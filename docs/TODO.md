# 📝 SEO King Phase 1 TODOs

This file tracks proposed enhancements, optimizations, and technical debt items for the local-first SEO King application. All items are designed to run fully locally without external third-party API dependencies.

---

## 🚀 Proposed Enhancements

- [x] **👥 Competitor Rank Comparison**
  *   **Module**: Keyword Tracker
  *   **Description**: Allow users to specify up to 3 competitor domains (e.g. `competitor.com`) in Settings. Parse and record competitor rankings from the Google SERP HTML alongside the main domain.
  *   **Benefits**: Free competitor analysis using the same SERP HTML response without generating extra HTTP requests.

- [x] **🤖 Robots.txt Creator Enhancements**
  *   **Module**: Standalone Utility Tools (`app/tools.py`, `tools-registry.js`)
  *   **Description**: Pre-populated default user-agents (`*`, `Googlebot`, `Googlebot-Image`, `Google-Extended`), Google Search Central quick preset shortcuts, and optional `Sitemap:` directive support.
  *   **Benefits**: Ensures rules align directly with Google Search Central guidelines (`docs/gsearch.md`).

- [x] **🗺️ XML Sitemap & Media Extension Crawler Builder**
  *   **Module**: Standalone Utility Tools (`app/tools.py`, `tools-registry.js`)
  *   **Description**: Automated domain crawling (`crawl_domain_for_sitemap`) for multi-URL page discovery, full support for Standard (0.9), Image, Video, and News extension XML namespaces, 50,000 URL threshold validation, and ephemeral in-memory Blob downloading.
  *   **Benefits**: Eliminates manual URL typing and generates compliant, multi-extension sitemaps on demand.

- [x] **🧩 Standalone Tools Architecture Decoupling**
  *   **Module**: Frontend Architecture (`app/static/`)
  *   **Description**: Decoupled monolithic `tools-hub.js` into a clean modular architecture (`tools-registry.js`, `tools-widgets.js`, `tools-schema-builder.js`, `tools-hub.js`) with a zero-switch declarative form serializer (`serializeToolForm`) and ephemeral Blob downloads.
  *   **Benefits**: High maintainability, separation of concerns, and 100% configuration-driven tool additions.

- [ ] **🍪 Persisted Browser Storage State (Stealth Layer)**
  *   **Module**: Stealth / Scraper Layer
  *   **Description**: Save the Playwright browser context storage state (cookies, local storage, consent configurations) to a local JSON file (e.g., `/app/data/session_state.json`) after a CAPTCHA is solved. Load this state when starting new scraper browser instances.
  *   **Benefits**: Reduces the number of security challenges and reCAPTCHA blocks by preserving cookies and session settings across runs.

- [ ] **🧹 Historical Audit Pruning Daemon**
  *   **Module**: Technical Site Audit / Database
  *   **Description**: Implement a scheduled SQLite worker to prune older audit runs and cascade-delete orphaned crawl page records when the total audits count exceeds the user-configured `historical_audit_limit`.
  *   **Benefits**: Prevents database bloat and disk space depletion on resource-constrained systems (e.g., ThinkPad X230).

- [ ] **✍️ Content Readability & Structural Metrics**
  *   **Module**: Content Optimization Engine
  *   **Description**: Add real-time grade calculations (like Flesch-Kincaid Reading Ease) and heading density statistics (H2/H3 counts in user draft compared to competitor averages) within the WYSIWYG editor.
  *   **Benefits**: Zero extra network overhead; parses text directly in frontend memory to guide optimized content creation.

- [ ] **🔍 SERP Feature Detection**
  *   **Module**: Keyword Tracker
  *   **Description**: Parse Google SERPs using CSS selectors to check for the presence of rich features, such as "People Also Ask" boxes, Local Map Packs, Video carousels, and Featured Snippets.
  *   **Benefits**: Logs query layout metadata to let users identify opportunities for snippet optimization.
