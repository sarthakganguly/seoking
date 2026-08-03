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
        conn = await get_db_connection()
        cursor = await conn.cursor()
        try:
            await cursor.execute("SELECT competitors_json FROM tracked_keywords WHERE id = ?", (kw_id,))
            row = await cursor.fetchone()
            if row and row["competitors_json"]:
                try:
                    competitors = json.loads(row["competitors_json"])
                except json.JSONDecodeError:
                    pass
        except Exception as e:
            logger.error(f"Error retrieving competitors for {keyword}: {e}")
        finally:
            await conn.close()

        # Step 3: Extract ranks
        res = extract_ranks(serp_html, target_domain, competitors)
        rank_pos = res["target"]["rank"]
        ranking_url = res["target"]["url"]
        competitor_ranks = res["competitors"]
        
        # Step 4: Write history to DB
        conn = await get_db_connection()
        cursor = await conn.cursor()
        try:
            await cursor.execute(
                """
                INSERT INTO keyword_rank_history (tracked_keyword_id, rank_position, ranking_url, competitor_ranks_json)
                VALUES (?, ?, ?, ?)
                """,
                (kw_id, rank_pos, ranking_url, json.dumps(competitor_ranks))
            )
            await conn.commit()
            logger.info(f"Saved rank history: Keyword='{keyword}', Rank={rank_pos}, CompetitorRanks={competitor_ranks}")
            return True
        except Exception as e:
            logger.error(f"Error saving rank history for {keyword}: {e}")
            return False
        finally:
            await conn.close()
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
    
    conn = await get_db_connection()
    cursor = await conn.cursor()
    try:
        # Fetch keywords
        await cursor.execute(
            """
            SELECT id, keyword, target_domain, target_geolocation, target_locale 
            FROM tracked_keywords 
            WHERE user_id = ?
            """,
            (user_id,)
        )
        keywords = await cursor.fetchall()
        
        if not keywords:
            logger.info("No tracked keywords found for rank tracker.")
            return

        for kw in keywords:
            kw_id = kw["id"]
            
            # Check if updated in the last 20 hours (to allow daily run)
            await cursor.execute(
                """
                SELECT checked_at FROM keyword_rank_history 
                WHERE tracked_keyword_id = ? 
                ORDER BY checked_at DESC LIMIT 1
                """,
                (kw_id,)
            )
            history = await cursor.fetchone()
            
            should_run = True
            if history and history["checked_at"]:
                last_checked = datetime.strptime(history["checked_at"], "%Y-%m-%d %H:%M:%S")
                hours_since = (datetime.utcnow() - last_checked).total_seconds() / 3600
                if hours_since < 20:
                    should_run = False
            
            if should_run:
                # Add jitter delay between queries to avoid getting blocked
                jitter_min = int(await get_user_setting(user_id, "jitter_min_ms", 3000))
                jitter_max = int(await get_user_setting(user_id, "jitter_max_ms", 8000))
                delay_s = random.uniform(jitter_min, jitter_max) / 1000.0
                await asyncio.sleep(delay_s)
                
                await check_keyword_rank(
                    user_id,
                    kw_id, 
                    kw["keyword"], 
                    kw["target_domain"]
                )
    except Exception as e:
        logger.error(f"Error in run_scheduled_rank_tracker: {e}")
    finally:
        await conn.close()
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
