import os
import json
import logging
import asyncio
import urllib.parse
import ipaddress
import urllib.request
import time
from bs4 import BeautifulSoup
from fastapi import FastAPI, Cookie, HTTPException, Depends, status, Response, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.database import init_db, get_db_connection, get_user_setting, set_user_setting
from app.auth import (
    register_user, authenticate_user, recover_account, 
    create_session, get_user_from_session, delete_session, get_current_user
)
import app.scraper as scraper
from app.crawler import start_crawl_job
from app.optimizer import optimize_keyword_content
from app.tracker import run_scheduled_rank_tracker, start_background_tracker
from app.performance import run_performance_audit_job
from app.tools import router as tools_router

logger = logging.getLogger("seoking.main")

def validate_ssrf(url_or_domain: str):
    if not url_or_domain.startswith("http://") and not url_or_domain.startswith("https://"):
        parsed = urllib.parse.urlparse("http://" + url_or_domain)
    else:
        parsed = urllib.parse.urlparse(url_or_domain)
        
    hostname = parsed.hostname
    if not hostname:
        raise HTTPException(status_code=400, detail="Invalid URL or domain")
        
    if hostname in ["localhost", "127.0.0.1", "::1"]:
        raise HTTPException(status_code=400, detail="Localhost/private IPs are not allowed")
        
    try:
        ip = ipaddress.ip_address(hostname)
        if ip.is_private or ip.is_loopback or ip.is_link_local:
            raise HTTPException(status_code=400, detail="Private IPs are not allowed")
    except ValueError:
        pass


def parse_json_field(data_dict, key, default):
    if key in data_dict and data_dict[key]:
        try:
            return json.loads(data_dict[key])
        except Exception:
            return default
    return default

app = FastAPI(title="SEO King", version="1.0.0")
app.include_router(tools_router)

# Global set to track active websocket connections for real-time alerts
CONNECTED_WEBSOCKETS = set()

# Initialize DB on startup and launch background Rank Tracker daemon
@app.on_event("startup")
async def startup_event():
    await init_db()
    # Configure scraper callback to broadcast CAPTCHA triggers
    scraper.async_broadcast_callback = broadcast_ws_message
    
    # Run rank tracking daemon in background (every 4 hours, starts checking)
    asyncio.create_task(start_background_tracker())
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
    competitors: list[str] = []

class OptimizeReq(BaseModel):
    keyword: str

class PerformanceStartReq(BaseModel):
    url: str
    strategy: str = "mobile"

# ----------------- AUTHENTICATION API -----------------

@app.get("/api/init")
async def get_init_status():
    """
    Checks if a user is registered. Helps frontend decide whether to show registration.
    """
    conn = await get_db_connection()
    cursor = await conn.cursor()
    try:
        await cursor.execute("SELECT id FROM users LIMIT 1")
        row = await cursor.fetchone()
        return {"registered": row is not None}
    finally:
        await conn.close()

@app.post("/api/register")
async def api_register(data: RegisterReq):
    recovery_code, err = await register_user(data.username, data.password)
    if err:
        raise HTTPException(status_code=400, detail=err)
    return {"recovery_code": recovery_code}

@app.post("/api/login")
async def api_login(data: LoginReq, response: Response):
    user_id, err = await authenticate_user(data.username, data.password)
    if err:
        raise HTTPException(status_code=401, detail=err)
    
    session_token = await create_session(user_id)
    # Set HTTP-only secure cookie (samesite lax for local usage)
    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=False,
        samesite="lax",
        max_age=3600 * 24 * 7  # 7 days
    )
    return {"message": "Login successful"}

@app.post("/api/recover")
async def api_recover(data: RecoverReq):
    success = await recover_account(data.username, data.recovery_code, data.new_password)
    if not success:
        raise HTTPException(status_code=400, detail="Invalid recovery code or username.")
    return {"message": "Password reset successful"}

@app.post("/api/logout")
async def api_logout(response: Response, session_token: str = Cookie(None)):
    if session_token:
        await delete_session(session_token)
    response.delete_cookie("session_token")
    return {"message": "Logged out successfully"}

