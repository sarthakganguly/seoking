# **Product Requirements Document (PRD): Google Search Central Risk Auditor & Platform**

---

## **1. Executive Summary & Overview**

**SEO King** is a locally hosted, zero-dependency, local-first search engine optimization (SEO) tracking, content optimization, and technical risk auditing platform. It is designed to run entirely on user-owned hardware (optimized for a ThinkPad X230 with Intel Core i5/i7 3rd Gen, 8GB-16GB RAM) and Ubuntu Server, eliminating the need for expensive third-party SaaS backends (e.g., Ahrefs, Semrush, DataForSEO).

The primary goal of SEO King is to audit user websites page-by-page against Google Search Central guidelines, flag technical, content, and SEO risks, explain their severity, and provide actionable mitigation checklists. It relies on direct, local Playwright browser automation combined with human-in-the-loop CAPTCHA resolution via virtual displays (noVNC), ensuring zero external commercial API dependencies.

---

## **2. User Interface & Experience Architecture**

* **Sidebar Navigation:** A persistent left-hand sidebar hosting links to all core chapters, dashboards, standalone tools, and settings.
* **Primary Workspace:** A responsive right-hand panel where dynamic pages, detailed audit tables, editor interfaces, gauge charts, and diagrams render.
* **Viewport Support:** Fully responsive CSS supporting Mobile, Tablet, and Desktop screens.
* **Theming:** Dynamic Light and Dark modes utilizing native CSS variables.
* **Data Portability:** Every data table (e.g., page audits, keyword ranking histories) features a client-side "Download CSV" button for local export.
* **Authentication & User Management:** 100% local login (username/password stored in SQLite using PBKDF2 SHA-256). Upon initial signup, a unique recovery code is generated.
* **Settings Screen:** Manage default crawl depths, crawling schedules, concurrency limits, geolocations, and theme preferences.

---

## **3. Core Platform Chapters (Auditing & Tracking Engine)**

The core scanning and auditing pipeline evaluates websites page-by-page across eight specialized chapters. Each audit check specifies the risk, technical explanation, impact, and target audience perspectives (Non-Technical, SEO Manager, and Developer).

---

### **Chapter 1: Fundamentals (SEO & Content Basics)**

#### **1.1 Title & Meta Optimization Auditor**
* **Description:** Scans every page on the site to audit title tags and meta descriptions.
* **Risks Audited:** Missing, duplicated, truncated (too long: >60 chars title, >160 chars meta), too short (<30 chars title, <120 chars meta), or generic titles (e.g., "Home", "Untitled").
* **Explanation of Risk:** Google truncates titles that exceed snippet width limits (~60 characters) and may ignore uninformative or duplicate titles, generating its own fallback snippets. This harms CTR and organic traffic.
* **Target Audience Focus:**
  * *Non-technical:* Visual warning gauges (green/yellow/red) showing title health.
  * *SEO Manager/Developer:* Exportable CSV of duplicate titles, character counts, and pixel width estimates.

#### **1.2 E-E-A-T & Helpful Content Quality Scanner**
* **Description:** Heuristic and text scanner that analyzes page content copy.
* **Risks Audited:** Pages with search-engine-first content, thin text copy (<300 words), clickbait headlines, lack of expert credentials/author profiles, or repetitive keyword stuffing.
* **Explanation of Risk:** Google's Helpful Content system demotes sites that generate low-quality content primarily to rank in search engines rather than help human readers.
* **Target Audience Focus:**
  * *Non-technical:* Easy-to-understand "Helpful Content Score" with descriptive feedback.
  * *SEO Manager:* Keyword density checks and E-E-A-T signal checklist (author info, source citations).

#### **1.3 AI-Content Quality Guardrails Scan**
* **Description:** Scans AI-assisted copy to ensure compliance with Google's spam guidelines.
* **Risks Audited:** Detects raw auto-generated patterns without human editing, lack of factual verification (hallucination risks), and spammy mass-production indicators.
* **Explanation of Risk:** While AI content is not banned, using automation primarily to manipulate search rankings violates Google's spam policies.
* **Target Audience Focus:**
  * *All Users:* Clear flags showing which pages have highest risk of being flagged as automated search spam.

