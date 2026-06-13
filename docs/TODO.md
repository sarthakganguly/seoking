# 📝 SEO King Phase 1 TODOs

This file tracks proposed enhancements, optimizations, and technical debt items for the local-first SEO King application. All items are designed to run fully locally without external third-party API dependencies.

---

## 🚀 Proposed Enhancements

- [x] **👥 Competitor Rank Comparison**
  *   **Module**: Keyword Tracker
  *   **Description**: Allow users to specify up to 3 competitor domains (e.g. `competitor.com`) in Settings. Parse and record competitor rankings from the Google SERP HTML alongside the main domain.
  *   **Benefits**: Free competitor analysis using the same SERP HTML response without generating extra HTTP requests.

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
