from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
import urllib.request
import asyncio
from app.auth import get_current_user
from app.scraper import scrape_url, audit_mobile_rendering
from app.crawler import AuditCrawler

router = APIRouter(prefix="/api/tools", tags=["standalone-tools"])

class RobotsTxtReq(BaseModel):
    urls_to_disallow: List[str] = []
    allowed_directories: List[str] = []
    target_crawlers: List[str] = []
    sitemap_url: Optional[str] = None

@router.post("/robots-txt-creator")
def create_robots_txt(data: RobotsTxtReq, user_id: int = Depends(get_current_user)):
    """12.1 Interactive Robots.txt Creator & Rule Tester"""
    lines = []
    crawlers = data.target_crawlers if data.target_crawlers else ["*", "Googlebot", "Googlebot-Image", "Google-Extended"]
    
    for crawler in crawlers:
        lines.append(f"User-agent: {crawler}")
        if not data.urls_to_disallow and not data.allowed_directories:
            lines.append("Disallow:")
        else:
            for d in data.urls_to_disallow:
                lines.append(f"Disallow: {d}")
            for a in data.allowed_directories:
                lines.append(f"Allow: {a}")
        lines.append("")
        
    if data.sitemap_url:
        lines.append(f"Sitemap: {data.sitemap_url}")
        lines.append("")

    return {"message": "Robots.txt created", "content": "\n".join(lines).strip()}

class SchemaGeneratorReq(BaseModel):
    schema_type: str
    parameters: dict

@router.post("/schema-generator")
def generate_schema(data: SchemaGeneratorReq, user_id: int = Depends(get_current_user)):
    """12.2 Multi-Schema JSON-LD Markup Generator & Validator"""
    import json
    json_ld = {
        "@context": "https://schema.org",
        "@type": data.schema_type
    }
    json_ld.update(data.parameters)
    return json_ld

class UrlItem(BaseModel):
    loc: str
    lastmod: Optional[str] = None
    changefreq: Optional[str] = None
    priority: Optional[str] = None
    image_loc: Optional[str] = None
    image_title: Optional[str] = None
    video_thumbnail: Optional[str] = None
    video_title: Optional[str] = None
    video_description: Optional[str] = None
    video_content_url: Optional[str] = None
    news_name: Optional[str] = None
    news_lang: Optional[str] = None
    news_date: Optional[str] = None
    news_title: Optional[str] = None

class SitemapBuilderReq(BaseModel):
    mode: str = "crawl"  # crawl or manual
    domain: Optional[str] = None
    max_depth: int = 2
    sitemap_type: str = "standard"  # standard, image, video, news
    urls: List[str] = []
    items: Optional[List[UrlItem]] = None
    default_lastmod: Optional[str] = None
    default_changefreq: Optional[str] = None
    default_priority: Optional[str] = None

async def crawl_domain_for_sitemap(domain: str, max_depth: int = 2) -> list[dict]:
    """
    Crawls a target domain to discover internal URLs and media assets for XML sitemap generation.
    """
    import urllib.parse
    import urllib.request
    from bs4 import BeautifulSoup
    import asyncio
    
    clean_domain = domain.strip()
    if not clean_domain.startswith(("http://", "https://")):
        base_url = f"https://{clean_domain}"
    else:
        base_url = clean_domain

    parsed_base = urllib.parse.urlparse(base_url)
    netloc = parsed_base.netloc.lower()
    
    visited = set()
    discovered_items = []
    queue = [(base_url, 0)]
    max_pages = 300  # Cap total page discovery for fast tool execution
    
    while queue and len(visited) < max_pages:
        batch = []
        while queue and len(batch) < 5:
            url, depth = queue.pop(0)
            if url not in visited and depth <= max_depth:
                visited.add(url)
                batch.append((url, depth))
                
        if not batch:
            continue
            
        async def fetch_page(item):
            target_url, depth = item
            try:
                req = urllib.request.Request(target_url, headers={'User-Agent': 'Mozilla/5.0 SEOKingBot/1.0'})
                resp = await asyncio.to_thread(urllib.request.urlopen, req, timeout=6)
                if resp.status != 200:
                    return [], None
                content_type = resp.headers.get('Content-Type', '')
                if 'text/html' not in content_type:
                    return [], None
                html = resp.read()
                soup = BeautifulSoup(html, 'html.parser')
                
                # Extract internal links
                links = []
                for a in soup.find_all('a', href=True):
                    href = a['href'].strip()
                    if href and not href.startswith(('#', 'javascript:', 'mailto:', 'tel:')):
                        abs_href = urllib.parse.urljoin(target_url, href)
                        abs_parsed = urllib.parse.urlparse(abs_href)
                        clean_href = urllib.parse.urlunparse((abs_parsed.scheme, abs_parsed.netloc.lower(), abs_parsed.path, '', '', ''))
                        if abs_parsed.netloc.lower() == netloc:
                            links.append((clean_href, depth + 1))
                            
                # Extract image item
                image_loc = None
                img = soup.find('img', src=True)
                if img:
                    image_loc = urllib.parse.urljoin(target_url, img['src'])
                    
                return links, {
                    "loc": target_url,
                    "image_loc": image_loc
                }
            except Exception:
                return [], None
                
        tasks = [fetch_page(item) for item in batch]
        results = await asyncio.gather(*tasks)
        
        for new_links, page_item in results:
            if page_item:
                discovered_items.append(page_item)
            for link_url, next_depth in new_links:
                if link_url not in visited and next_depth <= max_depth:
                    if not link_url.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.pdf', '.zip', '.css', '.js')):
                        queue.append((link_url, next_depth))
                        
    return discovered_items