@app.get("/api/me")
async def api_me(user_id: int = Depends(get_current_user)):
    conn = await get_db_connection()
    cursor = await conn.cursor()
    try:
        await cursor.execute("SELECT username, created_at FROM users WHERE id = ?", (user_id,))
        row = await cursor.fetchone()
        return {"id": user_id, "username": row["username"], "created_at": row["created_at"]}
    finally:
        await conn.close()

# ----------------- SETTINGS API -----------------

@app.get("/api/settings")
async def api_get_settings(user_id: int = Depends(get_current_user)):
    conn = await get_db_connection()
    cursor = await conn.cursor()
    try:
        await cursor.execute("SELECT setting_key, setting_value FROM user_settings WHERE user_id = ?", (user_id,))
        rows = await cursor.fetchall()
        settings_dict = {row["setting_key"]: row["setting_value"] for row in rows}
        
        # Inject defaults if missing
        defaults = {
            "theme": "light",
            "max_concurrent_crawler_tabs": "3",
            "max_concurrent_browser_tabs": "3",
            "jitter_min_ms": "3000",
            "jitter_max_ms": "8000",
            "geolocation_latitude": "37.7749",
            "geolocation_longitude": "-122.4194",
            "locale": "en-US",
            "timezone": "America/Los_Angeles",
            "audit_pagination_limit": "100"
        }
        for k, v in defaults.items():
            if k not in settings_dict:
                settings_dict[k] = v
        return settings_dict
    finally:
        await conn.close()

@app.post("/api/settings")
async def api_save_settings(data: SettingsReq, user_id: int = Depends(get_current_user)):
    try:
        for k, v in data.settings.items():
            await set_user_setting(user_id, k, str(v))
        return {"message": "Settings saved successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ----------------- SITE AUDIT API (Module 1) -----------------

@app.post("/api/audit/start")
async def api_start_audit(data: AuditStartReq, user_id: int = Depends(get_current_user)):
    validate_ssrf(data.domain)
    run_id = await start_crawl_job(user_id, data.domain, data.max_depth)
    if not run_id:
        raise HTTPException(status_code=500, detail="Failed to initialize crawl audit run.")
    return {"run_id": run_id, "status": "running"}

@app.get("/api/audit/runs")
async def api_get_audit_runs(user_id: int = Depends(get_current_user)):
    conn = await get_db_connection()
    cursor = await conn.cursor()
    try:
        await cursor.execute(
            """
            SELECT id, domain, status, total_urls_crawled, started_at, completed_at 
            FROM audit_runs 
            WHERE user_id = ? 
            ORDER BY started_at DESC
            """,
            (user_id,)
        )
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]
    finally:
        await conn.close()

