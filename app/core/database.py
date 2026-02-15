"""
Ryzm Terminal — Database Layer (SQLite)
Connection management, schema init, all CRUD operations.
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

# ── Database Path (project root) ──
DB_PATH = str(PROJECT_ROOT / "council_history.db")

_db_lock = threading.Lock()


def db_connect():
    """Create a SQLite connection with WAL mode for better concurrency."""
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
        if self._row_factory:
            self._conn.row_factory = self._row_factory
        self._cursor = self._conn.cursor()
        return self._conn, self._cursor

    def __exit__(self, exc_type, exc_val, exc_tb):
        try:
            if exc_type is None:
                self._conn.commit()
            self._conn.close()
        finally:
            _db_lock.release()
        return False  # propagate exceptions


def utc_now_str() -> str:
    """Return current UTC time as a formatted string."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def init_council_db():
    """Initialize SQLite DB for all tables."""
    conn = db_connect()
    c = conn.cursor()
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
    # Migration: add new columns to existing users table if missing
    for col_def in [
        ("email_verified", "INTEGER DEFAULT 0"),
        ("email_verify_token", "TEXT DEFAULT NULL"),
        ("password_reset_token", "TEXT DEFAULT NULL"),
        ("reset_token_expires", "TEXT DEFAULT NULL"),
        ("tos_accepted_at", "TEXT DEFAULT NULL"),
    ]:
        try:
            c.execute(f"ALTER TABLE users ADD COLUMN {col_def[0]} {col_def[1]}")
        except sqlite3.OperationalError:
            pass
    # Migration: add new columns to existing council_history if missing
    for col_def in [
        ("timestamp_ms", "INTEGER DEFAULT 0"),
        ("horizon_min", "INTEGER DEFAULT 60"),
        ("return_pct", "REAL DEFAULT NULL"),
        ("evaluated_at_utc", "TEXT DEFAULT NULL"),
        ("price_source", "TEXT DEFAULT NULL"),
        ("prediction", "TEXT DEFAULT 'NEUTRAL'"),
        ("confidence", "TEXT DEFAULT 'LOW'"),
    ]:
        try:
            c.execute(f"ALTER TABLE council_history ADD COLUMN {col_def[0]} {col_def[1]}")
        except sqlite3.OperationalError:
            pass
    conn.commit()
    conn.close()
    logger.info("[DB] Council + Risk + PriceSnapshot + Eval + Briefings + Usage + Auth database initialized")


# ───────────────────────────────────────
# User Management (Auth)
# ───────────────────────────────────────
def create_user(email: str, password_hash: str, display_name: str = "", uid: str = None) -> Optional[int]:
    """Create a new user. Returns user_id or None on failure."""
    try:
        with _db_lock:
            conn = db_connect()
            c = conn.cursor()
            c.execute(
                "INSERT INTO users (email, password_hash, display_name, uid, tier, created_at_utc) VALUES (?, ?, ?, ?, 'free', ?)",
                (email, password_hash, display_name, uid, utc_now_str())
            )
            user_id = c.lastrowid
            conn.commit()
            conn.close()
        return user_id
    except Exception as e:
        logger.error(f"[DB] Create user error: {e}")
        return None


def get_user_by_email(email: str) -> Optional[dict]:
    """Fetch user by email."""
    try:
        with _db_lock:
            conn = db_connect()
            conn.row_factory = sqlite3.Row
            c = conn.cursor()
            c.execute("SELECT * FROM users WHERE email = ?", (email,))
            row = c.fetchone()
            conn.close()
        return dict(row) if row else None
    except Exception as e:
        logger.error(f"[DB] Get user by email error: {e}")
        return None


def get_user_by_id(user_id: int) -> Optional[dict]:
    """Fetch user by ID."""
    try:
        with _db_lock:
            conn = db_connect()
            conn.row_factory = sqlite3.Row
            c = conn.cursor()
            c.execute("SELECT * FROM users WHERE id = ?", (user_id,))
            row = c.fetchone()
            conn.close()
        return dict(row) if row else None
    except Exception as e:
        logger.error(f"[DB] Get user by id error: {e}")
        return None