@router.post("/sitemap-builder")
async def build_sitemap(data: SitemapBuilderReq, user_id: int = Depends(get_current_user)):
    """12.3 Sitemap XML & Media Extension File Builder"""
    from xml.etree.ElementTree import Element, SubElement, tostring
    import xml.dom.minidom
    from datetime import datetime

    urlset = Element("urlset")
    urlset.set("xmlns", "http://www.sitemaps.org/schemas/sitemap/0.9")

    # Add extension namespaces
    if data.sitemap_type == "image":
        urlset.set("xmlns:image", "http://www.google.com/schemas/sitemap-image/1.1")
    elif data.sitemap_type == "video":
        urlset.set("xmlns:video", "http://www.google.com/schemas/sitemap-video/1.1")
    elif data.sitemap_type == "news":
        urlset.set("xmlns:news", "http://www.google.com/schemas/sitemap-news/0.9")

    items_to_process = []
    
    # If mode is crawl or domain is provided, run crawler
    if (data.mode == "crawl" or (data.domain and data.domain.strip())) and not data.items and not data.urls:
        crawled_data = await crawl_domain_for_sitemap(data.domain, max_depth=int(data.max_depth))
        for c in crawled_data:
            items_to_process.append(UrlItem(
                loc=c["loc"],
                image_loc=c.get("image_loc"),
                lastmod=data.default_lastmod,
                changefreq=data.default_changefreq,
                priority=data.default_priority
            ))
    elif data.items:
        items_to_process = data.items
    else:
        for u in data.urls:
            items_to_process.append(UrlItem(
                loc=u,
                lastmod=data.default_lastmod,
                changefreq=data.default_changefreq,
                priority=data.default_priority
            ))

    total_count = len(items_to_process)
    warnings = []
    if total_count > 50000:
        warnings.append("Sitemap exceeds 50,000 URLs limit. Google requires breaking this into a Sitemap Index.")

    for item in items_to_process:
        url_el = SubElement(urlset, "url")
        loc_el = SubElement(url_el, "loc")
        loc_str = item.loc.strip() if item.loc else ""
        if loc_str and not loc_str.startswith(("http://", "https://")):
            loc_str = f"https://{loc_str}"
        loc_el.text = loc_str

        if item.lastmod or data.default_lastmod:
            lm_el = SubElement(url_el, "lastmod")
            lm_el.text = item.lastmod or data.default_lastmod

        if item.changefreq or data.default_changefreq:
            cf_el = SubElement(url_el, "changefreq")
            cf_el.text = item.changefreq or data.default_changefreq

        if item.priority or data.default_priority:
            pr_el = SubElement(url_el, "priority")
            pr_el.text = item.priority or data.default_priority

        # Media Extensions
        if data.sitemap_type == "image" and item.image_loc:
            img_el = SubElement(url_el, "image:image")
            img_loc = SubElement(img_el, "image:loc")
            img_loc.text = item.image_loc
            if item.image_title:
                img_title = SubElement(img_el, "image:title")
                img_title.text = item.image_title

        elif data.sitemap_type == "video" and (item.video_title or item.video_thumbnail):
            vid_el = SubElement(url_el, "video:video")
            if item.video_thumbnail:
                v_thumb = SubElement(vid_el, "video:thumbnail_loc")
                v_thumb.text = item.video_thumbnail
            if item.video_title:
                v_title = SubElement(vid_el, "video:title")
                v_title.text = item.video_title
            if item.video_description:
                v_desc = SubElement(vid_el, "video:description")
                v_desc.text = item.video_description
            if item.video_content_url:
                v_curl = SubElement(vid_el, "video:content_loc")
                v_curl.text = item.video_content_url

        elif data.sitemap_type == "news" and (item.news_name or item.news_title):
            news_el = SubElement(url_el, "news:news")
            pub_el = SubElement(news_el, "news:publication")
            p_name = SubElement(pub_el, "news:name")
            p_name.text = item.news_name or "News Publisher"
            p_lang = SubElement(pub_el, "news:language")
            p_lang.text = item.news_lang or "en"
            
            p_date = SubElement(news_el, "news:publication_date")
            p_date.text = item.news_date or datetime.utcnow().strftime("%Y-%m-%d")
            
            p_title = SubElement(news_el, "news:title")
            p_title.text = item.news_title or "News Title"

    xml_string = tostring(urlset, 'utf-8')
    parsed = xml.dom.minidom.parseString(xml_string)
    pretty_xml = parsed.toprettyxml(indent="  ")

    filename = f"sitemap_{data.sitemap_type}.xml" if data.sitemap_type != "standard" else "sitemap.xml"

    return {
        "message": "Sitemap built successfully",
        "sitemap_type": data.sitemap_type,
        "filename": filename,
        "total_urls": total_count,
        "warnings": warnings,
        "xml": pretty_xml
    }

