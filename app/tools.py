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
    """12.7 Google Discover Image & Meta Tag Builder & Compliance Auditor"""
    import urllib.parse
    import urllib.request
    from bs4 import BeautifulSoup
    import asyncio
    
    clean_url = data.url.strip()
    if not clean_url.startswith(("http://", "https://")):
        clean_url = f"https://{clean_url}"

    explanation = (
        "Google Discover delivers personalized content feeds based on Google algorithms. "
        "To be eligible for Discover cards and large image previews, Google Search Central requires pages "
        "to feature high-resolution hero images (at least 1200px wide) and explicit robots snippet directives "
        "('<meta name=\"robots\" content=\"max-image-preview:large\">'). This tool audits target URLs against these "
        "technical rules and outputs the required meta tag markup."
    )

    required_meta_tags = [
        '<meta name="robots" content="max-image-preview:large">',
        '<meta property="og:image" content="https://example.com/lead-image-1200px.jpg">',
        '<meta property="og:image:width" content="1200">',
        '<meta property="og:image:height" content="630">'
    ]

    try:
        req = urllib.request.Request(clean_url, headers={'User-Agent': 'Mozilla/5.0 SEOKingBot/1.0'})
        response = await asyncio.to_thread(urllib.request.urlopen, req, timeout=6)
        html = response.read()
        soup = BeautifulSoup(html, 'html.parser')
        
        # 1. Check Meta Robots max-image-preview:large
        robots_meta = soup.find('meta', attrs={'name': 'robots'})
        robots_content = robots_meta.get('content', '').lower() if robots_meta else ''
        has_max_image_large = 'max-image-preview:large' in robots_content or 'max-image-preview: large' in robots_content

        # 2. Check Open Graph Image
        og_img = soup.find('meta', property='og:image') or soup.find('meta', attrs={'name': 'og:image'})
        og_img_src = og_img.get('content', '').strip() if og_img else None
        
        # 3. Check Open Graph Image Width / Height
        og_width = soup.find('meta', property='og:image:width')
        og_height = soup.find('meta', property='og:image:height')
        has_og_dimensions = og_width is not None and og_height is not None
        
        checks = [
            {
                "requirement": "Robots Meta Directive (max-image-preview:large)",
                "passed": has_max_image_large,
                "details": "Present in page <head>" if has_max_image_large else "Missing '<meta name=\"robots\" content=\"max-image-preview:large\">'."
            },
            {
                "requirement": "Open Graph Hero Image (og:image)",
                "passed": og_img_src is not None,
                "details": f"Found: {og_img_src}" if og_img_src else "Missing '<meta property=\"og:image\">' tag."
            },
            {
                "requirement": "Open Graph Dimensions (1200px width)",
                "passed": has_og_dimensions,
                "details": f"Width: {og_width.get('content', '') if og_width else 'Missing'}px, Height: {og_height.get('content', '') if og_height else 'Missing'}px" if has_og_dimensions else "Missing explicit og:image:width (>= 1200px) and og:image:height tags."
            }
        ]

        is_eligible = has_max_image_large and (og_img_src is not None)

        generated_snippet = []
        if not has_max_image_large:
            generated_snippet.append('<meta name="robots" content="max-image-preview:large">')
        if not og_img_src:
            generated_snippet.append('<meta property="og:image" content="https://yourdomain.com/path/to/hero-image-1200px.jpg">')
        if not og_width:
            generated_snippet.append('<meta property="og:image:width" content="1200">')
        if not og_height:
            generated_snippet.append('<meta property="og:image:height" content="630">')

        snippet_output = "\n".join(generated_snippet) if generated_snippet else "<!-- All Google Discover meta tags are correctly implemented! -->"

        return {
            "message": "Discover Eligibility Audit Complete",
            "what_this_tool_does": explanation,
            "target_url": clean_url,
            "is_eligible": is_eligible,
            "status": "ELIGIBLE FOR DISCOVER CARDS" if is_eligible else "ACTION REQUIRED FOR DISCOVER ELIGIBILITY",
            "required_meta_tags": required_meta_tags,
            "audit_checks": checks,
            "filename": "discover_meta_tags.html",
            "content": snippet_output
        }
    except Exception as e:
        return {
            "message": f"Error Auditing URL: {str(e)}",
            "what_this_tool_does": explanation,
            "target_url": clean_url,
            "is_eligible": False,
            "status": f"ERROR: {str(e)}",
            "required_meta_tags": required_meta_tags,
            "filename": "discover_meta_tags.html",
            "content": "\n".join(required_meta_tags)
        }

