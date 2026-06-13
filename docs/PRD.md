# **Product Requirements Document (PRD)**

**SEO King: Phase 1 — Local-First SEO Platform**

## **1\. Executive Summary**

Project Stealth is a locally hosted, zero-dependency SEO tracking and content optimization platform. Designed to eliminate the multi-million dollar overhead of SaaS backends, it relies entirely on local execution, direct web scraping, and containerized deployment.

Phase 1 focuses exclusively on establishing a resilient data-gathering pipeline for a single user without relying on any third-party APIs (e.g., DataForSEO, Ahrefs, GSC) or external cloud servers.

### **Target Environment & NFRs (Non-Functional Requirements)**

* **Hardware Context:** Optimized to run entirely on a ThinkPad X230 (Intel Core i5/i7 3rd Gen, 8GB-16GB RAM). Application memory footprint must be aggressively managed.  
* **Host OS:** Ubuntu Server.  
* **Deployment:** 100% Dockerized (docker-compose). Application must spin up locally with zero host-level dependencies.  
* **Persistent Storage:** The SQLite database and local configuration files *must* be mapped to a persistent host volume outside the container to prevent data loss during container restarts or updates.  
* **Network Dependency:** Operates strictly from the user's local residential IP. No proxy rotation or data center proxy routing in Phase 1\.  
* **API Dependency:** Zero external commercial API calls. All Google Search data must be obtained via direct browser automation.

## **2\. User Interface & Experience Architecture**

### **Layout & Navigation**

* **Sidebar Navigation:** The application will utilize a persistent left-hand sidebar containing navigation links to all core modules (Dashboard, Site Audit, Content Optimizer, Rank Tracker, Performance Audit, Settings).  
* **Primary Workspace:** The right-hand pane will act as the dynamic workspace where all module interfaces, editors, and data tables are rendered.

### **Responsive & Modern Design**

* **Viewport Support:** The UI must be fully responsive, seamlessly adapting to Mobile, Tablet, and Desktop viewports.  
* **Theming:** The application will support both Light and Dark themes, adhering to modern web design standards (utilizing native CSS variables).  
* **Data Portability:** Every data table across all modules (Audit, Rank Tracker, Entities, Performance Audit) must feature a "Download CSV" button for local data extraction.

### **Authentication & User Management**

* **Local-Only Authentication:** User login is entirely local via username and password stored in the SQLite database. No external identity providers (OAuth, Google, etc.) will be used.  
* **Account Recovery:** Upon account creation, the user is provided a one-time unique recovery code. If the password is forgotten and the recovery code is lost, the account cannot be recovered, and a new user must be created.

### **Settings Configuration**

* **User Preferences:** A dedicated Settings screen accessible from the sidebar.  
* **Stored Configurations:** Allows the user to toggle UI themes (Light/Dark), manage default crawl depths, configure preferred keyword tracking schedules, and manage the technical parameters below.

## **3\. The "Stealth" Layer: CAPTCHA Resolution & Extraction Logistics**

### **CAPTCHA Handling**

Because Phase 1 utilizes direct scraping without IP rotation, Google will inevitably block automated requests with a CAPTCHA. The application must gracefully suspend scraping and securely pass the CAPTCHA to the human operator.

* **Detection:** The internal Playwright/Puppeteer script must monitor for 302 redirects to Google's reCAPTCHA/Turnstile pages or specific DOM elements indicating a block.  
* **State Pausing:** Upon detection, the script pauses the queue to prevent further blocks and alerts the UI dashboard via WebSockets.  
* **GUI Exposure (VNC Passthrough):** The headless Docker container runs a lightweight virtual display (Xvfb) and a VNC stream (noVNC).  
* **User Resolution:** The user accesses the application's local web dashboard, clicks "Solve CAPTCHA", and interacts with the embedded VNC browser frame to manually clear the block.  
* **Resumption:** Upon successful navigation back to the SERP, the script saves fresh session cookies locally, closes the VNC stream, and resumes the scrape queue.