def get_user_by_uid(uid: str) -> Optional[dict]:
    """Fetch user by anonymous UID."""
    try:
        with _db_lock:
            conn = db_connect()
            conn.row_factory = sqlite3.Row
            c = conn.cursor()
            c.execute("SELECT * FROM users WHERE uid = ?", (uid,))
            row = c.fetchone()
            conn.close()
        return dict(row) if row else None
    except Exception as e:
        logger.error(f"[DB] Get user by uid error: {e}")
        return None


def update_user_tier(user_id: int, tier: str):
    """Update user's subscription tier."""
    try:
        with _db_lock:
            conn = db_connect()
            c = conn.cursor()
            c.execute("UPDATE users SET tier = ? WHERE id = ?", (tier, user_id))
            conn.commit()
            conn.close()
        logger.info(f"[DB] User {user_id} tier → {tier}")
    except Exception as e:
        logger.error(f"[DB] Update tier error: {e}")


def update_user_stripe_customer(user_id: int, stripe_customer_id: str):
    """Link Stripe customer ID to user."""
    try:
        with _db_lock:
            conn = db_connect()
            c = conn.cursor()
            c.execute("UPDATE users SET stripe_customer_id = ? WHERE id = ?", (stripe_customer_id, user_id))
            conn.commit()
            conn.close()
    except Exception as e:
        logger.error(f"[DB] Update Stripe customer error: {e}")


def update_user_login(user_id: int):
    """Update last login timestamp."""
    try:
        with _db_lock:
            conn = db_connect()
            c = conn.cursor()
            c.execute("UPDATE users SET last_login_utc = ? WHERE id = ?", (utc_now_str(), user_id))
            conn.commit()
            conn.close()
    except Exception as e:
        logger.error(f"[DB] Update login error: {e}")


def link_uid_to_user(uid: str, user_id: int):
    """Link anonymous UID data (usage, alerts, layouts) to an authenticated user."""
    try:
        with _db_lock:
            conn = db_connect()
            c = conn.cursor()
            c.execute("UPDATE users SET uid = ? WHERE id = ?", (uid, user_id))
            conn.commit()
            conn.close()
    except Exception as e:
        logger.error(f"[DB] Link UID error: {e}")


# ───────────────────────────────────────
# Subscription Management (Stripe)
# ───────────────────────────────────────
def create_subscription(user_id: int, stripe_sub_id: str, plan: str, period_end: str):
    """Record a new subscription."""
    try:
        with _db_lock:
            conn = db_connect()
            c = conn.cursor()
            c.execute(
                "INSERT OR REPLACE INTO subscriptions (user_id, stripe_subscription_id, plan, status, current_period_end, created_at_utc) VALUES (?, ?, ?, 'active', ?, ?)",
                (user_id, stripe_sub_id, plan, period_end, utc_now_str())
            )
            conn.commit()
            conn.close()
    except Exception as e:
        logger.error(f"[DB] Create subscription error: {e}")


def get_active_subscription(user_id: int) -> Optional[dict]:
    """Get active subscription for user."""
    try:
        with _db_lock:
            conn = db_connect()
            conn.row_factory = sqlite3.Row
            c = conn.cursor()
            c.execute(
                "SELECT * FROM subscriptions WHERE user_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1",
                (user_id,)
            )
            row = c.fetchone()
            conn.close()
        return dict(row) if row else None
    except Exception as e:
        logger.error(f"[DB] Get subscription error: {e}")
        return None


def get_subscription_by_stripe_id(stripe_sub_id: str) -> Optional[dict]:
    """Find subscription by Stripe subscription ID."""
    try:
        with _db_lock:
            conn = db_connect()
            conn.row_factory = sqlite3.Row
            c = conn.cursor()
            c.execute("SELECT * FROM subscriptions WHERE stripe_subscription_id = ?", (stripe_sub_id,))
            row = c.fetchone()
            conn.close()
        return dict(row) if row else None
    except Exception as e:
        logger.error(f"[DB] Get subscription by stripe id error: {e}")
        return None


