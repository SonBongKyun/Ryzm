"""
Ryzm Terminal — Database Layer (SQLite / PostgreSQL)
Connection management, schema init, all CRUD operations.
Supports SQLite (local dev) and PostgreSQL (production) via DATABASE_URL.
"""
import os
import json
import time
import sqlite3
import threading
from datetime import datetime, timezone, timedelta
from typing import List, Optional

from app.core.config import PROJECT_ROOT, RISK_SAVE_INTERVAL
from app.core.logger import logger
from app.core.http_client import resilient_get

# ── PostgreSQL support via DATABASE_URL ──
DATABASE_URL = os.getenv("DATABASE_URL", "")
USE_PG = bool(DATABASE_URL)

if USE_PG:
    import psycopg2
    import psycopg2.extras
    logger.info("[DB] PostgreSQL mode (DATABASE_URL detected)")
else:
    _app_env = os.getenv("APP_ENV", "").lower()
    if _app_env == "production":
        logger.warning(
            "[DB] ⚠️  SQLite mode in PRODUCTION — data will be lost on redeploy! "
            "Set DATABASE_URL env var to use PostgreSQL (e.g. Neon, Supabase)."
        )
    else:
        logger.info("[DB] SQLite mode (local development)")

# ── Database Path (SQLite only) ──
DB_PATH = str(PROJECT_ROOT / "council_history.db")

_db_lock = threading.Lock()


class _AutoCursor:
    """Wraps DB cursor to auto-convert SQLite ? placeholders to PostgreSQL %s."""
    __slots__ = ('_c',)

    def __init__(self, cursor):
        self._c = cursor

    def execute(self, sql, params=None):
        if USE_PG:
            sql = sql.replace("?", "%s")
            sql = sql.replace("INTEGER PRIMARY KEY AUTOINCREMENT", "SERIAL PRIMARY KEY")
        return self._c.execute(sql, params) if params is not None else self._c.execute(sql)

    def fetchone(self):
        return self._c.fetchone()

    def fetchall(self):
        return self._c.fetchall()

    @property
    def lastrowid(self):
        return self._c.lastrowid

    @property
    def rowcount(self):
        return self._c.rowcount

    def close(self):
        return self._c.close()

    def __iter__(self):
        return iter(self._c)


def _migrate_col(cursor, table, col_name, col_def):
    """Add column to table if not exists (handles both SQLite and PG)."""
    if USE_PG:
        cursor.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {col_name} {col_def}")
    else:
        try:
            cursor.execute(f"ALTER TABLE {table} ADD COLUMN {col_name} {col_def}")
        except sqlite3.OperationalError:
            pass


def db_connect():
    """Create a database connection (PostgreSQL or SQLite)."""
    if USE_PG:
        conn = psycopg2.connect(DATABASE_URL)
        return conn
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    conn.execute("PRAGMA busy_timeout=5000;")
    return conn


class db_session:
    """Context manager that holds _db_lock for the entire open→execute→commit→close span.

    Usage:
        with db_session() as (conn, c):
            c.execute(...)
            conn.commit()   # optional—auto-committed on exit if no error
    """
    def __init__(self, row_factory=None):
        self._row_factory = row_factory

    def __enter__(self):
        _db_lock.acquire()
        self._conn = db_connect()
        if USE_PG:
            if self._row_factory:
                raw_cursor = self._conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
            else:
                raw_cursor = self._conn.cursor()
        else:
            if self._row_factory:
                self._conn.row_factory = self._row_factory
            raw_cursor = self._conn.cursor()
        self._cursor = _AutoCursor(raw_cursor)
        return self._conn, self._cursor

    def __exit__(self, exc_type, exc_val, exc_tb):
        try:
            if exc_type is None:
                self._conn.commit()
            elif USE_PG:
                self._conn.rollback()
        finally:
            try:
                self._conn.close()
            finally:
                _db_lock.release()
        return False  # propagate exceptions


