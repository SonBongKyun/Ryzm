"""
Ryzm Terminal — Signal Journal Routes
CRUD for journal entries: save council snapshots, track positions, record outcomes.
Pro feature with limited free access.
"""
import csv
import io
import json

from fastapi import APIRouter, HTTPException, Request

from app.core.logger import logger
from app.core.config import (
    JournalCreateRequest, JournalUpdateRequest,
    MAX_FREE_JOURNAL, MAX_PRO_JOURNAL,
)
from app.core.auth import get_current_user
from app.core.database import (
    create_journal_entry, get_journal_entries, get_journal_entry,
    update_journal_entry, delete_journal_entry, get_journal_stats,
    get_user_by_id, utc_now_str,
)
from app.core.security import get_user_tier

router = APIRouter(prefix="/api/journal", tags=["journal"])


def _require_auth(request: Request) -> dict:
    """Extract and validate authenticated user. Returns user_data."""
    user_data = get_current_user(request)
    if not user_data:
        raise HTTPException(401, "Authentication required")
    return user_data


@router.post("")
def create_entry(body: JournalCreateRequest, request: Request):
    """Save a council analysis to the signal journal."""
    user_data = _require_auth(request)
    user_id = int(user_data["sub"])
    tier = user_data.get("tier", "free")

    # Check journal limit
    stats = get_journal_stats(user_id)
    max_entries = MAX_PRO_JOURNAL if tier == "pro" else MAX_FREE_JOURNAL
    if stats["total"] >= max_entries:
        raise HTTPException(
            403,
            f"Journal limit reached ({max_entries} entries). " +
            ("Upgrade to Pro for 500 entries." if tier != "pro" else "Maximum entries reached.")
        )

    snapshot_json = json.dumps(body.snapshot, ensure_ascii=False) if body.snapshot else "{}"
    entry_id = create_journal_entry(
        user_id=user_id,
        council_id=body.council_id,
        snapshot_json=snapshot_json,
        position_type=body.position_type,
        entry_price=body.entry_price,
        stop_loss=body.stop_loss,
        take_profit=body.take_profit,
        user_note=body.user_note,
        tags=body.tags,
    )
    if not entry_id:
        raise HTTPException(500, "Failed to create journal entry")

    return {"status": "created", "id": entry_id}


@router.get("")
def list_entries(request: Request, limit: int = 50, offset: int = 0):
    """List journal entries for the authenticated user."""
    user_data = _require_auth(request)
    user_id = int(user_data["sub"])

    entries = get_journal_entries(user_id, limit=min(limit, 100), offset=offset)
    stats = get_journal_stats(user_id)

    # Parse snapshot_json for each entry
    for entry in entries:
        try:
            entry["snapshot"] = json.loads(entry.pop("snapshot_json", "{}"))
        except (json.JSONDecodeError, TypeError):
            entry["snapshot"] = {}

    return {"entries": entries, "stats": stats}


@router.get("/stats")
def get_stats(request: Request):
    """Get journal performance statistics."""
    user_data = _require_auth(request)
    user_id = int(user_data["sub"])
    return get_journal_stats(user_id)


@router.get("/{entry_id}")
def get_entry(entry_id: int, request: Request):
    """Get a single journal entry."""
    user_data = _require_auth(request)
    user_id = int(user_data["sub"])

    entry = get_journal_entry(entry_id, user_id)
    if not entry:
        raise HTTPException(404, "Journal entry not found")

    try:
        entry["snapshot"] = json.loads(entry.pop("snapshot_json", "{}"))
    except (json.JSONDecodeError, TypeError):
        entry["snapshot"] = {}

    return entry


@router.put("/{entry_id}")
def update_entry(entry_id: int, body: JournalUpdateRequest, request: Request):
    """Update a journal entry (notes, tags, outcome)."""
    user_data = _require_auth(request)
    user_id = int(user_data["sub"])

    updates = {k: v for k, v in body.model_dump().items() if v is not None}

    # Auto-set closed_at when outcome is recorded
    if "outcome" in updates and updates["outcome"]:
        updates["closed_at_utc"] = utc_now_str()

    if not updates:
        raise HTTPException(400, "No fields to update")

    success = update_journal_entry(entry_id, user_id, **updates)
    if not success:
        raise HTTPException(404, "Entry not found or no changes made")

    return {"status": "updated", "id": entry_id}


@router.delete("/{entry_id}")
def delete_entry(entry_id: int, request: Request):
    """Delete a journal entry."""
    user_data = _require_auth(request)
    user_id = int(user_data["sub"])

    if not delete_journal_entry(entry_id, user_id):
        raise HTTPException(404, "Entry not found")

    return {"status": "deleted", "id": entry_id}


# ─── Pro Feature: Journal CSV Export ───
@router.get("/export/csv")
def export_journal_csv(request: Request):
    """Export signal journal as CSV (Pro feature)."""
    from fastapi.responses import StreamingResponse
    user_data = _require_auth(request)
    user_id = int(user_data["sub"])

    # Check Pro tier
    user = get_user_by_id(user_id)
    if not user or user.get("tier") != "pro":
        raise HTTPException(403, "Pro subscription required for CSV export.")

    entries = get_journal_entries(user_id, limit=500, offset=0)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "id", "created_at", "position_type", "entry_price",
        "stop_loss", "take_profit", "outcome", "exit_price",
        "pnl_pct", "user_note", "tags", "closed_at"
    ])
    for e in entries:
        writer.writerow([
            e.get("id"), e.get("created_at_utc"), e.get("position_type"),
            e.get("entry_price"), e.get("stop_loss"), e.get("take_profit"),
            e.get("outcome"), e.get("exit_price"), e.get("pnl_pct"),
            e.get("user_note"), e.get("tags"), e.get("closed_at_utc"),
        ])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=ryzm_journal.csv"},
    )