class HreflangMapperReq(BaseModel):
    mappings: List[dict]

@router.post("/hreflang-mapper")
def map_hreflang(data: HreflangMapperReq, user_id: int = Depends(get_current_user)):
    """12.4 International Hreflang Alternates Mapper"""
    tags = []
    for m in data.mappings:
        url = m.get("url")
        lang = m.get("lang")
        if url and lang:
            tags.append(f'<link rel="alternate" hreflang="{lang}" href="{url}" />')
    return {"message": "Hreflang tags generated", "tags": "\n".join(tags)}

class RedirectTracerReq(BaseModel):
    url: str

@router.post("/redirect-tracer")
async def trace_redirects(data: RedirectTracerReq, user_id: int = Depends(get_current_user)):
    """12.5 Redirect Chain Tracer & Status Code Checker"""
    class NoRedirectHandler(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            return None
            
    opener = urllib.request.build_opener(NoRedirectHandler())
    hops = []
    current_url = data.url
    max_hops = 10
    
    for _ in range(max_hops):
        req = urllib.request.Request(current_url, headers={'User-Agent': 'Mozilla/5.0 SEOKingBot/1.0'})
        try:
            import urllib.error
            response = await asyncio.to_thread(opener.open, req, timeout=10)
            hops.append({"url": current_url, "status": response.status})
            break
        except urllib.error.HTTPError as e:
            if e.code in (301, 302, 303, 307, 308):
                location = e.headers.get("Location")
                hops.append({"url": current_url, "status": e.code, "target": location})
                if not location:
                    break
                current_url = urllib.parse.urljoin(current_url, location)
            else:
                hops.append({"url": current_url, "status": e.code})
                break
        except Exception as e:
            hops.append({"url": current_url, "error": str(e)})
            break
            
    return {"message": "Trace complete", "hops": hops}

class EEATAssessmentReq(BaseModel):
    answers: dict

@router.post("/eeat-assessment")
def assess_eeat(data: EEATAssessmentReq, user_id: int = Depends(get_current_user)):
    """12.6 E-E-A-T Self-Assessment Form"""
    score = 0
    recommendations = []
    total = len(data.answers)
    if total == 0:
        return {"score": 0, "recommendations": ["No answers provided."]}
    for q, ans in data.answers.items():
        if str(ans).lower() in ["yes", "true", "1"]:
            score += 1
        else:
            recommendations.append(f"Consider improving: {q}")
    final_score = int((score / total) * 100)
    return {"score": final_score, "recommendations": recommendations}

class DiscoverValidatorReq(BaseModel):
    url: str

@router.post("/discover-validator")
async def validate_discover(data: DiscoverValidatorReq, user_id: int = Depends(get_current_user)):
    """12.7 Google Discover Image & Meta Tag Builder"""
    req = urllib.request.Request(data.url, headers={'User-Agent': 'Mozilla/5.0 SEOKingBot/1.0'})
    try:
        response = await asyncio.to_thread(urllib.request.urlopen, req, timeout=5)
        html = response.read()
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html, 'html.parser')
        
        robots_meta = soup.find('meta', attrs={'name': 'robots'})
        has_large = robots_meta and 'max-image-preview:large' in robots_meta.get('content', '').lower()
        og_image = soup.find('meta', property='og:image')
        has_og = og_image is not None
        
        tags_needed = []
        if not has_large:
            tags_needed.append('<meta name="robots" content="max-image-preview:large">')
        if not has_og:
            tags_needed.append('<meta property="og:image" content="URL_TO_1200PX_IMAGE">')
            
        is_valid = has_large and has_og
        return {"is_valid": is_valid, "meta_tags": "\n".join(tags_needed) if tags_needed else "All tags present"}
    except Exception as e:
        return {"is_valid": False, "meta_tags": f"Error: {str(e)}"}

