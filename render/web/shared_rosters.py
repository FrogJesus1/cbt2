"""
Shared roster store — Airtable-backed roster library visible to all users.

Each roster is a row in the SharedRosters table of the Combat Terminal
Airtable base. Rosters are tagged with the uploader's profile name and
upload timestamp.

Required env vars:
  AIRTABLE_TOKEN   — Airtable Personal Access Token
  AIRTABLE_BASE_ID — Base ID (e.g. appfOqXB5mLMgXFKp)
"""

from __future__ import annotations

import os
import re
import time
from datetime import datetime, timezone

from pyairtable import Api


# ─── Airtable connection ─────────────────────────────────────────────────────

def _get_table():
    token = os.environ.get("AIRTABLE_TOKEN", "")
    base_id = os.environ.get("AIRTABLE_BASE_ID", "")
    if not token or not base_id:
        raise RuntimeError(
            "AIRTABLE_TOKEN and AIRTABLE_BASE_ID must be set. "
            "Rosters cannot be stored without an Airtable connection."
        )
    api = Api(token)
    return api.table(base_id, "SharedRosters")


# ─── Error surfacing + health ──────────────────────────────────────────────────

class RosterStoreError(RuntimeError):
    """Raised when the Airtable roster store is unreachable or rejects an op.

    Lets the API layer map a store outage to a 502 carrying the *real* Airtable
    cause, instead of letting it fall through as a generic 500 or — worse — be
    swallowed into a misleading "Roster not found" on the client.
    """


def _airtable_message(exc: Exception) -> str:
    """Best-effort human-readable detail from a pyairtable/HTTP error.

    Mirrors profiles._airtable_message so a roster outage reports the same kind of
    actionable cause (INVALID_PERMISSIONS, NOT_FOUND, auth, missing env, …).
    """
    msg = str(exc).strip()
    resp = getattr(exc, "response", None)
    if resp is not None:
        try:
            body = resp.json()
            err = body.get("error", body)
            if isinstance(err, dict):
                msg = f"{err.get('type', '')}: {err.get('message', '')}".strip(": ") or msg
            else:
                msg = str(err) or msg
            msg = f"Airtable {resp.status_code}: {msg}"
        except Exception:
            txt = (getattr(resp, "text", "") or "")[:300]
            msg = f"Airtable {resp.status_code}: {txt or msg}"
    return msg or "Unknown Airtable error"


def health_check() -> dict:
    """Diagnose the roster store without raising.

    Returns {ok, base_id, table, count|None, error|None}.  Hit via
    GET /api/rosters/health to see at a glance whether the Airtable token, base
    id, and SharedRosters table are reachable — turns an opaque "can't load any
    roster" outage into a one-request answer.
    """
    base_id = os.environ.get("AIRTABLE_BASE_ID", "")
    info = {"ok": False, "base_id": base_id or None, "table": "SharedRosters",
            "count": None, "error": None}
    try:
        table = _get_table()
        recs = table.all(max_records=1)
        info["ok"] = True
        try:
            info["count"] = len(table.all(fields=[]))
        except Exception:
            info["count"] = len(recs)
    except Exception as exc:
        info["error"] = _airtable_message(exc)
    return info


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _slugify(s: str) -> str:
    return re.sub(r"[^a-z0-9-]", "", s.lower().strip().replace(" ", "-"))


def _make_id(faction: str, name: str) -> str:
    slug = _slugify(f"{faction}-{name}")
    return f"{slug}-{int(time.time())}"


def _escape_formula_value(value: str) -> str:
    """Escape a value for safe interpolation into an Airtable formula string.

    Airtable formula string literals are single-quoted; a stray quote/backslash
    in user-influenced input would otherwise break out of the literal.
    """
    return str(value).replace("\\", "\\\\").replace("'", r"\'")


def _find_by_roster_id(table, roster_id: str) -> dict | None:
    """Find a roster record by RosterId. Returns raw Airtable record or None."""
    safe = _escape_formula_value(roster_id)
    records = table.all(formula=f"{{RosterId}} = '{safe}'")
    return records[0] if records else None