@app.get("/api/audit/run/{run_id}")
async def api_get_audit_details(
    run_id: int, 
    page: int = 1, 
    limit: int = 100, 
    q: str = None, 
    filter_type: str = "all",
    user_id: int = Depends(get_current_user)
):
    conn = await get_db_connection()
    cursor = await conn.cursor()
    try:
        await cursor.execute("SELECT * FROM audit_runs WHERE id = ? AND user_id = ?", (run_id, user_id))
        run = await cursor.fetchone()
        if not run:
            raise HTTPException(status_code=404, detail="Audit run not found.")
            
        # Get limit from database settings if not explicitly smaller
        db_limit = int(await get_user_setting(user_id, "audit_pagination_limit", "100"))
        limit = min(max(limit, 1), db_limit, 100) # Maximum and default is 100
        
        # Build query filters
        query_parts = ["audit_run_id = ?"]
        params = [run_id]
        
        if q:
            query_parts.append("url LIKE ?")
            params.append(f"%{q}%")
            
        if filter_type == "broken":
            query_parts.append("is_broken = 1")
        elif filter_type == "redirect":
            query_parts.append("has_redirect = 1")
        elif filter_type == "healthy":
            query_parts.append("status_code >= 200 AND status_code < 300 AND is_broken = 0")
        elif filter_type == "missing-meta":
            query_parts.append("(title_tag IS NULL OR title_tag = '' OR meta_description IS NULL OR meta_description = '')")
            
        where_clause = " AND ".join(query_parts)
        
        # Get count of matching records
        count_query = f"SELECT COUNT(*) FROM audit_pages WHERE {where_clause}"
        await cursor.execute(count_query, params)
        total_items = (await cursor.fetchone())[0]
        
        # Calculate pagination offsets
        import math
        total_pages = math.ceil(total_items / limit) if total_items > 0 else 1
        page = min(max(page, 1), total_pages)
        offset = (page - 1) * limit
        
        # Query sliced records
        pages_query = f"SELECT * FROM audit_pages WHERE {where_clause} ORDER BY crawled_at ASC LIMIT ? OFFSET ?"
        await cursor.execute(pages_query, params + [limit, offset])
        pages = await cursor.fetchall()
        
        # Also fetch summary metrics for the whole run
        await cursor.execute("SELECT COUNT(*) FROM audit_pages WHERE audit_run_id = ?", (run_id,))
        overall_total = (await cursor.fetchone())[0]
        await cursor.execute("SELECT COUNT(*) FROM audit_pages WHERE audit_run_id = ? AND is_broken = 1", (run_id,))
        overall_broken = (await cursor.fetchone())[0]
        await cursor.execute("SELECT COUNT(*) FROM audit_pages WHERE audit_run_id = ? AND has_redirect = 1", (run_id,))
        overall_redirect = (await cursor.fetchone())[0]
        await cursor.execute("SELECT COUNT(*) FROM audit_pages WHERE audit_run_id = ? AND status_code >= 200 AND status_code < 300 AND is_broken = 0", (run_id,))
        overall_healthy = (await cursor.fetchone())[0]
        
        # Parse json fields for run
        run_dict = dict(run)
        if "details_json" in run_dict and run_dict["details_json"]:
            try:
                run_dict["details"] = json.loads(run_dict["details_json"])
            except Exception:
                run_dict["details"] = None
        else:
            run_dict["details"] = None

        # Parse json fields for pages
        pages_list = []
        for p in pages:
            p_dict = dict(p)
            p_dict["issues"] = parse_json_field(p_dict, "issues_json", [])
            p_dict["details"] = parse_json_field(p_dict, "details_json", {})
            pages_list.append(p_dict)
            
        return {
            "run": run_dict,
            "pages": pages_list,
            "total_items": total_items,
            "total_pages": total_pages,
            "current_page": page,
            "limit": limit,
            "metrics": {
                "total": overall_total,
                "broken": overall_broken,
                "redirects": overall_redirect,
                "healthy": overall_healthy
            }
        }
    finally:
        await conn.close()

@app.get("/api/audit/run/{run_id}/pages/all")
async def api_get_all_audit_pages(run_id: int, user_id: int = Depends(get_current_user)):
    conn = await get_db_connection()
    cursor = await conn.cursor()
    try:
        await cursor.execute("SELECT id FROM audit_runs WHERE id = ? AND user_id = ?", (run_id, user_id))
        if not await cursor.fetchone():
            raise HTTPException(status_code=404, detail="Audit run not found.")
            
        await cursor.execute("SELECT * FROM audit_pages WHERE audit_run_id = ? ORDER BY crawled_at ASC", (run_id,))
        pages = await cursor.fetchall()
        
        pages_list = []
        for p in pages:
            p_dict = dict(p)
            p_dict["issues"] = parse_json_field(p_dict, "issues_json", [])
            p_dict["details"] = parse_json_field(p_dict, "details_json", {})
            pages_list.append(p_dict)
            
        return {
            "pages": pages_list
        }
    finally:
        await conn.close()

@app.post("/api/audit/run/{run_id}/cancel")
async def api_cancel_audit(run_id: int, user_id: int = Depends(get_current_user)):
    conn = await get_db_connection()
    cursor = await conn.cursor()
    try:
        await cursor.execute("SELECT status FROM audit_runs WHERE id = ? AND user_id = ?", (run_id, user_id))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Audit run not found.")
        if row["status"] in ["completed", "failed", "cancelled"]:
            raise HTTPException(status_code=400, detail=f"Cannot cancel audit in state: {row['status']}")
        
        await cursor.execute("UPDATE audit_runs SET status = 'cancelled' WHERE id = ?", (run_id,))
        await conn.commit()
        return {"message": "Cancellation request registered."}
    finally:
        await conn.close()