class RobotsPathTesterReq(BaseModel):
    robots_txt: str
    test_path: str
    user_agent: str = "Googlebot"

@router.post("/robots-path-tester")
def test_robots_path(data: RobotsPathTesterReq, user_id: int = Depends(get_current_user)):
    """12.1 Interactive Robots.txt Rule & Path Pattern Tester"""
    import re
    
    explanation = (
        "Evaluates whether a specific URL path is ALLOWED or BLOCKED for a target search engine crawler "
        "(e.g., Googlebot, GPTBot) based on the exact rule pattern precedence specified in Google Search Central's "
        "robots.txt specification (longer pattern match takes precedence; Allow overrides Disallow of equal length)."
    )

    path = data.test_path.strip()
    if not path.startswith("/"):
        path = f"/{path}"
        
    ua = data.user_agent.strip().lower()
    lines = data.robots_txt.splitlines()
    
    current_agents = []
    rules = []  # list of (agent, type, pattern, line_no)
    
    for idx, raw_line in enumerate(lines, 1):
        line = raw_line.split("#")[0].strip()
        if not line:
            continue
        if ":" in line:
            parts = line.split(":", 1)
            key = parts[0].strip().lower()
            val = parts[1].strip()
            
            if key == "user-agent":
                current_agents.append(val.lower())
            elif key in ("disallow", "allow"):
                for agent in current_agents:
                    rules.append((agent, key, val, idx))
        else:
            current_agents = []
            
    # Filter rules matching target user-agent or wildcard *
    applicable_rules = [r for r in rules if r[0] == ua or r[0] == "*"]
    
    # Sort rules: exact UA match first, then by pattern length descending
    def match_score(rule):
        agent, rule_type, pattern, line_no = rule
        agent_match = 2 if agent == ua else 1
        return (agent_match, len(pattern), 1 if rule_type == "allow" else 0)

    applicable_rules.sort(key=match_score, reverse=True)
    
    matched_rule = None
    status = "ALLOWED"
    
    for agent, rule_type, pattern, line_no in applicable_rules:
        if not pattern:  # Empty Disallow: means Allow All
            if rule_type == "disallow":
                continue
        # Convert robots wildcard * and $ to regex pattern
        regex_pattern = "^" + re.escape(pattern).replace(r"\*", ".*").replace(r"\$", "$")
        if re.search(regex_pattern, path):
            matched_rule = (agent, rule_type, pattern, line_no)
            status = "ALLOWED" if rule_type == "allow" else "BLOCKED"
            break
            
    checks = [
        {
            "requirement": f"User-Agent Match: {data.user_agent}",
            "passed": True,
            "details": f"Evaluated against rules matching '{data.user_agent}' and '*'"
        },
        {
            "requirement": f"Path Rule Precedence for '{path}'",
            "passed": status == "ALLOWED",
            "details": f"Matched Line #{matched_rule[3]}: '{matched_rule[1].capitalize()}: {matched_rule[2]}'" if matched_rule else "No disallow rules matched path. Default ALLOWED."
        }
    ]

    return {
        "message": f"Path '{path}' is {status} for {data.user_agent}",
        "what_this_tool_does": explanation,
        "test_path": path,
        "user_agent": data.user_agent,
        "status": status,
        "audit_checks": checks,
        "filename": "robots_test_result.txt",
        "content": f"URL Path: {path}\nUser-Agent: {data.user_agent}\nVerdict: {status}\nMatched Rule: {matched_rule[1] + ': ' + matched_rule[2] + ' (Line ' + str(matched_rule[3]) + ')' if matched_rule else 'None (Default Allow)'}"
    }