def utc_now_str() -> str:
    """Return current UTC time as a formatted string."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def init_council_db():
    """Initialize SQLite DB for all tables."""
    try:
        with db_session() as (conn, c):
            c.execute("""
                CREATE TABLE IF NOT EXISTS council_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    timestamp_ms INTEGER DEFAULT 0,
                    consensus_score INTEGER,
                    vibe_status TEXT,
                    btc_price REAL,
                    btc_price_after TEXT DEFAULT NULL,
                    hit INTEGER DEFAULT NULL,
                    horizon_min INTEGER DEFAULT 60,
                    return_pct REAL DEFAULT NULL,
                    evaluated_at_utc TEXT DEFAULT NULL,
                    price_source TEXT DEFAULT NULL,
                    full_result TEXT
                )
            """)
            c.execute("""
                CREATE TABLE IF NOT EXISTS risk_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    score REAL,
                    level TEXT,
                    fg REAL DEFAULT 0,
                    vix REAL DEFAULT 0,
                    ls REAL DEFAULT 0,
                    fr REAL DEFAULT 0,
                    kp REAL DEFAULT 0
                )
            """)
            c.execute("""
                CREATE TABLE IF NOT EXISTS price_snapshots (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ts_utc TEXT NOT NULL,
                    symbol TEXT NOT NULL,
                    price REAL NOT NULL,
                    source TEXT DEFAULT 'binance',
                    UNIQUE(ts_utc, symbol)
                )
            """)
            c.execute("""
                CREATE TABLE IF NOT EXISTS council_eval (
                    council_id INTEGER NOT NULL,
                    horizon_min INTEGER NOT NULL,
                    price_after REAL NOT NULL,
                    hit INTEGER NOT NULL,
                    evaluated_at_utc TEXT NOT NULL,
                    PRIMARY KEY (council_id, horizon_min)
                )
            """)
            c.execute("""
                CREATE TABLE IF NOT EXISTS briefings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT NOT NULL,
                    content TEXT NOT NULL,
                    created_at_utc TEXT NOT NULL
                )
            """)
            c.execute("""
                CREATE TABLE IF NOT EXISTS ai_usage (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    uid TEXT NOT NULL,
                    endpoint TEXT NOT NULL,
                    used_at_utc TEXT NOT NULL
                )
            """)
            c.execute("""
                CREATE TABLE IF NOT EXISTS price_alerts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    uid TEXT NOT NULL,
                    symbol TEXT NOT NULL,
                    target_price REAL NOT NULL,
                    direction TEXT NOT NULL,
                    note TEXT DEFAULT '',
                    triggered INTEGER DEFAULT 0,
                    triggered_at_utc TEXT DEFAULT NULL,
                    created_at_utc TEXT NOT NULL
                )
            """)
            c.execute("""
                CREATE TABLE IF NOT EXISTS user_layouts (
                    uid TEXT PRIMARY KEY,
                    layout_json TEXT NOT NULL,
                    updated_at_utc TEXT NOT NULL
                )
            """)
            # ── Auth & Payment tables ──
            c.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    email TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    display_name TEXT DEFAULT '',
                    uid TEXT UNIQUE,
                    tier TEXT DEFAULT 'free',
                    stripe_customer_id TEXT,
                    created_at_utc TEXT NOT NULL,
                    last_login_utc TEXT
                )
            """)
            c.execute("""
                CREATE TABLE IF NOT EXISTS subscriptions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    stripe_subscription_id TEXT UNIQUE,
                    plan TEXT DEFAULT 'pro',
                    status TEXT DEFAULT 'active',
                    current_period_end TEXT,
                    created_at_utc TEXT NOT NULL,
                    FOREIGN KEY (user_id) REFERENCES users(id)
                )
            """)
            # ── Signal Journal table ──
            c.execute("""
                CREATE TABLE IF NOT EXISTS signal_journal (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    council_id INTEGER,
                    snapshot_json TEXT NOT NULL,
                    position_type TEXT DEFAULT '',
                    entry_price REAL DEFAULT 0,
                    stop_loss REAL DEFAULT 0,
                    take_profit REAL DEFAULT 0,
                    user_note TEXT DEFAULT '',
                    tags TEXT DEFAULT '',
                    outcome TEXT DEFAULT '',
                    outcome_price REAL DEFAULT 0,
                    outcome_note TEXT DEFAULT '',
                    closed_at_utc TEXT DEFAULT NULL,
                    created_at_utc TEXT NOT NULL,
                    FOREIGN KEY (user_id) REFERENCES users(id)
                )
            """)
            # ── Announcements table ──
            c.execute("""
                CREATE TABLE IF NOT EXISTS announcements (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT NOT NULL,
                    content TEXT NOT NULL,
                    level TEXT DEFAULT 'info',
                    active INTEGER DEFAULT 1,
                    created_at_utc TEXT NOT NULL
                )
            """)
            # ── Briefing Subscribers table ──
            c.execute("""
                CREATE TABLE IF NOT EXISTS briefing_subscribers (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    email TEXT UNIQUE NOT NULL,
                    active INTEGER DEFAULT 1,
                    subscribed_at_utc TEXT NOT NULL,
                    unsubscribed_at_utc TEXT DEFAULT NULL
                )
            """)
            # ── Portfolio Holdings table ──
            c.execute("""
                CREATE TABLE IF NOT EXISTS portfolio_holdings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    symbol TEXT NOT NULL,
                    amount REAL NOT NULL DEFAULT 0,
                    avg_price REAL NOT NULL DEFAULT 0,
                    created_at_utc TEXT NOT NULL,
                    updated_at_utc TEXT NOT NULL,
                    UNIQUE(user_id, symbol),
                    FOREIGN KEY (user_id) REFERENCES users(id)
                )
            """)
            # Migration: add trial columns to users
            for col_name, col_def in [
                ("trial_used", "INTEGER DEFAULT 0"),
                ("trial_started_at", "TEXT DEFAULT NULL"),
                ("onboarding_step", "INTEGER DEFAULT 0"),
            ]:
                _migrate_col(c, "users", col_name, col_def)
            # Migration: add new columns to existing users table if missing
            for col_name, col_def in [
                ("email_verified", "INTEGER DEFAULT 0"),
                ("email_verify_token", "TEXT DEFAULT NULL"),
                ("password_reset_token", "TEXT DEFAULT NULL"),
                ("reset_token_expires", "TEXT DEFAULT NULL"),
                ("tos_accepted_at", "TEXT DEFAULT NULL"),
            ]:
                _migrate_col(c, "users", col_name, col_def)
            # Migration: add new columns to existing council_history if missing
            for col_name, col_def in [
                ("timestamp_ms", "INTEGER DEFAULT 0"),
                ("horizon_min", "INTEGER DEFAULT 60"),
                ("return_pct", "REAL DEFAULT NULL"),
                ("evaluated_at_utc", "TEXT DEFAULT NULL"),
                ("price_source", "TEXT DEFAULT NULL"),
                ("prediction", "TEXT DEFAULT 'NEUTRAL'"),
                ("confidence", "TEXT DEFAULT 'LOW'"),
            ]:
                _migrate_col(c, "council_history", col_name, col_def)
            # Migration: add OI + Stablecoin columns to risk_history
            for col_name, col_def in [
                ("oi", "REAL DEFAULT 0"),
                ("sc", "REAL DEFAULT 0"),
            ]:
                _migrate_col(c, "risk_history", col_name, col_def)
        logger.info("[DB] Council + Risk + PriceSnapshot + Eval + Briefings + Usage + Auth database initialized")
    except Exception as e:
        logger.error(f"[DB] Failed to initialize database: {e}")
        raise


# ───────────────────────────────────────
# User Management (Auth)
# ───────────────────────────────────────
def create_user(email: str, password_hash: str, display_name: str = "", uid: str = None) -> Optional[int]:
    """Create a new user. Returns user_id or None on failure."""
    try:
        with db_session() as (conn, c):
            sql = "INSERT INTO users (email, password_hash, display_name, uid, tier, created_at_utc) VALUES (?, ?, ?, ?, 'free', ?)"
            params = (email, password_hash, display_name, uid, utc_now_str())
            if USE_PG:
                c.execute(sql + " RETURNING id", params)
                user_id = c.fetchone()[0]
            else:
                c.execute(sql, params)
                user_id = c.lastrowid
        return user_id
    except Exception as e:
        logger.error(f"[DB] Create user error: {e}")
        return None


def get_user_by_email(email: str) -> Optional[dict]:
    """Fetch user by email."""
    try:
        with db_session(row_factory=sqlite3.Row) as (conn, c):
            c.execute("SELECT * FROM users WHERE email = ?", (email,))
            row = c.fetchone()
        return dict(row) if row else None
    except Exception as e:
        logger.error(f"[DB] Get user by email error: {e}")
        return None


def get_user_by_id(user_id: int) -> Optional[dict]:
    """Fetch user by ID."""
    try:
        with db_session(row_factory=sqlite3.Row) as (conn, c):
            c.execute("SELECT * FROM users WHERE id = ?", (user_id,))
            row = c.fetchone()
        return dict(row) if row else None
    except Exception as e:
        logger.error(f"[DB] Get user by id error: {e}")
        return None


def get_user_by_uid(uid: str) -> Optional[dict]:
    """Fetch user by anonymous UID."""
    try:
        with db_session(row_factory=sqlite3.Row) as (conn, c):
            c.execute("SELECT * FROM users WHERE uid = ?", (uid,))
            row = c.fetchone()
        return dict(row) if row else None
    except Exception as e:
        logger.error(f"[DB] Get user by uid error: {e}")
        return None


def update_user_tier(user_id: int, tier: str):
    """Update user's subscription tier."""
    try:
        with db_session() as (conn, c):
            c.execute("UPDATE users SET tier = ? WHERE id = ?", (tier, user_id))
        logger.info(f"[DB] User {user_id} tier → {tier}")
    except Exception as e:
        logger.error(f"[DB] Update tier error: {e}")


def update_user_stripe_customer(user_id: int, stripe_customer_id: str):
    """Link Stripe customer ID to user."""
    try:
        with db_session() as (conn, c):
            c.execute("UPDATE users SET stripe_customer_id = ? WHERE id = ?", (stripe_customer_id, user_id))
    except Exception as e:
        logger.error(f"[DB] Update Stripe customer error: {e}")