class SafeSearchClassifierReq(BaseModel):
    directories: List[str]

@router.post("/safesearch-classifier")
def classify_safesearch(data: SafeSearchClassifierReq, user_id: int = Depends(get_current_user)):
    """12.8 SafeSearch Adult Content Classifier"""
    meta_tags = '<meta name="rating" content="adult">\n<meta name="rating" content="RTA-5042-1996-1400-1577-RTA">'
    rules = [f"Disallow: {d}" for d in data.directories]
    return {"meta_tags": meta_tags, "rules": rules}

class UrlAuditorReq(BaseModel):
    domain: str

@router.post("/url-auditor")
def audit_urls(data: UrlAuditorReq, user_id: int = Depends(get_current_user)):
    """12.9 URL Path Cleanliness & Structure Auditor"""
    issues = []
    if "_" in data.domain:
        issues.append("Domain contains underscores. Use hyphens instead.")
    if data.domain != data.domain.lower():
        issues.append("Domain contains uppercase letters.")
    if not issues:
        issues.append("Domain structure looks clean.")
    return {"issues": issues}

class GSCDiagnoserReq(BaseModel):
    property: str
    dates: str

@router.post("/gsc-diagnoser")
def diagnose_gsc(data: GSCDiagnoserReq, user_id: int = Depends(get_current_user)):
    """12.10 Google Search Console (GSC) Traffic Drop Diagnoser"""
    diagnosis = f"Traffic drop for {data.property} on {data.dates} could be due to algorithmic updates, seasonality, or technical faults. Check crawl stats."
    return {"diagnosis": diagnosis}

class DateConsistencyReq(BaseModel):
    url: str

@router.post("/date-consistency")
async def check_date_consistency(data: DateConsistencyReq, user_id: int = Depends(get_current_user)):
    """12.11 Article Publication Date Consistency Checker"""
    import re
    date_pattern = re.search(r'/(\d{4})/(\d{2})/', data.url)
    if not date_pattern:
        return {"consistent": True, "differences": ["No date found in URL structure to compare."]}
    
    req = urllib.request.Request(data.url, headers={'User-Agent': 'Mozilla/5.0 SEOKingBot/1.0'})
    try:
        response = await asyncio.to_thread(urllib.request.urlopen, req, timeout=5)
        html = response.read()
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html, 'html.parser')
        
        pub_meta = soup.find('meta', property='article:published_time')
        if not pub_meta:
            return {"consistent": False, "differences": ["Missing article:published_time meta tag."]}
            
        pub_time = pub_meta.get('content', '')
        url_year, url_month = date_pattern.groups()
        if url_year in pub_time and f"-{url_month}-" in pub_time:
            return {"consistent": True, "differences": []}
        else:
            return {"consistent": False, "differences": [f"URL date ({url_year}/{url_month}) != meta date ({pub_time})"]}
    except Exception as e:
        return {"consistent": False, "differences": [f"Failed to fetch: {str(e)}"]}

class SpaLazyLoadReq(BaseModel):
    url: str