class EeatPageScannerReq(BaseModel):
    url: str

@router.post("/eeat-page-scanner")
async def scan_eeat_page(data: EeatPageScannerReq, user_id: int = Depends(get_current_user)):
    """12.6 E-E-A-T & Helpful Content Live Page Scanner"""
    import urllib.parse
    import urllib.request
    from bs4 import BeautifulSoup
    import asyncio
    
    clean_url = data.url.strip()
    if not clean_url.startswith(("http://", "https://")):
        clean_url = f"https://{clean_url}"

    explanation = (
        "Scans a live webpage's HTML copy and schema metadata for Google E-E-A-T (Experience, Expertise, Authoritativeness, "
        "Trustworthiness) and Helpful Content signals, such as author credentials, publication dates, outbound citations, "
        "and clear organizational trust pages (About, Contact, Privacy Policy)."
    )

    try:
        req = urllib.request.Request(clean_url, headers={'User-Agent': 'Mozilla/5.0 SEOKingBot/1.0'})
        response = await asyncio.to_thread(urllib.request.urlopen, req, timeout=6)
        html = response.read()
        soup = BeautifulSoup(html, 'html.parser')
        
        # 1. Author Byline / Schema Check
        has_author_schema = soup.find(attrs={"itemtype": re.compile(r"schema\.org/Person", re.I)}) is not None or "author" in str(soup.find_all('script', type='application/ld+json')).lower()
        has_author_text = soup.find(class_=re.compile(r"author|byline", re.I)) is not None or soup.find(id=re.compile(r"author|byline", re.I)) is not None
        has_author = has_author_schema or has_author_text

        # 2. Publication / Update Date Check
        has_date_schema = "datepublished" in str(soup).lower() or "datemodified" in str(soup).lower()
        has_time_tag = soup.find('time') is not None
        has_date = has_date_schema or has_time_tag

        # 3. Outbound Citations & External Links
        external_links = []
        parsed_base = urllib.parse.urlparse(clean_url)
        for a in soup.find_all('a', href=True):
            href = a['href']
            if href.startswith(('http://', 'https://')):
                if urllib.parse.urlparse(href).netloc.lower() != parsed_base.netloc.lower():
                    external_links.append(href)
        has_citations = len(external_links) >= 2

        # 4. Organizational Trust Links (About, Contact, Privacy)
        page_text = soup.get_text().lower()
        all_links_text = " ".join([a.get_text().lower() for a in soup.find_all('a')])
        has_about = "about" in all_links_text or "about-us" in all_links_text
        has_contact = "contact" in all_links_text or "contact-us" in all_links_text
        has_privacy = "privacy" in all_links_text or "terms" in all_links_text

        checks = [
            {
                "requirement": "Author Byline & Expertise Credentials",
                "passed": has_author,
                "details": "Author schema or author class detected" if has_author else "Missing clear author profile or Author JSON-LD schema."
            },
            {
                "requirement": "Publication & Last Modified Timestamps",
                "passed": has_date,
                "details": "DatePublished or <time> tag detected" if has_date else "Missing publication/update timestamps."
            },
            {
                "requirement": "Outbound Sourcing & External Citations",
                "passed": has_citations,
                "details": f"Found {len(external_links)} external reference links" if has_citations else "Fewer than 2 external reference links found."
            },
            {
                "requirement": "Organizational Trust Pages (About / Contact / Privacy)",
                "passed": has_about and has_contact,
                "details": f"About Page: {'✓' if has_about else '✗'}, Contact Page: {'✓' if has_contact else '✗'}, Privacy/Terms: {'✓' if has_privacy else '✗'}"
            }
        ]

        score = sum([1 for c in checks if c["passed"]])
        total_score = int((score / len(checks)) * 100)

        return {
            "message": f"E-E-A-T Scan Complete (Score: {total_score}/100)",
            "what_this_tool_does": explanation,
            "target_url": clean_url,
            "eeat_score": total_score,
            "status": f"E-E-A-T SCORE: {total_score}/100",
            "audit_checks": checks,
            "filename": "eeat_audit_report.json",
            "content": f"E-E-A-T Audit Report for {clean_url}\nScore: {total_score}/100\nAuthor Credentials: {'PASS' if has_author else 'FAIL'}\nPublication Dates: {'PASS' if has_date else 'FAIL'}\nOutbound Citations: {'PASS' if has_citations else 'FAIL'}\nTrust Pages: {'PASS' if has_about and has_contact else 'FAIL'}"
        }
    except Exception as e:
        return {
            "message": f"Error Scanning Page: {str(e)}",
            "what_this_tool_does": explanation,
            "target_url": clean_url,
            "status": f"ERROR: {str(e)}",
            "filename": "eeat_audit_report.json",
            "content": f"Error scanning URL {clean_url}: {str(e)}"
        }

