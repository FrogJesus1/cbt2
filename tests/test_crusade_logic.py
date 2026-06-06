"""
tests/test_crusade_logic.py

Pure-logic tests for the Crusade post-battle math (Session 4):
  - rank_for_xp        (CRUSADE_SPEC §3.1 thresholds)
  - compute_auto_xp    (CRUSADE_SPEC §3.2 XP awards)
  - promotion_slots    (rank tiers crossed → battle-honour slots, §3.5)

These functions are the canonical reference mirrored by lib/crusade.js, so the
PostBattleFlow preview matches what finalize_battle stores. No Airtable needed.

Run from the project root:
    python -m pytest tests/test_crusade_logic.py -v
    # or without pytest:
    python tests/test_crusade_logic.py
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))

import copy
import re

from render.web import crusade_store
from render.web.crusade_store import (
    rank_for_xp,
    compute_auto_xp,
    promotion_slots,
    RANK_THRESHOLDS,
    CAMPAIGNS_TABLE,
    UNITS_TABLE,
    BATTLES_TABLE,
)


# ── In-memory fake Airtable table (no network) ──────────────────────────────────

class _FakeTable:
    """Minimal stand-in for a pyairtable Table: all()/create()/update()/delete()
    over an in-memory record list, with `{Field} = 'value'` formula filtering.
    `fail_update_on` makes the Nth update() raise — to simulate a mid-transaction
    Airtable failure."""

    def __init__(self):
        self.records = []
        self._auto = 0
        self.update_calls = 0
        self.fail_update_on = None
        self.fail_next_create = False

    def all(self, formula=None):
        if not formula:
            return [copy.deepcopy(r) for r in self.records]
        m = re.match(r"\{(\w+)\}\s*=\s*'(.*)'$", formula)
        field = m.group(1)
        val = m.group(2).replace(r"\'", "'").replace("\\\\", "\\")
        return [copy.deepcopy(r) for r in self.records if r["fields"].get(field) == val]

    def create(self, fields):
        if self.fail_next_create:
            self.fail_next_create = False
            raise RuntimeError("simulated Airtable create failure")
        self._auto += 1
        rec = {"id": f"rec{self._auto}", "fields": dict(fields)}
        self.records.append(rec)
        return copy.deepcopy(rec)

    def update(self, rec_id, fields):
        self.update_calls += 1
        if self.fail_update_on and self.update_calls == self.fail_update_on:
            raise RuntimeError("simulated Airtable failure")
        for r in self.records:
            if r["id"] == rec_id:
                r["fields"].update(fields)
                return copy.deepcopy(r)
        raise KeyError(rec_id)

    def delete(self, rec_id):
        self.records = [r for r in self.records if r["id"] != rec_id]
        return True


def _patch_store():
    """Swap crusade_store._table for in-memory fakes. Returns (tables, restore)."""
    tables = {CAMPAIGNS_TABLE: _FakeTable(),
              UNITS_TABLE: _FakeTable(),
              BATTLES_TABLE: _FakeTable()}
    orig = crusade_store._table
    crusade_store._table = lambda name: tables[name]
    return tables, (lambda: setattr(crusade_store, "_table", orig))


# ── rank_for_xp ────────────────────────────────────────────────────────────────

def test_rank_thresholds_exact_boundaries():
    assert rank_for_xp(0) == "Fresh"
    assert rank_for_xp(5) == "Fresh"
    assert rank_for_xp(6) == "Blooded"
    assert rank_for_xp(15) == "Blooded"
    assert rank_for_xp(16) == "Battle-hardened"
    assert rank_for_xp(30) == "Battle-hardened"
    assert rank_for_xp(31) == "Heroic"
    assert rank_for_xp(50) == "Heroic"
    assert rank_for_xp(51) == "Legendary"
    assert rank_for_xp(999) == "Legendary"


def test_rank_for_xp_handles_none_and_negative():
    assert rank_for_xp(None) == "Fresh"
    assert rank_for_xp(-5) == "Fresh"


def test_rank_thresholds_match_spec():
    assert RANK_THRESHOLDS == [
        ("Fresh", 0), ("Blooded", 6), ("Battle-hardened", 16),
        ("Heroic", 31), ("Legendary", 51),
    ]


# ── compute_auto_xp (§3.2) ──────────────────────────────────────────────────────

def test_auto_xp_participation_only():
    # Lost, no kills, not marked → just the +1 for participating.
    assert compute_auto_xp(kills=0, won=False, marked=False) == 1


def test_auto_xp_win_bonus():
    assert compute_auto_xp(kills=0, won=True, marked=False) == 2


def test_auto_xp_one_kill():
    # participated +1, killed 1+ +1
    assert compute_auto_xp(kills=1, won=False, marked=False) == 2


def test_auto_xp_three_kills_gets_both_kill_bonuses():
    # participated +1, killed 1+ +1, killed 3+ +1
    assert compute_auto_xp(kills=3, won=False, marked=False) == 3


def test_auto_xp_marked_for_greatness():
    assert compute_auto_xp(kills=0, won=False, marked=True) == 2


def test_auto_xp_maximum_stack():
    # participated +1, won +1, killed 1+ +1, killed 3+ +1, marked +1 = 5
    assert compute_auto_xp(kills=5, won=True, marked=True) == 5


def test_auto_xp_agenda_passthrough():
    # Agenda XP deferred to Session 5; passed through for the manual override.
    assert compute_auto_xp(kills=0, won=False, marked=False, agenda=3) == 4


def test_auto_xp_two_kills_no_triple_bonus():
    # 2 kills earns the 1+ bonus but not the 3+ bonus.
    assert compute_auto_xp(kills=2, won=True, marked=False) == 3


# ── promotion_slots (§3.5) ────────────────────────────────────────────────────

def test_promotion_single_tier():
    # Fresh (5xp) gaining 3 → 8xp crosses into Blooded.
    assert promotion_slots(5, 8) == 1


def test_promotion_no_change():
    assert promotion_slots(6, 9) == 0      # both Blooded
    assert promotion_slots(0, 5) == 0      # both Fresh


def test_promotion_multiple_tiers():
    # Fresh (0) jumping to 31 crosses Blooded + Battle-hardened + Heroic = 3 tiers.
    assert promotion_slots(0, 31) == 3


def test_promotion_never_negative():
    # XP can't really drop, but the helper must not return a negative slot count.
    assert promotion_slots(20, 5) == 0


def test_promotion_to_legendary():
    # Heroic (31) → Legendary (51) is one tier.
    assert promotion_slots(31, 51) == 1


# ── finalize_battle idempotency + resumability (P1) ─────────────────────────────

def _setup_campaign(tables):
    import time
    campaign = crusade_store.create_campaign("Test", "tau", rp=5)
    units = []
    for i in range(3):
        units.append(crusade_store.create_unit(campaign["id"], f"Unit {i}"))
        time.sleep(0.002)  # unit ids are ms-timestamped — keep them distinct
    return campaign, units


def test_finalize_is_idempotent_on_retry():
    """A retry / double-submit with the same battle_token must be a no-op — XP and
    campaign counters apply exactly once."""
    tables, restore = _patch_store()
    try:
        campaign, units = _setup_campaign(tables)
        ur = [{"unit_id": u["id"], "kills": 0, "destroyed": False, "xp_gained": 2}
              for u in units]

        first = crusade_store.finalize_battle(
            campaign["id"], result="win", unit_results=ur, rp_gained=1, battle_token="T1")
        assert first is not None
        assert {u["xp"] for u in first["units"]} == {2}, "each unit gains 2 XP once"
        assert first["battle_count"] == 1 and first["rp"] == 6

        # Same token again → idempotent no-op.
        second = crusade_store.finalize_battle(
            campaign["id"], result="win", unit_results=ur, rp_gained=1, battle_token="T1")
        assert second.get("already_finalized") is True
        assert {u["xp"] for u in second["units"]} == {2}, "no double XP on retry"
        assert second["battle_count"] == 1 and second["rp"] == 6, "counters bumped once"
        assert len(tables[BATTLES_TABLE].records) == 1, "exactly one battle row"
    finally:
        restore()


def test_finalize_resumes_after_midloop_failure():
    """If a unit update fails mid-loop, a retry with the same token resumes — the
    already-applied unit must not be bumped twice."""
    tables, restore = _patch_store()
    try:
        campaign, units = _setup_campaign(tables)
        ur = [{"unit_id": u["id"], "kills": 0, "destroyed": False, "xp_gained": 2}
              for u in units]

        # Fail on the 2nd unit update (unit[0] applied, unit[1] raises).
        tables[UNITS_TABLE].fail_update_on = 2
        try:
            crusade_store.finalize_battle(
                campaign["id"], result="win", unit_results=ur, rp_gained=1, battle_token="T2")
            assert False, "expected the simulated failure to propagate"
        except RuntimeError:
            pass

        # Battle not written, campaign not bumped, but progress recorded.
        assert len(tables[BATTLES_TABLE].records) == 0
        assert crusade_store.get_campaign(campaign["id"])["battle_count"] == 0

        # Retry (failure cleared) → completes, each unit bumped exactly once.
        tables[UNITS_TABLE].fail_update_on = None
        done = crusade_store.finalize_battle(
            campaign["id"], result="win", unit_results=ur, rp_gained=1, battle_token="T2")
        xps = sorted(u["xp"] for u in done["units"])
        assert xps == [2, 2, 2], f"no double-bump after resume, got {xps}"
        assert done["battle_count"] == 1 and done["rp"] == 6
        assert len(tables[BATTLES_TABLE].records) == 1
    finally:
        restore()


def test_finalize_resumes_after_postloop_failure():
    """Regression: if the battle-row write (after the unit loop) fails, a retry
    with the same token must NOT re-bump the already-applied units."""
    tables, restore = _patch_store()
    try:
        campaign, units = _setup_campaign(tables)
        ur = [{"unit_id": u["id"], "kills": 0, "destroyed": False, "xp_gained": 2}
              for u in units]

        # Units all apply, then the CrusadeBattles create blows up.
        tables[BATTLES_TABLE].fail_next_create = True
        try:
            crusade_store.finalize_battle(
                campaign["id"], result="win", unit_results=ur, rp_gained=1, battle_token="T3")
            assert False, "expected the post-loop create failure to propagate"
        except RuntimeError:
            pass
        assert crusade_store.get_campaign(campaign["id"])["battle_count"] == 0

        # Retry → completes; units must still be at 2 XP, not 4.
        done = crusade_store.finalize_battle(
            campaign["id"], result="win", unit_results=ur, rp_gained=1, battle_token="T3")
        xps = sorted(u["xp"] for u in done["units"])
        assert xps == [2, 2, 2], f"post-loop retry double-applied XP: {xps}"
        assert done["battle_count"] == 1 and done["rp"] == 6
        assert len(tables[BATTLES_TABLE].records) == 1
    finally:
        restore()


# ── manual runner ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    failed = 0
    for fn in fns:
        try:
            fn()
            print(f"  ✓ {fn.__name__}")
        except AssertionError as e:
            failed += 1
            print(f"  ✗ {fn.__name__}  — {e}")
    total = len(fns)
    print(f"\n{total - failed}/{total} crusade-logic tests passed.")
    sys.exit(1 if failed else 0)
