# SEO King: Google Search Central Risk Auditor & Platform

SEO King is a locally hosted, zero-dependency, local-first search engine optimization (SEO) tracking and content optimization platform. Operating entirely on your local machine via Docker, it runs automated searches, crawls, and performance audits directly from your local IP. It uses standard web scraping (via Playwright) combined with human-in-the-loop VNC CAPTCHA resolution to completely bypass the need for expensive third-party SaaS APIs.

---

## 📂 Project Documentation

All design requirements, technical architecture definitions, and constraints are maintained under the [docs](file:///home/sarthakganguly/seoking/docs/) directory:

- 📑 **[Product Requirements (PRD.md)](file:///home/sarthakganguly/seoking/docs/PRD.md)**: Details the functional goals of the system, hardware constraints (ThinkPad X230 optimization), stealth scraping specifications, VNC CAPTCHA interception logic, the 8 Core Platform Chapters, and the Standalone Utility Tools Suite.
- 🗄️ **[Database Schema (SCHEMA.md)](file:///home/sarthakganguly/seoking/docs/SCHEMA.md)**: Holds the SQLite schema definitions optimizing performance for users, settings, sitemaps, page crawls, keyword definitions, and rank historical tables.
- 🤖 **[Agent Instructions (agents.md)](file:///home/sarthakganguly/seoking/docs/agents.md)**: Lists strict architectural boundaries, workflow instructions, scraping configurations, and development requirements for Antigravity coding assistants.

---

## 🛠️ System Architecture

SEO King is 100% containerized. The system coordinates the following layers under a single Docker network:
1. **FastAPI Backend (port `8000`)**: Python web framework routing HTTP requests, serving static views, running background keyword check daemons, and hosting the WebSocket CAPTCHA broker.
2. **Virtual Desktop (Xvfb & noVNC port `8081`)**: A lightweight virtual frame buffer display mapping Playwright Chromium automation. If a Google CAPTCHA security challenge is intercepted, the web interface embeds this stream via an `<iframe>` to allow manual clearance.
3. **SQLite Database (persisted)**: A local database file mapped to the host's directory for robust data persistence between image rebuilds.

---

## 📁 Repository Structure

```
/home/sarthakganguly/seoking/
├── docs/                      # Requirement documentation
│   ├── PRD.md                 # Product Requirements (Google Search Central Risk Auditor)
│   ├── SCHEMA.md              # Database Schema (SQLite)
│   └── agents.md              # Agent instructions
├── app/                       # Source code directory
│   ├── static/                # Single Page App frontend assets
│   │   ├── index.html
│   │   ├── style.css          # Custom Vanilla CSS styling
│   │   ├── app.js             # Client SPA routing & SVG chart draws
│   │   └── tools-hub.js       # Dynamic UI logic for Standalone Tools
│   ├── auth.py                # Hashing and authentication
│   ├── crawler.py             # Site auditor engine (Chapters 1–6)
│   ├── database.py            # SQLite connection pool & query helpers
│   ├── main.py                # FastAPI routes & WebSocket server
│   ├── optimizer.py           # spaCy NLP optimizer (Chapter 1.2 / Ephemeral content engine)
│   ├── scraper.py             # Playwright stealth & CAPTCHA tracker (Stealth Layer)
│   ├── tools.py               # Standalone Utility Tools Suite (Chapter 12)
│   └── tracker.py             # Scheduled keyword rank checking (Chapter 8)
├── Dockerfile                 # Playwright base & VNC configurations
├── docker-compose.yml         # Container mapping orchestrations
├── entrypoint.sh              # Start-up scripts for virtual desktops & servers
└── requirements.txt           # Core Python dependencies
```

---

## 🚀 Running the Application

To start the application, run the docker-compose command in your terminal:
```bash
docker compose up --build
```

### Accessing the Platform
- **App Dashboard**: Open your browser at **[http://localhost:8000](http://localhost:8000)** (or `http://YOUR_SERVER_IP:8000` from other devices on your local network).
- **noVNC Stream Direct**: Access the raw VNC desktop stream at **[http://localhost:8081](http://localhost:8081)** (or `http://YOUR_SERVER_IP:8081` from other devices on your local network).

### First-Time Account Setup
1. Fill in your desired **Username** and **Password** on the signup screen.
2. Copy the generated **Recovery Code** and store it somewhere safe. 
3. Log in using your new credentials.