class SafeSearchClassifierReq(BaseModel):
    directories: List[str]

@router.post("/safesearch-classifier")
def classify_safesearch(data: SafeSearchClassifierReq, user_id: int = Depends(get_current_user)):
    """12.8 SafeSearch Adult Content Classifier"""
    meta_tags = '<meta name="rating" content="adult">\n<meta name="rating" content="RTA-5042-1996-1400-1577-RTA">'
    rules = [f"Disallow: {d}" for d in data.directories]
    
    content = "SafeSearch Meta Tags:\n" + meta_tags + "\n\nRobots.txt Rules:\n" + "\n".join(rules)
    return {
        "message": "SafeSearch Configuration Generated",
        "status": "COMPLETED",
        "filename": "safesearch_config.txt",
        "content": content
    }

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
        
    status = "CLEAN" if len(issues) == 1 and issues[0] == "Domain structure looks clean." else "ISSUES FOUND"
    content = f"URL Audit for: {data.domain}\n\nFindings:\n" + "\n".join([f"- {i}" for i in issues])
    
    return {
        "message": "URL Audit Complete",
        "status": status,
        "filename": "url_audit.txt",
        "content": content
    }

class GSCDiagnoserReq(BaseModel):
    property: str
    dates: str

@router.post("/gsc-diagnoser")
def diagnose_gsc(data: GSCDiagnoserReq, user_id: int = Depends(get_current_user)):
    """12.10 Google Search Console (GSC) Traffic Drop Diagnoser"""
    diagnosis = f"Traffic drop for {data.property} on {data.dates} could be due to algorithmic updates, seasonality, or technical faults. Check crawl stats."
    
    return {
        "message": "GSC Diagnosis Complete",
        "status": "ANALYZED",
        "filename": "gsc_diagnosis.txt",
        "content": diagnosis
    }

class DateConsistencyReq(BaseModel):
    url: str

@router.post("/date-consistency")
async def check_date_consistency(data: DateConsistencyReq, user_id: int = Depends(get_current_user)):
    """12.11 Article Publication Date Consistency Checker"""
    import re
    date_pattern = re.search(r'/(\d{4})/(\d{2})/', data.url)
    
    def respond(consistent, diffs):
        status = "CONSISTENT" if consistent else "INCONSISTENT"
        return {
            "message": "Date Consistency Check Complete",
            "status": status,
            "filename": "date_consistency.txt",
            "content": f"URL: {data.url}\n\nFindings:\n" + "\n".join([f"- {d}" for d in diffs])
        }
        
    if not date_pattern:
        return respond(True, ["No date found in URL structure to compare."])
    
    req = urllib.request.Request(data.url, headers={'User-Agent': 'Mozilla/5.0 SEOKingBot/1.0'})
    try:
        response = await asyncio.to_thread(urllib.request.urlopen, req, timeout=5)
        html = response.read()
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html, 'html.parser')
        
        pub_meta = soup.find('meta', property='article:published_time')
        if not pub_meta:
            return respond(False, ["Missing article:published_time meta tag."])
            
        pub_time = pub_meta.get('content', '')
        url_year, url_month = date_pattern.groups()
        if url_year in pub_time and f"-{url_month}-" in pub_time:
            return respond(True, ["URL date matches article:published_time meta date."])
        else:
            return respond(False, [f"URL date ({url_year}/{url_month}) != meta date ({pub_time})"])
    except Exception as e:
        return respond(False, [f"Failed to fetch: {str(e)}"])

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

    status = "ISSUES FOUND" if issues else "OK"
    content = f"URL: {url}\nRaw Word Count: {raw_audit.get('word_count', 0)}\nRendered Word Count: {rendered_audit.get('word_count', 0)}\nJS Dependent: {raw_audit['details'].get('js_dependent', False)}\n\nIssues:\n" + "\n".join([f"- {i}" for i in issues]) if issues else "No SPA lazy-loading issues found."
    return {
        "message": "SPA Lazy-Load Check Complete",
        "status": status,
        "filename": "spa_lazy_load_audit.txt",
        "content": content
    }

