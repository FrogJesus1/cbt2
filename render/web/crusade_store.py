"""
Crusade store — Airtable-backed Crusade campaign + Order of Battle storage.

Session 1 (Foundation) of the Crusade Tracker. Mirrors the shape and
conventions of shared_rosters.py: server-side storage, tagged with the
owner profile name and timestamps, addressed by a stable string id.

Tables (in the Combat Terminal Airtable base):
  - CrusadeCampaigns   one row per campaign
  - CrusadeUnits       one row per unit's Crusade Card

Schema self-provisioning:
  The Combat Terminal base is created by an Airtable token that lives only
  in the server's environment. On first use this module attempts to create
  any missing tables via the Airtable metadata API (requires the PAT to
  carry the `schema.bases:write` scope). If that scope is absent the calls
  fail quietly and the tables must be created by hand — see TABLE_SPECS
  below for the exact field list.

Required env vars (same as shared_rosters):
  AIRTABLE_TOKEN     Airtable Personal Access Token
  AIRTABLE_BASE_ID   Base ID (e.g. appfOqXB5mLMgXFKp)
"""

from __future__ import annotations

import json
import os
import re
import time
from datetime import datetime, timezone

from pyairtable import Api


CAMPAIGNS_TABLE = "CrusadeCampaigns"
UNITS_TABLE = "CrusadeUnits"


# ─── Table specs (used for self-provisioning + manual reference) ───────────────

TABLE_SPECS = {
    CAMPAIGNS_TABLE: [
        {"name": "CampaignId", "type": "singleLineText"},
        {"name": "Name", "type": "singleLineText"},
        {"name": "Faction", "type": "singleLineText"},
        {"name": "RP", "type": "number", "options": {"precision": 0}},
        {"name": "SupplyLimit", "type": "number", "options": {"precision": 0}},
        {"name": "BattleCount", "type": "number", "options": {"precision": 0}},
        {"name": "Wins", "type": "number", "options": {"precision": 0}},
        {"name": "Losses", "type": "number", "options": {"precision": 0}},
        {"name": "Draws", "type": "number", "options": {"precision": 0}},
        {"name": "Owner", "type": "singleLineText"},
        {"name": "CreatedAt", "type": "singleLineText"},
        {"name": "UpdatedAt", "type": "singleLineText"},
        {"name": "State", "type": "multilineText"},
    ],
    UNITS_TABLE: [
        {"name": "UnitId", "type": "singleLineText"},
        {"name": "CampaignId", "type": "singleLineText"},
        {"name": "UnitName", "type": "singleLineText"},
        {"name": "Nickname", "type": "singleLineText"},
        {"name": "Points", "type": "number", "options": {"precision": 0}},
        {"name": "Models", "type": "number", "options": {"precision": 0}},
        {"name": "IsLeader", "type": "checkbox",
         "options": {"icon": "check", "color": "greenBright"}},
        {"name": "AttachedTo", "type": "singleLineText"},
        {"name": "Loadout", "type": "multilineText"},
        {"name": "XP", "type": "number", "options": {"precision": 0}},
        {"name": "Rank", "type": "singleLineText"},
        {"name": "BattlesFought", "type": "number", "options": {"precision": 0}},
        {"name": "BattlesSurvived", "type": "number", "options": {"precision": 0}},
        {"name": "EnemyKills", "type": "number", "options": {"precision": 0}},
        {"name": "Honours", "type": "multilineText"},
        {"name": "Scars", "type": "multilineText"},
        {"name": "CrusadePoints", "type": "number", "options": {"precision": 0}},
        {"name": "MarkedForGreatness", "type": "checkbox",
         "options": {"icon": "check", "color": "greenBright"}},
        {"name": "UpdatedAt", "type": "singleLineText"},
    ],
}

RANKS = ["Fresh", "Blooded", "Battle-hardened", "Heroic", "Legendary"]


# ─── Airtable connection + lazy schema provisioning ────────────────────────────

_schema_checked = False


def _get_base():
    token = os.environ.get("AIRTABLE_TOKEN", "")
    base_id = os.environ.get("AIRTABLE_BASE_ID", "")
    if not token or not base_id:
        raise RuntimeError(
            "AIRTABLE_TOKEN and AIRTABLE_BASE_ID must be set. "
            "Crusade data cannot be stored without an Airtable connection."
        )
    return Api(token).base(base_id)


def _ensure_schema(base) -> None:
    """Best-effort: create any missing Crusade tables.

    Idempotent and cheap to call once per process. Failures (e.g. the PAT
    lacks schema.bases:write) are swallowed — the tables may already exist or
    must be created manually.
    """
    global _schema_checked
    if _schema_checked:
        return
    _schema_checked = True
    try:
        existing = {t.name for t in base.schema().tables}
    except Exception as exc:  # noqa: BLE001 — schema read not permitted, skip
        print(f"[crusade_store] schema check skipped: {exc}")
        return
    for table_name, fields in TABLE_SPECS.items():
        if table_name in existing:
            continue
        try:
            base.create_table(table_name, fields)
            print(f"[crusade_store] created table {table_name}")
        except Exception as exc:  # noqa: BLE001
            print(f"[crusade_store] could not create {table_name}: {exc}")


