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

class RedirectGeneratorReq(BaseModel):
    source_url: str
    destination_url: str
    redirect_type: str = "301"

@router.post("/redirect-generator")
def generate_redirect_code(data: RedirectGeneratorReq, user_id: int = Depends(get_current_user)):
    """12.20 Server-Side Redirect Code Generator"""
    import urllib.parse
    
    source = data.source_url.strip()
    if not source.startswith("/"):
        source = f"/{source}"
        
    dest = data.destination_url.strip()
    rtype = data.redirect_type.strip()
    if rtype not in ("301", "302"):
        rtype = "301"

    # Apache mod_alias
    mod_alias = f"Redirect {rtype} {source} {dest}"
    
    # Apache mod_rewrite
    status_flag = "R=301" if rtype == "301" else "R=302"
    source_regex = "^" + urllib.parse.quote(source[1:]) + "/?$" if source != "/" else "^$"
    mod_rewrite = (
        "RewriteEngine On\n"
        f"RewriteRule {source_regex} {dest} [{status_flag},L]"
    )
    
    # NGINX
    nginx_type = "permanent" if rtype == "301" else "redirect"
    nginx = (
        f"location = {source} {{\n"
        f"    return {rtype} {dest};\n"
        f"}}"
    )
    
    content = (
        f"--- Apache (.htaccess / httpd.conf) using mod_alias ---\n{mod_alias}\n\n"
        f"--- Apache (.htaccess / httpd.conf) using mod_rewrite ---\n{mod_rewrite}\n\n"
        f"--- NGINX (nginx.conf) ---\n{nginx}\n"
    )
    
    return {
        "message": "Redirect Configuration Generated",
        "status": "COMPLETED",
        "filename": "redirect_config.txt",
        "content": content
    }
