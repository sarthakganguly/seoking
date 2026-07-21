# **Product Requirements Document (PRD)**

## **SEO King: Google Search Central Risk Auditor & Platform**

---

## **1. Executive Summary**

**SEO King** is a locally hosted, zero-dependency, local-first search engine optimization (SEO) tracking and content optimization platform. It is designed to run entirely on user-owned hardware (optimized for a ThinkPad X230 with Intel Core i5/i7 3rd Gen, 8GB-16GB RAM) and Ubuntu Server, eliminating the need for expensive third-party SaaS backends.

The primary goal of SEO King is to audit user websites against Google Search Central guidelines, flag technical, content, and SEO risks, explain their severity, and provide actionable mitigation checklists. It relies on direct, local Playwright browser automation combined with human-in-the-loop CAPTCHA resolution via virtual displays (noVNC), ensuring zero external commercial API dependencies.

---

## **2. User Interface & Experience Architecture**

*   **Sidebar Navigation:** A persistent left-hand sidebar hosting links to all core chapters, dashboards, standalone tools, and settings.
*   **Primary Workspace:** A responsive right-hand panel where dynamic pages, detailed audit tables, editor interfaces, and diagrams render.
*   **Viewport Support:** Fully responsive CSS supporting Mobile, Tablet, and Desktop screens.
*   **Theming:** Dynamic Light and Dark modes utilizing native CSS variables.
*   **Data Portability:** Every data table (e.g., page audits, keyword ranking histories) must feature a "Download CSV" button for local export.
*   **Authentication & User Management:** 100% local login (username/password stored in SQLite). Upon initial signup, a unique recovery code is generated. If lost, the account is unrecoverable.
*   **Settings Screen:** Manage default crawl depths, crawling schedules, concurrency limits, geolocations, and theme preferences.

---

## **3. Core Platform Chapters (Auditing & Tracking)**

The core scanning and auditing pipeline evaluates websites page-by-page across eight specialized chapters.

### **Chapter 1: Fundamentals (SEO & Content Basics)**

#### **1.1 Title & Meta Optimization Auditor**
*   **Description:** Scans every page on the site to audit title tags and meta descriptions.
*   **Risks Audited:** Missing, duplicate, truncated (too long: >60 chars title, >160 chars meta), too short (<30 chars title, <120 chars meta), or generic titles (e.g., "Home", "Untitled").
*   **Impact:** Prevents search engines from generating uninformative search snippets, protecting CTR.
*   **Audience Views:** Non-technical warning gauges (green/yellow/red) and developer CSV exports.

#### **1.2 E-E-A-T & Helpful Content Quality Scanner**
*   **Description:** Heuristically analyzes page text copy.
*   **Risks Audited:** Pages with search-engine-first content, thin content (<300 words), keyword stuffing, lack of credentials (author info), or missing source citations.
*   **Impact:** Ensures pages are not flagged by Google's Helpful Content System.
*   **Audience Views:** A simple "Helpful Content Score" with actionable text improvement checklists.

#### **1.3 AI-Content Quality Guardrails Scan**
*   **Description:** Scans page copy for hallmarks of raw, automated content production.
*   **Risks Audited:** Mass-produced automated patterns without human editing, and factual verification risks (hallucinations).
*   **Impact:** Protects the site against automated spam updates.

#### **1.4 Google Discover Eligibility Checker**
*   **Description:** Inspects articles for Google Discover inclusion requirements.
*   **Risks Audited:** Missing `max-image-preview:large` robots directive, clickbait headlines, and small images (width < 1200px).
*   **Impact:** Unlocks high-volume distribution in Google Discover feeds.

#### **1.5 Search Essentials Technical Compliance Scan**
*   **Description:** Checks site pages against basic Google Search Essentials guidelines.
*   **Risks Audited:** Non-200 status codes, indexing blocks, hidden text, and sneaky redirects.
*   **Impact:** Flags severe compliance problems that could trigger manual actions or total de-indexing.

---

### **Chapter 2: Crawling and Indexing**

#### **2.1 Sitemap Integrator & Health Auditor**
*   **Description:** Discovers and validates XML, TXT, and RSS sitemaps declared in `robots.txt` or site headers.
*   **Risks Audited:** Sitemaps >50MB or >50,000 URLs, invalid XML schemas, sitemap links returning non-200 codes, or blocked by noindex.
*   **Impact:** Prevents wasting Google's crawl budget on dead pages.

