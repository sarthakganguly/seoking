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

# Global dict to track active crawl tasks, allowing cancellation
ACTIVE_CRAWLS = {}

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
        self.sitemap_urls = set()
        
        # Concurrency limit from user settings
        concurrency = int(get_user_setting(user_id, "max_concurrent_crawler_tabs", "3"))
        self.semaphore = asyncio.Semaphore(min(max(concurrency, 1), 5))
        
        # Run-wide checklist metadata
        self.run_details = {
            "has_robots_txt": False,
            "robots_txt_status": 404,
            "robots_txt_content": "",
            "sitemaps_found": [],
            "sitemap_urls_count": 0,
            "orphan_pages": []
        }

    async def run(self):
        """
        Starts the crawl: audits robots.txt/sitemaps, crawls pages recursively,
        discovers and audits orphan pages, and completes the run.
        """
        logger.info(f"Starting rigorous crawl for domain {self.domain} (run_id: {self.run_id})")
        
        # Step 1: Scan robots.txt and fetch XML Sitemaps
        await self.audit_robots_and_sitemaps()
        
        # Step 2: Queue seed page
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

        # Step 3: Scan Sitemap Orphan pages
        await self.check_orphan_pages()

        # Step 4: Run post-crawl PageRank, SSL checks, and blocking audits
        await self.post_crawl_calculations()

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

    def save_run_details(self):
        """
        Saves sitemap/robots/orphan metadata to SQLite.
        """
        conn = get_db_connection()
        cursor = conn.cursor()
        try:
            cursor.execute(
                "UPDATE audit_runs SET details_json = ? WHERE id = ?",
                (json.dumps(self.run_details), self.run_id)
            )
            conn.commit()
        except Exception as e:
            logger.error(f"Failed to save audit_run details: {e}")
        finally:
            conn.close()

    async def audit_robots_and_sitemaps(self):
        """
        Fetches robots.txt and parses XML sitemaps recursively.
        """
        robots_url = f"{self.base_url.rstrip('/')}/robots.txt"
        logger.info(f"Auditing robots.txt at {robots_url}")
        
        sitemap_seeds = []
        
        try:
            req = urllib.request.Request(robots_url, headers={'User-Agent': 'Mozilla/5.0 SEOKingBot/1.0'})
            response = await asyncio.to_thread(urllib.request.urlopen, req, timeout=8)
            self.run_details["has_robots_txt"] = True
            self.run_details["robots_txt_status"] = response.status
            
            content = response.read().decode('utf-8', errors='ignore')
            self.run_details["robots_txt_content"] = content
            
            # Find sitemaps in robots.txt directives
            for line in content.splitlines():
                if line.lower().strip().startswith("sitemap:"):
                    parts = line.split(":", 1)
                    if len(parts) == 2:
                        sitemap_seeds.append(parts[1].strip())
        except Exception as e:
            self.run_details["has_robots_txt"] = False
            self.run_details["robots_txt_status"] = 404
            logger.warning(f"Robots.txt check skipped/failed: {e}")
            
        # If no sitemaps declared, try common paths
        if not sitemap_seeds:
            sitemap_seeds = [
                f"{self.base_url.rstrip('/')}/sitemap.xml",
                f"{self.base_url.rstrip('/')}/sitemap_index.xml"
            ]
            
        # Parse XML sitemaps (limits to max 5 recursive XML fetches to save resource)
        sitemaps_to_fetch = sitemap_seeds.copy()
        sitemaps_fetched = []
        
        while sitemaps_to_fetch and len(sitemaps_fetched) < 5:
            s_url = sitemaps_to_fetch.pop(0)
            if s_url in sitemaps_fetched:
                continue
            sitemaps_fetched.append(s_url)
            
            try:
                req = urllib.request.Request(s_url, headers={'User-Agent': 'Mozilla/5.0 SEOKingBot/1.0'})
                response = await asyncio.to_thread(urllib.request.urlopen, req, timeout=8)
                if response.status == 200:
                    self.run_details["sitemaps_found"].append(s_url)
                    xml_content = response.read().decode('utf-8', errors='ignore')
                    
                    urls = parse_urls_from_xml(xml_content)
                    for u in urls:
                        if ".xml" in u.lower():
                            sitemaps_to_fetch.append(u)
                        else:
                            self.sitemap_urls.add(u)
            except Exception as e:
                logger.warning(f"Failed to fetch XML sitemap at {s_url}: {e}")
                
        self.run_details["sitemap_urls_count"] = len(self.sitemap_urls)
        self.save_run_details()

    async def check_orphan_pages(self):
        """
        Finds sitemap URLs that were never linked during crawls and checks if they are live.
        """
        candidates = self.sitemap_urls - self.visited
        orphans = []
        
        # Audit a max subset of sitemap orphans to prevent infinite request threads
        for url in list(candidates)[:20]:
            parsed = urllib.parse.urlparse(url)
            if parsed.netloc != self.netloc:
                continue
                
            try:
                req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 SEOKingBot/1.0'})
                # Fast HEAD check
                req.get_method = lambda: 'HEAD'
                response = await asyncio.to_thread(urllib.request.urlopen, req, timeout=5)
                if response.status == 200:
                    orphans.append(url)
            except Exception:
                pass
                
        self.run_details["orphan_pages"] = orphans
        self.save_run_details()

    async def post_crawl_calculations(self):
        """
        Runs post-crawl calculations: SSL checks, PageRank (ILR), incoming link counts,
        AI crawler block analyses, and aggregates top-level run details.
        """
        logger.info(f"Running post-crawl calculations for run_id {self.run_id}")
        
        # 1. Run SSL check on domain
        ssl_details = check_ssl(self.base_url)
        self.run_details["ssl_details"] = ssl_details
        
        # 2. Fetch all pages crawled for this run
        conn = get_db_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("SELECT id, url, details_json, issues_json FROM audit_pages WHERE audit_run_id = ?", (self.run_id,))
            rows = cursor.fetchall()
            pages = []
            for r in rows:
                p_id = r["id"]
                p_url = r["url"]
                try:
                    p_details = json.loads(r["details_json"])
                except Exception:
                    p_details = {}
                try:
                    p_issues = json.loads(r["issues_json"])
                except Exception:
                    p_issues = []
                pages.append({"id": p_id, "url": p_url, "details": p_details, "issues": p_issues})
                
            if not pages:
                return
                
            N = len(pages)
            
            # Compute incoming links mapping
            incoming_links_map = {p["url"]: [] for p in pages}
            outgoing_links_map = {p["url"]: p["details"].get("outgoing_links", []) for p in pages}
            
            for p in pages:
                for out_url in p["details"].get("outgoing_links", []):
                    if out_url in incoming_links_map:
                        incoming_links_map[out_url].append(p["url"])
            
            # Simple PageRank (ILR)
            pr = {p["url"]: 1.0 / N for p in pages}
            d = 0.85
            
            for _ in range(10):
                new_pr = {}
                dangling_weight = sum(pr[p["url"]] for p in pages if not outgoing_links_map[p["url"]]) / N
                
                for p in pages:
                    url = p["url"]
                    sum_links = 0.0
                    for incoming_url in incoming_links_map[url]:
                        out_count = len(outgoing_links_map[incoming_url])
                        if out_count > 0:
                            sum_links += pr[incoming_url] / out_count
                    
                    new_pr[url] = ((1 - d) / N) + d * (sum_links + dangling_weight)
                pr = new_pr
                
            # Normalize PageRank to 1-100 scale
            pr_vals = list(pr.values())
            min_pr = min(pr_vals) if pr_vals else 0.0
            max_pr = max(pr_vals) if pr_vals else 1.0
            pr_range = max_pr - min_pr
            
            ilr_scores = {}
            for url, val in pr.items():
                if pr_range > 0:
                    ilr_scores[url] = int(10 + (val - min_pr) / pr_range * 90)
                else:
                    ilr_scores[url] = 100
            
            # 3. Check AI robots blocking
            robots_txt_content = self.run_details.get("robots_txt_content", "")
            ai_bots = ["ChatGPT-User", "OAI-SearchBot", "Googlebot", "Google-Extended"]
            
            ai_blocked_counts = {bot: 0 for bot in ai_bots}
            total_ai_checks = len(pages) * len(ai_bots)
            blocked_ai_checks = 0
            
            # Update each page
            for p in pages:
                url = p["url"]
                parsed_url = urllib.parse.urlparse(url)
                url_path = parsed_url.path or "/"
                
                blocked_bots = []
                for bot in ai_bots:
                    is_blocked = is_bot_blocked_robots_txt(robots_txt_content, url_path, bot)
                    if is_blocked:
                        blocked_bots.append(bot)
                        ai_blocked_counts[bot] += 1
                        blocked_ai_checks += 1
                
                # Update details with post-crawl calculations
                p["details"]["incoming_links"] = incoming_links_map[url]
                p["details"]["incoming_links_count"] = len(incoming_links_map[url])
                p["details"]["ilr"] = ilr_scores[url]
                p["details"]["blocked_ai_bots"] = blocked_bots
                p["details"]["ssl_valid"] = ssl_details.get("valid", False) if url.startswith("https") else False
                
                # Add notices / warnings for specific issues shown in screenshots
                if blocked_bots and "Blocked from crawling by AI agents" not in p["issues"]:
                    p["issues"].append("Blocked from crawling by AI agents")
                
                # Save page changes
                cursor.execute(
                    "UPDATE audit_pages SET issues_json = ?, details_json = ? WHERE id = ?",
                    (json.dumps(p["issues"]), json.dumps(p["details"]), p["id"])
                )
                
            # Update top-level run details
            ai_search_health = int(((total_ai_checks - blocked_ai_checks) / total_ai_checks) * 100) if total_ai_checks > 0 else 100
            
            self.run_details["ai_search_health"] = ai_search_health
            self.run_details["ai_blocked_counts"] = ai_blocked_counts
            self.run_details["ssl_details"] = ssl_details
            
            conn.commit()
        except Exception as e:
            logger.error(f"Error in post-crawl calculations: {e}")
        finally:
            conn.close()

    def analyze_page_seo(self, url: str, status_code: int, response_headers: dict, html_content: bytes) -> dict:
        """
        Parses HTML and executes 16 rigorous technical SEO checklists.
        """
        soup = BeautifulSoup(html_content, 'html.parser')
        
        # 1. Canonical URLs
        canonical_tag = soup.find('link', attrs={'rel': 'canonical'})
        canonical_url = canonical_tag.get('href', '').strip() if canonical_tag else None
        
        # 2. Noindex Tags
        is_noindex = False
        meta_robots = soup.find('meta', attrs={'name': 'robots'})
        if meta_robots:
            content = meta_robots.get('content', '').lower()
            if 'noindex' in content:
                is_noindex = True
                
        # Check HTTP headers for x-robots noindex
        for k, v in response_headers.items():
            if k.lower() == 'x-robots-tag' and 'noindex' in v.lower():
                is_noindex = True
                
        # 3. Text & Content word length (Thin content)
        body_soup = BeautifulSoup(html_content, 'html.parser')
        for element in body_soup(["script", "style", "nav", "header", "footer", "aside", "noscript"]):
            element.decompose()
        body_text = body_soup.get_text(separator=" ")
        words = body_text.split()
        word_count = len(words)
        thin_content = (word_count < 300)
        
        # 4. JS-Dependent Rendering Risk
        js_dependent = False
        if word_count < 150:
            script_srcs = [s.get('src', '').lower() for s in soup.find_all('script') if s.get('src')]
            script_ids = [s.get('id', '').lower() for s in soup.find_all('script') if s.get('id')]
            frameworks = ['react', 'vue', 'angular', 'next', 'nuxt', 'bundle', 'main.', 'webpack']
            if any(any(f in src for f in frameworks) for src in script_srcs) or \
               any(any(f in sid for f in frameworks) for sid in script_ids) or \
               soup.find(id='app') or soup.find(id='root'):
                js_dependent = True

        # 5. Header hierarchy sequence
        headers = []
        h1_count = 0
        violations = []
        last_level = 0
        for h in soup.find_all(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']):
            h_name = h.name.lower()
            h_text = h.get_text().strip()
            headers.append((h_name, h_text))
            
            level = int(h_name[1])
            if level == 1:
                h1_count += 1
            if last_level > 0 and level > last_level + 1:
                violations.append(f"Header Hierarchy Jump: {last_level.upper()} to {h_name.upper()}")
            last_level = level

        # 6. Alt images count
        images = soup.find_all('img')
        total_images = len(images)
        missing_alts = []
        for img in images:
            alt = img.get('alt')
            src = img.get('src', '')
            if alt is None or alt.strip() == "":
                missing_alts.append(src)

        # 7. Structured schema check
        schemas_found = []
        malformed_schema = False
        json_ld_blocks = soup.find_all('script', attrs={'type': 'application/ld+json'})
        for block in json_ld_blocks:
            try:
                schema_data = json.loads(block.string)
                if isinstance(schema_data, dict):
                    t = schema_data.get('@type')
                    if t: schemas_found.append(t)
                elif isinstance(schema_data, list):
                    for item in schema_data:
                        t = item.get('@type')
                        if t: schemas_found.append(t)
            except Exception:
                malformed_schema = True

        # Capture Microdata itemtypes
        microdata_elements = soup.find_all(attrs={'itemtype': True})
        for el in microdata_elements:
            itype = el.get('itemtype', '')
            type_name = itype.split('/')[-1] if '/' in itype else itype
            if type_name and type_name not in schemas_found:
                schemas_found.append(type_name)

        # 8. Breadcrumbs check
        has_breadcrumbs = False
        if "BreadcrumbList" in schemas_found:
            has_breadcrumbs = True
        else:
            breadcrumb_elements = soup.find_all(attrs={'class': True})
            for el in breadcrumb_elements:
                c_names = el.get('class')
                if isinstance(c_names, list):
                    c_names = " ".join(c_names)
                if 'breadcrumb' in c_names.lower():
                    has_breadcrumbs = True
                    break

        # 9. WordPress taxonomy redundant checks
        is_taxonomy = False
        parsed_url = urllib.parse.urlparse(url)
        path_lower = parsed_url.path.lower()
        if any(tax in path_lower for tax in ['/category/', '/tag/', '/author/', '/archive/']):
            is_taxonomy = True

        # 10. Pagination checks
        prev_link = soup.find('link', attrs={'rel': 'prev'})
        next_link = soup.find('link', attrs={'rel': 'next'})
        has_pagination = (prev_link is not None or next_link is not None or "?page=" in url.lower() or "&p=" in url.lower())

        # 11. Links generic / empty anchor checks
        total_links = 0
        empty_anchors = 0
        generic_anchors = 0
        generic_terms = {'click here', 'read more', 'learn more', 'link', 'more', 'here', 'go', 'view'}
        for a in soup.find_all('a', href=True):
            total_links += 1
            a_text = a.get_text().strip().lower()
            if not a_text:
                empty_anchors += 1
            elif a_text in generic_terms:
                generic_anchors += 1

        # 12. Gather Audit Issues
        issues = []
        title_tag = soup.find('title')
        if not title_tag:
            issues.append("Missing Title Tag")
        else:
            title_str = title_tag.string or ''
            if len(title_str) < 30:
                issues.append("Title Tag too short")
            elif len(title_str) > 60:
                issues.append("Title Tag too long")
                
        meta_desc_tag = soup.find('meta', attrs={'name': 'description'})
        if not meta_desc_tag:
            issues.append("Missing Meta Description")
        else:
            desc_len = len(meta_desc_tag.get('content', ''))
            if desc_len < 120:
                issues.append("Meta Description too short")
            elif desc_len > 160:
                issues.append("Meta Description too long")
                
        if not canonical_url:
            issues.append("Missing Canonical Tag")
        elif canonical_url != url:
            if canonical_url.replace("https://", "http://").rstrip("/") != url.replace("https://", "http://").rstrip("/"):
                issues.append("Canonical Mismatch")
                
        if h1_count == 0:
            issues.append("Missing H1 Header")
        elif h1_count > 1:
            issues.append("Multiple H1 Headers")
            
        if violations:
            issues.extend(violations)
        if thin_content:
            issues.append("Thin Content (< 300 words)")
        if js_dependent:
            issues.append("High JS Rendering Reliance")
        if len(missing_alts) > 0:
            issues.append(f"Missing Alt Tags ({len(missing_alts)} images)")
        if malformed_schema:
            issues.append("Malformed Schema Markup")
        if is_taxonomy and thin_content:
            issues.append("Redundant Taxonomy Page")

        # Extract resources count and schema flags
        css_count = len(soup.find_all('link', rel='stylesheet'))
        js_count = len([s for s in soup.find_all('script') if s.get('src')])
        has_microdata = len(soup.find_all(attrs={'itemtype': True})) > 0
        has_json_ld = len(soup.find_all('script', attrs={'type': 'application/ld+json'})) > 0
        has_og = len(soup.find_all('meta', attrs={'property': re.compile(r'^og:')})) > 0
        has_twitter = len(soup.find_all('meta', attrs={'name': re.compile(r'^twitter:')})) > 0

        return {
            "canonical_url": canonical_url,
            "is_noindex": 1 if is_noindex else 0,
            "word_count": word_count,
            "issues": issues,
            "details": {
                "thin_content": thin_content,
                "js_dependent": js_dependent,
                "has_schema": len(schemas_found) > 0,
                "schemas": schemas_found,
                "has_breadcrumbs": has_breadcrumbs,
                "is_taxonomy": is_taxonomy,
                "has_pagination": has_pagination,
                "header_hierarchy": headers,
                "css_count": css_count,
                "js_count": js_count,
                "has_microdata": has_microdata,
                "has_json_ld": has_json_ld,
                "has_og": has_og,
                "has_twitter": has_twitter,
                "images": {
                    "total": total_images,
                    "missing_alts_count": len(missing_alts),
                    "missing_alts": missing_alts[:15]
                },
                "links": {
                    "total": total_links,
                    "empty_anchors": empty_anchors,
                    "generic_anchors": generic_anchors
                }
            }
        }

    async def process_page(self, url: str, depth: int) -> tuple[list[str], int]:
        """
        Processes a single page: fetches it, parses html, saves detailed audits.
        """
        async with self.semaphore:
            path = urllib.parse.urlparse(url).path.lower()
            if path.endswith(('.png', '.jpg', '.jpeg', '.gif', '.pdf', '.zip', '.tar', '.gz', '.mp4', '.mp3', '.css', '.js')):
                return [], depth

            logger.info(f"Crawling URL: {url} (Depth: {depth})")
            
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
            discovered_links = []
            
            # Request
            import time
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
                if final_url != url:
                    has_redirect = True
                    redirect_url = final_url
                    logger.info(f"Redirection from {url} to {final_url}")
                
                content_type = response.headers.get('Content-Type', '')
                if 'text/html' in content_type:
                    html_content = response.read()
                    
                    # Parse standard features
                    soup = BeautifulSoup(html_content, 'html.parser')
                    title_tag = soup.find('title')
                    title = title_tag.string.strip() if title_tag and title_tag.string else None
                    
                    meta_tag = soup.find('meta', attrs={'name': 'description'})
                    meta_desc = meta_tag.get('content', '').strip() if meta_tag else None
                    if meta_desc == "":
                        meta_desc = None
                        
                    h1_tag = soup.find('h1')
                    h1 = h1_tag.get_text().strip() if h1_tag else None
                    
                    # Parse internal links
                    for a_tag in soup.find_all('a', href=True):
                        href = a_tag['href']
                        full_href = urllib.parse.urljoin(url, href)
                        full_href = urllib.parse.urljoin(full_href, urllib.parse.urlparse(full_href).path)
                        discovered_links.append(full_href)
                        
                    # Execute rigorous audits
                    response_headers = dict(response.headers)
                    audit_res = self.analyze_page_seo(url, status_code, response_headers, html_content)
                    canonical_url = audit_res["canonical_url"]
                    is_noindex = audit_res["is_noindex"]
                    word_count = audit_res["word_count"]
                    issues = audit_res["issues"]
                    details = audit_res["details"]
                    
                # Store depth, load_time, and outgoing links
                details["depth"] = depth
                details["load_time"] = round(load_time, 3)
                
                internal_links = []
                for l in discovered_links:
                    try:
                        parsed_l = urllib.parse.urlparse(l)
                        if parsed_l.netloc == self.netloc:
                            internal_links.append(l)
                    except Exception:
                        pass
                details["outgoing_links"] = list(set(internal_links))
                
            except HTTPError as e:
                load_time = time.time() - start_time
                status_code = e.code
                is_broken = (status_code == 404)
                logger.warning(f"HTTP Error {status_code} for {url}")
                issues = ["Broken Link (404)"] if is_broken else [f"HTTP Error {status_code}"]
                details["depth"] = depth
                details["load_time"] = round(load_time, 3)
                details["outgoing_links"] = []
            except URLError as e:
                load_time = time.time() - start_time
                status_code = 0
                is_broken = True
                logger.error(f"URL Error for {url}: {e.reason}")
                issues = ["Network Resolution Error"]
                details["depth"] = depth
                details["load_time"] = round(load_time, 3)
                details["outgoing_links"] = []
            except Exception as e:
                load_time = time.time() - start_time
                status_code = 0
                is_broken = True
                logger.error(f"General error crawling {url}: {e}")
                issues = ["Crawl Execution Failure"]
                details["depth"] = depth
                details["load_time"] = round(load_time, 3)
                details["outgoing_links"] = []

            # Save to SQLite Database
            self.crawled_count += 1
            conn = get_db_connection()
            cursor = conn.cursor()
            try:
                cursor.execute(
                    """
                    INSERT INTO audit_pages (
                        audit_run_id, url, status_code, title_tag, meta_description, 
                        h1_tag, is_broken, has_redirect, redirect_url, canonical_url,
                        is_noindex, word_count, issues_json, details_json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        self.run_id, url, status_code, title, meta_desc, h1, 
                        1 if is_broken else 0, 1 if has_redirect else 0, redirect_url,
                        canonical_url, 1 if is_noindex else 0, word_count,
                        json.dumps(issues), json.dumps(details)
                    )
                )
                
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
