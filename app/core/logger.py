"""
Ryzm Terminal — Logging Configuration
#13 Structured JSON logging in production, human-readable in dev.
"""
import logging
import os
import sys

_APP_ENV = os.getenv("APP_ENV", "development").lower()

# ── JSON structured logging for production ──
if _APP_ENV == "production":
    try:
        from pythonjsonlogger import jsonlogger

        class _RyzmJsonFormatter(jsonlogger.JsonFormatter):
            """Adds service name and environment to every log line."""
            def add_fields(self, log_record, record, message_dict):
                super().add_fields(log_record, record, message_dict)
                log_record["service"] = "ryzm-terminal"
                log_record["env"] = _APP_ENV
                log_record["level"] = record.levelname
                log_record["logger"] = record.name

        _handler = logging.StreamHandler(sys.stdout)
        _handler.setFormatter(_RyzmJsonFormatter(
            fmt="%(asctime)s %(levelname)s %(name)s %(message)s",
            rename_fields={"asctime": "timestamp", "levelname": "level"},
        ))
        logging.root.handlers = [_handler]
        logging.root.setLevel(logging.INFO)
    except ImportError:
        # Fallback if python-json-logger not installed
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        )
else:
    # Dev: human-readable colorish format
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    )

logger = logging.getLogger("ryzm")