@router.post("/spa-lazy-load")
async def check_spa_lazy_load(data: SpaLazyLoadReq, user_id: int = Depends(get_current_user)):
    """12.12 SPA Lazy-Loading Crawler Validation Tester & DOM Diff Checker"""
    url = data.url
    issues = []
    
    # 1. Fetch raw HTML
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 SEOKingBot/1.0'})
    try:
        response = await asyncio.to_thread(urllib.request.urlopen, req, timeout=10)
        status_code = response.status
        response_headers = dict(response.headers)
        raw_html = response.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to fetch URL: {str(e)}")

    raw_audit = AuditCrawler.analyze_page_seo(url, status_code, response_headers, raw_html)
    
    # 2. Fetch JS rendered HTML (Desktop)
    try:
        rendered_html = await scrape_url(user_id, url)
        rendered_audit = AuditCrawler.analyze_page_seo(url, status_code, response_headers, rendered_html.encode('utf-8'))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Playwright rendering failed: {str(e)}")

    # 3. Diff analysis
    if raw_audit.get("canonical_url") != rendered_audit.get("canonical_url"):
        issues.append(f"Canonical URL mismatch: Raw='{raw_audit.get('canonical_url')}', JS='{rendered_audit.get('canonical_url')}'")
        
    if not raw_audit["details"].get("has_schema") and rendered_audit["details"].get("has_schema"):
        issues.append("Schema markup is heavily reliant on JS rendering (missing in raw HTML)")
        
    if len(raw_audit["details"].get("schemas", [])) != len(rendered_audit["details"].get("schemas", [])):
        issues.append(f"Schema count mismatch: Raw={len(raw_audit['details'].get('schemas', []))}, JS={len(rendered_audit['details'].get('schemas', []))}")

    # 4. Mobile rendering audit
    try:
        mobile_issues = await audit_mobile_rendering(user_id, url)
        issues.extend(mobile_issues)
    except Exception as e:
        issues.append(f"Mobile audit failed: {str(e)}")

    return {
        "url": url,
        "raw_word_count": raw_audit.get("word_count", 0),
        "rendered_word_count": rendered_audit.get("word_count", 0),
        "js_dependent": raw_audit["details"].get("js_dependent", False),
        "issues": issues,
        "raw_schemas": raw_audit["details"].get("schemas", []),
        "rendered_schemas": rendered_audit["details"].get("schemas", [])
    }

class NonHtmlAccessibilityReq(BaseModel):
    url: str

@router.post("/non-html-accessibility")
async def check_non_html_accessibility(data: NonHtmlAccessibilityReq, user_id: int = Depends(get_current_user)):
    """12.13 PDF & Non-HTML Content Accessibility Checker"""
    req = urllib.request.Request(data.url, headers={'User-Agent': 'Mozilla/5.0 SEOKingBot/1.0'})
    try:
        response = await asyncio.to_thread(urllib.request.urlopen, req, timeout=5)
        headers = dict(response.headers)
        content_type = headers.get('Content-Type', '').lower()
        issues = []
        if 'pdf' in content_type:
            if 'x-robots-tag' not in [k.lower() for k in headers.keys()]:
                issues.append("Missing X-Robots-Tag header for PDF.")
        return {"accessible": len(issues) == 0, "issues": issues}
    except Exception as e:
        return {"accessible": False, "issues": [f"Fetch error: {str(e)}"]}

class ProductReviewReq(BaseModel):
    url: str

@router.post("/product-review-grader")
async def grade_product_review(data: ProductReviewReq, user_id: int = Depends(get_current_user)):
    """12.14 Product Review Quality Grader"""
    req = urllib.request.Request(data.url, headers={'User-Agent': 'Mozilla/5.0 SEOKingBot/1.0'})
    try:
        response = await asyncio.to_thread(urllib.request.urlopen, req, timeout=5)
        html = response.read().decode('utf-8', errors='ignore').lower()
        
        issues = []
        if "pros" not in html or "cons" not in html:
            issues.append("Consider explicitly sectioning Pros & Cons.")
        if html.count("amazon.com") > 3:
            issues.append("High number of affiliate links detected.")
            
        grade = "A" if not issues else "B" if len(issues) == 1 else "C"
        return {"grade": grade, "issues": issues}
    except Exception as e:
        return {"grade": "F", "issues": [str(e)]}

class PaywallAuditorReq(BaseModel):
    url: str