### **Resource & Request Constraints (Configurable via Settings)**

To prevent hardware throttling on the ThinkPad X230, the scraping logic must be strictly governed:

* **Concurrency Limits:** Users can set the "Max Concurrent Browser Tabs" (default: 3, max: 5\) to prevent RAM exhaustion.  
* **Humanized Jitter:** Users can define a "Request Delay Range" (e.g., 3000ms \- 8000ms) to inject random pauses between automated searches, reducing detection rates.

### **Geolocation Spoofing (Configurable via Settings)**

* **Locale Manipulation:** To fetch accurate SERPs for target markets, users can define their target Geolocation (Latitude/Longitude), Locale (e.g., en-US, en-GB), and TimezoneId in the settings. The browser engine will natively inject these properties into the scraping context.

## **4\. Core Modules (Phase 1 Scope)**

### **Module 1: Technical Site Audit \[Local Execution\]**

Behaves as a local diagnostic scanner for a single, user-defined domain, expanded to evaluate 16 rigorous technical SEO metrics:

1. **Robots.txt & Sitemap Audit:** Scans robots.txt directives and discovers/indexes XML sitemaps recursively (run-wide).
2. **Orphan Page Detection:** Cross-references crawled URLs with sitemap URLs to discover orphan paths (run-wide).
3. **JS-Dependent Rendering Risk:** Heuristically flags pages showing low raw word counts coupled with frontend frameworks (React, Vue, Next.js, Nuxt, etc.).
4. **Canonicalization Checks:** Validates presence and accuracy of canonical target links, flagging external target mismatches.
5. **Robots Meta Noindex Audits:** Scans `<meta name="robots">` and `X-Robots-Tag` HTTP headers to flag indexing blocks.
6. **HTTP Status Code Compliance:** Logs server response codes (healthy 200s, redirects 3xx, broken 404s, etc.).
7. **Title Tag Analysis:** Flags missing, duplicate, too short (<30 chars), or too long (>60 chars) title tags.
8. **Meta Description Analysis:** Flags missing, duplicate, too short (<120 chars), or too long (>160 chars) meta descriptions.
9. **H1 Tag Audits:** Verifies presence and uniqueness of H1 tags.
10. **Header Hierarchy Levels:** Maps the full H1-H6 tree, flagging skipped levels (e.g. H1 straight to H3).
11. **Thin Content Check:** Logs total body words and flags pages with fewer than 300 words.
12. **Structured Data Validator:** Parses and logs JSON-LD and microdata schemas, validating JSON format.
13. **Breadcrumbs Validator:** Detects presence of breadcrumb markup/schemas.
14. **Taxonomy Duplication Checks:** Identifies category, tag, author, and archive URLs, checking for thin content and index status.
15. **Pagination Tag Checks:** Identifies `rel="prev"` / `rel="next"` and page query parameters.
16. **Anchor & Alt Text Audits:** Identifies images missing alt tags and links containing generic (e.g. "click here") or empty anchor text.

* **UI Interface (Expanding Diagnostic Panels):** An expanding panel drawer under each page row allows deep inspection of the technical checklist, hierarchical header tree, structured data schemas, missing alt images, and generic anchor stats.
* **Detailed Issues View:** The issues panel groups and normalizes crawler warnings and errors (e.g., consolidating alt tag warnings). When inspecting an issue, the UI renders a dynamic table detailing every affected URL with a context-specific column:
  * *Title tag too short / too long:* Displays the current title tag string and character count.
  * *Thin Content:* Displays the exact word count.
  * *Meta description too short / too long:* Displays the current meta description and character count.
  * *Missing Alt Tags:* Consolidates occurrences and displays a nested bulleted list of image URLs lacking alt attributes.
  * *Broken Link (404):* Displays a list of clickable, referring page URLs indicating where the broken link is located.
  * *Other errors / warnings:* Displays relevant, contextual statuses (such as actual canonical tags, heading lists, JS dependency, or HTTP error codes).
