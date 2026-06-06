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
BATTLES_TABLE = "CrusadeBattles"


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
    BATTLES_TABLE: [
        {"name": "BattleId", "type": "singleLineText"},
        {"name": "CampaignId", "type": "singleLineText"},
        {"name": "Mission", "type": "singleLineText"},
        {"name": "PointLimit", "type": "number", "options": {"precision": 0}},
        {"name": "Result", "type": "singleLineText"},
        {"name": "RPGained", "type": "number", "options": {"precision": 0}},
        {"name": "UnitResults", "type": "multilineText"},
        {"name": "Notes", "type": "multilineText"},
        {"name": "PlayedAt", "type": "singleLineText"},
    ],
}

RANKS = ["Fresh", "Blooded", "Battle-hardened", "Heroic", "Legendary"]

# XP floor for each rank (CRUSADE_SPEC §3.1). Single source of truth shared by
# the post-battle promotion logic; the frontend mirrors this in lib/crusade.js.
RANK_THRESHOLDS = [
    ("Fresh", 0),
    ("Blooded", 6),
    ("Battle-hardened", 16),
    ("Heroic", 31),
    ("Legendary", 51),
]


def rank_for_xp(xp: int) -> str:
    """Highest rank whose XP threshold is met by ``xp`` (CRUSADE_SPEC §3.1)."""
    x = int(xp or 0)
    rank = RANK_THRESHOLDS[0][0]
    for name, floor in RANK_THRESHOLDS:
        if x >= floor:
            rank = name
    return rank


def _rank_index(rank: str) -> int:
    for i, (name, _) in enumerate(RANK_THRESHOLDS):
        if name == rank:
            return i
    return 0


def compute_auto_xp(*, kills: int = 0, won: bool = False,
                    marked: bool = False, agenda: int = 0) -> int:
    """Auto-calculated XP for a unit that fought in a battle (CRUSADE_SPEC §3.2).

      +1 participated (always — the unit was mustered)
      +1 on the winning side
      +1 destroyed 1+ enemy unit
      +1 destroyed 3+ enemy units (bonus)
      +1 marked for greatness
      +agenda (deferred to Session 5; passed through for the manual override)
    """
    xp = 1  # participated
    if won:
        xp += 1
    if int(kills or 0) >= 1:
        xp += 1
    if int(kills or 0) >= 3:
        xp += 1
    if marked:
        xp += 1
    xp += int(agenda or 0)
    return xp


def promotion_slots(old_xp: int, new_xp: int) -> int:
    """Number of rank tiers crossed going from ``old_xp`` to ``new_xp``.

    Each crossed tier grants one battle-honour slot (CRUSADE_SPEC §3.5).
    """
    return max(0, _rank_index(rank_for_xp(new_xp)) - _rank_index(rank_for_xp(old_xp)))


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


def _escape_formula_value(value: str) -> str:
    """Escape a value for safe interpolation into an Airtable formula literal.

    Formula string literals are single-quoted, so an unescaped quote/backslash in
    user-influenced input would break out of the literal (formula injection).
    """
    return str(value).replace("\\", "\\\\").replace("'", r"\'")


def _eq_formula(field: str, value: str) -> str:
    """Build a safe ``{Field} = 'value'`` equality formula."""
    return f"{{{field}}} = '{_escape_formula_value(value)}'"


def _find(table, field: str, value: str) -> dict | None:
    records = table.all(formula=_eq_formula(field, value))
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
    unit_records = units_table.all(formula=_eq_formula("CampaignId", campaign_id))
    for ur in unit_records:
        units_table.delete(ur["id"])
    table.delete(record["id"])
    return True


# ─── Unit (Crusade Card) API ────────────────────────────────────────────────────

def list_units(campaign_id: str) -> list[dict]:
    table = _table(UNITS_TABLE)
    records = table.all(formula=_eq_formula("CampaignId", campaign_id))
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
    existing = table.all(formula=_eq_formula("CampaignId", campaign_id))
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


# ─── Battle (history) API ───────────────────────────────────────────────────────