def _record_to_roster(record: dict) -> dict:
    """Convert Airtable record to internal roster dict."""
    f = record["fields"]
    return {
        "id":          f.get("RosterId", ""),
        "name":        f.get("Name", ""),
        "faction":     f.get("Faction", ""),
        "content":     f.get("Content", ""),
        "uploaded_by": f.get("UploadedBy", "unknown"),
        "uploaded_at": f.get("UploadedAt"),
        "updated_at":  f.get("UpdatedAt"),
        "_record_id":  record["id"],
    }


def _roster_summary(record: dict) -> dict:
    """Convert Airtable record to listing summary (no content)."""
    f = record["fields"]
    return {
        "id":          f.get("RosterId", ""),
        "name":        f.get("Name", ""),
        "faction":     f.get("Faction", ""),
        "uploaded_by": f.get("UploadedBy", "unknown"),
        "uploaded_at": f.get("UploadedAt"),
        "updated_at":  f.get("UpdatedAt"),
    }


# ─── Public API ───────────────────────────────────────────────────────────────

def list_all_rosters() -> list[dict]:
    """Return all shared rosters sorted by faction then name.
    Each entry includes everything except the raw content (for listing).
    """
    table = _get_table()
    records = table.all()
    rosters = [_roster_summary(r) for r in records]
    rosters.sort(key=lambda r: (r["faction"], r["name"].lower()))
    return rosters


def list_rosters_grouped() -> dict:
    """Return rosters grouped by faction slug.
    { "<faction>": [ { id, name, uploaded_by, uploaded_at, ... }, ... ] }
    """
    rosters = list_all_rosters()
    grouped = {}
    for r in rosters:
        faction = r["faction"]
        if faction not in grouped:
            grouped[faction] = []
        grouped[faction].append(r)
    return grouped


def get_roster(roster_id: str) -> dict | None:
    """Return full roster including content."""
    table = _get_table()
    record = _find_by_roster_id(table, roster_id)
    if not record:
        return None
    return _record_to_roster(record)


def find_roster_by_name(name: str) -> dict | None:
    """Find a roster by name (case-insensitive partial match). Returns full roster with content."""
    table = _get_table()
    records = table.all()
    lower = name.lower().strip()
    for r in records:
        rname = r["fields"].get("Name", "")
        if lower in rname.lower():
            return _record_to_roster(r)
    return None


def save_roster(name: str, faction: str, content: str, uploaded_by: str) -> dict:
    """Save a new roster. Returns the saved roster dict."""
    faction_slug = _slugify(faction)
    roster_id = _make_id(faction_slug, name)
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")

    table = _get_table()
    fields = {
        "Name":       name,
        "RosterId":   roster_id,
        "Faction":    faction_slug,
        "Content":    content,
        "UploadedBy": uploaded_by,
        "UploadedAt": now,
        "UpdatedAt":  now,
    }
    table.create(fields)

    return {
        "id":          roster_id,
        "name":        name,
        "faction":     faction_slug,
        "content":     content,
        "uploaded_by": uploaded_by,
        "uploaded_at": now,
        "updated_at":  now,
    }


def delete_roster(roster_id: str, requester: str | None = None) -> bool:
    """Delete a roster by id. Returns True if deleted, False if not found.

    Ownership: when the roster has a known uploader and a ``requester`` is
    supplied, only that uploader may delete it — otherwise a ``PermissionError``
    is raised.  Legacy rows with no/unknown uploader stay deletable so old data
    isn't stranded (the deploy is trusted-friends; see BACKLOG for the limit).
    """
    table = _get_table()
    record = _find_by_roster_id(table, roster_id)
    if not record:
        return False
    owner = (record["fields"].get("UploadedBy") or "").strip()
    if owner and owner.lower() != "unknown" and requester and requester != owner:
        raise PermissionError(
            f"This roster belongs to '{owner}' — only they can delete it."
        )
    table.delete(record["id"])
    return True


def update_roster_content(roster_id: str, content: str) -> dict | None:
    """Update a roster's content. Returns updated roster or None."""
    table = _get_table()
    record = _find_by_roster_id(table, roster_id)
    if not record:
        return None

    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    table.update(record["id"], {
        "Content":   content,
        "UpdatedAt": now,
    })

    roster = _record_to_roster(record)
    roster["content"] = content
    roster["updated_at"] = now
    return roster
