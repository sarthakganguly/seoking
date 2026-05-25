-- Database Schema v1 for Local SEO Platform (SQLite)
-- Optimized for SQLite on resource-constrained hardware

PRAGMA foreign_keys = ON; -- Enforce foreign key constraints

-- ==========================================
-- 1. USER & SETTINGS MANAGEMENT
-- ==========================================

CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    recovery_code_hash TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    setting_key TEXT NOT NULL,
    setting_value TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, setting_key) 
    -- Allows easy UPSERTs: INSERT INTO ... ON CONFLICT(user_id, setting_key) DO UPDATE SET setting_value = excluded.setting_value
);

-- ==========================================
-- 2. SITE AUDIT MODULE (Module 1)
-- ==========================================

-- Represents a single audit run for a domain.
-- A scheduled background worker will prune these based on the 
-- 'historical_audit_limit' setting in user_settings.
CREATE TABLE audit_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    domain TEXT NOT NULL,
    status TEXT DEFAULT 'pending', -- 'pending', 'running', 'completed', 'failed'
    total_urls_crawled INTEGER DEFAULT 0,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    details_json TEXT, -- JSON-serialized dict containing robots.txt info, sitemaps list, and orphan pages list
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Stores the individual page results for a specific audit run.
CREATE TABLE audit_pages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    audit_run_id INTEGER NOT NULL,
    url TEXT NOT NULL,
    status_code INTEGER,
    title_tag TEXT,
    meta_description TEXT,
    h1_tag TEXT,
    is_broken BOOLEAN DEFAULT 0,
    has_redirect BOOLEAN DEFAULT 0,
    redirect_url TEXT,
    canonical_url TEXT, -- The canonical link tag target URL if set
    is_noindex BOOLEAN DEFAULT 0, -- 1 if page has noindex meta or header
    word_count INTEGER, -- Word count of page text
    issues_json TEXT, -- JSON array of strings listing detected SEO issues on the page
    details_json TEXT, -- JSON dictionary of full structural/diagnostic checks (header tree, alt images list, schema list)
    crawled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(audit_run_id) REFERENCES audit_runs(id) ON DELETE CASCADE
);

-- ==========================================
-- 3. KEYWORD TRACKER MODULE (Module 3)
-- ==========================================

-- The root configuration for keywords the user is tracking.
CREATE TABLE tracked_keywords (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    keyword TEXT NOT NULL,
    target_domain TEXT NOT NULL,
    -- Allows tracking the same keyword in different locations/languages
    target_geolocation TEXT DEFAULT 'en-US', 
    target_locale TEXT DEFAULT 'en',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, keyword, target_domain, target_geolocation)
);

-- Time-series data tracking daily performance.
CREATE TABLE keyword_rank_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tracked_keyword_id INTEGER NOT NULL,
    rank_position INTEGER, -- Will be NULL if the URL is not found in the Top 100
    ranking_url TEXT,      -- The specific URL from the target_domain that ranked
    checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(tracked_keyword_id) REFERENCES tracked_keywords(id) ON DELETE CASCADE
);

-- ==========================================
-- 4. EPHEMERAL CONTENT OPTIMIZATION (Module 2)
-- ==========================================
-- No persistent schema required based on architecture decisions.
-- Data will exist only in memory / frontend state during the active session.

-- ==========================================
-- INDEXES FOR PERFORMANCE
-- ==========================================
-- Essential for fast lookups on a constrained machine

-- Speeds up dashboard loading when fetching audit results
CREATE INDEX idx_audit_pages_run_id ON audit_pages(audit_run_id);

-- Speeds up the pruning script when deleting old audits
CREATE INDEX idx_audit_runs_domain_date ON audit_runs(domain, started_at DESC);

-- Speeds up rendering the historical line charts in the UI
CREATE INDEX idx_keyword_history_lookup ON keyword_rank_history(tracked_keyword_id, checked_at DESC);