#### **2.2 Canonicalization & Duplication Risk Scan**
*   **Description:** Audits duplicate URL paths and canonical declarations.
*   **Risks Audited:** Missing canonical tags, canonical mismatches (pointing to different domains or 404s), or DOM vs raw HTML canonical discrepancies.
*   **Impact:** Avoids rank dilution and duplicate indexing issues.

#### **2.3 Crawlability & HTTP Status Code Diagnoser**
*   **Description:** Checks server response codes and crawl paths.
*   **Risks Audited:** Broken links (404), soft 404s, redirect loops, and link element violations (e.g., buttons using onclick JS functions instead of `href` anchors).
*   **Impact:** Ensures crawl bots can map and reach all sub-pages.

#### **2.4 JavaScript Rendering & SPA SEO Auditor**
*   **Description:** Compares raw initial HTML responses against fully rendered browser DOMs.
*   **Risks Audited:** Dynamic tags (titles, meta, canonicals, links) failing to render, or lazy-loaded assets missing noscript fallbacks.
*   **Impact:** Protects Single Page Applications from indexing failures.

#### **2.5 Mobile-First Indexing Parity Scanner**
*   **Description:** Compares desktop and mobile browser renders of the same URL.
*   **Risks Audited:** Mismatched meta tags, discrepancies in text copy, different header hierarchies, or missing schema markup on mobile.
*   **Impact:** Prevents content from being ignored by Google's mobile-first crawler.

#### **2.6 AMP Validation Checker**
*   **Description:** Checks AMP page markup validity.
*   **Risks Audited:** AMP validation errors (invalid custom elements, CSS limit > 75KB), and content differences between canonical and AMP variants.
*   **Impact:** Restores eligibility for mobile AMP search carousels.

#### **2.7 Index Blocking & Safe Removal Auditor**
*   **Description:** Scans index block directives and link attribute scopes.
*   **Risks Audited:** Mishandled `noindex` directives (e.g., a page blocked in `robots.txt` containing a `noindex` tag, preventing Googlebot from crawling it to read the block), and missing qualifiers on paid or user-generated outbound links (`sponsored`, `ugc`, `nofollow`).
*   **Impact:** Prevents leakage of search indexing permissions and paid-link penalties.

#### **2.8 Site Migration & Redirection Health Check**
*   **Description:** Verifies URL transition paths.
*   **Risks Audited:** Crawling temporary 302 redirects instead of permanent 301, redirect chains (> 2 hops), or generic "all redirects to homepage" mappings.
*   **Impact:** Preserves PageRank and domain transition authority.

---

### **Chapter 3: Crawling (Infrastructure)**

#### **3.1 Robots.txt Syntax & Security Auditor**
*   **Description:** Evaluates `robots.txt` syntax validity and crawl restrictions.
*   **Risks Audited:** Invalid syntax, and rules blocking CSS/JS files (which prevents Googlebot from rendering pages properly to audit page layout experience).
*   **Impact:** Restores normal page experience rendering verification.

#### **3.2 User-Agent Verification & Spoofing Diagnoser**
*   **Description:** Analyzes crawl block rules and user-agent setups.
*   **Risks Audited:** Blocking Googlebot sub-crawlers (like Googlebot-Image), and malicious bots spoofing the Googlebot UA without passing reverse DNS validation.
*   **Impact:** Guarantees asset indexing while preventing resource theft by malicious crawlers.

#### **3.3 Infinite Spaces & Crawl Budget Diagnoser**
*   **Description:** Analyzes site URLs for crawl traps.
*   **Risks Audited:** Faceted navigation paths generating infinite parameters, duplicate paths, and high latency responses (>2s).
*   **Impact:** Maximizes Google's daily crawl efficiency.

---

### **Chapter 4: Appearance (Structured Data & Search Richness)**

#### **4.1 Structured Data Policies & Semantic Validator**
*   **Description:** Parses JSON-LD and Microdata schemas.
*   **Risks Audited:** Syntactically invalid JSON, missing required fields, and schema-to-page mismatches (e.g., schema price different from display price).
*   **Impact:** Protects against schema-related spam penalties.

#### **4.2 Rich Result Opportunities Finder (Search Gallery Mapper)**
*   **Description:** Identifies candidate schemas based on page structures.
*   **Risks Audited:** Missing schemas for Breadcrumbs, Product reviews, Local Businesses, Events, and Articles.
*   **Impact:** Highlights opportunities to increase CTR via search snippets (stars, prices, etc.).

#### **4.3 Search Branding (Favicon & Site Name) Compliance Check**
*   **Description:** Audits favicon assets and Site Name schemas.
*   **Risks Audited:** Favicons not multiples of 48px square, and missing `WebSite` schema defining the official name of the site.
*   **Impact:** Prevents Google from displaying generic icons or fallback domain names.