def update_user_display_name(user_id: int, display_name: str):
    """Update user display name."""
    try:
        with db_session() as (conn, c):
            c.execute("UPDATE users SET display_name = ? WHERE id = ?", (display_name.strip(), user_id))
            return True
    except Exception as e:
        logger.error(f"[DB] Update display name error: {e}")
        return False


def update_user_password_hash(user_id: int, pw_hash: str):
    """Update user password hash."""
    try:
        with db_session() as (conn, c):
            c.execute("UPDATE users SET password_hash = ? WHERE id = ?", (pw_hash, user_id))
            return True
    except Exception as e:
        logger.error(f"[DB] Update password error: {e}")
        return False


def update_user_login(user_id: int):
    """Update last login timestamp."""
    try:
        with db_session() as (conn, c):
            c.execute("UPDATE users SET last_login_utc = ? WHERE id = ?", (utc_now_str(), user_id))
    except Exception as e:
        logger.error(f"[DB] Update login error: {e}")


def link_uid_to_user(uid: str, user_id: int):
    """Link anonymous UID data (usage, alerts, layouts) to an authenticated user."""
    try:
        with db_session() as (conn, c):
            c.execute("UPDATE users SET uid = ? WHERE id = ?", (uid, user_id))
    except Exception as e:
        logger.error(f"[DB] Link UID error: {e}")


# ───────────────────────────────────────
# Subscription Management (Stripe)
# ───────────────────────────────────────
def create_subscription(user_id: int, stripe_sub_id: str, plan: str, period_end: str):
    """Record a new subscription."""
    try:
        with db_session() as (conn, c):
            if USE_PG:
                c.execute(
                    "INSERT INTO subscriptions (user_id, stripe_subscription_id, plan, status, current_period_end, created_at_utc) VALUES (?, ?, ?, 'active', ?, ?) ON CONFLICT (stripe_subscription_id) DO UPDATE SET user_id=EXCLUDED.user_id, plan=EXCLUDED.plan, status='active', current_period_end=EXCLUDED.current_period_end",
                    (user_id, stripe_sub_id, plan, period_end, utc_now_str())
                )
            else:
                c.execute(
                    "INSERT OR REPLACE INTO subscriptions (user_id, stripe_subscription_id, plan, status, current_period_end, created_at_utc) VALUES (?, ?, ?, 'active', ?, ?)",
                    (user_id, stripe_sub_id, plan, period_end, utc_now_str())
                )
    except Exception as e:
        logger.error(f"[DB] Create subscription error: {e}")


def get_active_subscription(user_id: int) -> Optional[dict]:
    """Get active subscription for user."""
    try:
        with db_session(row_factory=sqlite3.Row) as (conn, c):
            c.execute(
                "SELECT * FROM subscriptions WHERE user_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1",
                (user_id,)
            )
            row = c.fetchone()
        return dict(row) if row else None
    except Exception as e:
        logger.error(f"[DB] Get subscription error: {e}")
        return None


def get_subscription_by_stripe_id(stripe_sub_id: str) -> Optional[dict]:
    """Find subscription by Stripe subscription ID."""
    try:
        with db_session(row_factory=sqlite3.Row) as (conn, c):
            c.execute("SELECT * FROM subscriptions WHERE stripe_subscription_id = ?", (stripe_sub_id,))
            row = c.fetchone()
        return dict(row) if row else None
    except Exception as e:
        logger.error(f"[DB] Get subscription by stripe id error: {e}")
        return None


def update_subscription_status(stripe_sub_id: str, status: str, period_end: str = None):
    """Update subscription status (from Stripe webhook)."""
    try:
        with db_session() as (conn, c):
            if period_end:
                c.execute(
                    "UPDATE subscriptions SET status = ?, current_period_end = ? WHERE stripe_subscription_id = ?",
                    (status, period_end, stripe_sub_id)
                )
            else:
                c.execute(
                    "UPDATE subscriptions SET status = ? WHERE stripe_subscription_id = ?",
                    (status, stripe_sub_id)
                )
    except Exception as e:
        logger.error(f"[DB] Update subscription status error: {e}")


# ───────────────────────────────────────
# Signal Journal
# ───────────────────────────────────────
def create_journal_entry(user_id: int, council_id: int, snapshot_json: str,
                         position_type: str = "", entry_price: float = 0,
                         stop_loss: float = 0, take_profit: float = 0,
                         user_note: str = "", tags: str = "") -> Optional[int]:
    """Create a signal journal entry. Returns entry ID or None."""
    try:
        with db_session() as (conn, c):
            sql = """INSERT INTO signal_journal
                   (user_id, council_id, snapshot_json, position_type, entry_price,
                    stop_loss, take_profit, user_note, tags, created_at_utc)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"""
            params = (user_id, council_id, snapshot_json, position_type, entry_price,
                 stop_loss, take_profit, user_note, tags, utc_now_str())
            if USE_PG:
                c.execute(sql + " RETURNING id", params)
                entry_id = c.fetchone()[0]
            else:
                c.execute(sql, params)
                entry_id = c.lastrowid
        logger.info(f"[Journal] Entry #{entry_id} created for user {user_id}")
        return entry_id
    except Exception as e:
        logger.error(f"[Journal] Create error: {e}")
        return None


def get_journal_entries(user_id: int, limit: int = 50, offset: int = 0) -> List[dict]:
    """Get journal entries for a user, newest first."""
    try:
        with db_session(row_factory=sqlite3.Row) as (conn, c):
            c.execute(
                """SELECT id, council_id, snapshot_json, position_type, entry_price,
                          stop_loss, take_profit, user_note, tags, outcome,
                          outcome_price, outcome_note, closed_at_utc, created_at_utc
                   FROM signal_journal
                   WHERE user_id = ?
                   ORDER BY id DESC LIMIT ? OFFSET ?""",
                (user_id, limit, offset)
            )
            rows = [dict(r) for r in c.fetchall()]
        return rows
    except Exception as e:
        logger.error(f"[Journal] List error: {e}")
        return []


def get_journal_entry(entry_id: int, user_id: int) -> Optional[dict]:
    """Get a single journal entry owned by user."""
    try:
        with db_session(row_factory=sqlite3.Row) as (conn, c):
            c.execute(
                "SELECT * FROM signal_journal WHERE id = ? AND user_id = ?",
                (entry_id, user_id)
            )
            row = c.fetchone()
        return dict(row) if row else None
    except Exception as e:
        logger.error(f"[Journal] Get error: {e}")
        return None


def update_journal_entry(entry_id: int, user_id: int, **kwargs) -> bool:
    """Update a journal entry. Supports: user_note, tags, outcome, outcome_price, outcome_note, closed_at_utc."""
    allowed = {"user_note", "tags", "outcome", "outcome_price", "outcome_note", "closed_at_utc",
               "position_type", "entry_price", "stop_loss", "take_profit"}
    updates = {k: v for k, v in kwargs.items() if k in allowed}
    if not updates:
        return False
    try:
        set_clause = ", ".join(f"{k} = ?" for k in updates)
        values = list(updates.values()) + [entry_id, user_id]
        with db_session() as (conn, c):
            c.execute(
                f"UPDATE signal_journal SET {set_clause} WHERE id = ? AND user_id = ?",
                values
            )
            changed = c.rowcount
        return changed > 0
    except Exception as e:
        logger.error(f"[Journal] Update error: {e}")
        return False


