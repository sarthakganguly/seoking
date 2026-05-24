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

* **Sidebar Navigation:** The application will utilize a persistent left-hand sidebar containing navigation links to all core modules (Dashboard, Site Audit, Content Optimizer, Rank Tracker, Settings).  
* **Primary Workspace:** The right-hand pane will act as the dynamic workspace where all module interfaces, editors, and data tables are rendered.

### **Responsive & Modern Design**

* **Viewport Support:** The UI must be fully responsive, seamlessly adapting to Mobile, Tablet, and Desktop viewports.  
* **Theming:** The application will support both Light and Dark themes, adhering to modern web design standards (utilizing native CSS variables).  
* **Data Portability:** Every data table across all modules (Audit, Rank Tracker, Entities) must feature a "Download CSV" button for local data extraction.

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

Behaves as a local diagnostic scanner for a single, user-defined domain.

* **On-Demand Local Spider:** Crawls the target domain up to a configured depth. Maps broken links (404s), redirect chains (301/302), and server 5XX errors.  
* **HTML Parser:** Extracts and flags missing or duplicated Title Tags, Meta Descriptions, Alt Text, and H1-H6 headers.  
* **Local Storage:** Saves crawl results to a local SQLite database for historical comparison.

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