#### **1.4 Google Discover Eligibility Checker**
* **Description:** Analyzes article-like pages for specific Discover criteria.
* **Risks Audited:** Missing `max-image-preview:large` robots directive, clickbait headlines, and small hero images (width < 1200px).
* **Explanation of Risk:** Pages will not appear in Google Discover feeds if they lack large hero images or fail to set the `max-image-preview:large` meta robots directive.
* **Target Audience Focus:**
  * *SEO Manager:* Flagging missing `max-image-preview` meta tag.
  * *Non-technical:* Warning if images uploaded are too small (width < 1200px).

#### **1.5 Search Essentials Technical Compliance Scan**
* **Description:** Performs a baseline check of your site against Google's technical core requirements.
* **Risks Audited:** Pages throwing non-200 status codes, pages blocked by `robots.txt` that are indexed, or sites employing sneaky redirects/hidden text.
* **Explanation of Risk:** Failing these technical essentials can lead to total de-indexing or manual spam actions.
* **Target Audience Focus:**
  * *Developer:* Specific HTTP headers, robots directives, and response times.
  * *Non-technical:* Simple Pass/Fail checklist showing critical technical blockers.

---

### **Chapter 2: Crawling and Indexing**

#### **2.1 Sitemap Integrator & Health Auditor**
* **Description:** Discovers and validates XML, TXT, and RSS sitemaps declared in `robots.txt` or site headers.
* **Risks Audited:** Sitemaps >50MB or >50,000 URLs, invalid XML schemas, sitemap links returning non-200 codes, or blocked by noindex.
* **Explanation of Risk:** Submitting invalid or dead URLs in sitemaps wastes Google's crawl budget, causing Googlebot to spend time crawling error pages instead of useful content.
* **Target Audience Focus:**
  * *SEO Manager:* Warnings about dead URLs in sitemaps causing Googlebot to waste crawl budget.
  * *Non-technical:* Easy checklist showing if sitemaps are valid and clean.

#### **2.2 Canonicalization & Duplication Risk Scan**
* **Description:** Audits duplicate URL paths and canonical declarations across raw HTML and DOM.
* **Risks Audited:** Missing canonical tags, self-referential canonical mismatches, multiple canonical tags on one page, or discrepancies between HTML and DOM (JS-rendered) canonicals.
* **Explanation of Risk:** Missing or incorrect canonical tags lead to duplicate content issues, diluting PageRank and backlink equity.
* **Target Audience Focus:**
  * *Developer:* Detailed diagnostic comparison of DOM vs raw HTML canonical tags.
  * *Non-technical:* Alerts identifying duplicate pages competing with each other in search.

#### **2.3 Crawlability & HTTP Status Code Diagnoser**
* **Description:** Performs a local crawl checking status codes, redirect loops, and uncrawlable link elements.
* **Risks Audited:** Broken links (404), soft 404s, redirect loops, and link element violations (e.g., buttons using onclick JS functions instead of `href` anchors).
* **Explanation of Risk:** Un-crawlable links mean search engine bots cannot discover sub-pages. High error rates block indexing and signal poor user experience.
* **Target Audience Focus:**
  * *Developer:* Raw log of error pages, redirect chains, and DOM selector paths of uncrawlable links.
  * *Non-technical:* Map of broken links and instructions on which pages to fix.

#### **2.4 JavaScript Rendering & SPA SEO Auditor**
* **Description:** Compares the raw initial HTML response with the fully rendered DOM.
* **Risks Audited:** Dynamic content (meta tags, headings, canonicals, links) failing to render, or lazy-loaded elements missing noscript fallbacks.
* **Explanation of Risk:** Googlebot renders pages in a two-wave process. If content requires user actions to load or fails to render within execution timeouts, it will never be indexed.
* **Target Audience Focus:**
  * *Developer:* Mismatch reports detailing tags present in HTML but altered/missing in the DOM.

#### **2.5 Mobile-First Indexing Parity Scanner**
* **Description:** Compares desktop and mobile browser renders of the same URL.
* **Risks Audited:** Mismatched meta tags, discrepancies in text copy, different header hierarchies, or missing schema markup on mobile.
* **Explanation of Risk:** Since Google is mobile-first, any content or structured data present on desktop but missing on mobile will be completely ignored for ranking.
* **Target Audience Focus:**
  * *SEO Manager:* High-risk warning when critical content present on desktop is hidden on mobile.

