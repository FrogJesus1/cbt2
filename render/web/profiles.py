"""
Profile manager — JSON-file-backed user profiles.

Each profile is a single JSON file in data/profiles/<slug>.json.
Stores user state (theme, starred units, rosters, campaigns, command history)
so it persists across sessions and devices.

Auth: simple name + optional PIN (hashed with sha256 + per-profile salt).
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import secrets
from datetime import datetime, timezone
from pathlib import Path

PROFILES_DIR = Path(__file__).parent.parent.parent / "data" / "profiles"


def _ensure_dir():
    PROFILES_DIR.mkdir(parents=True, exist_ok=True)


def _slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9-]", "", name.lower().strip().replace(" ", "-"))


def _path(slug: str) -> Path:
    return PROFILES_DIR / f"{slug}.json"


def _hash_pin(pin: str, salt: str) -> str:
    return hashlib.sha256(f"{salt}:{pin}".encode()).hexdigest()


def _read(slug: str) -> dict | None:
    p = _path(slug)
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text())
    except (json.JSONDecodeError, OSError):
        return None


def _write(slug: str, data: dict):
    _ensure_dir()
    _path(slug).write_text(json.dumps(data, indent=2))


# ─── Public API ───────────────────────────────────────────────────────────────

def list_profiles() -> list[dict]:
    """Return list of profile summaries (name, has_pin, created_at)."""
    _ensure_dir()
    profiles = []
    for f in sorted(PROFILES_DIR.glob("*.json")):
        try:
            d = json.loads(f.read_text())
            profiles.append({
                "name":       d["name"],
                "has_pin":    d.get("pin_hash") is not None,
                "created_at": d.get("created_at"),
            })
        except (json.JSONDecodeError, KeyError):
            continue
    return profiles


def create_profile(name: str, pin: str | None = None) -> dict:
    """Create a new profile. Returns the profile dict. Raises ValueError if exists."""
    slug = _slugify(name)
    if not slug:
        raise ValueError("Invalid profile name")
    if _path(slug).exists():
        raise ValueError(f"Profile '{name}' already exists")

    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    salt = secrets.token_hex(16) if pin else None
    pin_hash = _hash_pin(pin, salt) if pin else None

    profile = {
        "name":       name,
        "slug":       slug,
        "pin_hash":   pin_hash,
        "pin_salt":   salt,
        "created_at": now,
        "updated_at": now,
        "state": {
            "theme":           "dark",
            "starred_units":   [],
            "command_history": [],
            "vfs":             {"rosters": {}, "campaigns": {}},
        },
    }
    _write(slug, profile)
    return _public_profile(profile)


def login(name: str, pin: str | None = None) -> dict:
    """Authenticate and return full profile with state. Raises ValueError on failure."""
    slug = _slugify(name)
    profile = _read(slug)
    if not profile:
        raise ValueError("Profile not found")

    if profile.get("pin_hash"):
        if not pin:
            raise ValueError("PIN required")
        if _hash_pin(pin, profile["pin_salt"]) != profile["pin_hash"]:
            raise ValueError("Wrong PIN")
    return _public_profile(profile)


def save_state(name: str, state: dict) -> dict:
    """Merge state update into profile. Returns updated profile."""
    slug = _slugify(name)
    profile = _read(slug)
    if not profile:
        raise ValueError("Profile not found")

    # Merge only known keys
    for key in ("theme", "starred_units", "command_history", "vfs"):
        if key in state:
            profile["state"][key] = state[key]

    profile["updated_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    _write(slug, profile)
    return _public_profile(profile)


def delete_profile(name: str, pin: str | None = None):
    """Delete a profile. Requires PIN if set. Raises ValueError on failure."""
    slug = _slugify(name)
    profile = _read(slug)
    if not profile:
        raise ValueError("Profile not found")

    if profile.get("pin_hash"):
        if not pin:
            raise ValueError("PIN required to delete profile")
        if _hash_pin(pin, profile["pin_salt"]) != profile["pin_hash"]:
            raise ValueError("Wrong PIN")

    _path(slug).unlink()


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
