"""
Ryzm Terminal — Database Backup Script
#9 Automated PostgreSQL backup with rotation.
Run via cron: 0 3 * * * python scripts/backup_db.py
"""
import os
import sys
import subprocess
import time
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

DATABASE_URL = os.getenv("DATABASE_URL", "")
BACKUP_DIR = os.getenv("BACKUP_DIR", os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backups"))
MAX_BACKUPS = int(os.getenv("MAX_BACKUPS", "30"))  # Keep 30 days


def backup_postgresql():
    """Run pg_dump and save compressed backup."""
    if not DATABASE_URL:
        print("❌ DATABASE_URL not set. Cannot backup.")
        return False

    os.makedirs(BACKUP_DIR, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"ryzm_backup_{timestamp}.sql.gz"
    filepath = os.path.join(BACKUP_DIR, filename)

    try:
        # pg_dump → gzip
        process = subprocess.Popen(
            ["pg_dump", DATABASE_URL, "--no-owner", "--no-acl"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        import gzip
        with gzip.open(filepath, "wb") as f:
            while True:
                chunk = process.stdout.read(8192)
                if not chunk:
                    break
                f.write(chunk)

        process.wait()
        if process.returncode != 0:
            stderr = process.stderr.read().decode()
            print(f"❌ pg_dump failed: {stderr}")
            return False

        size_mb = os.path.getsize(filepath) / (1024 * 1024)
        print(f"✅ Backup created: {filename} ({size_mb:.1f} MB)")

        # Rotate old backups
        rotate_backups()
        return True

    except FileNotFoundError:
        print("❌ pg_dump not found. Install PostgreSQL client tools.")
        return False
    except Exception as e:
        print(f"❌ Backup failed: {e}")
        return False


def backup_sqlite():
    """Backup SQLite database by copying the file."""
    from app.core.database import DB_PATH
    if not os.path.exists(DB_PATH):
        print("❌ SQLite database not found.")
        return False

    os.makedirs(BACKUP_DIR, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"ryzm_sqlite_backup_{timestamp}.db"
    filepath = os.path.join(BACKUP_DIR, filename)

    import shutil
    shutil.copy2(DB_PATH, filepath)
    size_mb = os.path.getsize(filepath) / (1024 * 1024)
    print(f"✅ SQLite backup: {filename} ({size_mb:.1f} MB)")
    rotate_backups()
    return True


def rotate_backups():
    """Remove oldest backups beyond MAX_BACKUPS."""
    if not os.path.exists(BACKUP_DIR):
        return
    files = sorted(
        [f for f in os.listdir(BACKUP_DIR) if f.startswith("ryzm_")],
        key=lambda f: os.path.getmtime(os.path.join(BACKUP_DIR, f)),
    )
    while len(files) > MAX_BACKUPS:
        old = files.pop(0)
        os.remove(os.path.join(BACKUP_DIR, old))
        print(f"🗑️ Rotated: {old}")


if __name__ == "__main__":
    if DATABASE_URL:
        backup_postgresql()
    else:
        backup_sqlite()