def delete_journal_entry(entry_id: int, user_id: int) -> bool:
    """Delete a journal entry owned by user."""
    try:
        with db_session() as (conn, c):
            c.execute("DELETE FROM signal_journal WHERE id = ? AND user_id = ?", (entry_id, user_id))
            deleted = c.rowcount
        return deleted > 0
    except Exception as e:
        logger.error(f"[Journal] Delete error: {e}")
        return False


def get_journal_stats(user_id: int) -> dict:
    """Get journal performance stats for a user."""
    try:
        with db_session(row_factory=sqlite3.Row) as (conn, c):
            c.execute(
                """SELECT
                     COUNT(*) AS total,
                     SUM(CASE WHEN outcome = 'WIN' THEN 1 ELSE 0 END) AS wins,
                     SUM(CASE WHEN outcome = 'LOSS' THEN 1 ELSE 0 END) AS losses,
                     SUM(CASE WHEN outcome = 'BREAKEVEN' THEN 1 ELSE 0 END) AS breakeven,
                     SUM(CASE WHEN outcome = '' OR outcome IS NULL THEN 1 ELSE 0 END) AS open
                   FROM signal_journal WHERE user_id = ?""",
                (user_id,)
            )
            row = c.fetchone()
        if not row:
            return {"total": 0, "wins": 0, "losses": 0, "breakeven": 0, "open": 0, "win_rate": None}
        total = row["total"] or 0
        wins = row["wins"] or 0
        losses = row["losses"] or 0
        closed = wins + losses + (row["breakeven"] or 0)
        return {
            "total": total,
            "wins": wins,
            "losses": losses,
            "breakeven": row["breakeven"] or 0,
            "open": row["open"] or 0,
            "win_rate": round((wins / closed) * 100, 1) if closed > 0 else None,
        }
    except Exception as e:
        logger.error(f"[Journal] Stats error: {e}")
        return {"total": 0, "wins": 0, "losses": 0, "breakeven": 0, "open": 0, "win_rate": None}


# ───────────────────────────────────────
# Email Verification & Password Reset
# ───────────────────────────────────────
def set_email_verify_token(user_id: int, token: str):
    """Store an email verification token."""
    try:
        with db_session() as (conn, c):
            c.execute("UPDATE users SET email_verify_token = ? WHERE id = ?", (token, user_id))
    except Exception as e:
        logger.error(f"[DB] Set verify token error: {e}")


def verify_email_token(token: str) -> Optional[int]:
    """Verify email token → mark user as verified. Returns user_id or None."""
    try:
        with db_session(row_factory=sqlite3.Row) as (conn, c):
            c.execute("SELECT id FROM users WHERE email_verify_token = ?", (token,))
            row = c.fetchone()
            if row:
                c.execute(
                    "UPDATE users SET email_verified = 1, email_verify_token = NULL WHERE id = ?",
                    (row["id"],)
                )
        return row["id"] if row else None
    except Exception as e:
        logger.error(f"[DB] Verify email error: {e}")
        return None


def set_password_reset_token(email: str, token: str, expires: str):
    """Store a password reset token for a user."""
    try:
        with db_session() as (conn, c):
            c.execute(
                "UPDATE users SET password_reset_token = ?, reset_token_expires = ? WHERE email = ?",
                (token, expires, email)
            )
    except Exception as e:
        logger.error(f"[DB] Set reset token error: {e}")


def validate_reset_token(token: str) -> Optional[dict]:
    """Check reset token validity. Returns user dict or None."""
    try:
        with db_session(row_factory=sqlite3.Row) as (conn, c):
            c.execute(
                "SELECT id, email, reset_token_expires FROM users WHERE password_reset_token = ?",
                (token,)
            )
            row = c.fetchone()
        if not row:
            return None
        # Check expiry
        expires = datetime.strptime(row["reset_token_expires"], "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) > expires:
            return None
        return {"id": row["id"], "email": row["email"]}
    except Exception as e:
        logger.error(f"[DB] Validate reset token error: {e}")
        return None


def reset_password(token: str, new_password_hash: str) -> bool:
    """Reset password using valid token."""
    try:
        with db_session(row_factory=sqlite3.Row) as (conn, c):
            c.execute("SELECT id, reset_token_expires FROM users WHERE password_reset_token = ?", (token,))
            row = c.fetchone()
            if not row:
                return False
            expires = datetime.strptime(row["reset_token_expires"], "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) > expires:
                return False
            c.execute(
                "UPDATE users SET password_hash = ?, password_reset_token = NULL, reset_token_expires = NULL WHERE id = ?",
                (new_password_hash, row["id"])
            )
        logger.info(f"[DB] Password reset for user {row['id']}")
        return True
    except Exception as e:
        logger.error(f"[DB] Reset password error: {e}")
        return False


def update_user_tos(user_id: int):
    """Mark user as having accepted ToS."""
    try:
        with db_session() as (conn, c):
            c.execute("UPDATE users SET tos_accepted_at = ? WHERE id = ?", (utc_now_str(), user_id))
    except Exception as e:
        logger.error(f"[DB] Update ToS error: {e}")


# ───────────────────────────────────────
# Risk History
# ───────────────────────────────────────
_last_risk_save = 0


def save_risk_record(score, level, components):
    """Save risk gauge snapshot to history (rate-limited)."""
    global _last_risk_save
    now = time.time()
    if now - _last_risk_save < RISK_SAVE_INTERVAL:
        return
    _last_risk_save = now
    try:
        with db_session() as (conn, c):
            c.execute(
                "INSERT INTO risk_history (timestamp, score, level, fg, vix, ls, fr, kp, oi, sc) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    utc_now_str(),
                    round(score, 1),
                    level,
                    round(components.get("fear_greed", {}).get("contrib", 0), 1),
                    round(components.get("vix", {}).get("contrib", 0), 1),
                    round(components.get("long_short", {}).get("contrib", 0), 1),
                    round(components.get("funding_rate", {}).get("contrib", 0), 1),
                    round(components.get("kimchi", {}).get("contrib", 0), 1),
                    round(components.get("open_interest", {}).get("contrib", 0), 1),
                    round(components.get("stablecoin", {}).get("contrib", 0), 1),
                )
            )
        logger.info(f"[DB] Risk history saved: score={round(score, 1)}, level={level}")
    except Exception as e:
        logger.error(f"[DB] Failed to save risk history: {e}")


def get_risk_history(days: int = 30) -> List[dict]:
    """Retrieve risk history for the last N days."""
    try:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S")
        with db_session(row_factory=sqlite3.Row) as (conn, c):
            c.execute("""
                SELECT timestamp, score, level, fg, vix, ls, fr, kp, oi, sc
                FROM risk_history
                WHERE timestamp > ?
                ORDER BY timestamp ASC
            """, (cutoff,))
            rows = [dict(r) for r in c.fetchall()]
        return rows
    except Exception as e:
        logger.error(f"[DB] Failed to read risk history: {e}")
        return []


def get_risk_component_changes() -> dict:
    """Get component value changes at 1H, 4H, 24H ago for heatmap."""
    changes = {"1h": {}, "4h": {}, "24h": {}}
    try:
        with db_session(row_factory=sqlite3.Row) as (conn, c):
            # Get latest record
            c.execute("SELECT fg, vix, ls, fr, kp, oi, sc FROM risk_history ORDER BY timestamp DESC LIMIT 1")
            latest = c.fetchone()
            if not latest:
                return changes
            latest = dict(latest)
            for period_key, hours in [("1h", 1), ("4h", 4), ("24h", 24)]:
                cutoff = (datetime.now(timezone.utc) - timedelta(hours=hours)).strftime("%Y-%m-%d %H:%M:%S")
                c.execute("""
                    SELECT fg, vix, ls, fr, kp, oi, sc FROM risk_history
                    WHERE timestamp <= ?
                    ORDER BY timestamp DESC LIMIT 1
                """, (cutoff,))
                row = c.fetchone()
                if row:
                    row = dict(row)
                    for k in ["fg", "vix", "ls", "fr", "kp", "oi", "sc"]:
                        changes[period_key][k] = round(latest.get(k, 0) - row.get(k, 0), 1)
                else:
                    for k in ["fg", "vix", "ls", "fr", "kp", "oi", "sc"]:
                        changes[period_key][k] = 0
    except Exception as e:
        logger.error(f"[DB] Risk component changes error: {e}")
    return changes


def get_component_sparklines(days: int = 7) -> dict:
    """Get component-level history for sparklines."""
    result = {"fg": [], "vix": [], "ls": [], "fr": [], "kp": [], "oi": [], "sc": []}
    try:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S")
        with db_session(row_factory=sqlite3.Row) as (conn, c):
            c.execute("""
                SELECT timestamp, fg, vix, ls, fr, kp, oi, sc FROM risk_history
                WHERE timestamp > ?
                ORDER BY timestamp ASC
            """, (cutoff,))
            for row in c.fetchall():
                r = dict(row)
                for k in result:
                    result[k].append(r.get(k, 0))
    except Exception as e:
        logger.error(f"[DB] Component sparklines error: {e}")
    return result


# ───────────────────────────────────────
# Council History
# ───────────────────────────────────────
def save_council_record(result: dict, btc_price: float = 0.0):
    """Save a council analysis to the DB."""
    try:
        with db_session() as (conn, c):
            ts_utc = utc_now_str()
            ts_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
            prediction = result.get("prediction", "NEUTRAL")
            confidence = result.get("confidence", "LOW")
            c.execute(
                "INSERT INTO council_history (timestamp, timestamp_ms, consensus_score, vibe_status, btc_price, prediction, confidence, full_result) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    ts_utc,
                    ts_ms,
                    result.get("consensus_score", 50),
                    result.get("vibe", {}).get("status", "UNKNOWN"),
                    btc_price,
                    prediction,
                    confidence,
                    json.dumps(result, ensure_ascii=False)
                )
            )
        logger.info(f"[DB] Council record saved — score={result.get('consensus_score')}, pred={prediction}/{confidence}, btc=${btc_price:.0f}")
    except Exception as e:
        logger.error(f"[DB] Failed to save council record: {e}")