def update_subscription_status(stripe_sub_id: str, status: str, period_end: str = None):
    """Update subscription status (from Stripe webhook)."""
    try:
        with _db_lock:
            conn = db_connect()
            c = conn.cursor()
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
            conn.commit()
            conn.close()
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
        with _db_lock:
            conn = db_connect()
            c = conn.cursor()
            c.execute(
                """INSERT INTO signal_journal
                   (user_id, council_id, snapshot_json, position_type, entry_price,
                    stop_loss, take_profit, user_note, tags, created_at_utc)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (user_id, council_id, snapshot_json, position_type, entry_price,
                 stop_loss, take_profit, user_note, tags, utc_now_str())
            )
            entry_id = c.lastrowid
            conn.commit()
            conn.close()
        logger.info(f"[Journal] Entry #{entry_id} created for user {user_id}")
        return entry_id
    except Exception as e:
        logger.error(f"[Journal] Create error: {e}")
        return None


def get_journal_entries(user_id: int, limit: int = 50, offset: int = 0) -> List[dict]:
    """Get journal entries for a user, newest first."""
    try:
        with _db_lock:
            conn = db_connect()
            conn.row_factory = sqlite3.Row
            c = conn.cursor()
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
            conn.close()
        return rows
    except Exception as e:
        logger.error(f"[Journal] List error: {e}")
        return []


def get_journal_entry(entry_id: int, user_id: int) -> Optional[dict]:
    """Get a single journal entry owned by user."""
    try:
        with _db_lock:
            conn = db_connect()
            conn.row_factory = sqlite3.Row
            c = conn.cursor()
            c.execute(
                "SELECT * FROM signal_journal WHERE id = ? AND user_id = ?",
                (entry_id, user_id)
            )
            row = c.fetchone()
            conn.close()
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
        with _db_lock:
            conn = db_connect()
            c = conn.cursor()
            c.execute(
                f"UPDATE signal_journal SET {set_clause} WHERE id = ? AND user_id = ?",
                values
            )
            changed = c.rowcount
            conn.commit()
            conn.close()
        return changed > 0
    except Exception as e:
        logger.error(f"[Journal] Update error: {e}")
        return False


def delete_journal_entry(entry_id: int, user_id: int) -> bool:
    """Delete a journal entry owned by user."""
    try:
        with _db_lock:
            conn = db_connect()
            c = conn.cursor()
            c.execute("DELETE FROM signal_journal WHERE id = ? AND user_id = ?", (entry_id, user_id))
            deleted = c.rowcount
            conn.commit()
            conn.close()
        return deleted > 0
    except Exception as e:
        logger.error(f"[Journal] Delete error: {e}")
        return False


def get_journal_stats(user_id: int) -> dict:
    """Get journal performance stats for a user."""
    try:
        with _db_lock:
            conn = db_connect()
            conn.row_factory = sqlite3.Row
            c = conn.cursor()
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
            conn.close()
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
        with _db_lock:
            conn = db_connect()
            c = conn.cursor()
            c.execute("UPDATE users SET email_verify_token = ? WHERE id = ?", (token, user_id))
            conn.commit()
            conn.close()
    except Exception as e:
        logger.error(f"[DB] Set verify token error: {e}")


def verify_email_token(token: str) -> Optional[int]:
    """Verify email token → mark user as verified. Returns user_id or None."""
    try:
        with _db_lock:
            conn = db_connect()
            conn.row_factory = sqlite3.Row
            c = conn.cursor()
            c.execute("SELECT id FROM users WHERE email_verify_token = ?", (token,))
            row = c.fetchone()
            if row:
                c.execute(
                    "UPDATE users SET email_verified = 1, email_verify_token = NULL WHERE id = ?",
                    (row["id"],)
                )
                conn.commit()
            conn.close()
        return row["id"] if row else None
    except Exception as e:
        logger.error(f"[DB] Verify email error: {e}")
        return None


def set_password_reset_token(email: str, token: str, expires: str):
    """Store a password reset token for a user."""
    try:
        with _db_lock:
            conn = db_connect()
            c = conn.cursor()
            c.execute(
                "UPDATE users SET password_reset_token = ?, reset_token_expires = ? WHERE email = ?",
                (token, expires, email)
            )
            conn.commit()
            conn.close()
    except Exception as e:
        logger.error(f"[DB] Set reset token error: {e}")


def validate_reset_token(token: str) -> Optional[dict]:
    """Check reset token validity. Returns user dict or None."""
    try:
        with _db_lock:
            conn = db_connect()
            conn.row_factory = sqlite3.Row
            c = conn.cursor()
            c.execute(
                "SELECT id, email, reset_token_expires FROM users WHERE password_reset_token = ?",
                (token,)
            )
            row = c.fetchone()
            conn.close()
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
        with _db_lock:
            conn = db_connect()
            conn.row_factory = sqlite3.Row
            c = conn.cursor()
            c.execute("SELECT id, reset_token_expires FROM users WHERE password_reset_token = ?", (token,))
            row = c.fetchone()
            if not row:
                conn.close()
                return False
            expires = datetime.strptime(row["reset_token_expires"], "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) > expires:
                conn.close()
                return False
            c.execute(
                "UPDATE users SET password_hash = ?, password_reset_token = NULL, reset_token_expires = NULL WHERE id = ?",
                (new_password_hash, row["id"])
            )
            conn.commit()
            conn.close()
        logger.info(f"[DB] Password reset for user {row['id']}")
        return True
    except Exception as e:
        logger.error(f"[DB] Reset password error: {e}")
        return False


def update_user_tos(user_id: int):
    """Mark user as having accepted ToS."""
    try:
        with _db_lock:
            conn = db_connect()
            c = conn.cursor()
            c.execute("UPDATE users SET tos_accepted_at = ? WHERE id = ?", (utc_now_str(), user_id))
            conn.commit()
            conn.close()
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
        with _db_lock:
            conn = db_connect()
            c = conn.cursor()
            c.execute(
                "INSERT INTO risk_history (timestamp, score, level, fg, vix, ls, fr, kp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    utc_now_str(),
                    round(score, 1),
                    level,
                    round(components.get("fear_greed", {}).get("contrib", 0), 1),
                    round(components.get("vix", {}).get("contrib", 0), 1),
                    round(components.get("long_short", {}).get("contrib", 0), 1),
                    round(components.get("funding_rate", {}).get("contrib", 0), 1),
                    round(components.get("kimchi", {}).get("contrib", 0), 1),
                )
            )
            conn.commit()
            conn.close()
        logger.info(f"[DB] Risk history saved: score={round(score, 1)}, level={level}")
    except Exception as e:
        logger.error(f"[DB] Failed to save risk history: {e}")


def get_risk_history(days: int = 30) -> List[dict]:
    """Retrieve risk history for the last N days."""
    try:
        with _db_lock:
            conn = db_connect()
            conn.row_factory = sqlite3.Row
            c = conn.cursor()
            c.execute("""
                SELECT timestamp, score, level, fg, vix, ls, fr, kp
                FROM risk_history
                WHERE datetime(timestamp) > datetime('now', ?)
                ORDER BY timestamp ASC
            """, (f'-{days} days',))
            rows = [dict(r) for r in c.fetchall()]
            conn.close()
        return rows
    except Exception as e:
        logger.error(f"[DB] Failed to read risk history: {e}")
        return []


# ───────────────────────────────────────
# Council History
# ───────────────────────────────────────
def save_council_record(result: dict, btc_price: float = 0.0):
    """Save a council analysis to the DB."""
    try:
        with _db_lock:
            conn = db_connect()
            c = conn.cursor()
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
            conn.commit()
            conn.close()
        logger.info(f"[DB] Council record saved — score={result.get('consensus_score')}, pred={prediction}/{confidence}, btc=${btc_price:.0f}")
    except Exception as e:
        logger.error(f"[DB] Failed to save council record: {e}")


def get_council_history(limit: int = 50) -> List[dict]:
    """Retrieve recent council records with eval data via JOIN."""
    try:
        with _db_lock:
            conn = db_connect()
            conn.row_factory = sqlite3.Row
            c = conn.cursor()
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
            conn.close()
        return rows
    except Exception as e:
        logger.error(f"[DB] Failed to read council history: {e}")
        return []


def get_multi_horizon_accuracy() -> dict:
    """Aggregate accuracy stats per evaluation horizon."""
    HORIZONS = [15, 60, 240, 1440]
    result = {}
    try:
        with _db_lock:
            conn = db_connect()
            conn.row_factory = sqlite3.Row
            c = conn.cursor()
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
            conn.close()
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
        with _db_lock:
            conn = db_connect()
            c = conn.cursor()
            c.execute(
                "INSERT OR IGNORE INTO price_snapshots (ts_utc, symbol, price, source) VALUES (?, ?, ?, ?)",
                (ts, symbol, price, source),
            )
            conn.commit()
            conn.close()
    except Exception as e:
        logger.error(f"[DB] Failed to store price snapshot: {e}")


def find_price_near(symbol: str, target_dt_utc: datetime, window_min: int = 10) -> Optional[float]:
    """Find the closest price snapshot to target_dt_utc within ±window_min."""
    start = (target_dt_utc - timedelta(minutes=window_min)).strftime("%Y-%m-%d %H:%M:%S")
    end = (target_dt_utc + timedelta(minutes=window_min)).strftime("%Y-%m-%d %H:%M:%S")
    target = target_dt_utc.strftime("%Y-%m-%d %H:%M:%S")
    with _db_lock:
        conn = db_connect()
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute(
            """
            SELECT price, ts_utc
            FROM price_snapshots
            WHERE symbol = ? AND ts_utc BETWEEN ? AND ?
            ORDER BY ABS(strftime('%s', ts_utc) - strftime('%s', ?)) ASC
            LIMIT 1
            """,
            (symbol, start, end, target)
        )
        row = c.fetchone()
        conn.close()
    if not row:
        return None
    return float(row["price"])


def evaluate_council_accuracy(horizons_min: List[int] = [60]):
    """Evaluate past council predictions using price_snapshots."""
    try:
        for h in horizons_min:
            with _db_lock:
                conn = db_connect()
                conn.row_factory = sqlite3.Row
                c = conn.cursor()
                c.execute(f"""
                    SELECT h.id, h.timestamp, h.consensus_score, h.btc_price,
                           COALESCE(h.prediction, 'NEUTRAL') AS prediction,
                           COALESCE(h.confidence, 'LOW') AS confidence
                    FROM council_history h
                    LEFT JOIN council_eval e
                      ON e.council_id = h.id AND e.horizon_min = ?
                    WHERE e.council_id IS NULL
                      AND h.btc_price > 0
                      AND datetime(h.timestamp) < datetime('now', '-{h} minutes')
                    ORDER BY h.id ASC
                    LIMIT 50
                """, (h,))
                rows = list(c.fetchall())
                conn.close()

            if not rows:
                continue

            evaluated = 0
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

                with _db_lock:
                    conn = db_connect()
                    c = conn.cursor()
                    c.execute(
                        """
                        INSERT OR REPLACE INTO council_eval
                          (council_id, horizon_min, price_after, hit, evaluated_at_utc)
                        VALUES (?, ?, ?, ?, ?)
                        """,
                        (int(row["id"]), int(h), float(price_after), int(hit), eval_ts)
                    )
                    if h == min(horizons_min):
                        c.execute(
                            """
                            UPDATE council_history
                            SET return_pct = ?, evaluated_at_utc = ?, price_source = ?
                            WHERE id = ?
                            """,
                            (return_pct, eval_ts, "binance_snapshot", int(row["id"]))
                        )
                    conn.commit()
                    conn.close()
                evaluated += 1

            if evaluated > 0:
                logger.info(f"[DB] Evaluated {evaluated} council predictions at {h}min horizon")
    except Exception as e:
        logger.error(f"[DB] Accuracy evaluation error: {e}")


# ───────────────────────────────────────
# AI Usage Counting
# ───────────────────────────────────────
def count_usage_today(uid: str, endpoint: str) -> int:
    """Count how many times this UID used this endpoint today."""
    try:
        with _db_lock:
            conn = db_connect()
            c = conn.cursor()
            c.execute(
                "SELECT COUNT(*) FROM ai_usage WHERE uid = ? AND endpoint = ? AND date(used_at_utc) = date('now')",
                (uid, endpoint)
            )
            count = c.fetchone()[0]
            conn.close()
        return count
    except Exception as e:
        logger.error(f"[Usage] Count error: {e}")
        return 0


def record_usage(uid: str, endpoint: str):
    """Record one usage event."""
    try:
        with _db_lock:
            conn = db_connect()
            c = conn.cursor()
            c.execute(
                "INSERT INTO ai_usage (uid, endpoint, used_at_utc) VALUES (?, ?, ?)",
                (uid, endpoint, utc_now_str())
            )
            conn.commit()
            conn.close()
    except Exception as e:
        logger.error(f"[Usage] Record error: {e}")


# ── Initialize DB on import ──
init_council_db()