#### **2.6 AMP Validation Checker**
* **Description:** Checks AMP page markup validity.
* **Risks Audited:** Missing canonical pointers, AMP validation errors (invalid custom elements, CSS limit > 75KB), and content differences between canonical and AMP variants.
* **Explanation of Risk:** Invalid AMP pages will not be served in AMP search carousels or mobile viewers.
* **Target Audience Focus:**
  * *Developer:* Exact CSS line numbers and invalid HTML tags causing AMP validation to fail.

#### **2.7 Index Blocking & Safe Removal Auditor**
* **Description:** Scans index block directives and link attribute scopes.
* **Risks Audited:** Mishandled `noindex` directives (e.g. page blocked in `robots.txt` containing a `noindex` tag, preventing Googlebot from crawling it to read the block), and missing qualifiers on paid or user-generated outbound links (`sponsored`, `ugc`, `nofollow`).
* **Explanation of Risk:** Blocking a page in `robots.txt` prevents Googlebot from crawling it, meaning a `noindex` tag will never be read. Missing link qualifiers can trigger link spam penalties.
* **Target Audience Focus:**
  * *SEO Manager:* Alerts for pages marked with `noindex` that should be public, or missing qualifiers on affiliate outbound links.

#### **2.8 Site Migration & Redirection Health Check**
* **Description:** Verifies URL transition paths during site moves.
* **Risks Audited:** Temporary 302 redirects instead of permanent 301, redirect chains (> 2 hops), or generic "all redirects to homepage" mappings.
* **Explanation of Risk:** Redirect chains dilute PageRank. 302 redirects signal that a move is temporary, preventing ranking signal transfers.
* **Target Audience Focus:**
  * *All Users:* Redirect health map showing clean 301 paths vs bad redirect habits.

---

### **Chapter 3: Crawling (Infrastructure)**

#### **3.1 Robots.txt Syntax & Security Auditor**
* **Description:** Evaluates `robots.txt` syntax validity and crawl restrictions.
* **Risks Audited:** Syntax errors, deprecated directives, and rules blocking CSS/JS files.
* **Explanation of Risk:** Googlebot needs to render pages like a browser. Blocking CSS or JS in `robots.txt` makes it impossible for Google to verify mobile friendliness and layout, harming rankings.
* **Target Audience Focus:**
  * *Developer:* Line-by-line syntax checker.
  * *Non-technical:* Warning: "You are blocking Googlebot from seeing your design styles (CSS/JS)."

#### **3.2 User-Agent Verification & Spoofing Diagnoser**
* **Description:** Analyzes crawl block rules and user-agent setups.
* **Risks Audited:** Blocking Googlebot sub-crawlers (Googlebot-Image), and malicious bots spoofing the Googlebot UA without passing reverse DNS validation.
* **Explanation of Risk:** Blocking legitimate Google bots prevents image and asset indexing. Allowing spoofed bots wastes server resources.
* **Target Audience Focus:**
  * *Developer:* Instructions to set up DNS lookup verification checks.
  * *SEO Manager:* Warnings about missing image indexation.

#### **3.3 Infinite Spaces & Crawl Budget Diagnoser**
* **Description:** Analyzes site URLs for crawl traps.
* **Risks Audited:** Faceted navigation paths generating infinite parameters, duplicate paths, and high latency responses (>2s).
* **Explanation of Risk:** Spending crawl budget on infinite parameter URLs or waiting on high server latency means new or updated pages won't be crawled.
* **Target Audience Focus:**
  * *SEO Manager:* Flagging crawl bottlenecks like faceted parameter combinations.
  * *Developer:* Server response latency charts and pagination recommendations.

---

### **Chapter 4: Appearance (Structured Data & Search Richness)**

#### **4.1 Structured Data Policies & Semantic Validator**
* **Description:** Parses JSON-LD and Microdata schemas.
* **Risks Audited:** Syntactically invalid JSON, missing required fields, and schema-to-page mismatches (e.g., schema price different from display price).
* **Explanation of Risk:** Schema markup representing content not visible to visitors will be ignored or trigger manual spam penalties.
* **Target Audience Focus:**
  * *Developer:* JSON-LD syntax error highlighter.
  * *SEO Manager:* Structural mismatch warnings that threaten manual actions.