@app.get("/api/audit/compare")
async def api_compare_audit_runs(
    run_id_1: int,
    run_id_2: int,
    user_id: int = Depends(get_current_user)
):
    conn = await get_db_connection()
    cursor = await conn.cursor()
    try:
        await cursor.execute("SELECT * FROM audit_runs WHERE id = ? AND user_id = ?", (run_id_1, user_id))
        run1 = await cursor.fetchone()
        await cursor.execute("SELECT * FROM audit_runs WHERE id = ? AND user_id = ?", (run_id_2, user_id))
        run2 = await cursor.fetchone()
        
        if not run1 or not run2:
            raise HTTPException(status_code=404, detail="One or both audit runs not found.")
            
        await cursor.execute("SELECT is_broken, has_redirect, status_code, issues_json FROM audit_pages WHERE audit_run_id = ?", (run_id_1,))
        pages1 = await cursor.fetchall()
        
        await cursor.execute("SELECT is_broken, has_redirect, status_code, issues_json FROM audit_pages WHERE audit_run_id = ?", (run_id_2,))
        pages2 = await cursor.fetchall()
        
        async def calculate_stats(pages):
            total = len(pages)
            broken = sum(1 for p in pages if p["is_broken"])
            redirects = sum(1 for p in pages if p["has_redirect"])
            healthy = sum(1 for p in pages if p["status_code"] == 200 and not p["is_broken"])
            
            errors = 0
            warnings = 0
            notices = 0
            
            for p in pages:
                issues = parse_json_field(dict(p), "issues_json", [])
                for issue in issues:
                    issue_lower = issue.lower()
                    if "broken" in issue_lower or "error" in issue_lower or "failure" in issue_lower:
                        errors += 1
                    elif "missing" in issue_lower or "too short" in issue_lower or "too long" in issue_lower or "thin" in issue_lower or "reliance" in issue_lower or "alt tags" in issue_lower:
                        warnings += 1
                    else:
                        notices += 1
            return {
                "total": total,
                "broken": broken,
                "redirects": redirects,
                "healthy": healthy,
                "errors": errors,
                "warnings": warnings,
                "notices": notices,
                "total_issues": errors + warnings + notices
            }
            
        stats1 = calculate_stats(pages1)
        stats2 = calculate_stats(pages2)
        
        # Calculate health score ratio (healthy / total) * 100
        health1 = int((stats1["healthy"] / stats1["total"] * 100)) if stats1["total"] > 0 else 0
        health2 = int((stats2["healthy"] / stats2["total"] * 100)) if stats2["total"] > 0 else 0
        
        stats1["health_score"] = health1
        stats2["health_score"] = health2
        
        return {
            "run1": {
                "id": run_id_1,
                "domain": run1["domain"],
                "started_at": run1["started_at"],
                "stats": stats1
            },
            "run2": {
                "id": run_id_2,
                "domain": run2["domain"],
                "started_at": run2["started_at"],
                "stats": stats2
            }
        }
    finally:
        await conn.close()