class NonHtmlAccessibilityReq(BaseModel):
    url: str

@router.post("/non-html-accessibility")
async def check_non_html_accessibility(data: NonHtmlAccessibilityReq, user_id: int = Depends(get_current_user)):
    """12.13 PDF & Non-HTML Content Accessibility Checker"""
    req = urllib.request.Request(data.url, headers={'User-Agent': 'Mozilla/5.0 SEOKingBot/1.0'})
    
    def respond(accessible, issues):
        status = "ACCESSIBLE" if accessible else "ISSUES FOUND"
        return {
            "message": "Non-HTML Accessibility Check Complete",
            "status": status,
            "filename": "accessibility_report.txt",
            "content": f"URL: {data.url}\n\nFindings:\n" + "\n".join([f"- {i}" for i in issues]) if issues else f"URL: {data.url}\n\nNo accessibility issues found."
        }

    try:
        response = await asyncio.to_thread(urllib.request.urlopen, req, timeout=5)
        headers = dict(response.headers)
        content_type = headers.get('Content-Type', '').lower()
        issues = []
        if 'pdf' in content_type:
            if 'x-robots-tag' not in [k.lower() for k in headers.keys()]:
                issues.append("Missing X-Robots-Tag header for PDF.")
        return respond(len(issues) == 0, issues)
    except Exception as e:
        return respond(False, [f"Fetch error: {str(e)}"])

class ProductReviewReq(BaseModel):
    url: str

@router.post("/product-review-grader")
async def grade_product_review(data: ProductReviewReq, user_id: int = Depends(get_current_user)):
    """12.14 Product Review Quality Grader"""
    req = urllib.request.Request(data.url, headers={'User-Agent': 'Mozilla/5.0 SEOKingBot/1.0'})
    
    def respond(grade, issues):
        return {
            "message": f"Product Review Graded: {grade}",
            "status": f"GRADE {grade}",
            "filename": "product_review_grade.txt",
            "content": f"URL: {data.url}\nGrade: {grade}\n\nIssues:\n" + "\n".join([f"- {i}" for i in issues]) if issues else f"URL: {data.url}\nGrade: {grade}\n\nNo issues found. Excellent product review!"
        }

    try:
        response = await asyncio.to_thread(urllib.request.urlopen, req, timeout=5)
        html = response.read().decode('utf-8', errors='ignore').lower()
        
        issues = []
        if "pros" not in html or "cons" not in html:
            issues.append("Consider explicitly sectioning Pros & Cons.")
        if html.count("amazon.com") > 3:
            issues.append("High number of affiliate links detected.")
            
        grade = "A" if not issues else "B" if len(issues) == 1 else "C"
        return respond(grade, issues)
    except Exception as e:
        return respond("F", [str(e)])

class PaywallAuditorReq(BaseModel):
    url: str