def _record_to_battle(record: dict) -> dict:
    f = record["fields"]
    return {
        "id":           f.get("BattleId", ""),
        "campaign_id":  f.get("CampaignId", ""),
        "mission":      f.get("Mission", ""),
        "point_limit":  int(f.get("PointLimit", 0) or 0),
        "result":       f.get("Result", ""),
        "rp_gained":    int(f.get("RPGained", 0) or 0),
        "unit_results": _loads(f.get("UnitResults"), []),
        "notes":        f.get("Notes", ""),
        "played_at":    f.get("PlayedAt"),
        "_record_id":   record["id"],
    }


def create_battle(campaign_id: str, *, mission: str = "", point_limit: int = 0,
                  result: str = "", rp_gained: int = 0,
                  unit_results: list | None = None, notes: str = "",
                  played_at: str | None = None, battle_id: str | None = None) -> dict:
    table = _table(BATTLES_TABLE)
    played = played_at or _now()
    if battle_id is None:
        battle_id = f"{campaign_id}:battle:{int(time.time() * 1000)}"
    table.create({
        "BattleId":     battle_id,
        "CampaignId":   campaign_id,
        "Mission":      mission,
        "PointLimit":   int(point_limit or 0),
        "Result":       result,
        "RPGained":     int(rp_gained or 0),
        "UnitResults":  json.dumps(unit_results or []),
        "Notes":        notes or "",
        "PlayedAt":     played,
    })
    record = _find(table, "BattleId", battle_id)
    return _record_to_battle(record) if record else None


def list_battles(campaign_id: str) -> list[dict]:
    """Return a campaign's battles, newest first."""
    table = _table(BATTLES_TABLE)
    records = table.all(formula=_eq_formula("CampaignId", campaign_id))
    battles = [_record_to_battle(r) for r in records]
    battles.sort(key=lambda b: b.get("played_at") or "", reverse=True)
    return battles


# ─── Post-battle finalize transaction (CRUSADE_SPEC §5 / Phase 5) ────────────────