@app.post("/api/audit/page/{page_id}/reaudit")
async def api_reaudit_page(page_id: int, user_id: int = Depends(get_current_user)):
    from app.crawler import AuditCrawler, is_bot_blocked_robots_txt
    
    conn = await get_db_connection()
    cursor = await conn.cursor()
    try:
        await cursor.execute(
            """
            SELECT p.*, r.user_id, r.domain, r.details_json as run_details_json 
            FROM audit_pages p
            JOIN audit_runs r ON p.audit_run_id = r.id
            WHERE p.id = ? AND r.user_id = ?
            """,
            (page_id, user_id)
        )
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Page not found.")
            
        url = row["url"]
        run_id = row["audit_run_id"]
        domain = row["domain"]
        run_details_json = row["run_details_json"]
        
        # Initialize crawler instance
        crawler = AuditCrawler(user_id, run_id, domain, 3)
        
        status_code = 0
        title = None
        meta_desc = None
        h1 = None
        is_broken = False
        has_redirect = False
        redirect_url = None
        canonical_url = None
        is_noindex = False
        word_count = 0
        issues = []
        details = {}
        
        req = urllib.request.Request(
            url, 
            headers={'User-Agent': 'Mozilla/5.0 SEOKingBot/1.0'}
        )
        
        start_time = time.time()
        try:
            response = await asyncio.to_thread(urllib.request.urlopen, req, timeout=10)
            load_time = time.time() - start_time
            status_code = response.status
            final_url = response.geturl()
            c_type = response.headers.get('Content-Type', '')
            
            parsed = {}
            outgoing_links = []
            scripts_count = 0
            css_count = 0
            
            if 'text/html' in c_type:
                html_c = await asyncio.to_thread(response.read)
                parsed = await crawler.analyze_page_seo(url, status_code, dict(response.headers), html_c)
                
                def parse_html():
                    soup = BeautifulSoup(html_c, 'html.parser')
                    out_links = []
                    for a in soup.find_all('a', href=True):
                        href = a.get('href', '').strip()
                        if href and not href.startswith(('#', 'javascript:', 'mailto:', 'tel:')):
                            out_links.append(urllib.parse.urljoin(url, href))
                    s_c = len([s.get('src') for s in soup.find_all('script') if s.get('src')])
                    c_c = len([l.get('href') for l in soup.find_all('link', rel='stylesheet') if l.get('href')])
                    return list(set(out_links)), s_c, c_c
                
                outgoing_links, scripts_count, css_count = await asyncio.to_thread(parse_html)
        except Exception:
            load_time = time.time() - start_time
            status_code = 0
            final_url = url
            parsed = {}
            outgoing_links = []
            scripts_count = 0
            css_count = 0
        
        if final_url != url:
            has_redirect = True
            redirect_url = final_url
            
        if parsed:
            title = parsed.get("title")
            meta_desc = parsed.get("meta_desc")
            h1 = parsed.get("h1")
            is_broken = parsed.get("is_broken", False)
            canonical_url = parsed.get("canonical")
            is_noindex = parsed.get("is_noindex", False)
            word_count = parsed.get("word_count", 0)
            issues = parsed.get("issues", [])
            details = parsed.get("details", {})
            
            details["outgoing_links"] = outgoing_links
            details["js_count"] = scripts_count
            details["css_count"] = css_count
        else:
            details["depth"] = row["depth"] if "depth" in row else 0
            details["load_time"] = round(load_time, 3)
            details["outgoing_links"] = []
            is_broken = True
            issues = ["Crawl Execution Failure"]
            details["depth"] = 0
            details["load_time"] = round(load_time, 3)
            details["outgoing_links"] = []
            
        run_details = {}
        if run_details_json:
            try:
                run_details = json.loads(run_details_json)
            except Exception:
                pass
        robots_content = run_details.get("robots_txt_content", "")
        ai_bots = ["ChatGPT-User", "OAI-SearchBot", "Googlebot", "Google-Extended"]
        parsed_url = urllib.parse.urlparse(url)
        url_path = parsed_url.path or "/"
        blocked_bots = []
        for bot in ai_bots:
            if is_bot_blocked_robots_txt(robots_content, url_path, bot):
                blocked_bots.append(bot)
        details["blocked_ai_bots"] = blocked_bots
        
        existing_details = {}
        if row["details_json"]:
            try:
                existing_details = json.loads(row["details_json"])
            except Exception:
                pass
        details["ilr"] = existing_details.get("ilr", 10)
        details["incoming_links"] = existing_details.get("incoming_links", [])
        details["incoming_links_count"] = existing_details.get("incoming_links_count", 0)
        
        if blocked_bots and "Blocked from crawling by AI agents" not in issues:
            issues.append("Blocked from crawling by AI agents")
            
        await cursor.execute(
            """
            UPDATE audit_pages 
            SET status_code = ?, title_tag = ?, meta_description = ?, h1_tag = ?,
                is_broken = ?, has_redirect = ?, redirect_url = ?, canonical_url = ?,
                is_noindex = ?, word_count = ?, issues_json = ?, details_json = ?
            WHERE id = ?
            """,
            (
                status_code, title, meta_desc, h1,
                1 if is_broken else 0, 1 if has_redirect else 0, redirect_url, canonical_url,
                1 if is_noindex else 0, word_count, json.dumps(issues), json.dumps(details),
                page_id
            )
        )
        await conn.commit()
        return {"message": "Page reaudited successfully"}
    except Exception as e:
        await conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        await conn.close()