#### **4.2 Rich Result Opportunities Finder (Search Gallery Mapper)**
* **Description:** Identifies candidate schemas based on page structures.
* **Risks Audited:** Missing schemas for Breadcrumbs, Product reviews, Local Businesses, Events, and Articles.
* **Explanation of Risk:** Without structured data schemas, search results appear as standard blue links, losing CTR to competitors displaying stars, prices, or carousels.
* **Target Audience Focus:**
  * *Non-technical:* Visual checklist showing missing schema tags and CTR expansion opportunities.

#### **4.3 Search Branding (Favicon & Site Name) Compliance Check**
* **Description:** Audits favicon assets and Site Name schemas.
* **Risks Audited:** Favicons not multiples of 48px square, and missing `WebSite` schema defining official site name.
* **Explanation of Risk:** Google defaults your site name to your domain name and displays a generic icon if favicon or WebSite schemas are missing.
* **Target Audience Focus:**
  * *All Users:* Warning if site name defaults to domain name or favicon fails requirements.

#### **4.4 Web Stories Health Check**
* **Description:** Audits Web Stories against content policies.
* **Risks Audited:** Aspect ratio violations, thin content, missing video transcripts, and clickbait descriptions.
* **Explanation of Risk:** Non-compliant Web Stories are rejected from Discover visual search blocks.
* **Target Audience Focus:**
  * *SEO Manager:* Flagging compliance risks before publishing stories to Discover.

---

### **Chapter 5: Monitor & Debug (Index Verification & Security)**

#### **5.1 Index Representation & Cloaking Auditor**
* **Description:** Compares live visitor HTML to responses returned for search engine bots.
* **Risks Audited:** Server-side cloaking (serving bots different content than human users) and malware link injection.
* **Explanation of Risk:** Cloaking violates Google’s spam policies and triggers immediate de-indexing.
* **Target Audience Focus:**
  * *SEO Manager:* Warnings if cached/bot copies differ from live visitor view.
  * *Developer:* Server response comparison by User-Agent header.

#### **5.2 Security & Malware Injection Scanner**
* **Description:** Scans script sources, forms, and headers against Google Safe Browsing guidelines.
* **Risks Audited:** Malware script links, deceptive forms, and phishing vectors.
* **Explanation of Risk:** Security issues cause Google to display a red warning screen ("This site may harm your computer"), destroying traffic.
* **Target Audience Focus:**
  * *Developer:* Lines of code or external script sources flagged as unsafe.
  * *Non-technical:* Immediate red alert showing site security rating.

#### **5.3 User-Generated Content (UGC) Abuse Prevention Checker**
* **Description:** Audits forms and comment blocks.
* **Risks Audited:** Comment spam injection and missing `rel="ugc"` or `rel="nofollow"` tags.
* **Explanation of Risk:** Unmoderated user-generated spam results in site-wide quality demotions.
* **Target Audience Focus:**
  * *SEO Manager:* Flagging pages with high comment-to-text ratios that lack spam controls.
  * *Developer:* Code checks to verify external links contain correct qualifiers.

---

### **Chapter 6: Specialty (Ecommerce, International, Explicit)**

#### **6.1 Ecommerce Schema & Shopping Quality Auditor**
* **Description:** Checks structured data specifically for ecommerce listings.
* **Risks Audited:** Missing variant metadata, return policies, or shipping details.
* **Explanation of Risk:** Google requires return and shipping policies schemas for Merchant Center search placements. Mismatched pricing leads to feed suspensions.
* **Target Audience Focus:**
  * *SEO Manager:* Dedicated "Merchant Center readiness" score.
  * *Developer:* Debug details for merchant schemas.

#### **6.2 Hreflang & International Target Check**
* **Description:** Audits international target mapping tags.
* **Risks Audited:** Missing self-referential tags, invalid country/locale codes, and broken reciprocal targets.
* **Explanation of Risk:** Broken hreflangs serve incorrect language versions to local users, driving up bounce rates.
* **Target Audience Focus:**
  * *Developer:* Reciprocal link matrix showing broken return tags.
  * *Non-technical:* Map of localized versions showing missing connections.

#### **6.3 Explicit Content & SafeSearch Isolation Checker**
* **Description:** Scans adult directories for rating classifications.
* **Risks Audited:** Missing `<meta name="rating" content="adult">` tags on explicit content.
* **Explanation of Risk:** Unflagged adult content can cause the entire site to be filtered out under SafeSearch.
* **Target Audience Focus:**
  * *SEO Manager:* Warnings about SafeSearch de-indexing risks.

