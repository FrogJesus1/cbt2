"""
tests/test_loader_smoke.py

Smoke tests for the real-dossier data load (loader.py + engine wiring).

The math suite uses hand-built fixtures, so a regression in loader.py's parsing
of the actual parsed_dossier.json files passes every math test but breaks
production. These tests load ALL factions for real and assert the corpus is
present and correctly shaped — the cheapest insurance for the biggest untested
module.

Run from the project root:
    python -m pytest tests/test_loader_smoke.py -v
    # or without pytest:
    python tests/test_loader_smoke.py
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))

from data.combat_terminal.engine import CombatTerminalEngine


def _engine() -> CombatTerminalEngine:
    e = CombatTerminalEngine()
    e._loader._ensure_all_loaded()
    return e


def test_engine_reports_ready_with_data():
    e = _engine()
    st = e.status()
    assert st["ready"] is True, "engine must report ready once dossiers load"


def test_corpus_counts_are_substantial():
    """A healthy load has the full corpus — guards against an empty/partial load
    silently reporting success (the P0-1 failure mode)."""
    s = _engine().status()["summary"]
    assert s["factions"] >= 25, f"expected ~29 factions, got {s['factions']}"
    assert s["total_units"] >= 1000, f"expected 1000+ units, got {s['total_units']}"
    assert s["stratagems"] >= 500, f"expected 500+ stratagems, got {s['stratagems']}"
    assert s["enhancements"] >= 300, f"expected 300+ enhancements, got {s['enhancements']}"
    assert s["abilities"] >= 500, f"expected 500+ abilities, got {s['abilities']}"
    assert s["missions"] >= 1, "missions must load"


def test_every_faction_has_units():
    per_faction = _engine().status()["per_faction"]
    assert len(per_faction) >= 25
    empty = [f for f, n in per_faction.items() if not n]
    assert not empty, f"these factions loaded zero units: {empty}"


def test_get_faction_units_returns_full_roster():
    """get_faction_units returns (name, units); the unit list must be the full
    faction roster, not a truncated slice."""
    name, units = _engine()._loader.get_faction_units("space marines")
    assert name, "Space Marines should resolve"
    assert len(units) >= 100, f"expected the full SM roster, got {len(units)} units"


def test_known_unit_shape_intercessor():
    u = _engine()._loader.get_unit("intercessor squad")
    assert u is not None, "Intercessor Squad should resolve"
    assert not u.get("_stub"), "must be a real unit, not a fabricated stub"
    assert "INTERCESSOR" in str(u.get("name", "")).upper()
    # Top-level stat keys must be populated (the 2026-03-22 normalisation fix)
    assert u.get("T") and u.get("Sv") and u.get("W"), f"missing stats: {u.get('T')}/{u.get('Sv')}/{u.get('W')}"
    assert u.get("weapons"), "unit must carry weapon profiles"


def test_known_unit_shape_cross_faction():
    """A unit from a different faction also resolves with weapons (guards against
    a single-faction load masquerading as a full one)."""
    u = _engine()._loader.get_unit("hive tyrant")
    assert u is not None and not u.get("_stub")
    assert u.get("weapons"), "Hive Tyrant must carry weapons"


def test_unknown_unit_returns_none_not_stub():
    """The anti-fabrication guarantee (P0-1): when data IS loaded, a bogus name
    must return None — never a plausible-but-wrong fabricated unit."""
    u = _engine()._loader.get_unit("zzz not a real unit name")
    assert u is None, f"bogus lookup must be None, got {u!r}"


# ── self-runner (mirrors the other suites) ──────────────────────────────────────

def _run_all() -> None:
    import traceback
    tests = [v for k, v in sorted(globals().items())
             if k.startswith("test_") and callable(v)]
    passed = failed = 0
    for t in tests:
        try:
            t()
            print(f"  ✓  {t.__name__}")
            passed += 1
        except Exception as e:
            print(f"  ✗  {t.__name__}: {e}")
            traceback.print_exc()
            failed += 1
    print(f"\n{passed} passed, {failed} failed")
    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    print("\nCombat Terminal — Loader Smoke Tests")
    print("─" * 60)
    _run_all()
