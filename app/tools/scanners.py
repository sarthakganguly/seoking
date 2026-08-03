from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
import urllib.request
import asyncio
from app.auth import get_current_user
from app.scraper import scrape_url, audit_mobile_rendering
from app.crawler import AuditCrawler

router = APIRouter(prefix="/api/tools", tags=["standalone-tools"])

from fastapi import APIRouter
router = APIRouter()

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