def get_council_history(limit: int = 50) -> List[dict]:
    """Retrieve recent council records with eval data via JOIN."""
    try:
        with db_session(row_factory=sqlite3.Row) as (conn, c):
            c.execute(
                """
                SELECT
                  h.id, h.timestamp, h.timestamp_ms, h.consensus_score, h.vibe_status, h.btc_price,
                  h.horizon_min, h.return_pct, h.evaluated_at_utc, h.price_source,
                  h.prediction, h.confidence,
                  e.price_after AS btc_price_after,
                  e.hit AS hit
                FROM council_history h
                LEFT JOIN council_eval e
                  ON e.council_id = h.id AND e.horizon_min = 60
                ORDER BY h.id DESC
                LIMIT ?
                """,
                (limit,)
            )
            rows = [dict(r) for r in c.fetchall()]
        return rows
    except Exception as e:
        logger.error(f"[DB] Failed to read council history: {e}")
        return []


def get_multi_horizon_accuracy() -> dict:
    """Aggregate accuracy stats per evaluation horizon."""
    HORIZONS = [15, 60, 240, 1440]
    result = {}
    try:
        with db_session(row_factory=sqlite3.Row) as (conn, c):
            for h in HORIZONS:
                c.execute(
                    """
                    SELECT
                      COUNT(*) AS total_all,
                      SUM(CASE WHEN e.hit >= 0 THEN 1 ELSE 0 END) AS total_active,
                      SUM(CASE WHEN e.hit = 1 THEN 1 ELSE 0 END) AS hits,
                      AVG(CASE WHEN e.hit >= 0 THEN (
                        (e.price_after - h.btc_price) / h.btc_price * 100
                      ) END) AS avg_return_pct
                    FROM council_eval e
                    JOIN council_history h ON h.id = e.council_id
                    WHERE e.horizon_min = ?
                    """,
                    (h,)
                )
                row = c.fetchone()
                total_all = row["total_all"] or 0
                total_active = row["total_active"] or 0
                hits = row["hits"] or 0
                avg_ret = round(row["avg_return_pct"], 3) if row["avg_return_pct"] is not None else None
                coverage = round((total_active / total_all) * 100, 1) if total_all > 0 else None

                confidence_stats = {}
                for conf in ["HIGH", "MED", "LOW"]:
                    c.execute(
                        """
                        SELECT
                          COUNT(*) AS cnt,
                          SUM(CASE WHEN e.hit = 1 THEN 1 ELSE 0 END) AS h_hits
                        FROM council_eval e
                        JOIN council_history h ON h.id = e.council_id
                        WHERE e.horizon_min = ? AND e.hit >= 0
                          AND COALESCE(h.confidence, 'LOW') = ?
                        """,
                        (h, conf)
                    )
                    cr = c.fetchone()
                    cnt = cr["cnt"] or 0
                    ch = cr["h_hits"] or 0
                    confidence_stats[conf] = {
                        "evaluated": cnt,
                        "hits": ch,
                        "accuracy_pct": round((ch / cnt) * 100, 1) if cnt > 0 else None,
                    }

                result[f"{h}min"] = {
                    "evaluated": total_active,
                    "total_with_neutral": total_all,
                    "hits": hits,
                    "accuracy_pct": round((hits / total_active) * 100, 1) if total_active > 0 else None,
                    "coverage_pct": coverage,
                    "avg_return_pct": avg_ret,
                    "by_confidence": confidence_stats,
                }
    except Exception as e:
        logger.error(f"[DB] Multi-horizon accuracy query error: {e}")
    return result


# ───────────────────────────────────────
# Price Snapshots & Accuracy Evaluation
# ───────────────────────────────────────
def fetch_btc_price_binance() -> Optional[float]:
    """Fetch current BTC price from Binance for snapshots."""
    try:
        resp = resilient_get(
            "https://fapi.binance.com/fapi/v1/ticker/price",
            timeout=5, params={"symbol": "BTCUSDT"}
        )
        resp.raise_for_status()
        return float(resp.json()["price"])
    except Exception:
        return None


