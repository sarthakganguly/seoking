import os
import asyncio
import urllib.request
import urllib.parse
from urllib.error import HTTPError, URLError
import logging
from bs4 import BeautifulSoup
from app.database import get_db_connection, get_user_setting

logger = logging.getLogger("seoking.crawler")

# Global dict to track active crawl tasks, allowing cancellation
ACTIVE_CRAWLS = {}

class AuditCrawler:
    def __init__(self, user_id: int, run_id: int, domain: str, max_depth: int):
        self.user_id = user_id
        self.run_id = run_id
        self.domain = domain
        self.max_depth = max_depth
        self.base_url = f"http://{domain}" if not domain.startswith(("http://", "https://")) else domain
        parsed = urllib.parse.urlparse(self.base_url)
        self.netloc = parsed.netloc
        self.visited = set()
        self.crawled_count = 0
        
        # Concurrency limit from user settings
        concurrency = int(get_user_setting(user_id, "max_concurrent_crawler_tabs", "3"))
        self.semaphore = asyncio.Semaphore(min(max(concurrency, 1), 5))

    async def run(self):
        """
        Starts the crawl from the seed URL.
        """
        logger.info(f"Starting crawl for domain {self.domain} (run_id: {self.run_id}, max_depth: {self.max_depth})")
        
        # Initial queue: (url, current_depth)
        queue = [(self.base_url, 0)]
        
        while queue:
            # Check if this crawl run was canceled
            if ACTIVE_CRAWLS.get(self.run_id) == "cancelled":
                logger.info(f"Crawl run {self.run_id} cancelled by user.")
                self.update_run_status("cancelled")
                return

            # Batch process based on concurrency limit
            batch = []
            while queue and len(batch) < self.semaphore._value:
                url, depth = queue.pop(0)
                if url not in self.visited:
                    self.visited.add(url)
                    batch.append((url, depth))

            if not batch:
                continue

            tasks = [self.process_page(url, depth) for url, depth in batch]
            results = await asyncio.gather(*tasks)

            # Extract new internal links found
            for new_links, current_depth in results:
                if current_depth < self.max_depth:
                    for link in new_links:
                        # Normalize and ensure same domain
                        parsed_link = urllib.parse.urlparse(link)
                        if parsed_link.netloc == self.netloc and link not in self.visited:
                            queue.append((link, current_depth + 1))

        self.update_run_status("completed")
        logger.info(f"Crawl completed. Crawled {self.crawled_count} pages.")

    def update_run_status(self, status: str):
        """
        Updates the final status and completion time in the database.
        """
        conn = get_db_connection()
        cursor = conn.cursor()
        try:
            cursor.execute(
                """
                UPDATE audit_runs 
                SET status = ?, total_urls_crawled = ?, completed_at = CURRENT_TIMESTAMP 
                WHERE id = ?
                """,
                (status, self.crawled_count, self.run_id)
            )
            conn.commit()
        except Exception as e:
            logger.error(f"Failed to update audit_run status: {e}")
        finally:
            conn.close()

    async def process_page(self, url: str, depth: int) -> tuple[list[str], int]:
        """
        Processes a single page: fetches it, parses html, saves audit features to SQLite.
        Returns: (list_of_discovered_internal_links, current_depth)
        """
        async with self.semaphore:
            # Skip non-HTML resource links (files, PDF, ZIP, images etc.)
            path = urllib.parse.urlparse(url).path.lower()
            if path.endswith(('.png', '.jpg', '.jpeg', '.gif', '.pdf', '.zip', '.tar', '.gz', '.mp4', '.mp3', '.css', '.js')):
                return [], depth

            logger.info(f"Crawling URL: {url} (Depth: {depth})")
            
            # Default audit parameters
            status_code = 0
            title = None
            meta_desc = None
            h1 = None
            is_broken = False
            has_redirect = False
            redirect_url = None
            discovered_links = []
            
            # Perform HTTP Request
            req = urllib.request.Request(
                url, 
                headers={'User-Agent': 'Mozilla/5.0 SEOKingBot/1.0'}
            )
            
            try:
                # Wrap blocking urllib in asyncio.to_thread
                response = await asyncio.to_thread(urllib.request.urlopen, req, timeout=10)
                status_code = response.status
                
                # Check for redirection
                final_url = response.geturl()
                if final_url != url:
                    has_redirect = True
                    redirect_url = final_url
                    logger.info(f"Redirection detected from {url} to {final_url}")
                
                content_type = response.headers.get('Content-Type', '')
                if 'text/html' in content_type:
                    html_content = response.read()
                    
                    # Parse using BeautifulSoup
                    soup = BeautifulSoup(html_content, 'html.parser')
                    
                    # Title
                    title_tag = soup.find('title')
                    title = title_tag.string.strip() if title_tag and title_tag.string else None
                    
                    # Meta Description
                    meta_tag = soup.find('meta', attrs={'name': 'description'})
                    meta_desc = meta_tag.get('content', '').strip() if meta_tag else None
                    if meta_desc == "":
                        meta_desc = None
                        
                    # H1 Header
                    h1_tag = soup.find('h1')
                    h1 = h1_tag.get_text().strip() if h1_tag else None
                    
                    # Find all internal links
                    for a_tag in soup.find_all('a', href=True):
                        href = a_tag['href']
                        # Resolve relative links
                        full_href = urllib.parse.urljoin(url, href)
                        # De-fragment
                        full_href = urllib.parse.urljoin(full_href, urllib.parse.urlparse(full_href).path)
                        discovered_links.append(full_href)
                        
            except HTTPError as e:
                status_code = e.code
                is_broken = (status_code == 404)
                logger.warning(f"HTTP Error {status_code} for {url}")
            except URLError as e:
                status_code = 0
                is_broken = True
                logger.error(f"URL Error for {url}: {e.reason}")
            except Exception as e:
                status_code = 0
                is_broken = True
                logger.error(f"General error crawling {url}: {e}")

            # Save to Database
            self.crawled_count += 1
            conn = get_db_connection()
            cursor = conn.cursor()
            try:
                cursor.execute(
                    """
                    INSERT INTO audit_pages (
                        audit_run_id, url, status_code, title_tag, meta_description, 
                        h1_tag, is_broken, has_redirect, redirect_url
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        self.run_id, url, status_code, title, meta_desc, 
                        h1, 1 if is_broken else 0, 1 if has_redirect else 0, redirect_url
                    )
                )
                
                # Live update crawled counter in audit_runs
                cursor.execute(
                    "UPDATE audit_runs SET total_urls_crawled = ? WHERE id = ?",
                    (self.crawled_count, self.run_id)
                )
                conn.commit()
            except Exception as e:
                logger.error(f"Error saving audit results for {url}: {e}")
            finally:
                conn.close()

            return discovered_links, depth

async def start_crawl_job(user_id: int, domain: str, max_depth: int) -> int:
    """
    Spawns an asynchronous site audit job.
    Returns: run_id
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    run_id = None
    try:
        cursor.execute(
            "INSERT INTO audit_runs (user_id, domain, status) VALUES (?, ?, 'running')",
            (user_id, domain)
        )
        conn.commit()
        run_id = cursor.lastrowid
    except Exception as e:
        logger.error(f"Failed to create audit run: {e}")
        return None
    finally:
        conn.close()

    if run_id:
        crawler = AuditCrawler(user_id, run_id, domain, max_depth)
        ACTIVE_CRAWLS[run_id] = "running"
        # Run background task
        asyncio.create_task(run_crawler_task(run_id, crawler))
    
    return run_id

async def run_crawler_task(run_id: int, crawler: AuditCrawler):
    try:
        await crawler.run()
    except Exception as e:
        logger.error(f"Exception in crawler thread: {e}")
        crawler.update_run_status("failed")
    finally:
        if run_id in ACTIVE_CRAWLS:
            del ACTIVE_CRAWLS[run_id]
