"""
Ryzm Terminal — DB Migration Runner
#3 Lightweight migration system (Alembic-lite)
Tracks applied migrations in a `schema_migrations` table.
"""
import os
import sys
import time
import hashlib

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.database import db_session, USE_PG
from app.core.logger import logger


# ── Migration definitions (append-only, never modify existing) ──
MIGRATIONS = [
    {
        "id": "001_initial_schema",
        "description": "Baseline — all existing tables",
        "sql": "SELECT 1;",  # Baseline marker — tables created by init_council_db()
    },
    {
        "id": "002_totp_secret",
        "description": "Add TOTP 2FA columns to users table",
        "sql": """
            ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret TEXT DEFAULT '';
            ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled INTEGER DEFAULT 0;
        """ if USE_PG else """
            -- SQLite: handled by _migrate_col in init_council_db
            SELECT 1;
        """,
    },
    {
        "id": "003_feature_flags",
        "description": "Feature flags table for runtime toggles",
        "sql": """
            CREATE TABLE IF NOT EXISTS feature_flags (
                key TEXT PRIMARY KEY,
                enabled INTEGER DEFAULT 1,
                rollout_pct INTEGER DEFAULT 100,
                updated_at TEXT DEFAULT ''
            );
        """,
    },
    {
        "id": "004_token_blocklist",
        "description": "JWT token revocation blocklist",
        "sql": """
            CREATE TABLE IF NOT EXISTS token_blocklist (
                jti TEXT PRIMARY KEY,
                user_id INTEGER,
                revoked_at TEXT DEFAULT '',
                expires_at TEXT DEFAULT ''
            );
        """,
    },
    {
        "id": "005_schema_version",
        "description": "Track current schema version",
        "sql": "SELECT 1;",
    },
]


def ensure_migration_table():
    """Create migration tracking table if not exists."""
    with db_session() as (conn, c):
        c.execute("""
            CREATE TABLE IF NOT EXISTS schema_migrations (
                id TEXT PRIMARY KEY,
                applied_at TEXT DEFAULT '',
                checksum TEXT DEFAULT ''
            )
        """)
        conn.commit()


def get_applied_migrations():
    """Get list of already-applied migration IDs."""
    with db_session() as (conn, c):
        c.execute("SELECT id FROM schema_migrations ORDER BY id")
        return {row[0] for row in c.fetchall()}


def apply_migration(migration):
    """Apply a single migration."""
    mid = migration["id"]
    sql = migration["sql"]
    checksum = hashlib.md5(sql.encode()).hexdigest()

    with db_session() as (conn, c):
        # Execute migration SQL (may be multi-statement)
        for stmt in sql.strip().split(";"):
            stmt = stmt.strip()
            if stmt and not stmt.startswith("--"):
                c.execute(stmt)

        # Record in tracking table
        now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        c.execute(
            "INSERT INTO schema_migrations (id, applied_at, checksum) VALUES (?, ?, ?)",
            (mid, now, checksum),
        )
        conn.commit()
    logger.info(f"[Migration] Applied: {mid} — {migration['description']}")


def run_migrations():
    """Run all pending migrations."""
    ensure_migration_table()
    applied = get_applied_migrations()
    pending = [m for m in MIGRATIONS if m["id"] not in applied]

    if not pending:
        print("✅ All migrations up to date.")
        return

    print(f"📦 {len(pending)} pending migration(s):")
    for m in pending:
        print(f"  → {m['id']}: {m['description']}")
        apply_migration(m)

    print(f"✅ Applied {len(pending)} migration(s) successfully.")


if __name__ == "__main__":
    run_migrations()