def store_price_snapshot(symbol: str = "BTC", source: str = "binance") -> None:
    """Store a 1-minute BTC price snapshot."""
    price = fetch_btc_price_binance()
    if not price or price <= 0:
        return
    ts = utc_now_str()
    try:
        with db_session() as (conn, c):
            if USE_PG:
                c.execute(
                    "INSERT INTO price_snapshots (ts_utc, symbol, price, source) VALUES (?, ?, ?, ?) ON CONFLICT (ts_utc, symbol) DO NOTHING",
                    (ts, symbol, price, source),
                )
            else:
                c.execute(
                    "INSERT OR IGNORE INTO price_snapshots (ts_utc, symbol, price, source) VALUES (?, ?, ?, ?)",
                    (ts, symbol, price, source),
                )
    except Exception as e:
        logger.error(f"[DB] Failed to store price snapshot: {e}")


def find_price_near(symbol: str, target_dt_utc: datetime, window_min: int = 10) -> Optional[float]:
    """Find the closest price snapshot to target_dt_utc within ±window_min."""
    try:
        start = (target_dt_utc - timedelta(minutes=window_min)).strftime("%Y-%m-%d %H:%M:%S")
        end = (target_dt_utc + timedelta(minutes=window_min)).strftime("%Y-%m-%d %H:%M:%S")
        with db_session(row_factory=sqlite3.Row) as (conn, c):
            # Fetch all candidates in window, sort by proximity in Python
            c.execute(
                """
                SELECT price, ts_utc
                FROM price_snapshots
                WHERE symbol = ? AND ts_utc BETWEEN ? AND ?
                """,
                (symbol, start, end)
            )
            rows = c.fetchall()
        if not rows:
            return None
        # Find closest to target
        target_epoch = target_dt_utc.timestamp()
        best = min(rows, key=lambda r: abs(
            datetime.strptime(r["ts_utc"], "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc).timestamp() - target_epoch
        ))
        return float(best["price"])
    except Exception as e:
        logger.error(f"[DB] find_price_near error: {e}")
        return None


def evaluate_council_accuracy(horizons_min: List[int] = [60]):
    """Evaluate past council predictions using price_snapshots."""
    try:
        for h in horizons_min:
            cutoff = (datetime.now(timezone.utc) - timedelta(minutes=h)).strftime("%Y-%m-%d %H:%M:%S")
            with db_session(row_factory=sqlite3.Row) as (conn, c):
                c.execute("""
                    SELECT h.id, h.timestamp, h.consensus_score, h.btc_price,
                           COALESCE(h.prediction, 'NEUTRAL') AS prediction,
                           COALESCE(h.confidence, 'LOW') AS confidence
                    FROM council_history h
                    LEFT JOIN council_eval e
                      ON e.council_id = h.id AND e.horizon_min = ?
                    WHERE e.council_id IS NULL
                      AND h.btc_price > 0
                      AND h.timestamp < ?
                    ORDER BY h.id ASC
                    LIMIT 50
                """, (h, cutoff))
                rows = [dict(r) for r in c.fetchall()]

            if not rows:
                continue

            # Pre-compute evaluation results before opening DB session
            eval_batch = []
            for row in rows:
                base_price = float(row["btc_price"])
                prediction = row["prediction"]
                ts_dt = datetime.strptime(row["timestamp"], "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
                target_dt = ts_dt + timedelta(minutes=h)
                price_after = find_price_near("BTC", target_dt, window_min=10)
                if price_after is None:
                    continue

                return_pct = round(((price_after - base_price) / base_price) * 100, 4) if base_price > 0 else 0.0
                eval_ts = utc_now_str()

                if prediction == "NEUTRAL":
                    hit = -1
                else:
                    actual_bull = price_after > base_price
                    predicted_bull = prediction == "BULL"
                    hit = 1 if (predicted_bull == actual_bull) else 0

                eval_batch.append((int(row["id"]), int(h), float(price_after), int(hit), eval_ts, return_pct))

            # Batch write all evaluations in a single db_session
            if eval_batch:
                with db_session() as (conn, c):
                    for council_id, horizon, pa, hit_val, ts, ret_pct in eval_batch:
                        if USE_PG:
                            c.execute(
                                """
                                INSERT INTO council_eval
                                  (council_id, horizon_min, price_after, hit, evaluated_at_utc)
                                VALUES (?, ?, ?, ?, ?)
                                ON CONFLICT (council_id, horizon_min) DO UPDATE SET
                                  price_after=EXCLUDED.price_after, hit=EXCLUDED.hit, evaluated_at_utc=EXCLUDED.evaluated_at_utc
                                """,
                                (council_id, horizon, pa, hit_val, ts)
                            )
                        else:
                            c.execute(
                                """
                                INSERT OR REPLACE INTO council_eval
                                  (council_id, horizon_min, price_after, hit, evaluated_at_utc)
                                VALUES (?, ?, ?, ?, ?)
                                """,
                                (council_id, horizon, pa, hit_val, ts)
                            )
                        if h == min(horizons_min):
                            c.execute(
                                """
                                UPDATE council_history
                                SET return_pct = ?, evaluated_at_utc = ?, price_source = ?
                                WHERE id = ?
                                """,
                                (ret_pct, ts, "binance_snapshot", council_id)
                            )
                logger.info(f"[DB] Evaluated {len(eval_batch)} council predictions at {h}min horizon")
    except Exception as e:
        logger.error(f"[DB] Accuracy evaluation error: {e}")


# ───────────────────────────────────────
# AI Usage Counting
# ───────────────────────────────────────
def count_usage_today(uid: str, endpoint: str) -> int:
    """Count how many times this UID used this endpoint today."""
    try:
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        with db_session() as (conn, c):
            c.execute(
                "SELECT COUNT(*) FROM ai_usage WHERE uid = ? AND endpoint = ? AND substr(used_at_utc, 1, 10) = ?",
                (uid, endpoint, today)
            )
            count = c.fetchone()[0]
        return count
    except Exception as e:
        logger.error(f"[Usage] Count error: {e}")
        return 0


def record_usage(uid: str, endpoint: str):
    """Record one usage event."""
    try:
        with db_session() as (conn, c):
            c.execute(
                "INSERT INTO ai_usage (uid, endpoint, used_at_utc) VALUES (?, ?, ?)",
                (uid, endpoint, utc_now_str())
            )
    except Exception as e:
        logger.error(f"[Usage] Record error: {e}")


# ───────────────────────────────────────
# Admin Dashboard Queries
# ───────────────────────────────────────
def admin_get_users(search: str = "", page: int = 1, per_page: int = 20) -> dict:
    """Paginated user list for admin dashboard."""
    try:
        offset = (page - 1) * per_page
        with db_session(row_factory=sqlite3.Row) as (conn, c):
            if search:
                like = f"%{search}%"
                c.execute("SELECT COUNT(*) FROM users WHERE email LIKE ? OR display_name LIKE ? OR uid LIKE ?", (like, like, like))
                total = c.fetchone()[0]
                c.execute(
                    """SELECT id, email, display_name, uid, tier, email_verified,
                              stripe_customer_id, created_at_utc, last_login_utc
                       FROM users WHERE email LIKE ? OR display_name LIKE ? OR uid LIKE ?
                       ORDER BY id DESC LIMIT ? OFFSET ?""",
                    (like, like, like, per_page, offset)
                )
            else:
                c.execute("SELECT COUNT(*) FROM users")
                total = c.fetchone()[0]
                c.execute(
                    """SELECT id, email, display_name, uid, tier, email_verified,
                              stripe_customer_id, created_at_utc, last_login_utc
                       FROM users ORDER BY id DESC LIMIT ? OFFSET ?""",
                    (per_page, offset)
                )
            users = [dict(r) for r in c.fetchall()]
        return {"users": users, "total": total, "page": page, "per_page": per_page, "pages": max(1, (total + per_page - 1) // per_page)}
    except Exception as e:
        logger.error(f"[Admin] Get users error: {e}")
        return {"users": [], "total": 0, "page": 1, "per_page": per_page, "pages": 1}


def admin_get_stats() -> dict:
    """Aggregate dashboard statistics for admin."""
    stats = {}
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    cutoff_7d = (datetime.now(timezone.utc) - timedelta(days=7)).strftime("%Y-%m-%d %H:%M:%S")
    cutoff_14d = (datetime.now(timezone.utc) - timedelta(days=14)).strftime("%Y-%m-%d %H:%M:%S")
    try:
        with db_session(row_factory=sqlite3.Row) as (conn, c):
            # Total users
            c.execute("SELECT COUNT(*) FROM users")
            stats["total_users"] = c.fetchone()[0]
            # Pro users
            c.execute("SELECT COUNT(*) FROM users WHERE tier = 'pro'")
            stats["pro_users"] = c.fetchone()[0]
            # Free users
            stats["free_users"] = stats["total_users"] - stats["pro_users"]
            # Email verified
            c.execute("SELECT COUNT(*) FROM users WHERE email_verified = 1")
            stats["verified_users"] = c.fetchone()[0]
            # Registered today
            c.execute("SELECT COUNT(*) FROM users WHERE substr(created_at_utc, 1, 10) = ?", (today,))
            stats["signups_today"] = c.fetchone()[0]
            # Active today (last_login_utc today)
            c.execute("SELECT COUNT(*) FROM users WHERE substr(last_login_utc, 1, 10) = ?", (today,))
            stats["active_today"] = c.fetchone()[0]
            # Active last 7 days
            c.execute("SELECT COUNT(*) FROM users WHERE last_login_utc > ?", (cutoff_7d,))
            stats["active_7d"] = c.fetchone()[0]
            # AI usage today
            c.execute("SELECT endpoint, COUNT(*) AS cnt FROM ai_usage WHERE substr(used_at_utc, 1, 10) = ? GROUP BY endpoint", (today,))
            stats["usage_today"] = {r["endpoint"]: r["cnt"] for r in c.fetchall()}
            # AI usage last 7 days by day
            c.execute("""
                SELECT substr(used_at_utc, 1, 10) AS day, endpoint, COUNT(*) AS cnt
                FROM ai_usage
                WHERE used_at_utc > ?
                GROUP BY day, endpoint ORDER BY day
            """, (cutoff_7d,))
            daily = {}
            for r in c.fetchall():
                d = r["day"]
                if d not in daily:
                    daily[d] = {}
                daily[d][r["endpoint"]] = r["cnt"]
            stats["usage_7d"] = daily
            # Total council analyses
            c.execute("SELECT COUNT(*) FROM council_history")
            stats["total_councils"] = c.fetchone()[0]
            # Total journal entries
            c.execute("SELECT COUNT(*) FROM signal_journal")
            stats["total_journals"] = c.fetchone()[0]
            # Active subscriptions
            c.execute("SELECT COUNT(*) FROM subscriptions WHERE status = 'active'")
            stats["active_subscriptions"] = c.fetchone()[0]
            # Signup trend (last 14 days)
            c.execute("""
                SELECT substr(created_at_utc, 1, 10) AS day, COUNT(*) AS cnt
                FROM users
                WHERE created_at_utc > ?
                GROUP BY day ORDER BY day
            """, (cutoff_14d,))
            stats["signup_trend"] = [{"day": r["day"], "count": r["cnt"]} for r in c.fetchall()]
    except Exception as e:
        logger.error(f"[Admin] Stats error: {e}")
    return stats


def admin_get_system_info() -> dict:
    """System/cache status for admin monitoring."""
    from app.core.cache import cache
    info = {"cache": {}}
    try:
        for key, val in cache.items():
            if isinstance(val, dict) and "updated" in val:
                updated = val["updated"]
                age = round(time.time() - updated) if updated else None
                has_data = bool(val.get("data"))
                info["cache"][key] = {"has_data": has_data, "age_seconds": age, "updated": updated}
    except Exception as e:
        logger.error(f"[Admin] System info error: {e}")
    # DB file size
    try:
        info["db_size_mb"] = round(os.path.getsize(DB_PATH) / (1024 * 1024), 2)
    except Exception:
        info["db_size_mb"] = None
    return info


def admin_delete_user(user_id: int) -> bool:
    """Delete a user and all associated data."""
    try:
        with db_session() as (conn, c):
            c.execute("SELECT uid FROM users WHERE id = ?", (user_id,))
            row = c.fetchone()
            if not row:
                return False
            uid = row[0]
            # Clean up related data
            if uid:
                c.execute("DELETE FROM ai_usage WHERE uid = ?", (uid,))
                c.execute("DELETE FROM price_alerts WHERE uid = ?", (uid,))
                c.execute("DELETE FROM user_layouts WHERE uid = ?", (uid,))
            c.execute("DELETE FROM signal_journal WHERE user_id = ?", (user_id,))
            c.execute("DELETE FROM subscriptions WHERE user_id = ?", (user_id,))
            c.execute("DELETE FROM users WHERE id = ?", (user_id,))
        logger.info(f"[Admin] Deleted user {user_id}")
        return True
    except Exception as e:
        logger.error(f"[Admin] Delete user error: {e}")
        return False


# ── Announcements ──
def admin_create_announcement(title: str, content: str, level: str = "info") -> Optional[int]:
    """Create an admin announcement."""
    try:
        with db_session() as (conn, c):
            sql = "INSERT INTO announcements (title, content, level, active, created_at_utc) VALUES (?, ?, ?, 1, ?)"
            params = (title, content, level, utc_now_str())
            if USE_PG:
                c.execute(sql + " RETURNING id", params)
                return c.fetchone()[0]
            else:
                c.execute(sql, params)
                return c.lastrowid
    except Exception as e:
        logger.error(f"[Admin] Create announcement error: {e}")
        return None


def admin_get_announcements(active_only: bool = True) -> List[dict]:
    """Get announcements."""
    try:
        with db_session(row_factory=sqlite3.Row) as (conn, c):
            if active_only:
                c.execute("SELECT * FROM announcements WHERE active = 1 ORDER BY id DESC")
            else:
                c.execute("SELECT * FROM announcements ORDER BY id DESC LIMIT 50")
            return [dict(r) for r in c.fetchall()]
    except Exception as e:
        logger.error(f"[Admin] Get announcements error: {e}")
        return []


def admin_toggle_announcement(ann_id: int, active: bool) -> bool:
    """Toggle announcement active status."""
    try:
        with db_session() as (conn, c):
            c.execute("UPDATE announcements SET active = ? WHERE id = ?", (1 if active else 0, ann_id))
            return c.rowcount > 0
    except Exception as e:
        logger.error(f"[Admin] Toggle announcement error: {e}")
        return False


# ───────────────────────────────────────
# Briefing Subscribers
# ───────────────────────────────────────
def subscribe_briefing(email: str) -> dict:
    """Subscribe email to daily briefing. Returns status dict."""
    try:
        with db_session() as (conn, c):
            # Check if already exists
            c.execute("SELECT id, active FROM briefing_subscribers WHERE email = ?", (email,))
            row = c.fetchone()
            if row:
                if row[1] == 1:
                    return {"status": "exists", "message": "Already subscribed!"}
                else:
                    # Re-activate
                    c.execute(
                        "UPDATE briefing_subscribers SET active = 1, unsubscribed_at_utc = NULL WHERE id = ?",
                        (row[0],)
                    )
                    return {"status": "reactivated", "message": "Welcome back! Subscription reactivated."}
            else:
                c.execute(
                    "INSERT INTO briefing_subscribers (email, active, subscribed_at_utc) VALUES (?, 1, ?)",
                    (email, utc_now_str())
                )
                return {"status": "ok", "message": "Subscribed! You'll receive daily briefings at 9:00 KST."}
    except Exception as e:
        logger.error(f"[Briefing] Subscribe error: {e}")
        return {"status": "error", "message": "Subscription failed. Please try again."}


def unsubscribe_briefing(email: str) -> bool:
    """Unsubscribe email from daily briefing."""
    try:
        with db_session() as (conn, c):
            c.execute(
                "UPDATE briefing_subscribers SET active = 0, unsubscribed_at_utc = ? WHERE email = ? AND active = 1",
                (utc_now_str(), email)
            )
            return c.rowcount > 0
    except Exception as e:
        logger.error(f"[Briefing] Unsubscribe error: {e}")
        return False


def get_active_briefing_subscribers() -> List[str]:
    """Get list of active subscriber emails."""
    try:
        with db_session() as (conn, c):
            c.execute("SELECT email FROM briefing_subscribers WHERE active = 1")
            return [row[0] for row in c.fetchall()]
    except Exception as e:
        logger.error(f"[Briefing] Get subscribers error: {e}")
        return []


# ───────────────────────────────────────
# Portfolio Holdings
# ───────────────────────────────────────
def upsert_portfolio_holding(user_id: int, symbol: str, amount: float, avg_price: float = 0) -> bool:
    """Insert or update a portfolio holding."""
    try:
        now = utc_now_str()
        with db_session() as (conn, c):
            c.execute(
                """INSERT INTO portfolio_holdings (user_id, symbol, amount, avg_price, created_at_utc, updated_at_utc)
                   VALUES (?, ?, ?, ?, ?, ?)
                   ON CONFLICT(user_id, symbol) DO UPDATE SET amount=excluded.amount, avg_price=excluded.avg_price, updated_at_utc=excluded.updated_at_utc""",
                (user_id, symbol.upper(), amount, avg_price, now, now)
            )
        return True
    except Exception as e:
        logger.error(f"[Portfolio] Upsert error: {e}")
        return False


def get_portfolio_holdings(user_id: int) -> list:
    """Get all holdings for a user."""
    try:
        with db_session(row_factory=sqlite3.Row) as (conn, c):
            c.execute("SELECT * FROM portfolio_holdings WHERE user_id = ? ORDER BY symbol", (user_id,))
            return [dict(r) for r in c.fetchall()]
    except Exception as e:
        logger.error(f"[Portfolio] Get error: {e}")
        return []


def delete_portfolio_holding(user_id: int, symbol: str) -> bool:
    """Remove a holding."""
    try:
        with db_session() as (conn, c):
            c.execute("DELETE FROM portfolio_holdings WHERE user_id = ? AND symbol = ?", (user_id, symbol.upper()))
            return c.rowcount > 0
    except Exception as e:
        logger.error(f"[Portfolio] Delete error: {e}")
        return False


def get_council_accuracy_summary() -> dict:
    """Get overall council accuracy stats for the accuracy dashboard."""
    try:
        with db_session(row_factory=sqlite3.Row) as (conn, c):
            # Overall stats
            c.execute("""
                SELECT
                    COUNT(*) as total,
                    SUM(CASE WHEN hit = 1 THEN 1 ELSE 0 END) as hits,
                    SUM(CASE WHEN hit = 0 THEN 1 ELSE 0 END) as misses
                FROM council_eval WHERE hit >= 0
            """)
            overall = dict(c.fetchone())
            total = overall["total"] or 0
            hits = overall["hits"] or 0
            accuracy_pct = round((hits / total) * 100, 1) if total > 0 else None

            # Recent 30 entries for sparkline
            c.execute("""
                SELECT e.hit, e.horizon_min, h.consensus_score, h.timestamp
                FROM council_eval e
                JOIN council_history h ON h.id = e.council_id
                WHERE e.hit >= 0
                ORDER BY e.evaluated_at_utc DESC
                LIMIT 30
            """)
            recent = [dict(r) for r in c.fetchall()]

            # By prediction direction
            c.execute("""
                SELECT
                    COALESCE(ch.prediction, 'NEUTRAL') as pred,
                    COUNT(*) as cnt,
                    SUM(CASE WHEN e.hit = 1 THEN 1 ELSE 0 END) as hits
                FROM council_eval e
                JOIN council_history ch ON ch.id = e.council_id
                WHERE e.hit >= 0
                GROUP BY pred
            """)
            by_prediction = {r["pred"]: {"total": r["cnt"], "hits": r["hits"], "pct": round((r["hits"]/r["cnt"])*100, 1) if r["cnt"] > 0 else 0} for r in c.fetchall()}

            return {
                "total_evaluated": total,
                "total_hits": hits,
                "accuracy_pct": accuracy_pct,
                "recent": recent,
                "by_prediction": by_prediction,
            }
    except Exception as e:
        logger.error(f"[DB] Council accuracy summary error: {e}")
        return {"total_evaluated": 0, "total_hits": 0, "accuracy_pct": None, "recent": [], "by_prediction": {}}


def update_user_onboarding_step(user_id: int, step: int):
    """Update user's onboarding progress step."""
    try:
        with db_session() as (conn, c):
            c.execute("UPDATE users SET onboarding_step = ? WHERE id = ?", (step, user_id))
    except Exception as e:
        logger.error(f"[DB] Update onboarding step error: {e}")


def mark_user_trial_used(user_id: int):
    """Mark that user has used their free trial."""
    try:
        with db_session() as (conn, c):
            c.execute("UPDATE users SET trial_used = 1, trial_started_at = ? WHERE id = ?", (utc_now_str(), user_id))
    except Exception as e:
        logger.error(f"[DB] Mark trial used error: {e}")


# ── Initialize DB on import ──
init_council_db()
