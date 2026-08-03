import logging
import asyncio
from collections import Counter
from bs4 import BeautifulSoup
import spacy
from app.scraper import scrape_google_serp, scrape_url
from app.database import get_user_setting

logger = logging.getLogger("seoking.optimizer")

# Load spaCy model globally. Downloaded during Docker build.
try:
    nlp = spacy.load("en_core_web_sm")
except Exception as e:
    logger.error(f"Failed to load spaCy model: {e}. Downloading model inline.")
    import os
    os.system("python -m spacy download en_core_web_sm")
    nlp = spacy.load("en_core_web_sm")

def extract_competitor_urls(serp_html: str, count: int = 15) -> list[str]:
    """
    Parses Google SERP HTML and extracts top organic result URLs.
    """
    soup = BeautifulSoup(serp_html, "html.parser")
    urls = []
    
    # Organic results typically reside within standard anchors that aren't Google-owned
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if href.startswith("http") and not any(domain in href for domain in [
            "google.com", "webcache.googleusercontent", "youtube.com", "instagram.com", "facebook.com", "twitter.com"
        ]):
            if href not in urls:
                urls.append(href)
                if len(urls) >= count:
                    break
    logger.info(f"Extracted {len(urls)} competitor URLs from SERP.")
    return urls

def clean_html_content(html: str) -> str:
    """
    Strips sidebars, headers, footers, scripts, and styles to return clean article text.
    """
    soup = BeautifulSoup(html, "html.parser")
    # Decompose boilerplates and non-text elements
    for element in soup(["script", "style", "nav", "header", "footer", "aside", "form", "iframe", "noscript"]):
        element.decompose()
        
    text = soup.get_text(separator=" ")
    # Clean whitespace
    lines = (line.strip() for line in text.splitlines())
    chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
    return " ".join(chunk for chunk in chunks if chunk)

def extract_entities_and_terms(text: str, top_n: int = 30) -> list[dict]:
    """
    Extracts prominent entities and multi-word phrases using spaCy NLP.
    Calculates frequencies and returns them sorted.
    """
    logger.info("Running spaCy NLP pipeline on aggregated text.")
    # Slice text to prevent excessive memory usage on ThinkPad
    doc = nlp(text[:150000])
    
    terms = []
    
    # 1. Named Entities (useful for semantic matching)
    for ent in doc.ents:
        if ent.label_ in {"ORG", "GPE", "PRODUCT", "PERSON", "LOC", "FAC", "WORK_OF_ART"}:
            term = ent.text.strip().lower()
            if len(term) > 2 and not ent.root.is_stop:
                terms.append((term, "entity"))

    # 2. Noun Chunks (captures multi-word keyphrases)
    for chunk in doc.noun_chunks:
        term = chunk.text.strip().lower()
        words = term.split()
        # Keep multi-word phrases (e.g. "seo strategy", "organic search traffic")
        if 2 <= len(words) <= 4:
            # Verify words aren't just stopwords
            if not all(nlp.vocab[w].is_stop for w in words):
                terms.append((term, "keyphrase"))

    # Count occurrences
    counter = Counter(terms)
    
    # Format and sort results
    results = []
    for (term, category), count in counter.most_common(100):
        # Filter out numbers or terms with special characters
        if term.replace(" ", "").isalnum() and count > 1:
            results.append({
                "phrase": term,
                "count": count,
                "category": category
            })
            if len(results) >= top_n:
                break
                
    return results

async def optimize_keyword_content(user_id: int, keyword: str) -> dict:
    """
    Executes the full Content Optimization pipeline:
    1. Scrapes Google SERP for the keyword.
    2. Extracts competitor URLs (top 10).
    3. Scrapes competitor pages (obeying concurrency settings).
    4. Cleans HTML & aggregates text content.
    5. Extracts semantic entities/keyphrases via spaCy.
    """
    logger.info(f"Starting content optimization pipeline for keyword: '{keyword}'")
    
    # Step 1: Scrape Google SERP
    serp_html = await scrape_google_serp(user_id, keyword)
    
    # Step 2: Extract URLs
    competitor_urls = await asyncio.to_thread(extract_competitor_urls, serp_html, 10)
    if not competitor_urls:
        return {"error": "No competitor URLs could be extracted from SERP."}

    # Step 3: Scrape competitor pages concurrently
    concurrency_limit = int(await get_user_setting(user_id, "max_concurrent_crawler_tabs", "3"))
    semaphore = asyncio.Semaphore(concurrency_limit)
    
    async def bound_scrape(url):
        await asyncio.sleep(1.0)
        async with semaphore:
            try:
                html = await scrape_url(user_id, url)
                return clean_html_content(html)
            except Exception as e:
                logger.error(f"Failed to scrape competitor {url}: {e}")
                return ""

    logger.info(f"Scraping {len(competitor_urls)} competitor pages with concurrency {concurrency_limit}...")
    tasks = [bound_scrape(url) for url in competitor_urls]
    pages_text = await asyncio.gather(*tasks)
    
    # Step 4: Aggregate clean texts
    aggregated_text = " ".join(t for t in pages_text if t)
    
    if not aggregated_text.strip():
        return {"error": "Failed to extract content from any competitor pages."}
        
    # Step 5: Extract Entities
    recommended_entities = await asyncio.to_thread(extract_entities_and_terms, aggregated_text, 40)
    
    logger.info(f"Content optimization pipeline finished. Extracted {len(recommended_entities)} terms.")
    return {
        "keyword": keyword,
        "competitor_urls": competitor_urls,
        "entities": recommended_entities
    }