#### **4.4 Web Stories Health Check**
*   **Description:** Audits Web Stories against content policies.
*   **Risks Audited:** Aspect ratio violations, thin content, missing video transcripts, and clickbait descriptions.
*   **Impact:** Retains eligibility for Discover visual search blocks.

---

### **Chapter 5: Monitor & Debug (Index Verification & Security)**

#### **5.1 Index Representation & Cloaking Auditor**
*   **Description:** Compares live visitor HTML to responses returned for search engines.
*   **Risks Audited:** Server-side cloaking (serving search bots different content than human users) and malware link injection.
*   **Impact:** Prevents site-wide Google manual spam actions.

#### **5.2 Security & Malware Injection Scanner**
*   **Description:** Scans the site’s script sources, forms, and headers against Google Safe Browsing guidelines.
*   **Risks Audited:** Malware script links, deceptive forms, and phishing vectors.
*   **Impact:** Prevents red screen malware warnings in browsers and search results.

#### **5.3 User-Generated Content (UGC) Abuse Prevention Checker**
*   **Description:** Audits forms and comment blocks.
*   **Risks Audited:** Comment spam injection and missing `rel="ugc"` tags.
*   **Impact:** Safeguards domain quality flags.

---

### **Chapter 6: Specialty (Ecommerce, International, Explicit)**

#### **6.1 Ecommerce Schema & Shopping Quality Auditor**
*   **Description:** Checks structured data specifically for ecommerce listings.
*   **Risks Audited:** Missing variant metadata, return policies, or shipping details.
*   **Impact:** Maintains visibility in premium free Google Shopping placements.

#### **6.2 Hreflang & International Target Check**
*   **Description:** Audits international target mapping tags.
*   **Risks Audited:** Missing self-referential tags, invalid country/locale codes, and broken reciprocal targets.
*   **Impact:** Avoids serving incorrect language versions, protecting bounce rates.

#### **6.3 Explicit Content & SafeSearch Isolation Checker**
*   **Description:** Scans adult directories for rating classifications.
*   **Risks Audited:** Missing `<meta name="rating" content="adult">` tags on adult content.
*   **Impact:** Prevents the site from being filtered out in SafeSearch results.

#### **6.4 Local SEO & Business Details Auditor**
*   **Description:** Validates local business schemas.
*   **Risks Audited:** Mismatching NAP (Name, Address, Phone) details across pages, and missing geocoordinates.
*   **Impact:** Secures local Google Map placements.

---

### **Chapter 7: Performance & Core Web Vitals (Local Execution)**

#### **7.1 Page Speed & Core Web Vitals Audit**
*   **Description:** Integrates local browser observers to evaluate site responsiveness.
*   **Risks Audited:** Poor Largest Contentful Paint (LCP), Cumulative Layout Shift (CLS), and Interaction to Next Paint (INP) scores.
*   **Impact:** Identifies UX page speed ranking bottlenecks.

#### **7.2 Third-Party Script & API Resource Auditor**
*   **Description:** Scans loaded widgets (chat, analytics) blocking main execution threads.
*   **Risks Audited:** Bloated JavaScript payloads blocking user interaction.
*   **Impact:** Keeps Core Web Vitals scores in the green.

#### **7.3 Asset & Caching Optimization Audit**
*   **Description:** Audits static resource delivery headers and properties.
*   **Risks Audited:** Missing CDN use, absent caching directives, missing image dimensions (width/height), and missing next-generation formats (.webp, .avif).
*   **Impact:** Lowers page loads speeds and bandwidth use.

---

### **Chapter 8: Targeted Keyword Tracker (Low-Volume)**

#### **8.1 Scheduled SERP Tracking**
*   **Description:** Direct queries to Google SERPs for selected target terms.
*   **Risks Audited:** Position drop notifications, and SERP displacements.
*   **Impact:** Replaces commercial rank trackers locally.

#### **8.2 Competitor Position Comparison**
*   **Description:** Tracks SERP rankings of the main domain alongside up to 3 competitors.
*   **Risks Audited:** Organic market share loss.
*   **Impact:** Extracts competitor data without generating extra network request overhead.

---

## **4. Standalone Utility Tools Suite**

SEO King provides interactive dashboard utilities for localized testing:

1.  **Robots.txt Creator & Rule Tester:** Generate compliance texts and test bot crawl rules on target paths.
2.  **Multi-Schema JSON-LD Markup Generator:** Form-based JSON builder outputting validated schemas (e.g., Products, local businesses).
3.  **Sitemap XML & Media Extension Builder:** Compile URL list directories into XML files supporting standard namespaces (`image`, `video`).
4.  **International Hreflang Alternates Mapper:** Map localized translation groups and verify country code mappings.
5.  **Redirect Chain Tracer:** Track hop logs and confirm status codes along redirect paths.
6.  **E-E-A-T Self-Assessment Wizard:** Interactive questionnaire based on Google's quality check guidelines.
7.  **Discover Image & Meta Tag Builder:** Validate article images and generate `max-image-preview:large` tags.
8.  **SafeSearch Adult Content Classifier:** Generate rating directives for adult folders.
9.  **URL Path Cleanliness & Structure Auditor:** Check paths for spaces, mixed casing, underscores, or parameter bloat.
10. **GSC Traffic Drop Diagnoser:** Wizard matching traffic patterns to updates and technical problems, generating Bubble Chart query directives.
11. **Article Publication Date Consistency Checker:** Verify `datePublished` schema alignment with HTML page text.
12. **SPA Lazy-Loading Crawler Validation Tester:** Confirm that lazy-loaded assets contain `<noscript>` fallbacks.
13. **PDF & Document Accessibility Checker:** Validate readable texts on non-HTML static attachments.
14. **Product Review Quality Grader:** Audit reviews for original research claims and multiple merchant links.
15. **Paywalled Content Selector Selector:** Match paywall container IDs to schema selectors.
16. **Search Snippet & Cache Scanner:** Highlight page elements suitable for `data-nosnippet` tags.
17. **Server Maintenance Mode Helper:** Confirm 503 status code and `Retry-After` header responses.
18. **Indexing API Integration Advisor:** Validate service account credentials for Google Indexing API access.
19. **Local SEO & NAP Alignment Auditor:** Audit contact page details against footer texts to confirm consistency.

---

## **5. Supporting Technical Specifications**

### **5.1 The "Stealth" Layer: CAPTCHA Resolution & Extraction Logistics**

Direct Google SERP scraping requires robust stealth automation:

*   **Detection:** The scraper checks for 302 redirects to Google's reCAPTCHA/Turnstile pages or specific warning texts.
*   **State Pausing:** Intercepting a block triggers a WebSocket alert to the UI and pauses the scrape queue.
*   **VNC Passthrough:** The headful browser displays inside virtual frame buffers (`Xvfb`) in the container. The VNC stream is captured via `x11vnc` and translated by `websockify` to `noVNC`.
*   **User Action:** The web dashboard embeds the VNC stream in an `<iframe>` allowing the user to manually solve the CAPTCHA.
*   **Resumption:** Upon successful CAPTCHA clearance, the scraper closes the VNC frame and resumes the execution queue.
*   **Logistics Settings:**
    *   *Concurrency:* Default 3 browser tabs (max 5) to protect ThinkPad memory.
    *   *Jitter:* Configurable range (default 3s-8s) to simulate human delay between queries.
    *   *Geolocation Spoofing:* Settings coordinate timezone, latitude, longitude, and locale inputs injected natively into the browser context.

### **5.2 Technical Stack Blueprint**
*   **Backend:** Python 3.11+ / FastAPI
*   **Automation:** Playwright Python wrapper (stealth plugin enabled)
*   **Display Stream:** Xvfb, x11vnc, websockify, noVNC
*   **Database:** SQLite (single file storage)
*   **Frontend:** Vanilla JS / Vanilla CSS

---

## **6. Non-Functional Requirements**

### **6.1 Performance & Scalability**
*   **Crawl Speed Control:** Throttles crawls dynamically based on server response latency.
*   **Render Pipeline Limits:** Render timeouts are capped at 10 seconds per page.
*   **Database Scaling:** JSON bulk records support indexing up to 50,000 URLs.

### **6.2 Security & Compliance**
*   **Data Privacy:** Never persist user verification keys or credentials.
*   **Exclusions:** Identifying user-agent name is `SearchCentralAuditorBot/1.0` and respects robots.txt blocking rules.

---

## **7. Technical Constraints & Out-of-Scope (Phase 1)**
*   **No Auto-Mitigations:** The software outlines risks and recommendations but does not write code fixes to the host server, Git, or CMS systems.
*   **External CSS Parsing:** Complex stylesheet auditing is out of scope.
*   **Proxy Rotation:** Deferred to Phase 2; Phase 1 relies on residential IP execution and human VNC interaction.