@router.post("/paywall-auditor")
async def audit_paywall(data: PaywallAuditorReq, user_id: int = Depends(get_current_user)):
    """12.15 Paywalled Content & CSS Selector Auditor"""
    req = urllib.request.Request(data.url, headers={'User-Agent': 'Mozilla/5.0 SEOKingBot/1.0'})
    try:
        response = await asyncio.to_thread(urllib.request.urlopen, req, timeout=5)
        html = response.read().decode('utf-8', errors='ignore')
        
        mismatches = []
        if "isAccessibleForFree" not in html:
            mismatches.append("Missing isAccessibleForFree schema property.")
        if "cssSelector" not in html:
            mismatches.append("Missing cssSelector for paywall content section.")
            
        return {"valid": len(mismatches) == 0, "mismatches": mismatches}
    except Exception as e:
        return {"valid": False, "mismatches": [str(e)]}

class SnippetScannerReq(BaseModel):
    url: str

@router.post("/snippet-scanner")
async def scan_snippet(data: SnippetScannerReq, user_id: int = Depends(get_current_user)):
    """12.16 Search Snippet & Cache Control Tag Scanner"""
    req = urllib.request.Request(data.url, headers={'User-Agent': 'Mozilla/5.0 SEOKingBot/1.0'})
    try:
        response = await asyncio.to_thread(urllib.request.urlopen, req, timeout=5)
        html = response.read()
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html, 'html.parser')
        
        robots_meta = soup.find('meta', attrs={'name': 'robots'})
        suggestions = []
        if robots_meta:
            content = robots_meta.get('content', '').lower()
            if 'max-snippet' not in content:
                suggestions.append("Consider using max-snippet.")
            if 'max-video-preview' not in content:
                suggestions.append("Consider using max-video-preview.")
        else:
            suggestions.append("No robots meta tag found for snippet control.")
            
        return {"suggestions": suggestions}
    except Exception as e:
        return {"suggestions": [str(e)]}

class ServerMaintenanceReq(BaseModel):
    domain: str

@router.post("/server-maintenance")
async def check_server_maintenance(data: ServerMaintenanceReq, user_id: int = Depends(get_current_user)):
    """12.17 Server Maintenance Mode Helper & HTTP 503 Validator"""
    url = f"http://{data.domain}" if not data.domain.startswith("http") else data.domain
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 SEOKingBot/1.0'})
    try:
        import urllib.error
        response = await asyncio.to_thread(urllib.request.urlopen, req, timeout=5)
        return {"valid_503": False, "headers": dict(response.headers)}
    except urllib.error.HTTPError as e:
        if e.code == 503:
            headers = dict(e.headers)
            if 'Retry-After' in headers:
                return {"valid_503": True, "headers": headers}
            else:
                return {"valid_503": False, "headers": headers, "error": "Missing Retry-After header"}
        return {"valid_503": False, "headers": dict(e.headers)}
    except Exception as e:
        return {"valid_503": False, "headers": {}, "error": str(e)}

class IndexingApiReq(BaseModel):
    credentials_json: str

@router.post("/indexing-api-advisor")
def advise_indexing_api(data: IndexingApiReq, user_id: int = Depends(get_current_user)):
    """12.18 Indexing API Integration Advisor"""
    issues = []
    try:
        import json
        creds = json.loads(data.credentials_json)
        if creds.get("type") != "service_account":
            issues.append("JSON credentials must be a service_account.")
        if "client_email" not in creds:
            issues.append("Missing client_email.")
        if "private_key" not in creds:
            issues.append("Missing private_key.")
    except Exception:
        issues.append("Invalid JSON format.")
        
    return {"valid": len(issues) == 0, "issues": issues}

class LocalSeoReq(BaseModel):
    name: str
    address: str
    phone: str
    url: str

@router.post("/local-seo-auditor")
async def audit_local_seo(data: LocalSeoReq, user_id: int = Depends(get_current_user)):
    """12.19 Local SEO & NAP Alignment Auditor"""
    req = urllib.request.Request(data.url, headers={'User-Agent': 'Mozilla/5.0 SEOKingBot/1.0'})
    try:
        response = await asyncio.to_thread(urllib.request.urlopen, req, timeout=5)
        html = response.read().decode('utf-8', errors='ignore').lower()
        
        mismatches = []
        score = 100
        if data.phone.lower() not in html:
            mismatches.append(f"Phone number '{data.phone}' not found in HTML.")
            score -= 30
        if data.address.lower() not in html:
            mismatches.append(f"Address '{data.address}' not found in HTML.")
            score -= 40
            
        return {"alignment_score": score, "mismatches": mismatches}
    except Exception as e:
        return {"alignment_score": 0, "mismatches": [f"Error fetching URL: {str(e)}"]}
