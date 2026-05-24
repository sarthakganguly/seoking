import os
import asyncio
import random
import logging
from playwright.async_api import async_playwright
from playwright_stealth import stealth_async
from app.database import get_user_setting

logger = logging.getLogger("seoking.scraper")

# Global callback hook set by main.py to broadcast CAPTCHA status to UI WebSockets
async_broadcast_callback = None

# Global flag to check if a CAPTCHA is currently active
captcha_active = False

def is_google_captcha(url: str, content: str) -> bool:
    """
    Checks if the page is a Google CAPTCHA / Sorry page.
    """
    url_lower = url.lower()
    if "google.com/sorry" in url_lower or "recaptcha" in url_lower:
        return True
    if "detected unusual traffic" in content or "google.com/sorry/index" in url_lower:
        return True
    return False

async def get_browser_options(user_id: int) -> dict:
    """
    Compiles Playwright browser context options from settings.
    """
    # Fetch settings from DB or use defaults
    geo_lat = float(get_user_setting(user_id, "geolocation_latitude", "37.7749"))
    geo_lon = float(get_user_setting(user_id, "geolocation_longitude", "-122.4194"))
    locale = get_user_setting(user_id, "locale", "en-US")
    timezone = get_user_setting(user_id, "timezone", "America/Los_Angeles")
    
    # Random realistic User-Agent
    user_agents = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    ]
    user_agent = random.choice(user_agents)

    options = {
        "user_agent": user_agent,
        "locale": locale,
        "timezone_id": timezone,
        "geolocation": {"latitude": geo_lat, "longitude": geo_lon},
        "permissions": ["geolocation"],
        "viewport": {"width": 1280, "height": 800}
    }
    logger.info(f"Generated browser options: Locale={locale}, Timezone={timezone}, Geolocation=({geo_lat}, {geo_lon})")
    return options

async def apply_human_jitter(user_id: int):
    """
    Injects random sleep delay between automated actions (humanized jitter).
    """
    jitter_min = int(get_user_setting(user_id, "jitter_min_ms", "3000"))
    jitter_max = int(get_user_setting(user_id, "jitter_max_ms", "8000"))
    delay = random.randint(jitter_min, jitter_max) / 1000.0
    logger.info(f"Applying human jitter delay of {delay:.2f}s")
    await asyncio.sleep(delay)

async def scrape_google_serp(user_id: int, query: str) -> str:
    """
    Queries Google for a search query, handles stealth, blocks, and CAPTCHAs.
    Returns: HTML content of the SERP.
    """
    global captcha_active
    
    # Compile options and run playwright in headful mode targeting display :99
    browser_options = await get_browser_options(user_id)
    url = f"https://www.google.com/search?q={query.replace(' ', '+')}&num=100"
    
    async with async_playwright() as p:
        # Launch Chromium in headful mode (headless=False) inside Xvfb
        logger.info(f"Launching headful Chromium for query: '{query}'")
        browser = await p.chromium.launch(
            headless=False,
            args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
        )
        
        context = await browser.new_context(**browser_options)
        page = await context.new_page()
        await stealth_async(page)
        
        logger.info(f"Navigating to {url}")
        await page.goto(url)
        await page.wait_for_load_state("networkidle")
        
        content = await page.content()
        
        # Check if Google returned a CAPTCHA/Sorry page
        if is_google_captcha(page.url, content):
            logger.warning("Google CAPTCHA block detected!")
            captcha_active = True
            
            # Notify UI via WebSocket callback
            if async_broadcast_callback:
                await async_broadcast_callback({
                    "type": "captcha_required",
                    "url": page.url,
                    "query": query
                })
            
            # Loop until the page is no longer on a CAPTCHA URL
            # The user interacts via noVNC to solve it.
            logger.info("Suspended scraper execution. Waiting for human CAPTCHA resolution via VNC...")
            while is_google_captcha(page.url, await page.content()):
                # Give user time to solve
                await asyncio.sleep(2.0)
            
            logger.info("CAPTCHA resolved. Resuming scraper execution.")
            captcha_active = False
            
            if async_broadcast_callback:
                await async_broadcast_callback({
                    "type": "captcha_resolved"
                })
            
            # Wait a moment and fetch updated content
            await page.wait_for_load_state("networkidle")
            content = await page.content()
            
        await browser.close()
        return content

async def scrape_url(user_id: int, target_url: str) -> str:
    """
    Scrapes a target website URL (e.g. for content optimization) using Playwright.
    Includes human-like behavior and handles SPA dynamic rendering.
    """
    browser_options = await get_browser_options(user_id)
    
    async with async_playwright() as p:
        logger.info(f"Launching headful Chromium for target website: {target_url}")
        browser = await p.chromium.launch(
            headless=False,
            args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
        )
        context = await browser.new_context(**browser_options)
        page = await context.new_page()
        await stealth_async(page)
        
        await page.goto(target_url, timeout=30000)
        # Wait for dynamic rendering (Single Page Apps)
        await page.wait_for_load_state("networkidle")
        
        content = await page.content()
        await browser.close()
        return content
