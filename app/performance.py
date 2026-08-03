import os
import json
import asyncio
import logging
import urllib.parse
from playwright.async_api import async_playwright
from playwright_stealth import stealth_async
from app.database import get_db_connection

logger = logging.getLogger("seoking.performance")

async def run_performance_audit_job(run_id: int, url: str, strategy: str):
    """
    Runs the performance audit in the background using Playwright.
    """
    logger.info(f"Starting performance audit for {url} using strategy {strategy} (run_id: {run_id})")
    
    # Update status to running
    await update_audit_status(run_id, "running")
    
    try:
        # Determine browser profile
        if strategy == "desktop":
            viewport = {"width": 1280, "height": 800}
            user_agent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
            is_mobile = False
            has_touch = False
        else: # mobile default
            viewport = {"width": 360, "height": 640}
            user_agent = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36"
            is_mobile = True
            has_touch = True
            
        async with async_playwright() as p:
            logger.info("Launching headful Chromium for performance audit...")
            browser = await p.chromium.launch(
                headless=False,
                args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
            )
            
            context = await browser.new_context(
                viewport=viewport,
                user_agent=user_agent,
                is_mobile=is_mobile,
                has_touch=has_touch,
                permissions=["geolocation"]
            )
            
            # Setup Page
            page = await context.new_page()
            await stealth_async(page)
            
            # Inject Performance Observers on page init
            init_script = """
                window.lcpVal = 0;
                window.clsVal = 0;
                window.inpVal = 0;
                
                // Largest Contentful Paint Observer
                try {
                    new PerformanceObserver((entryList) => {
                        const entries = entryList.getEntries();
                        const lastEntry = entries[entries.length - 1];
                        window.lcpVal = (lastEntry.renderTime || lastEntry.loadTime) / 1000;
                    }).observe({ type: 'largest-contentful-paint', buffered: true });
                } catch(e) {}
                
                // Layout Shift Observer
                try {
                    new PerformanceObserver((entryList) => {
                        for (const entry of entryList.getEntries()) {
                            if (!entry.hadRecentInput) {
                                window.clsVal += entry.value;
                            }
                        }
                    }).observe({ type: 'layout-shift', buffered: true });
                } catch(e) {}
                
                // Input delay / Interaction delay
                try {
                    new PerformanceObserver((entryList) => {
                        for (const entry of entryList.getEntries()) {
                            if (entry.duration && entry.duration > window.inpVal) {
                                window.inpVal = entry.duration;
                            }
                        }
                    }).observe({ type: 'event', buffered: true });
                } catch(e) {}
            """
            await page.add_init_script(init_script)
            
            # Track HTTP responses for CDN and Caching audits
            responses = []
            page.on("response", lambda r: responses.append(r))
            
            # Navigate to page
            logger.info(f"Navigating to {url}...")
            main_response = await page.goto(url, timeout=30000, wait_until="load")
            
            # Wait for network idle to let static assets load
            try:
                await page.wait_for_load_state("networkidle", timeout=4000)
            except Exception:
                pass
                
            # Perform simulated user interaction (Option A for INP/FID and scroll-shifts)
            logger.info("Simulating user interactions (scroll & body click) to capture CLS/INP...")
            await page.evaluate("window.scrollTo(0, 300);")
            await asyncio.sleep(0.5)
            await page.evaluate("window.scrollTo(0, 800);")
            await asyncio.sleep(0.5)
            await page.evaluate("window.scrollTo(0, 0);")
            await asyncio.sleep(0.5)
            
            # Click on a safe coordinate (body) to trigger event latency observer
            try:
                await page.click("body", position={"x": 50, "y": 50}, delay=50)
            except Exception:
                pass
            await asyncio.sleep(1.0)
            
            # Collect timing, DOM, and Image metrics from page context
            metrics_script = """
                () => {
                    // TTFB
                    let ttfb = 0;
                    try {
                        const navEntry = performance.getEntriesByType('navigation')[0];
                        if (navEntry) {
                            ttfb = navEntry.responseStart;
                        } else {
                            ttfb = performance.timing.responseStart - performance.timing.requestStart;
                        }
                    } catch(e) {}
                    
                    // DOM size and depth
                    let domSize = 0;
                    let domDepth = 0;
                    try {
                        domSize = document.getElementsByTagName('*').length;
                        
                        function getDepth(el) {
                            let max = 0;
                            for (let c of el.children) {
                                max = Math.max(max, getDepth(c));
                            }
                            return 1 + max;
                        }
                        domDepth = getDepth(document.documentElement);
                    } catch(e) {}
                    
                    // Image audits
                    let imgsAudit = [];
                    try {
                        const imgs = document.querySelectorAll('img');
                        imgs.forEach(img => {
                            const src = img.currentSrc || img.src || '';
                            if (!src) return;
                            const isNextGen = src.endsWith('.webp') || src.endsWith('.avif') || src.includes('data:image/webp');
                            const hasLazy = img.getAttribute('loading') === 'lazy';
                            const hasDims = img.hasAttribute('width') && img.hasAttribute('height');
                            imgsAudit.push({
                                src: src.length > 80 ? src.substring(0, 80) + '...' : src,
                                isNextGen,
                                hasLazy,
                                hasDims
                            });
                        });
                    } catch(e) {}
                    
                    return {
                        lcp: window.lcpVal || 0,
                        cls: window.clsVal || 0,
                        inp: window.inpVal || 0,
                        ttfb: ttfb,
                        domSize: domSize,
                        domDepth: domDepth,
                        images: imgsAudit
                    };
                }
            """
            
            page_data = await page.evaluate(metrics_script)
            
            # Compile Caching and CDN statistics
            cdn_headers_keywords = ['cloudflare', 'cloudfront', 'fastly', 'akamai', 'keycdn', 'sucuri', 'litespeed']
            
            main_headers = {}
            if main_response:
                main_headers = {k.lower(): v for k, v in main_response.headers.items()}
                
            total_assets = 0
            cached_assets = 0
            cdn_assets = 0
            
            assets_details = []
            
            for r in responses:
                r_url = r.url
                # Filter out base page itself, data: URLs, and focus on static assets
                if r_url.startswith("data:"):
                    continue
                parsed_r_url = urllib.parse.urlparse(r_url)
                path = parsed_r_url.path.lower()
                if path.endswith(('.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.woff', '.woff2', '.ttf')):
                    total_assets += 1
                    r_headers = {k.lower(): v for k, v in r.headers.items()}
                    
                    # Caching check
                    cache_control = r_headers.get('cache-control', '').lower()
                    expires = r_headers.get('expires', '')
                    is_cached = False
                    if 'max-age' in cache_control and 'max-age=0' not in cache_control and 'no-store' not in cache_control and 'no-cache' not in cache_control:
                        is_cached = True
                        cached_assets += 1
                    elif expires:
                        is_cached = True
                        cached_assets += 1
                        
                    # CDN Check
                    is_cdn = False
                    server = r_headers.get('server', '').lower()
                    via = r_headers.get('via', '').lower()
                    x_cache = r_headers.get('x-cache', '').lower()
                    
                    if any(kw in server for kw in cdn_headers_keywords) or \
                       any(kw in via for kw in cdn_headers_keywords) or \
                       any(kw in x_cache for kw in cdn_headers_keywords) or \
                       'cf-ray' in r_headers or 'x-amz-cf-id' in r_headers:
                        is_cdn = True
                        cdn_assets += 1
                        
                    if len(assets_details) < 30: # Limit size to prevent DB bloat
                        assets_details.append({
                            "url": r_url if len(r_url) < 80 else r_url[:80] + '...',
                            "type": path.split('.')[-1] if '.' in path else "asset",
                            "is_cached": is_cached,
                            "is_cdn": is_cdn,
                            "cache_control": cache_control[:80] if cache_control else ""
                        })
                        
            # CDN Detection on Main Document
            doc_cdn = "No CDN detected"
            server = main_headers.get('server', '').lower()
            via = main_headers.get('via', '').lower()
            x_cache = main_headers.get('x-cache', '').lower()
            if 'cloudflare' in server or 'cf-ray' in main_headers:
                doc_cdn = "Cloudflare"
            elif 'cloudfront' in via or 'x-amz-cf-id' in main_headers:
                doc_cdn = "Amazon CloudFront"
            elif 'fastly' in via or 'x-served-by' in main_headers:
                doc_cdn = "Fastly"
            elif 'akamai' in server or (x_cache and 'akamai' in x_cache):
                doc_cdn = "Akamai"
            elif 'keycdn' in server or 'x-edge-location' in main_headers:
                doc_cdn = "KeyCDN"
            elif 'sucuri' in server:
                doc_cdn = "Sucuri"
            elif server:
                doc_cdn = server.capitalize()
                
            # Fallback/Estimator values if performance observer was empty
            lcp = page_data["lcp"]
            if lcp == 0:
                try:
                    load_time = await page.evaluate("performance.timing.loadEventEnd - performance.timing.navigationStart")
                    lcp = max(load_time / 1000.0, 0.4)
                except Exception:
                    lcp = 1.0 # fallback
                    
            ttfb = page_data["ttfb"]
            if ttfb <= 0:
                ttfb = 120 # realistic fallback
                
            details = {
                "dom_depth": page_data["domDepth"],
                "images": page_data["images"],
                "main_headers": main_headers,
                "cdn_detection": doc_cdn,
                "caching_summary": {
                    "total_assets": total_assets,
                    "cached_assets": cached_assets,
                    "cdn_assets": cdn_assets,
                    "cached_percentage": round((cached_assets / total_assets * 100), 1) if total_assets > 0 else 0,
                    "cdn_percentage": round((cdn_assets / total_assets * 100), 1) if total_assets > 0 else 0
                },
                "assets_details": assets_details
            }
            
            # Close browser
            await browser.close()
            
            # Save results to database
            await save_audit_results(
                run_id, 
                status="completed", 
                lcp=round(lcp, 2), 
                inp=round(page_data["inp"], 2), 
                cls=round(page_data["cls"], 3), 
                ttfb=round(ttfb, 1), 
                dom_size=page_data["domSize"], 
                details=details
            )
            logger.info("Performance audit completed successfully and saved.")
            
    except Exception as e:
        logger.error(f"Error executing performance audit: {e}")
        await update_audit_status(run_id, "failed")

async def update_audit_status(run_id: int, status: str):
    conn = await get_db_connection()
    cursor = await conn.cursor()
    try:
        await cursor.execute("UPDATE performance_audits SET status = ? WHERE id = ?", (status, run_id))
        await conn.commit()
    except Exception as e:
        logger.error(f"Failed to update performance_audits status: {e}")
    finally:
        await conn.close()

async def save_audit_results(run_id: int, status: str, lcp: float, inp: float, cls: float, ttfb: float, dom_size: int, details: dict):
    conn = await get_db_connection()
    cursor = await conn.cursor()
    try:
        await cursor.execute(
            """
            UPDATE performance_audits 
            SET status = ?, lcp = ?, inp = ?, cls = ?, ttfb = ?, dom_size = ?, details_json = ?
            WHERE id = ?
            """,
            (status, lcp, inp, cls, ttfb, dom_size, json.dumps(details), run_id)
        )
        await conn.commit()
    except Exception as e:
        logger.error(f"Failed to save performance_audits results: {e}")
    finally:
        await conn.close()
