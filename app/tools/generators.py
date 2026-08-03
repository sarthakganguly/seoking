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