@app.delete("/api/audit/run/{run_id}")
async def api_delete_audit(run_id: int, user_id: int = Depends(get_current_user)):
    conn = await get_db_connection()
    cursor = await conn.cursor()
    try:
        await cursor.execute("DELETE FROM audit_runs WHERE id = ? AND user_id = ?", (run_id, user_id))
        await conn.commit()
        return {"message": "Audit run deleted successfully."}
    except Exception as e:
        await conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        await conn.close()

# ----------------- PERFORMANCE AUDIT API -----------------

@app.post("/api/performance/start")
async def api_start_performance_audit(data: PerformanceStartReq, user_id: int = Depends(get_current_user)):
    validate_ssrf(data.url)
    conn = await get_db_connection()
    cursor = await conn.cursor()
    run_id = None
    try:
        await cursor.execute(
            "INSERT INTO performance_audits (user_id, url, strategy, status) VALUES (?, ?, ?, 'pending')",
            (user_id, data.url, data.strategy)
        )
        await conn.commit()
        run_id = cursor.lastrowid
    except Exception as e:
        logger.error(f"Failed to create performance run: {e}")
        raise HTTPException(status_code=500, detail="Failed to initialize performance run.")
    finally:
        await conn.close()

    if run_id:
        asyncio.create_task(run_performance_audit_job(run_id, data.url, data.strategy))
        return {"run_id": run_id, "status": "pending"}
    raise HTTPException(status_code=500, detail="Failed to start performance run.")

@app.get("/api/performance/runs")
async def api_get_performance_runs(user_id: int = Depends(get_current_user)):
    conn = await get_db_connection()
    cursor = await conn.cursor()
    try:
        await cursor.execute(
            """
            SELECT id, url, strategy, status, lcp, inp, cls, ttfb, dom_size, created_at 
            FROM performance_audits 
            WHERE user_id = ? 
            ORDER BY created_at DESC
            """,
            (user_id,)
        )
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]
    finally:
        await conn.close()

@app.get("/api/performance/run/{run_id}")
async def api_get_performance_detail(run_id: int, user_id: int = Depends(get_current_user)):
    conn = await get_db_connection()
    cursor = await conn.cursor()
    try:
        await cursor.execute(
            "SELECT * FROM performance_audits WHERE id = ? AND user_id = ?",
            (run_id, user_id)
        )
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Performance run not found.")
        d = dict(row)
        if d.get("details_json"):
            try:
                d["details"] = json.loads(d["details_json"])
            except Exception:
                d["details"] = {}
        else:
            d["details"] = {}
        return d
    finally:
        await conn.close()

@app.delete("/api/performance/run/{run_id}")
async def api_delete_performance_run(run_id: int, user_id: int = Depends(get_current_user)):
    conn = await get_db_connection()
    cursor = await conn.cursor()
    try:
        await cursor.execute("DELETE FROM performance_audits WHERE id = ? AND user_id = ?", (run_id, user_id))
        await conn.commit()
        return {"message": "Performance run deleted successfully."}
    except Exception as e:
        await conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        await conn.close()

# ----------------- KEYWORD RANK TRACKER API (Module 3) -----------------