* **Local Storage:** Saves crawl results, issues arrays, and structural metadata to a local SQLite database for historical comparison and CSV extraction.

### **Module 2: Content Optimization Engine \[Direct Scrape\]**

An on-demand semantic analysis tool built for single-keyword target optimization.

* **SERP Acquisition:** User inputs a target keyword. The headless browser directly queries Google, bypasses boilerplate, and extracts the top 10 to 20 ranking organic URLs.  
* **JS-Rendered DOM Extraction:** The scraper must wait for networkidle to ensure Single Page Applications (React/Vue competitors) are fully rendered before extracting text, bypassing raw HTML fetching limitations.  
* **Concurrent Scraping (Limited):** Asynchronous workers download the competitor DOMs, strictly adhering to the user's defined concurrency limits.  
* **Noise Reduction:** Runs local libraries (e.g., newspaper3k or Mozilla Readability) to strip sidebars, nav bars, and footers, leaving pure article text.  
* **Local NLP Pipeline:** Processes the aggregate text locally using TF-IDF (or a lightweight library like spaCy) to extract the most prominent semantic entities and multi-word phrases.  
* **Text Editor GUI:** A frontend WYSIWYG editor that scores the user's draft in real-time against the locally generated entity list.

### **Module 3: Targeted Keyword Tracker \[Low-Volume\]**

A tactical, low-volume position monitor replacing commercial rank trackers.

* **Scheduled Scraping:** Executes automated Google searches for a predefined list of high-priority keywords (e.g., 20-50 queries daily).  
* **Rank Extraction:** Parses the live SERP DOM to locate the user's specific domain URL and records the integer position (1 through 100).  
* **Historical Dashboard:** Renders a simple line chart tracking position movements over time, stored locally.

### **Module 4: Performance & Core Web Vitals Audit \[Local Execution\]**

An on-demand performance auditing tool evaluating page speed optimization parameters.

* **Performance Observers:** Launches Chromium in headful mode, injecting Javascript `PerformanceObservers` to gather Largest Contentful Paint (LCP), Layout Shift (CLS), and Interaction to Next Paint (INP) directly from the browser window object.
* **Simulated Interaction:** Executes automated scrolling and body clicks to trigger browser event latency and record realistic user experience metrics.
* **Asset Auditing:** Inspects document response headers to check for CDN use (Cloudflare, CloudFront, etc.) and cache-control properties. Parses image elements to analyze lazy loading, next-generation image formats, and explicit layout dimensions (width and height attributes).
* **Local Persistence:** Stores performance metrics and detailed JSON logs in SQLite for user lookup and comparison.

## **5\. Out of Scope for Phase 1**

| Deferred Feature | Reasoning / Phase 2 Plan |
| :---- | :---- |
| **Proxy Rotation Layer** | Phase 1 relies on the ThinkPad's residential IP and human-in-the-loop CAPTCHA solving. Proxy management introduces configuration overhead. |
| **Google Search Console (GSC) Sync** | Requires OAuth implementation and external API orchestration. Deflecting to Phase 2 to maintain strict "Zero API" isolation. |
| **Global Link Graphing** | Requires persistent, massive database indexation which violates the local-first, low-memory ThinkPad environment limit. |

## **6\. Technical Stack Blueprint**

* **Backend Automation:** Python 3.11+ / FastAPI (lightweight, asynchronous processing).  
* **Browser Engine:** Playwright (Python wrapper) configured with Stealth plugins to minimize immediate bot detection.  
* **Virtual Display:** Xvfb & noVNC mapped to Docker exposed ports for browser GUI interaction.  
* **Database:** SQLite (Single file, no background daemon required, ideal for ThinkPad resource constraints).  
* **Frontend:** Vanilla JavaScript + Vanilla CSS (served directly by FastAPI).


