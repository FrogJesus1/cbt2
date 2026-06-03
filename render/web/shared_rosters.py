"""
Shared roster store — server-side roster library visible to all users.

Each roster is stored as a JSON file in data/shared_rosters/<id>.json.
Rosters are tagged with the uploader's profile name and upload timestamp.

Structure per file:
  {
    "id":          "tau-retaliation-cadre-1717430000",
    "name":        "Retaliation Cadre",
    "faction":     "tau",
    "content":     "... raw roster text ...",
    "uploaded_by": "Juzzie",
    "uploaded_at": "2026-06-03T12:00:00+00:00",
    "updated_at":  "2026-06-03T12:00:00+00:00"
  }
"""

from __future__ import annotations

import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path

ROSTERS_DIR = Path(__file__).parent.parent.parent / "data" / "shared_rosters"


def _ensure_dir():
    ROSTERS_DIR.mkdir(parents=True, exist_ok=True)


def _slugify(s: str) -> str:
    return re.sub(r"[^a-z0-9-]", "", s.lower().strip().replace(" ", "-"))


def _make_id(faction: str, name: str) -> str:
    slug = _slugify(f"{faction}-{name}")
    return f"{slug}-{int(time.time())}"


def _read(roster_id: str) -> dict | None:
    p = ROSTERS_DIR / f"{roster_id}.json"
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text())
    except (json.JSONDecodeError, OSError):
        return None


def _write(roster_id: str, data: dict):
    _ensure_dir()
    (ROSTERS_DIR / f"{roster_id}.json").write_text(json.dumps(data, indent=2))


# ─── Public API ───────────────────────────────────────────────────────────────

def list_all_rosters() -> list[dict]:
    """Return all shared rosters sorted by faction then name.
    Each entry includes everything except the raw content (for listing).
    """
    _ensure_dir()
    rosters = []
    for f in ROSTERS_DIR.glob("*.json"):
        try:
            d = json.loads(f.read_text())
            rosters.append({
                "id":          d["id"],
                "name":        d["name"],
                "faction":     d["faction"],
                "uploaded_by": d.get("uploaded_by", "unknown"),
                "uploaded_at": d.get("uploaded_at"),
                "updated_at":  d.get("updated_at"),
            })
        except (json.JSONDecodeError, KeyError):
            continue
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
    return _read(roster_id)


def find_roster_by_name(name: str) -> dict | None:
    """Find a roster by name (case-insensitive partial match). Returns full roster with content."""
    _ensure_dir()
    lower = name.lower().strip()
    for f in ROSTERS_DIR.glob("*.json"):
        try:
            d = json.loads(f.read_text())
            if lower in d.get("name", "").lower():
                return d
        except (json.JSONDecodeError, KeyError):
            continue
    return None


def save_roster(name: str, faction: str, content: str, uploaded_by: str) -> dict:
    """Save a new roster. Returns the saved roster dict."""
    faction_slug = _slugify(faction)
    roster_id = _make_id(faction_slug, name)
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")

    roster = {
        "id":          roster_id,
        "name":        name,
        "faction":     faction_slug,
        "content":     content,
        "uploaded_by": uploaded_by,
        "uploaded_at": now,
        "updated_at":  now,
    }
    _write(roster_id, roster)
    return roster


def delete_roster(roster_id: str, requester: str | None = None) -> bool:
    """Delete a roster by id. Returns True if deleted."""
    p = ROSTERS_DIR / f"{roster_id}.json"
    if not p.exists():
        return False
    p.unlink()
    return True


def update_roster_content(roster_id: str, content: str) -> dict | None:
    """Update a roster's content. Returns updated roster or None."""
    roster = _read(roster_id)
    if not roster:
        return None
    roster["content"] = content
    roster["updated_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    _write(roster_id, roster)
    return roster