@app.post("/api/keywords")
async def api_add_keyword(data: KeywordAddReq, user_id: int = Depends(get_current_user)):
    if len(data.competitors) > 3:
        raise HTTPException(status_code=400, detail="Maximum of 3 competitor domains can be tracked.")
    
    conn = await get_db_connection()
    cursor = await conn.cursor()
    try:
        await cursor.execute(
            """
            INSERT INTO tracked_keywords (user_id, keyword, target_domain, target_geolocation, target_locale, competitors_json)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                user_id,
                data.keyword,
                data.target_domain,
                data.target_geolocation,
                data.target_locale,
                json.dumps(data.competitors)
            )
        )
        await conn.commit()
        return {"message": "Keyword added successfully."}
    except Exception as e:
        await conn.rollback()
        raise HTTPException(status_code=400, detail="Keyword already tracked for this domain.")
    finally:
        await conn.close()

@app.get("/api/keywords")
async def api_get_keywords(user_id: int = Depends(get_current_user)):
    conn = await get_db_connection()
    cursor = await conn.cursor()
    try:
        # Get keywords along with their most recent rank
        await cursor.execute(
            """
            SELECT tk.id, tk.keyword, tk.target_domain, tk.target_geolocation, tk.target_locale, tk.competitors_json, tk.created_at,
                   kh.rank_position, kh.ranking_url, kh.competitor_ranks_json, kh.checked_at
            FROM tracked_keywords tk
            LEFT JOIN (
                SELECT tracked_keyword_id, rank_position, ranking_url, competitor_ranks_json, checked_at
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
        rows = await cursor.fetchall()
        
        res = []
        for row in rows:
            d = dict(row)
            d["competitors"] = parse_json_field(d, "competitors_json", [])
            d["competitor_ranks"] = parse_json_field(d, "competitor_ranks_json", {})
            res.append(d)
        return res
    finally:
        await conn.close()

@app.get("/api/keywords/{kw_id}/history")
async def api_get_keyword_history(kw_id: int, user_id: int = Depends(get_current_user)):
    conn = await get_db_connection()
    cursor = await conn.cursor()
    try:
        # Verify ownership
        await cursor.execute("SELECT id FROM tracked_keywords WHERE id = ? AND user_id = ?", (kw_id, user_id))
        if not await cursor.fetchone():
            raise HTTPException(status_code=404, detail="Tracked keyword not found.")
            
        await cursor.execute(
            "SELECT rank_position, ranking_url, competitor_ranks_json, checked_at FROM keyword_rank_history WHERE tracked_keyword_id = ? ORDER BY checked_at ASC",
            (kw_id,)
        )
        rows = await cursor.fetchall()
        
        res = []
        for row in rows:
            d = dict(row)
            d["competitor_ranks"] = parse_json_field(d, "competitor_ranks_json", {})
            res.append(d)
        return res
    finally:
        await conn.close()

@app.delete("/api/keywords/{kw_id}")
async def api_delete_keyword(kw_id: int, user_id: int = Depends(get_current_user)):
    conn = await get_db_connection()
    cursor = await conn.cursor()
    try:
        await cursor.execute("DELETE FROM tracked_keywords WHERE id = ? AND user_id = ?", (kw_id, user_id))
        await conn.commit()
        return {"message": "Keyword deleted successfully."}
    except Exception as e:
        await conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        await conn.close()

@app.post("/api/keywords/trigger")
async def api_trigger_rank_update(user_id: int = Depends(get_current_user)):
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
    session_token = websocket.cookies.get("session_token")
    if not session_token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
        
    user_id = await get_user_from_session(session_token)
    if not user_id:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept()
    CONNECTED_WEBSOCKETS.add(websocket)
    logger.info(f"New WebSocket client connected (User ID: {user_id}).")
    try:
        while True:
            # Keep connection alive, listen for any messages from client (none expected in current design)
            data = await websocket.receive_text()
            # If client sends a resume action, can handle it (optional, url check handles it automatically)
    except WebSocketDisconnect:
        logger.info(f"WebSocket client disconnected (User ID: {user_id}).")
    finally:
        if websocket in CONNECTED_WEBSOCKETS:
            CONNECTED_WEBSOCKETS.remove(websocket)

# ----------------- STATIC INTERFACE SERVING -----------------

import pathlib
STATIC_DIR = pathlib.Path(__file__).parent / "static"

# Mount the static files directory to serve CSS and JS
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

@app.get("/")
def serve_dashboard():
    return FileResponse(str(STATIC_DIR / "index.html"))

# Fallback client-side routes
@app.get("/{catchall:path}")
def serve_dashboard_catchall(catchall: str):
    # Ensure api routes still return 404 and don't route to HTML
    if catchall.startswith("api/"):
        raise HTTPException(status_code=404, detail="API endpoint not found.")
    return FileResponse(str(STATIC_DIR / "index.html"))
