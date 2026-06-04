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

from render.web.crusade_store import (
    rank_for_xp,
    compute_auto_xp,
    promotion_slots,
    RANK_THRESHOLDS,
)


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