def finalize_battle(campaign_id: str, *, result: str, mission: str = "",
                    point_limit: int = 0, unit_results: list | None = None,
                    notes: str = "", rp_gained: int = 1,
                    battle_token: str | None = None) -> dict | None:
    """Resolve a battle, idempotently and resumably.

    For each entry in ``unit_results`` (``[{unit_id, kills, destroyed,
    xp_gained, scars?, honours?}]``):
      • add ``xp_gained`` to the unit's XP and re-derive its rank,
      • append any newly chosen scars / honours,
      • bump battles fought (+1), battles survived (+1 unless destroyed),
        lifetime kills, and clear marked-for-greatness.
    Then write one CrusadeBattles row, bump the campaign's RP / W-L-D /
    battle count, and clear ``state.active_battle``.

    True atomicity isn't available over Airtable's REST API, so this is made
    **idempotent + resumable** instead (the failure mode the old version had:
    30+ sequential writes with no rollback double-applied XP on a retry):

      • ``battle_token`` identifies this finalize. A token that has already been
        fully finalized returns the campaign unchanged (safe to retry / handles
        double-submits).
      • Each unit's id is recorded in campaign State as it's applied. A retry
        with the same token skips already-applied units, so a mid-loop failure
        resumes instead of re-bumping.
      • The battle row is keyed by the token, so a retry won't write a duplicate.

    Returns the refreshed campaign (with units), or ``None`` if it's missing.
    """
    campaign = get_campaign(campaign_id)
    if not campaign:
        return None

    state = dict(campaign.get("state") or {})
    token = battle_token or f"{campaign_id}:{int(time.time() * 1000)}"
    battle_row_id = f"{campaign_id}:battle:{token}"
    finalized = list(state.get("_finalized_battles") or [])

    # Already finalized → no-op (idempotent). Return current state.
    if token in finalized:
        done = get_campaign(campaign_id)
        if done is not None:
            done["units"] = list_units(campaign_id)
            done["already_finalized"] = True
        return done

    progress = dict((state.get("_finalize_progress") or {}).get(token) or {})
    applied = set(progress.get("applied_unit_ids") or [])

    result = (result or "").lower()
    summary = []

    def _persist_progress():
        prog = dict(state.get("_finalize_progress") or {})
        prog[token] = {"applied_unit_ids": sorted(applied)}
        state["_finalize_progress"] = prog
        update_campaign(campaign_id, {"state": state})

    try:
        for ur in (unit_results or []):
            uid = ur.get("unit_id", "")
            unit = get_unit(uid)
            if not unit:
                continue
            xp_gained = int(ur.get("xp_gained", 0) or 0)
            destroyed = bool(ur.get("destroyed"))
            kills = int(ur.get("kills", 0) or 0)
            new_honours = ur.get("honours") or []
            new_scars = ur.get("scars") or []
            old_xp = int(unit.get("xp", 0) or 0)

            if uid in applied:
                # Already applied on a prior attempt — don't double-bump. Rebuild
                # the summary line from the unit's persisted (post-apply) state.
                cur_xp = old_xp
                summary.append({
                    "unit_id":   unit["id"],
                    "unit_name": unit.get("nickname") or unit.get("unit_name", ""),
                    "kills":     kills,
                    "destroyed": destroyed,
                    "xp_gained": xp_gained,
                    "new_xp":    cur_xp,
                    "new_rank":  rank_for_xp(cur_xp),
                    "promoted":  False,
                    "scars":     new_scars,
                    "honours":   new_honours,
                    "resumed":   True,
                })
                continue

            new_xp = old_xp + xp_gained
            old_rank = rank_for_xp(old_xp)
            new_rank = rank_for_xp(new_xp)

            update_unit(unit["id"], {
                "xp":               new_xp,
                "rank":             new_rank,
                "honours":          (unit.get("honours") or []) + new_honours,
                "scars":            (unit.get("scars") or []) + new_scars,
                "battles_fought":   int(unit.get("battles_fought", 0) or 0) + 1,
                "battles_survived": int(unit.get("battles_survived", 0) or 0) + (0 if destroyed else 1),
                "enemy_kills":      int(unit.get("enemy_kills", 0) or 0) + kills,
                "marked_for_greatness": False,
            })
            applied.add(uid)

            summary.append({
                "unit_id":    unit["id"],
                "unit_name":  unit.get("nickname") or unit.get("unit_name", ""),
                "kills":      kills,
                "destroyed":  destroyed,
                "xp_gained":  xp_gained,
                "new_xp":     new_xp,
                "new_rank":   new_rank,
                "promoted":   new_rank != old_rank,
                "scars":      new_scars,
                "honours":    new_honours,
            })
    except Exception:
        # Save how far we got so a retry with the same token resumes rather than
        # re-applying. Best-effort persistence, then re-raise (route → 503).
        try:
            _persist_progress()
        except Exception:
            pass
        raise

    # Persist the fully-applied unit set BEFORE the battle-row write + campaign
    # bump. Those are two more network calls; if either fails, a retry with the
    # same token must still skip the already-bumped units (otherwise XP is applied
    # twice). The battle row is token-keyed (idempotent) and the campaign bump
    # reads a fresh snapshot, so persisting `applied` here closes the post-loop
    # double-apply window.
    _persist_progress()

    # All units applied. Write the battle row keyed by the token (skip if a prior
    # attempt already wrote it) and bump the campaign exactly once.
    battle = None
    if _find(_table(BATTLES_TABLE), "BattleId", battle_row_id) is None:
        battle = create_battle(
            campaign_id, mission=mission, point_limit=point_limit, result=result,
            rp_gained=rp_gained, unit_results=summary, notes=notes,
            battle_id=battle_row_id)

    # Mark finalized, clear progress + active battle, bump campaign counters.
    finalized.append(token)
    state["_finalized_battles"] = finalized[-50:]   # cap retained history
    prog = dict(state.get("_finalize_progress") or {})
    prog.pop(token, None)
    state["_finalize_progress"] = prog
    state.pop("active_battle", None)
    update_campaign(campaign_id, {
        "rp":           int(campaign.get("rp", 0) or 0) + int(rp_gained or 0),
        "battle_count": int(campaign.get("battle_count", 0) or 0) + 1,
        "wins":         int(campaign.get("wins", 0) or 0) + (1 if result == "win" else 0),
        "losses":       int(campaign.get("losses", 0) or 0) + (1 if result == "loss" else 0),
        "draws":        int(campaign.get("draws", 0) or 0) + (1 if result == "draw" else 0),
        "state":        state,
    })

    refreshed = get_campaign(campaign_id)
    if refreshed is not None:
        refreshed["units"] = list_units(campaign_id)
        refreshed["last_battle"] = battle
    return refreshed
