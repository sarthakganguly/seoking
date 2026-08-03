import os
import json
import math
import asyncio
import urllib.request
import urllib.parse
from urllib.error import HTTPError, URLError
import logging
import re
import socket
import ssl
from datetime import datetime
from bs4 import BeautifulSoup
from app.database import get_db_connection, get_user_setting

logger = logging.getLogger("seoking.crawler")

from app.crawler.core import AuditCrawler
from app.crawler.utils import check_if_cancelled

async def start_crawl_job(user_id: int, domain: str, max_depth: int) -> int:
    """
    Spawns an asynchronous site audit job.
    """
    conn = await get_db_connection()
    cursor = await conn.cursor()
    run_id = None
    try:
        await cursor.execute(
            "INSERT INTO audit_runs (user_id, domain, status) VALUES (?, ?, 'running')",
            (user_id, domain)
        )
        await conn.commit()
        run_id = cursor.lastrowid
    except Exception as e:
        logger.error(f"Failed to create audit run: {e}")
        return None
    finally:
        await conn.close()

    if run_id:
        crawler = AuditCrawler(user_id, run_id, domain, max_depth)
        asyncio.create_task(run_crawler_task(run_id, crawler))
    
    return run_id

async def run_crawler_task(run_id: int, crawler: AuditCrawler):
    try:
        await crawler.run()
    except Exception as e:
        logger.error(f"Exception in crawler thread: {e}")
        await crawler.update_run_status("failed")
