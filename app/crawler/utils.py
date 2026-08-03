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

async def check_if_cancelled(run_id: int) -> bool:
    conn = await get_db_connection()
    cursor = await conn.cursor()
    try:
        await cursor.execute("SELECT status FROM audit_runs WHERE id = ?", (run_id,))
        row = await cursor.fetchone()
        return row and row["status"] == "cancelled"
    except Exception as e:
        logger.error(f"Error checking cancel status for run_id {run_id}: {e}")
        return False
    finally:
        await conn.close()
def check_ssl(domain: str) -> dict:
    """
    Connects to domain via SSL port 443 and checks details.
    """
    clean_domain = domain.replace("https://", "").replace("http://", "").split("/")[0].split(":")[0]
    context = ssl.create_default_context()
    try:
        with socket.create_connection((clean_domain, 443), timeout=4) as sock:
            with context.wrap_socket(sock, server_hostname=clean_domain) as ssock:
                cert = ssock.getpeercert()
                not_after_str = cert.get('notAfter')
                if not_after_str:
                    not_after = datetime.strptime(not_after_str, '%b %d %H:%M:%S %Y %Z')
                    days_left = (not_after - datetime.utcnow()).days
                    expiry_date = not_after.strftime('%Y-%m-%d')
                    
                    subject = dict(x[0] for x in cert.get('subject', ()))
                    common_name = subject.get('commonName', '')
                    
                    alt_names = [x[1] for x in cert.get('subjectAltName', ()) if x[0] == 'DNS']
                    name_matches = False
                    if clean_domain.lower() == common_name.lower():
                        name_matches = True
                    else:
                        for alt in alt_names:
                            if alt.replace('*', '') in clean_domain.lower():
                                name_matches = True
                                break
                    return {
                        "valid": True,
                        "days_left": days_left,
                        "expiry_date": expiry_date,
                        "common_name": common_name,
                        "name_matches": name_matches,
                        "support_sni": True,
                        "tls_version": ssock.version()
                    }
    except Exception as e:
        logger.warning(f"SSL certificate check failed for {clean_domain}: {e}")
    return {
        "valid": False,
        "days_left": 0,
        "expiry_date": None,
        "common_name": None,
        "name_matches": False,
        "support_sni": False,
        "tls_version": None
    }

def is_bot_blocked_robots_txt(robots_content: str, url_path: str, bot_name: str) -> bool:
    if not robots_content:
        return False
    lines = robots_content.splitlines()
    current_user_agents = []
    rules = []
    for line in lines:
        line = line.strip().lower()
        if not line or line.startswith('#'):
            continue
        if line.startswith('user-agent:'):
            ua = line.split(':', 1)[1].strip()
            current_user_agents.append(ua)
        elif line.startswith('disallow:') or line.startswith('allow:'):
            parts = line.split(':', 1)
            rule_type = parts[0].strip()
            path = parts[1].strip() if len(parts) > 1 else ""
            for ua in current_user_agents:
                if ua == '*' or bot_name.lower() in ua:
                    rules.append((ua, rule_type, path))
    
    bot_rules = [r for r in rules if r[0] == bot_name.lower()]
    if not bot_rules:
        bot_rules = [r for r in rules if r[0] == '*']
        
    blocked = False
    for ua, rule_type, rule_path in bot_rules:
        if rule_path == '':
            if rule_type == 'disallow':
                blocked = False
        elif url_path.startswith(rule_path):
            if rule_type == 'disallow':
                blocked = True
            elif rule_type == 'allow':
                blocked = False
    return blocked

def parse_urls_from_xml(xml_content: str) -> list[str]:
    """
    Parses sitemap loc URLs from XML file. Falls back to regex if XML parse fails.
    """
    urls = []
    try:
        soup = BeautifulSoup(xml_content, 'xml')
        # Check if it is a sitemap index
        sitemaps = soup.find_all('sitemap')
        if sitemaps:
            return [s.loc.text.strip() for s in sitemaps if s.loc]
        # Standard URL list sitemap
        locs = soup.find_all('loc')
        urls = [l.text.strip() for l in locs if l]
    except Exception:
        # Regex fallback for safety
        urls = re.findall(r'<loc>(.*?)</loc>', xml_content)
    return urls

