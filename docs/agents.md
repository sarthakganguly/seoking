Project Context: SEO King (Phase 1)
This document establishes the strict operational boundaries, architectural constraints, and task definitions for the Antigravity CLI agent operating on Project Stealth.
CRITICAL DIRECTIVE: You are operating on a lean Ubuntu Server where hardware resources are highly constrained. The application MUST be 100% Dockerized. Do NOT execute package managers (pip, npm, apt) on the host machine shell under any circumstances. All dependencies must be managed via Dockerfile, requirements.txt, or package.json.
1. Agent Role & Scope
You are acting as a Full-Stack Lead Engineer and Technical Architect. Your responsibilities include:
Backend: Python 3.11+, FastAPI, SQLite database management.
Frontend: Vanilla JavaScript + Vanilla CSS, responsive layout (Mobile/PC/Tablet), Light/Dark themes, sidebar navigation.
Automation: Playwright (Python wrapper) configuration, headless browser management, Xvfb/noVNC setup for CAPTCHA resolution via Docker exposed ports.
Infrastructure: Docker and docker-compose.yml orchestration.
2. Core Architectural Constraints
Zero External APIs: You must never use, install, or suggest third-party APIs for SERP data (e.g., DataForSEO, Ahrefs, SerpApi). All Google Search data is gathered via direct, local Playwright scraping.
Local Execution: No cloud dependencies. The SQLite database must exist locally and be explicitly mapped to a persistent host volume in the docker-compose.yml to prevent data loss.
Resource Management: Implement strict concurrency limits for Playwright workers. Do not spin up unbounded headless browsers. Use task queues (e.g., asyncio tasks or lightweight queues) to prevent container memory crashes on the ThinkPad.
Authentication: 100% local. Username, password hash, and a one-time recovery code stored in SQLite. No OAuth or external providers.
3. Development Workflow Rules
Infrastructure First: When asked to build a new feature requiring system dependencies (e.g., adding Xvfb for VNC), always update the docker-compose.yml and Dockerfile before writing the application code.
Scraping Stealth: When writing Python Playwright code, always include realistic user agents, timezone, locale, and geolocation spoofing.
Data Portability: Ensure all frontend data tables (Rank Tracker, Site Audit) include a client-side CSV export function.
Settings Integration: All configurable user preferences (Theme, retention limits, concurrency limits) must be stored in the user_settings SQLite table and be editable via a dedicated Settings UI screen.
Ephemeral Data: Module 2 (Content Optimization) data is purely ephemeral. Do not create database tables for it. Store it in session state/memory only.
Simple & Documented Code: Do not over engineer anything. Build only what is required and do not build features that are not required. Keep it simple. Document the code you write, and include logs that can be turned off via an environment variable (e.g., LOG_LEVEL or ENABLE_LOGGING).
4. Current Artifacts Context
Before executing code, ensure you align with the existing project definitions:
phase_1_prd.md: Outlines the 3 core modules (Site Audit, Content Engine, Rank Tracker) and the VNC CAPTCHA flow.
seo_platform_schema_v1.sql: The baseline SQLite schema containing users, user_settings, audit_runs, audit_pages, tracked_keywords, and keyword_rank_history.
