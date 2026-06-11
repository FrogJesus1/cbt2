"""
Profile manager — Airtable-backed user profiles.

Each profile is a row in the Profiles table of the Combat Terminal Airtable base.
Stores user state (theme, starred units, rosters, campaigns, command history)
so it persists across sessions, devices, and deploys.

Auth: simple name + optional PIN (hashed with sha256 + per-profile salt).

Required env vars:
  AIRTABLE_TOKEN   — Airtable Personal Access Token
  AIRTABLE_BASE_ID — Base ID (e.g. appfOqXB5mLMgXFKp)
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import secrets
from datetime import datetime, timezone

from pyairtable import Api


# ─── Airtable connection ─────────────────────────────────────────────────────

PROFILES_TABLE = "Profiles"


def _get_table():
    token = os.environ.get("AIRTABLE_TOKEN", "")
    base_id = os.environ.get("AIRTABLE_BASE_ID", "")
    if not token or not base_id:
        raise RuntimeError(
            "AIRTABLE_TOKEN and AIRTABLE_BASE_ID must be set. "
            "Profiles cannot be stored without an Airtable connection."
        )
    api = Api(token)
    return api.table(base_id, PROFILES_TABLE)


class ProfileStoreError(RuntimeError):
    """Raised when the Airtable profile store is unreachable or rejects a write.

    Distinct from ValueError (which means a *user* error like a duplicate name or
    wrong PIN) so the API layer can map store failures to 502 with the real
    Airtable message, instead of swallowing them into a generic 500.
    """


def _airtable_message(exc: Exception) -> str:
    """Best-effort human-readable detail from a pyairtable/HTTP error."""
    msg = str(exc).strip()
    # pyairtable raises requests.HTTPError whose response body carries the real
    # Airtable error (e.g. INVALID_VALUE_FOR_COLUMN, NOT_FOUND, INVALID_PERMISSIONS).
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
    """Diagnose the profile store without raising.

    Returns {ok, base_id, table, count|None, error|None}.  Hit via
    GET /api/profiles/health to see at a glance whether the Airtable token,
    base id, and Profiles table are reachable — turns an opaque outage into a
    one-request answer.
    """
    base_id = os.environ.get("AIRTABLE_BASE_ID", "")
    info = {"ok": False, "base_id": base_id or None, "table": PROFILES_TABLE,
            "count": None, "error": None}
    try:
        table = _get_table()
        recs = table.all(max_records=1)
        # A reachable table returns a (possibly empty) list without raising.
        info["ok"] = True
        # Report the full count separately so an empty table is obvious.
        try:
            info["count"] = len(table.all(fields=[]))
        except Exception:
            info["count"] = len(recs)
    except Exception as exc:
        info["error"] = _airtable_message(exc)
    return info


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9-]", "", name.lower().strip().replace(" ", "-"))


def _hash_pin(pin: str, salt: str) -> str:
    return hashlib.sha256(f"{salt}:{pin}".encode()).hexdigest()


def _find_by_slug(table, slug: str) -> dict | None:
    """Find a profile record by slug. Returns raw Airtable record or None."""
    # slug is already restricted to [a-z0-9-] by _slugify, but escape anyway so
    # the formula is safe by construction regardless of caller (defence in depth).
    safe = str(slug).replace("\\", "\\\\").replace("'", r"\'")
    records = table.all(formula=f"{{Slug}} = '{safe}'")
    return records[0] if records else None


def _record_to_profile(record: dict) -> dict:
    """Convert Airtable record to internal profile dict."""
    fields = record["fields"]
    state_raw = fields.get("State", "{}")
    try:
        state = json.loads(state_raw) if state_raw else {}
    except (json.JSONDecodeError, TypeError):
        state = {}

    return {
        "name":       fields.get("Name", ""),
        "slug":       fields.get("Slug", ""),
        "pin_hash":   fields.get("PinHash") or None,
        "pin_salt":   fields.get("PinSalt") or None,
        "created_at": fields.get("CreatedAt"),
        "updated_at": fields.get("UpdatedAt"),
        "state":      state,
        "_record_id": record["id"],
    }


# ─── Public API ───────────────────────────────────────────────────────────────

def list_profiles() -> list[dict]:
    """Return list of profile summaries (name, has_pin, created_at)."""
    table = _get_table()
    records = table.all()
    profiles = []
    for r in records:
        f = r["fields"]
        profiles.append({
            "name":       f.get("Name", ""),
            "has_pin":    bool(f.get("PinHash")),
            "created_at": f.get("CreatedAt"),
        })
    profiles.sort(key=lambda p: p["name"].lower())
    return profiles


def create_profile(name: str, pin: str | None = None) -> dict:
    """Create a new profile. Returns the profile dict. Raises ValueError if exists."""
    slug = _slugify(name)
    if not slug:
        raise ValueError("Invalid profile name")

    table = _get_table()

    # Check for existing
    if _find_by_slug(table, slug):
        raise ValueError(f"Profile '{name}' already exists")

    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    salt = secrets.token_hex(16) if pin else None
    pin_hash = _hash_pin(pin, salt) if pin else None

    state = {
        "theme":           "dark",
        "starred_units":   [],
        "command_history": [],
        "vfs":             {"rosters": {}, "campaigns": {}},
    }

    # Only send fields that carry a real value. An empty string sent to a column
    # whose Airtable type drifted (e.g. PinHash/PinSalt retyped, or a Date-typed
    # timestamp) triggers INVALID_VALUE_FOR_COLUMN and fails the whole create —
    # the same trap the Reports table hit. Optional/empty fields are omitted.
    fields = {
        "Name":      name,
        "Slug":      slug,
        "State":     json.dumps(state),
        "CreatedAt": now,
        "UpdatedAt": now,
    }
    if pin_hash:
        fields["PinHash"] = pin_hash
    if salt:
        fields["PinSalt"] = salt

    try:
        table.create(fields)
    except Exception as exc:
        # Surface the real Airtable cause (token / table / column-type) instead
        # of letting it bubble up as an opaque 500 → generic UI message.
        raise ProfileStoreError(
            f"Could not save the profile to Airtable — {_airtable_message(exc)}"
        ) from exc

    return _public_profile({
        "name": name, "slug": slug,
        "pin_hash": pin_hash, "pin_salt": salt,
        "created_at": now, "updated_at": now,
        "state": state,
    })


def login(name: str, pin: str | None = None) -> dict:
    """Authenticate and return full profile with state. Raises ValueError on failure."""
    slug = _slugify(name)
    table = _get_table()
    record = _find_by_slug(table, slug)
    if not record:
        raise ValueError("Profile not found")

    profile = _record_to_profile(record)

    if profile.get("pin_hash"):
        if not pin:
            raise ValueError("PIN required")
        if _hash_pin(pin, profile["pin_salt"]) != profile["pin_hash"]:
            raise ValueError("Wrong PIN")

    return _public_profile(profile)


def save_state(name: str, state: dict) -> dict:
    """Merge state update into profile. Returns updated profile."""
    slug = _slugify(name)
    table = _get_table()
    record = _find_by_slug(table, slug)
    if not record:
        raise ValueError("Profile not found")

    profile = _record_to_profile(record)

    # Merge only known keys
    for key in ("theme", "starred_units", "command_history", "vfs"):
        if key in state:
            profile["state"][key] = state[key]

    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    profile["updated_at"] = now

    table.update(record["id"], {
        "State":     json.dumps(profile["state"]),
        "UpdatedAt": now,
    })

    return _public_profile(profile)


def delete_profile(name: str, pin: str | None = None):
    """Delete a profile. Requires PIN if set. Raises ValueError on failure."""
    slug = _slugify(name)
    table = _get_table()
    record = _find_by_slug(table, slug)
    if not record:
        raise ValueError("Profile not found")

    profile = _record_to_profile(record)

    if profile.get("pin_hash"):
        if not pin:
            raise ValueError("PIN required to delete profile")
        if _hash_pin(pin, profile["pin_salt"]) != profile["pin_hash"]:
            raise ValueError("Wrong PIN")

    table.delete(record["id"])


def _public_profile(profile: dict) -> dict:
    """Strip sensitive fields before returning to client."""
    return {
        "name":       profile["name"],
        "slug":       profile["slug"],
        "has_pin":    profile.get("pin_hash") is not None,
        "created_at": profile.get("created_at"),
        "updated_at": profile.get("updated_at"),
        "state":      profile.get("state", {}),
    }