def _table(name: str):
    base = _get_base()
    _ensure_schema(base)
    return base.table(name)


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _slugify(s: str) -> str:
    return re.sub(r"[^a-z0-9-]", "", s.lower().strip().replace(" ", "-"))


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _make_campaign_id(name: str) -> str:
    return f"{_slugify(name)}-{int(time.time())}"


def _loads(raw, default):
    if not raw:
        return default
    try:
        return json.loads(raw)
    except (ValueError, TypeError):
        return default


def _find(table, field: str, value: str) -> dict | None:
    safe = value.replace("'", r"\'")
    records = table.all(formula=f"{{{field}}} = '{safe}'")
    return records[0] if records else None


# ─── Record <-> dict conversion ────────────────────────────────────────────────

def _record_to_campaign(record: dict) -> dict:
    f = record["fields"]
    return {
        "id":           f.get("CampaignId", ""),
        "name":         f.get("Name", ""),
        "faction":      f.get("Faction", ""),
        "rp":           int(f.get("RP", 0) or 0),
        "supply_limit": int(f.get("SupplyLimit", 0) or 0),
        "battle_count": int(f.get("BattleCount", 0) or 0),
        "wins":         int(f.get("Wins", 0) or 0),
        "losses":       int(f.get("Losses", 0) or 0),
        "draws":        int(f.get("Draws", 0) or 0),
        "owner":        f.get("Owner", "unknown"),
        "created_at":   f.get("CreatedAt"),
        "updated_at":   f.get("UpdatedAt"),
        "state":        _loads(f.get("State"), {}),
        "_record_id":   record["id"],
    }


def _record_to_unit(record: dict) -> dict:
    f = record["fields"]
    honours = _loads(f.get("Honours"), [])
    scars = _loads(f.get("Scars"), [])
    return {
        "id":               f.get("UnitId", ""),
        "campaign_id":      f.get("CampaignId", ""),
        "unit_name":        f.get("UnitName", ""),
        "nickname":         f.get("Nickname", ""),
        "points":           int(f.get("Points", 0) or 0),
        "models":           int(f.get("Models", 1) or 1),
        "is_leader":        bool(f.get("IsLeader", False)),
        "attached_to":      f.get("AttachedTo", ""),
        "loadout":          _loads(f.get("Loadout"), []),
        "xp":               int(f.get("XP", 0) or 0),
        "rank":             f.get("Rank", "Fresh"),
        "battles_fought":   int(f.get("BattlesFought", 0) or 0),
        "battles_survived": int(f.get("BattlesSurvived", 0) or 0),
        "enemy_kills":      int(f.get("EnemyKills", 0) or 0),
        "honours":          honours,
        "scars":            scars,
        "crusade_points":   int(f.get("CrusadePoints", len(honours) - len(scars)) or 0),
        "marked_for_greatness": bool(f.get("MarkedForGreatness", False)),
        "updated_at":       f.get("UpdatedAt"),
        "_record_id":       record["id"],
    }


# ─── Campaign API ───────────────────────────────────────────────────────────────

def list_campaigns(owner: str | None = None) -> list[dict]:
    """Return all campaigns (optionally filtered by owner), newest first."""
    table = _table(CAMPAIGNS_TABLE)
    records = table.all()
    campaigns = [_record_to_campaign(r) for r in records]
    if owner:
        campaigns = [c for c in campaigns if c["owner"] == owner]
    campaigns.sort(key=lambda c: c.get("created_at") or "", reverse=True)
    return campaigns


def get_campaign(campaign_id: str) -> dict | None:
    table = _table(CAMPAIGNS_TABLE)
    record = _find(table, "CampaignId", campaign_id)
    return _record_to_campaign(record) if record else None


def create_campaign(name: str, faction: str, rp: int = 5,
                    supply_limit: int = 1000, owner: str = "unknown") -> dict:
    table = _table(CAMPAIGNS_TABLE)
    campaign_id = _make_campaign_id(name)
    now = _now()
    table.create({
        "CampaignId":  campaign_id,
        "Name":        name,
        "Faction":     _slugify(faction),
        "RP":          int(rp),
        "SupplyLimit": int(supply_limit),
        "BattleCount": 0,
        "Wins":        0,
        "Losses":      0,
        "Draws":       0,
        "Owner":       owner,
        "CreatedAt":   now,
        "UpdatedAt":   now,
        "State":       "{}",
    })
    return get_campaign(campaign_id)