@router.post("/paywall-auditor")
async def audit_paywall(data: PaywallAuditorReq, user_id: int = Depends(get_current_user)):
    """12.15 Paywalled Content & CSS Selector Auditor"""
    req = urllib.request.Request(data.url, headers={'User-Agent': 'Mozilla/5.0 SEOKingBot/1.0'})
    
    def respond(valid, mismatches):
        status = "VALID" if valid else "INVALID"
        return {
            "message": "Paywall Audit Complete",
            "status": status,
            "filename": "paywall_audit.txt",
            "content": f"URL: {data.url}\n\nMismatches:\n" + "\n".join([f"- {m}" for m in mismatches]) if mismatches else f"URL: {data.url}\n\nPaywall schema is correctly configured."
        }

    try:
        response = await asyncio.to_thread(urllib.request.urlopen, req, timeout=5)
        html = response.read().decode('utf-8', errors='ignore')
        
        mismatches = []
        if "isAccessibleForFree" not in html:
            mismatches.append("Missing isAccessibleForFree schema property.")
        if "cssSelector" not in html:
            mismatches.append("Missing cssSelector for paywall content section.")
            
        return respond(len(mismatches) == 0, mismatches)
    except Exception as e:
        return respond(False, [str(e)])

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
            
        status = "ACTION NEEDED" if suggestions else "OPTIMIZED"
        return {
            "message": "Snippet Scanner Complete",
            "status": status,
            "filename": "snippet_scan_report.txt",
            "content": f"Target: {data.url}\nSuggestions:\n" + "\n".join([f"- {s}" for s in suggestions]) if suggestions else f"Target: {data.url}\nNo suggestions. Snippet control looks good!"
        }
    except Exception as e:
        return {
            "message": f"Error Scanning Snippet",
            "status": "ERROR",
            "filename": "snippet_scan_report.txt",
            "content": str(e)
        }

class ServerMaintenanceReq(BaseModel):
    domain: str

@router.post("/server-maintenance")
async def check_server_maintenance(data: ServerMaintenanceReq, user_id: int = Depends(get_current_user)):
    """12.17 Server Maintenance Mode Helper & HTTP 503 Validator"""
    url = f"http://{data.domain}" if not data.domain.startswith("http") else data.domain
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 SEOKingBot/1.0'})
    
    def respond(valid, headers, error=None):
        status = "VALID 503" if valid else "INVALID"
        content = f"URL: {url}\n\nHeaders:\n" + "\n".join([f"{k}: {v}" for k, v in headers.items()])
        if error:
            content += f"\n\nError: {error}"
            
        return {
            "message": "Server Maintenance Check Complete",
            "status": status,
            "filename": "server_maintenance.txt",
            "content": content
        }

    try:
        import urllib.error
        response = await asyncio.to_thread(urllib.request.urlopen, req, timeout=5)
        return respond(False, dict(response.headers))
    except urllib.error.HTTPError as e:
        if e.code == 503:
            headers = dict(e.headers)
            if 'Retry-After' in headers:
                return respond(True, headers)
            else:
                return respond(False, headers, "Missing Retry-After header")
        return respond(False, dict(e.headers))
    except Exception as e:
        return respond(False, {}, str(e))

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
        
    status = "VALID" if not issues else "INVALID"
    return {
        "message": "Indexing API Config Checked",
        "status": status,
        "filename": "indexing_api_check.txt",
        "content": "Configuration is valid." if not issues else "Issues found:\n" + "\n".join([f"- {i}" for i in issues])
    }

class LocalSeoReq(BaseModel):
    name: str
    address: str
    phone: str
    url: str

@router.post("/local-seo-auditor")
async def audit_local_seo(data: LocalSeoReq, user_id: int = Depends(get_current_user)):
    """12.19 Local SEO & NAP Alignment Auditor"""
    req = urllib.request.Request(data.url, headers={'User-Agent': 'Mozilla/5.0 SEOKingBot/1.0'})
    
    def respond(score, mismatches):
        status = "ALIGNED" if score == 100 else "MISMATCHES FOUND"
        return {
            "message": f"Local SEO Audited (Score: {score}/100)",
            "status": status,
            "filename": "local_seo_audit.txt",
            "content": f"URL: {data.url}\nScore: {score}/100\n\nMismatches:\n" + "\n".join([f"- {m}" for m in mismatches]) if mismatches else f"URL: {data.url}\nScore: {score}/100\n\nNAP data is perfectly aligned!"
        }

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
            
        return respond(score, mismatches)
    except Exception as e:
        return respond(0, [f"Error fetching URL: {str(e)}"])
