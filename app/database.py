import os
import sqlite3
import logging

# Configure logger based on environment variables
LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO").upper()
ENABLE_LOGGING = os.environ.get("ENABLE_LOGGING", "true").lower() == "true"

logger = logging.getLogger("seoking.database")
if ENABLE_LOGGING:
    logging.basicConfig(
        level=getattr(logging, LOG_LEVEL, logging.INFO),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
    )
else:
    logging.disable(logging.CRITICAL)  # Turn off all logs below CRITICAL

DB_PATH = os.environ.get("DATABASE_URL", "/app/data/seoking.db")

def get_db_connection():
    """
    Returns a sqlite3 connection with Row factory configured.
    Enforces foreign keys on connection.
    """
    conn = sqlite3.connect(DB_PATH, timeout=30.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn

def init_db():
    """
    Initializes the SQLite database schema if not already set up.
    Creates tables and indexes defined in docs/SCHEMA.md.
    """
    db_dir = os.path.dirname(DB_PATH)
    if db_dir and not os.path.exists(db_dir):
        os.makedirs(db_dir, exist_ok=True)
        logger.info(f"Created database directory at {db_dir}")

    schema = """
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        recovery_code_hash TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        setting_key TEXT NOT NULL,
        setting_value TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(user_id, setting_key)
    );

    CREATE TABLE IF NOT EXISTS audit_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        domain TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        total_urls_crawled INTEGER DEFAULT 0,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS audit_pages (
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
        crawled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(audit_run_id) REFERENCES audit_runs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tracked_keywords (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        keyword TEXT NOT NULL,
        target_domain TEXT NOT NULL,
        target_geolocation TEXT DEFAULT 'en-US',
        target_locale TEXT DEFAULT 'en',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(user_id, keyword, target_domain, target_geolocation)
    );

    CREATE TABLE IF NOT EXISTS keyword_rank_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tracked_keyword_id INTEGER NOT NULL,
        rank_position INTEGER,
        ranking_url TEXT,
        checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(tracked_keyword_id) REFERENCES tracked_keywords(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_audit_pages_run_id ON audit_pages(audit_run_id);
    CREATE INDEX IF NOT EXISTS idx_audit_runs_domain_date ON audit_runs(domain, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_keyword_history_lookup ON keyword_rank_history(tracked_keyword_id, checked_at DESC);
    """

    conn = get_db_connection()
    try:
        conn.executescript(schema)
        conn.commit()
        logger.info("Database initialized successfully with tables and indexes.")
    except Exception as e:
        logger.error(f"Error initializing database: {e}")
        raise e
    finally:
        conn.close()

def get_user_setting(user_id: int, key: str, default: str = None) -> str:
    """
    Retrieves a user setting from SQLite database.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT setting_value FROM user_settings WHERE user_id = ? AND setting_key = ?", (user_id, key))
        row = cursor.fetchone()
        return row["setting_value"] if row else default
    except Exception as e:
        logger.error(f"Error fetching user setting {key}: {e}")
        return default
    finally:
        conn.close()

def set_user_setting(user_id: int, key: str, value: str):
    """
    Inserts or updates a user setting in SQLite database.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            """
            INSERT INTO user_settings (user_id, setting_key, setting_value)
            VALUES (?, ?, ?)
            ON CONFLICT(user_id, setting_key)
            DO UPDATE SET setting_value = excluded.setting_value, updated_at = CURRENT_TIMESTAMP
            """,
            (user_id, key, str(value))
        )
        conn.commit()
        logger.info(f"Setting {key} updated to {value} for user_id: {user_id}")
    except Exception as e:
        conn.rollback()
        logger.error(f"Error updating user setting {key}: {e}")
        raise e
    finally:
        conn.close()