#### **6.4 Local SEO & Business Details Auditor**
* **Description:** Validates local business schemas.
* **Risks Audited:** Mismatching NAP (Name, Address, Phone) details across pages, and missing geocoordinates.
* **Explanation of Risk:** Inconsistent NAP data or missing location coordinates prevent local Google Maps placement.
* **Target Audience Focus:**
  * *SEO Manager:* Local search readiness audit checklist.
  * *Developer:* Diagnostic of lat/long geocoordinates format.

---

### **Chapter 7: Performance & Core Web Vitals (Local Execution)**

#### **7.1 Page Speed & Core Web Vitals Audit**
* **Description:** Integrates local browser `PerformanceObserver` scripts to evaluate site responsiveness.
* **Risks Audited:** Poor Largest Contentful Paint (LCP), Cumulative Layout Shift (CLS), and Interaction to Next Paint (INP) scores.
* **Explanation of Risk:** Low Core Web Vitals scores directly degrade page experience ranking signals in Google Search.

#### **7.2 Third-Party Script & API Resource Auditor**
* **Description:** Scans third-party widgets (chat, analytics) blocking main execution threads.
* **Risks Audited:** Bloated JavaScript payloads blocking user interaction.
* **Explanation of Risk:** Heavy third-party scripts block the main thread and destroy Core Web Vitals performance.

#### **7.3 Asset & Caching Optimization Audit**
* **Description:** Audits static resource delivery headers and properties.
* **Risks Audited:** Missing CDN headers, absent caching directives (`Cache-Control`, `Expires`), missing image dimensions, and missing next-gen formats (.webp, .avif).
* **Explanation of Risk:** Uncached or unoptimized assets slow page loads and increase bandwidth consumption.

---

### **Chapter 8: Targeted Keyword Tracker (Low-Volume)**

#### **8.1 Scheduled SERP Tracking**
* **Description:** Direct queries to Google SERPs for selected target terms.
* **Risks Audited:** Position drop notifications, and SERP displacements.

#### **8.2 Competitor Position Comparison**
* **Description:** Tracks SERP rankings of the main domain alongside up to 3 competitors (`competitors_json`).
* **Risks Audited:** Organic market share loss.

---

## **4. Web Application Dashboard UI & User Flow**

### **4.1 Core User Flow**
1. **Onboarding & Initialization:** User logs into the dashboard and specifies a target domain.
2. **Audit Scan Trigger:** User clicks "Start Crawl & Audit Scan". The background crawler initializes and recursively scans discovered internal links. A real-time progress bar updates scanned page counts.
3. **Report Presentation:** Once complete, the user views the **Health Score Dashboard** with high-fidelity gauges and tabbed issue breakdowns.
4. **Detail View & Audit Inspector:** User inspects specific risk categories (e.g., "Missing Canonicals") to see affected URLs, raw diagnostic headers, and remediation checklists.

### **4.2 Dashboard UI Views**
* **Main Overview Tab:** Overall crawl health gauge, AI Search Health gauge, critical technical blockers, and top issues summary.
* **Issues Tab:** Searchable, filterable list of all detected errors, warnings, and notices with expandable remediation instructions.
* **Crawled Pages Tab:** Paginated table of all crawled pages with status codes, crawl depths, ILR score, and AI bot access flags.
* **Statistics Tab:** Visual performance tiles and distribution charts for HTTP codes, sitemap coverage, crawl depth, and canonicals.
* **Settings Tab:** Manage concurrency limits, retention pruning, geolocations, user settings, and theme toggles.

---

## **5. Standalone Utility Tools Suite (19 Interactive Utilities)**

The application features a suite of 19 standalone tools. Every generator tool operates **100% ephemerally in-memory**, featuring client-side Blob downloading:

1. **Robots.txt Creator & Rule Tester:** Generate compliance texts with pre-populated Google user-agents (`*`, `Googlebot`, `Googlebot-Image`, `Google-Extended`), Google Search Central quick presets, and optional `Sitemap:` directives.
2. **Multi-Schema JSON-LD Markup Generator:** Form-based JSON builder outputting validated schemas (e.g., Products, local businesses).
3. **Sitemap XML & Media Extension Builder:** Auto-crawl domains (`crawl_domain_for_sitemap`) or compile URL lists into XML files supporting standard (0.9), `image`, `video`, and `news` namespaces with 50,000 URL threshold checks and ephemeral Blob downloading.
4. **International Hreflang Alternates Mapper:** Map localized translation groups and verify reciprocal hreflang tags.
5. **Redirect Chain Tracer:** Track hop logs of redirect chains (301 -> 302 -> 200) and warn if paths exceed 2 hops.
6. **E-E-A-T Self-Assessment Wizard:** Interactive questionnaire based on Google's 20+ helpful content self-assessment guidelines.
7. **Discover Image & Meta Tag Builder:** Validate article images and generate `max-image-preview:large` tags.
8. **SafeSearch Adult Content Classifier:** Generate rating directives (`<meta name="rating" content="adult">`) for explicit folders.
9. **URL Path Cleanliness & Structure Auditor:** Check paths for dynamic parameters, underscores, mixed casings, or length violations.
10. **GSC Traffic Drop Diagnoser:** Wizard matching traffic drops to seasonal, technical, manual action, or algorithm update causes.
11. **Article Publication Date Consistency Checker:** Verify `datePublished` schema alignment with HTML text.
12. **SPA Lazy-Loading Crawler Validation Tester:** Confirm that lazy-loaded assets contain `<noscript>` fallbacks.
13. **PDF & Document Accessibility Checker:** Validate readable text on non-HTML static attachments.
14. **Product Review Quality Grader:** Audit review pages for original research claims and multiple merchant links.
15. **Paywalled Content Selector Selector:** Match paywall container IDs to schema `cssSelector` values.
16. **Search Snippet & Cache Scanner:** Highlight page elements suitable for `data-nosnippet` tags.
17. **Server Maintenance Mode Helper:** Test HTTP responses to confirm `503 Service Unavailable` + `Retry-After` parameters.
18. **Indexing API Integration Advisor:** Validate service account credentials for Google Indexing API access.
19. **Local SEO & NAP Alignment Auditor:** Audit contact page details against footer texts to confirm 100% NAP consistency.

---

## **6. Supporting Technical Specifications**

### **6.1 The "Stealth" Layer: CAPTCHA Resolution Logistics**
* **Detection:** Scraper checks for 302 redirects to Google reCAPTCHA/Turnstile pages or warning text blocks.
* **State Pausing:** Intercepting a block triggers a WebSocket alert to the UI and pauses the scrape queue.
* **VNC Passthrough:** Chromium runs headful inside virtual frame buffers (`Xvfb` display `:99`). The VNC stream is captured via `x11vnc` and translated by `websockify` to `noVNC` on port 8081.
* **User Action:** The web dashboard embeds the noVNC stream inside an `<iframe>`, allowing the user to solve the CAPTCHA manually.
* **Resumption:** Upon clearance, the scraper resumes execution automatically.

### **6.2 Technical Stack Blueprint**
* **Backend:** Python 3.11+ / FastAPI
* **Automation:** Playwright Python wrapper (`playwright-stealth` enabled)
* **Display Stream:** Xvfb, x11vnc, websockify, noVNC
* **Database:** SQLite (`data/seoking.db`) with self-healing startup migrations
* **Frontend:** Vanilla JS / Vanilla CSS, modular component structure (`tools-registry.js`, `tools-widgets.js`, `tools-schema-builder.js`, `tools-hub.js`)

---

## **7. Non-Functional Requirements**

### **7.1 Performance & Scalability**
* **Crawl Speed Control:** Throttles crawls dynamically based on server response latency (`asyncio.Semaphore`, default 3 tabs).
* **Render Pipeline Limits:** Capped at 10-second render timeouts per page.
* **Database Scaling:** Bulk-indexed JSON records supporting crawls up to 50,000 URLs per report.

### **7.2 Security & Compliance**
* **Data Privacy:** Never persist user verification keys or credentials.
* **Exclusions:** User-agent name is `SearchCentralAuditorBot/1.0` and respects robots.txt blocking rules.

---

## **8. Technical Constraints & Out-of-Scope (Phase 1)**
* **No Auto-Mitigations:** Software outlines risks and recommendations but does not write code fixes to the host server filesystem or CMS database.
* **External CSS Parsing:** Complex stylesheet AST auditing is out of scope.
* **Proxy Rotation:** Phase 1 relies on residential local IP execution and human VNC interaction.
