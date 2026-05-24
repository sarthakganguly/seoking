import os
import json
import logging
import asyncio
from fastapi import FastAPI, Cookie, HTTPException, Depends, status, Response, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.database import init_db, get_db_connection, get_user_setting, set_user_setting
from app.auth import (
    register_user, authenticate_user, recover_account, 
    create_session, get_user_from_session, delete_session, ACTIVE_SESSIONS
)
import app.scraper as scraper
from app.crawler import start_crawl_job, ACTIVE_CRAWLS
from app.optimizer import optimize_keyword_content
from app.tracker import run_scheduled_rank_tracker, start_background_tracker

logger = logging.getLogger("seoking.main")

app = FastAPI(title="SEO King", version="1.0.0")

# Global set to track active websocket connections for real-time alerts
CONNECTED_WEBSOCKETS = set()

# Initialize DB on startup and launch background Rank Tracker daemon
@app.on_event("startup")
async def startup_event():
    init_db()
    # Configure scraper callback to broadcast CAPTCHA triggers
    scraper.async_broadcast_callback = broadcast_ws_message
    
    # Run rank tracking daemon in background (every 4 hours, starts checking)
    # Default to user_id 1 (since it's a single-user system)
    asyncio.create_task(start_background_tracker(user_id=1))
    logger.info("Application startup processes completed.")

async def broadcast_ws_message(data: dict):
    """
    Broadcasts message to all connected WebSocket clients.
    """
    if not CONNECTED_WEBSOCKETS:
        return
    message = json.dumps(data)
    inactive_websockets = set()
    for ws in CONNECTED_WEBSOCKETS:
        try:
            await ws.send_text(message)
        except Exception as e:
            logger.warning(f"Failed to send to WebSocket, marking for removal: {e}")
            inactive_websockets.add(ws)
    for ws in inactive_websockets:
        CONNECTED_WEBSOCKETS.remove(ws)