# Map internal dict keys → Airtable field names for partial updates.
_CAMPAIGN_FIELD_MAP = {
    "name": "Name", "faction": "Faction", "rp": "RP",
    "supply_limit": "SupplyLimit", "battle_count": "BattleCount",
    "wins": "Wins", "losses": "Losses", "draws": "Draws",
    "owner": "Owner", "state": "State",
}


def update_campaign(campaign_id: str, updates: dict) -> dict | None:
    table = _table(CAMPAIGNS_TABLE)
    record = _find(table, "CampaignId", campaign_id)
    if not record:
        return None
    fields = {}
    for key, value in updates.items():
        air = _CAMPAIGN_FIELD_MAP.get(key)
        if not air:
            continue
        if key == "state" and not isinstance(value, str):
            value = json.dumps(value)
        if key == "faction":
            value = _slugify(value)
        fields[air] = value
    fields["UpdatedAt"] = _now()
    table.update(record["id"], fields)
    return get_campaign(campaign_id)


def delete_campaign(campaign_id: str) -> bool:
    """Delete a campaign and all of its units."""
    table = _table(CAMPAIGNS_TABLE)
    record = _find(table, "CampaignId", campaign_id)
    if not record:
        return False
    # Cascade: remove the campaign's units first.
    units_table = _table(UNITS_TABLE)
    unit_records = units_table.all(formula=f"{{CampaignId}} = '{campaign_id}'")
    for ur in unit_records:
        units_table.delete(ur["id"])
    table.delete(record["id"])
    return True


# ─── Unit (Crusade Card) API ────────────────────────────────────────────────────

def list_units(campaign_id: str) -> list[dict]:
    table = _table(UNITS_TABLE)
    records = table.all(formula=f"{{CampaignId}} = '{campaign_id}'")
    units = [_record_to_unit(r) for r in records]
    units.sort(key=lambda u: (not u["is_leader"], u["unit_name"].lower()))
    return units


def get_unit(unit_id: str) -> dict | None:
    table = _table(UNITS_TABLE)
    record = _find(table, "UnitId", unit_id)
    return _record_to_unit(record) if record else None


def create_unit(campaign_id: str, unit_name: str, *, nickname: str = "",
                points: int = 0, models: int = 1, is_leader: bool = False,
                loadout: list | None = None) -> dict:
    table = _table(UNITS_TABLE)
    # Stable per-campaign index id: campaignId:N
    existing = table.all(formula=f"{{CampaignId}} = '{campaign_id}'")
    unit_id = f"{campaign_id}:{int(time.time() * 1000)}"
    now = _now()
    table.create({
        "UnitId":          unit_id,
        "CampaignId":      campaign_id,
        "UnitName":        unit_name,
        "Nickname":        nickname,
        "Points":          int(points),
        "Models":          int(models),
        "IsLeader":        bool(is_leader),
        "AttachedTo":      "",
        "Loadout":         json.dumps(loadout or []),
        "XP":              0,
        "Rank":            "Fresh",
        "BattlesFought":   0,
        "BattlesSurvived": 0,
        "EnemyKills":      0,
        "Honours":         "[]",
        "Scars":           "[]",
        "CrusadePoints":   0,
        "MarkedForGreatness": False,
        "UpdatedAt":       now,
    })
    return get_unit(unit_id)


_UNIT_FIELD_MAP = {
    "unit_name": "UnitName", "nickname": "Nickname", "points": "Points",
    "models": "Models", "is_leader": "IsLeader", "attached_to": "AttachedTo",
    "loadout": "Loadout", "xp": "XP", "rank": "Rank",
    "battles_fought": "BattlesFought", "battles_survived": "BattlesSurvived",
    "enemy_kills": "EnemyKills", "honours": "Honours", "scars": "Scars",
    "crusade_points": "CrusadePoints", "marked_for_greatness": "MarkedForGreatness",
}
_UNIT_JSON_FIELDS = {"loadout", "honours", "scars"}


def update_unit(unit_id: str, updates: dict) -> dict | None:
    table = _table(UNITS_TABLE)
    record = _find(table, "UnitId", unit_id)
    if not record:
        return None
    fields = {}
    for key, value in updates.items():
        air = _UNIT_FIELD_MAP.get(key)
        if not air:
            continue
        if key in _UNIT_JSON_FIELDS and not isinstance(value, str):
            value = json.dumps(value)
        fields[air] = value
    # Keep CrusadePoints derived from honours/scars when either changes.
    if "honours" in updates or "scars" in updates:
        merged = _record_to_unit(record)
        honours = updates.get("honours", merged["honours"])
        scars = updates.get("scars", merged["scars"])
        try:
            fields["CrusadePoints"] = len(honours) - len(scars)
        except TypeError:
            pass
    fields["UpdatedAt"] = _now()
    table.update(record["id"], fields)
    return get_unit(unit_id)


def delete_unit(unit_id: str) -> bool:
    table = _table(UNITS_TABLE)
    record = _find(table, "UnitId", unit_id)
    if not record:
        return False
    table.delete(record["id"])
    return True
