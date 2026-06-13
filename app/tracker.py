import asyncio
import logging
import urllib.parse
import json
from datetime import datetime, timedelta
from bs4 import BeautifulSoup
from app.database import get_db_connection, get_user_setting
from app.scraper import scrape_google_serp, apply_human_jitter

logger = logging.getLogger("seoking.tracker")

# Global dict to check if keyword rank tracking job is actively running
TRACKING_JOBS = {"active": False}

def extract_ranks(serp_html: str, target_domain: str, competitors: list[str]) -> dict:
    """
    Parses the SERP HTML page to find the organic rank of the target domain
    and a list of competitor domains.
    Returns: {
        "target": {"rank": int | None, "url": str | None},
        "competitors": {
            "competitor1.com": {"rank": int | None, "url": str | None},
            ...
        }
    }
    """
    soup = BeautifulSoup(serp_html, "html.parser")
    rank = 1
    
    # Standardize target and competitors for matching
    target_clean = target_domain.lower().replace("www.", "")
    comp_clean_map = {c: c.lower().replace("www.", "") for c in competitors}
    
    result = {
        "target": {"rank": None, "url": None},
        "competitors": {c: {"rank": None, "url": None} for c in competitors}
    }
    
    for a in soup.find_all("a", href=True):
        href = a["href"]
        # Skip google local/internal links
        if href.startswith("http") and not any(d in href for d in ["google.com", "webcache.googleusercontent"]):
            parsed_href = urllib.parse.urlparse(href)
            netloc = parsed_href.netloc.lower()
            
            # Check target domain
            if result["target"]["rank"] is None and target_clean in netloc:
                logger.info(f"Target domain '{target_domain}' found at rank {rank}: {href}")
                result["target"] = {"rank": rank, "url": href}
            
            # Check competitors
            for c, c_clean in comp_clean_map.items():
                if result["competitors"][c]["rank"] is None and c_clean in netloc:
                    logger.info(f"Competitor domain '{c}' found at rank {rank}: {href}")
                    result["competitors"][c] = {"rank": rank, "url": href}
            
            rank += 1
            if rank > 100:
                break
                
    if result["target"]["rank"] is None:
        logger.info(f"Target domain '{target_domain}' not found in top 100 results.")
    return result

def extract_rank_position(serp_html: str, target_domain: str) -> tuple[int | None, str | None]:
    """
    Parses the SERP HTML page to find the organic rank of the target domain.
    Returns: (rank_position, ranking_url)
    """
    res = extract_ranks(serp_html, target_domain, [])
    return res["target"]["rank"], res["target"]["url"]

async def check_keyword_rank(user_id: int, kw_id: int, keyword: str, target_domain: str) -> bool:
    """
    Scrapes Google SERP, extracts rank, and saves history.
    """
    try:
        logger.info(f"Checking rank for keyword: '{keyword}' (domain: {target_domain})")
        # Step 1: Scrape Google SERP
        serp_html = await scrape_google_serp(user_id, keyword)
        
        # Step 2: Retrieve competitors
        competitors = []
        conn = get_db_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("SELECT competitors_json FROM tracked_keywords WHERE id = ?", (kw_id,))
            row = cursor.fetchone()
            if row and row["competitors_json"]:
                try:
                    competitors = json.loads(row["competitors_json"])
                    if not isinstance(competitors, list):
                        competitors = []
                except Exception:
                    competitors = []
        except Exception as e:
            logger.error(f"Error reading competitors for keyword {kw_id}: {e}")
        finally:
            conn.close()

        # Step 3: Extract ranks
        res = extract_ranks(serp_html, target_domain, competitors)
        rank_pos = res["target"]["rank"]
        ranking_url = res["target"]["url"]
        competitor_ranks = res["competitors"]
        
        # Step 4: Write history to DB
        conn = get_db_connection()
        cursor = conn.cursor()
        try:
            cursor.execute(
                """
                INSERT INTO keyword_rank_history (tracked_keyword_id, rank_position, ranking_url, competitor_ranks_json)
                VALUES (?, ?, ?, ?)
                """,
                (kw_id, rank_pos, ranking_url, json.dumps(competitor_ranks))
            )
            conn.commit()
            logger.info(f"Saved rank history: Keyword='{keyword}', Rank={rank_pos}, CompetitorRanks={competitor_ranks}")
            return True
        except Exception as e:
            logger.error(f"Error saving rank history for {keyword}: {e}")
            return False
        finally:
            conn.close()
    except Exception as e:
        logger.error(f"Failed to check keyword '{keyword}': {e}")
        return False

async def run_scheduled_rank_tracker(user_id: int, force_check: bool = False):
    """
    Loops through all tracked keywords and updates ranks if they haven't been updated today.
    """
    if TRACKING_JOBS["active"]:
        logger.warning("Rank tracker job is already running. Skipping trigger.")
        return
        
    TRACKING_JOBS["active"] = True
    logger.info("Rank tracker job started.")
    
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Fetch keywords
        cursor.execute(
            """
            SELECT id, keyword, target_domain, target_geolocation, target_locale 
            FROM tracked_keywords 
            WHERE user_id = ?
            """,
            (user_id,)
        )
        keywords = cursor.fetchall()
        
        for kw in keywords:
            kw_id = kw["id"]
            keyword = kw["keyword"]
            domain = kw["target_domain"]
            
            # Check if updated in the last 20 hours (to allow daily run)
            cursor.execute(
                """
                SELECT checked_at FROM keyword_rank_history 
                WHERE tracked_keyword_id = ? 
                ORDER BY checked_at DESC LIMIT 1
                """,
                (kw_id,)
            )
            history = cursor.fetchone()
            
            should_check = force_check
            if not should_check and history:
                last_checked = datetime.strptime(history["checked_at"], "%Y-%m-%d %H:%M:%S")
                # If more than 20 hours ago, run it
                if datetime.utcnow() - last_checked > timedelta(hours=20):
                    should_check = True
            elif not history:
                should_check = True
                
            if should_check:
                # Run the check
                success = await check_keyword_rank(user_id, kw_id, keyword, domain)
                if success:
                    # Apply humanized jitter to prevent getting blocked
                    await apply_human_jitter(user_id)
            else:
                logger.info(f"Skipping keyword '{keyword}', checked recently.")
                
    except Exception as e:
        logger.error(f"Error in scheduler rank tracker loop: {e}")
    finally:
        conn.close()
        TRACKING_JOBS["active"] = False
        logger.info("Rank tracker job completed.")

async def start_background_tracker(user_id: int):
    """
    Starts an infinite loops running rank updates every 4 hours.
    """
    logger.info("Starting background Rank Tracker loop daemon...")
    while True:
        try:
            # Check if there are keywords and updates are required
            await run_scheduled_rank_tracker(user_id, force_check=False)
        except Exception as e:
            logger.error(f"Error in background Rank Tracker daemon: {e}")
        # Sleep for 4 hours
        await asyncio.sleep(4 * 3600)