# Dependency to check session authentication
async def get_current_user(session_token: str = Cookie(None)):
    if not session_token:
        raise HTTPException(status_code=401, detail="Session cookie missing")
    user_id = get_user_from_session(session_token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Session invalid or expired")
    return user_id

# Pydantic schemas for request validation
class RegisterReq(BaseModel):
    username: str
    password: str

class LoginReq(BaseModel):
    username: str
    password: str

class RecoverReq(BaseModel):
    username: str
    recovery_code: str
    new_password: str

class SettingsReq(BaseModel):
    settings: dict

class AuditStartReq(BaseModel):
    domain: str
    max_depth: int

class KeywordAddReq(BaseModel):
    keyword: str
    target_domain: str
    target_geolocation: str = "en-US"
    target_locale: str = "en"

class OptimizeReq(BaseModel):
    keyword: str

# ----------------- AUTHENTICATION API -----------------

@app.get("/api/init")
def get_init_status():
    """
    Checks if a user is registered. Helps frontend decide whether to show registration.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id FROM users LIMIT 1")
        row = cursor.fetchone()
        return {"registered": row is not None}
    finally:
        conn.close()

@app.post("/api/register")
def api_register(data: RegisterReq):
    recovery_code, err = register_user(data.username, data.password)
    if err:
        raise HTTPException(status_code=400, detail=err)
    return {"recovery_code": recovery_code}

@app.post("/api/login")
def api_login(data: LoginReq, response: Response):
    user_id, err = authenticate_user(data.username, data.password)
    if err:
        raise HTTPException(status_code=401, detail=err)
    
    session_token = create_session(user_id)
    # Set HTTP-only secure-ish cookie (samesite lax for local usage)
    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        samesite="lax",
        max_age=3600 * 24 * 7  # 7 days
    )
    return {"message": "Login successful"}

@app.post("/api/recover")
def api_recover(data: RecoverReq):
    success = recover_account(data.username, data.recovery_code, data.new_password)
    if not success:
        raise HTTPException(status_code=400, detail="Invalid recovery code or username.")
    return {"message": "Password reset successful"}

@app.post("/api/logout")
def api_logout(response: Response, session_token: str = Cookie(None)):
    if session_token:
        delete_session(session_token)
    response.delete_cookie("session_token")
    return {"message": "Logged out successfully"}

@app.get("/api/me")
def api_me(user_id: int = Depends(get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT username, created_at FROM users WHERE id = ?", (user_id,))
        row = cursor.fetchone()
        return {"id": user_id, "username": row["username"], "created_at": row["created_at"]}
    finally:
        conn.close()

# ----------------- SETTINGS API -----------------

@app.get("/api/settings")
def api_get_settings(user_id: int = Depends(get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT setting_key, setting_value FROM user_settings WHERE user_id = ?", (user_id,))
        rows = cursor.fetchall()
        settings_dict = {row["setting_key"]: row["setting_value"] for row in rows}
        
        # Inject defaults if missing
        defaults = {
            "theme": "dark",
            "max_concurrent_crawler_tabs": "3",
            "max_concurrent_browser_tabs": "3",
            "jitter_min_ms": "3000",
            "jitter_max_ms": "8000",
            "geolocation_latitude": "37.7749",
            "geolocation_longitude": "-122.4194",
            "locale": "en-US",
            "timezone": "America/Los_Angeles"
        }
        for k, v in defaults.items():
            if k not in settings_dict:
                settings_dict[k] = v
        return settings_dict
    finally:
        conn.close()

@app.post("/api/settings")
def api_save_settings(data: SettingsReq, user_id: int = Depends(get_current_user)):
    try:
        for k, v in data.settings.items():
            set_user_setting(user_id, k, str(v))
        return {"message": "Settings saved successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ----------------- SITE AUDIT API (Module 1) -----------------

@app.post("/api/audit/start")
async def api_start_audit(data: AuditStartReq, user_id: int = Depends(get_current_user)):
    run_id = await start_crawl_job(user_id, data.domain, data.max_depth)
    if not run_id:
        raise HTTPException(status_code=500, detail="Failed to initialize crawl audit run.")
    return {"run_id": run_id, "status": "running"}

@app.get("/api/audit/runs")
def api_get_audit_runs(user_id: int = Depends(get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            """
            SELECT id, domain, status, total_urls_crawled, started_at, completed_at 
            FROM audit_runs 
            WHERE user_id = ? 
            ORDER BY started_at DESC
            """,
            (user_id,)
        )
        rows = cursor.fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()

@app.get("/api/audit/run/{run_id}")
def api_get_audit_details(run_id: int, user_id: int = Depends(get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT * FROM audit_runs WHERE id = ? AND user_id = ?", (run_id, user_id))
        run = cursor.fetchone()
        if not run:
            raise HTTPException(status_code=404, detail="Audit run not found.")
            
        cursor.execute("SELECT * FROM audit_pages WHERE audit_run_id = ? ORDER BY crawled_at ASC", (run_id,))
        pages = cursor.fetchall()
        return {
            "run": dict(run),
            "pages": [dict(p) for p in pages]
        }
    finally:
        conn.close()

@app.post("/api/audit/run/{run_id}/cancel")
def api_cancel_audit(run_id: int, user_id: int = Depends(get_current_user)):
    if run_id in ACTIVE_CRAWLS:
        ACTIVE_CRAWLS[run_id] = "cancelled"
        return {"message": "Cancellation request registered."}
    raise HTTPException(status_code=400, detail="Audit is not actively running.")

@app.delete("/api/audit/run/{run_id}")
def api_delete_audit(run_id: int, user_id: int = Depends(get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM audit_runs WHERE id = ? AND user_id = ?", (run_id, user_id))
        conn.commit()
        return {"message": "Audit run deleted successfully."}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

# ----------------- KEYWORD RANK TRACKER API (Module 3) -----------------

@app.post("/api/keywords")
def api_add_keyword(data: KeywordAddReq, user_id: int = Depends(get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            """
            INSERT INTO tracked_keywords (user_id, keyword, target_domain, target_geolocation, target_locale)
            VALUES (?, ?, ?, ?, ?)
            """,
            (user_id, data.keyword, data.target_domain, data.target_geolocation, data.target_locale)
        )
        conn.commit()
        return {"message": "Keyword added successfully."}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail="Keyword already tracked for this domain.")
    finally:
        conn.close()

@app.get("/api/keywords")
def api_get_keywords(user_id: int = Depends(get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Get keywords along with their most recent rank
        cursor.execute(
            """
            SELECT tk.id, tk.keyword, tk.target_domain, tk.target_geolocation, tk.target_locale, tk.created_at,
                   kh.rank_position, kh.ranking_url, kh.checked_at
            FROM tracked_keywords tk
            LEFT JOIN (
                SELECT tracked_keyword_id, rank_position, ranking_url, checked_at
                FROM keyword_rank_history
                WHERE id IN (
                    SELECT MAX(id) FROM keyword_rank_history GROUP BY tracked_keyword_id
                )
            ) kh ON tk.id = kh.tracked_keyword_id
            WHERE tk.user_id = ?
            ORDER BY tk.created_at DESC
            """,
            (user_id,)
        )
        rows = cursor.fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()

@app.get("/api/keywords/{kw_id}/history")
def api_get_keyword_history(kw_id: int, user_id: int = Depends(get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Verify ownership
        cursor.execute("SELECT id FROM tracked_keywords WHERE id = ? AND user_id = ?", (kw_id, user_id))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Tracked keyword not found.")
            
        cursor.execute(
            "SELECT rank_position, ranking_url, checked_at FROM keyword_rank_history WHERE tracked_keyword_id = ? ORDER BY checked_at ASC",
            (kw_id,)
        )
        rows = cursor.fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()

@app.delete("/api/keywords/{kw_id}")
def api_delete_keyword(kw_id: int, user_id: int = Depends(get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM tracked_keywords WHERE id = ? AND user_id = ?", (kw_id, user_id))
        conn.commit()
        return {"message": "Keyword deleted successfully."}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.post("/api/keywords/trigger")
def api_trigger_rank_update(user_id: int = Depends(get_current_user)):
    """
    Manually triggers position checks for all keywords in the background.
    """
    asyncio.create_task(run_scheduled_rank_tracker(user_id, force_check=True))
    return {"message": "Rank tracker scan triggered in the background."}

# ----------------- CONTENT OPTIMIZATION API (Module 2) -----------------

@app.post("/api/optimizer/analyze")
async def api_analyze_content(data: OptimizeReq, user_id: int = Depends(get_current_user)):
    """
    Runs content optimization analysis.
    This fetches search results, scrapes competitor DOMs, extracts semantic entities.
    Returns results directly since the execution is synchronous/awaited.
    If a CAPTCHA occurs, the websocket will alert the UI, and the user solves it before this returns.
    """
    try:
        result = await optimize_keyword_content(user_id, data.keyword)
        if "error" in result:
            raise HTTPException(status_code=500, detail=result["error"])
        return result
    except Exception as e:
        logger.error(f"Error during content optimization analysis: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ----------------- WEBSOCKET SERVER -----------------

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    CONNECTED_WEBSOCKETS.add(websocket)
    logger.info("New WebSocket client connected.")
    try:
        while True:
            # Keep connection alive, listen for any messages from client (none expected in current design)
            data = await websocket.receive_text()
            # If client sends a resume action, can handle it (optional, url check handles it automatically)
    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected.")
    finally:
        if websocket in CONNECTED_WEBSOCKETS:
            CONNECTED_WEBSOCKETS.remove(websocket)

# ----------------- STATIC INTERFACE SERVING -----------------

# Mount the static files directory to serve CSS and JS
# Mounts the actual absolute folder directory /app/app/static
app.mount("/static", StaticFiles(directory="/app/app/static"), name="static")

@app.get("/")
def serve_dashboard():
    return FileResponse("/app/app/static/index.html")

# Fallback client-side routes
@app.get("/{catchall:path}")
def serve_dashboard_catchall(catchall: str):
    # Ensure api routes still return 404 and don't route to HTML
    if catchall.startswith("api/"):
        raise HTTPException(status_code=404, detail="API endpoint not found.")
    return FileResponse("/app/app/static/index.html")
