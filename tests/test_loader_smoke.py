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


def test_parse_failure_does_not_mark_faction_loaded():
    """P1: a dossier that fails to parse must NOT be marked loaded — otherwise it
    is permanently empty and never retried. It should log an error and stay
    retryable (so a later, fixed file loads)."""
    import json
    import tempfile
    from data.combat_terminal.loader import CombatTerminalLoader

    ldr = CombatTerminalLoader()
    ldr.load()  # discover real factions
    with tempfile.TemporaryDirectory() as d:
        broken = Path(d) / "broken_parsed_dossier.json"
        broken.write_text("{ this is not valid json ")
        ldr._faction_dossier_paths["__broken__"] = broken

        ldr._load_faction("__broken__")
        assert "__broken__" not in ldr._loaded_factions, \
            "a parse failure must not mark the faction loaded"
        assert any("__broken__" in e for e in ldr._errors), "the failure must be logged"

        # Repeated access shouldn't spam the log (deduped) ...
        ldr._load_faction("__broken__")
        assert sum("__broken__" in e for e in ldr._errors) == 1, "error must be deduped"

        # ... and once the file is valid, a retry succeeds (it was never marked).
        broken.write_text(json.dumps({"units": [{"name": "TEST UNIT", "stats": {}}]}))
        ldr._load_faction("__broken__")
        assert "__broken__" in ldr._loaded_factions, "a fixed dossier must load on retry"


def test_parse_min_models_scales_non_bulleted_squads():
    """P1 squad-size parse: many dossiers list models on plain (non-bulleted)
    lines. The old ■-only parser scaled a 10-model squad as 1 model. The parser
    must read counts regardless of bullet while excluding points/equipment rows,
    and not over-count lower-case weapon options."""
    from data.combat_terminal.engine import _parse_min_models
    intercessor = ["1 Intercessor Sergeant", "4-9 Intercessors",
                   "Every model is equipped with: bolt pistol; bolt rifle.",
                   "5 models\t80", "10 models\t160"]
    assert _parse_min_models(intercessor) == 5
    blood_claws = ["1 Blood Claw Pack Leader", "9-19 Blood Claws",
                   "Every model is equipped with: bolt pistol.", "10 models\t135"]
    assert _parse_min_models(blood_claws) == 10
    # Weapon options ("1 killkannon") are lower-case → must NOT be counted as models.
    battlewagon = ["This model can be equipped with one of the following: ■ 1 Battlewagon",
                   "1 kannon This model is equipped with: tracks.", "1 killkannon", "1 zzap gun"]
    assert _parse_min_models(battlewagon) == 1
    assert _parse_min_models([]) == 1  # always at least 1


def test_coerce_models_never_crashes_on_junk():
    """P1: roster `models` values can be junk ("3+", null, "10 models", floats).
    _coerce_models must never raise and must fall back sensibly."""
    from data.combat_terminal.engine import _coerce_models
    assert _coerce_models("3+", 1) == 3
    assert _coerce_models("10 models", 1) == 10
    assert _coerce_models(None, 7) == 7
    assert _coerce_models("", 4) == 4
    assert _coerce_models("garbage", 2) == 2
    assert _coerce_models(5, 1) == 5
    assert _coerce_models(3.0, 1) == 3
    assert _coerce_models(0, 9) == 9          # non-positive → fallback
    assert _coerce_models(True, 6) == 6       # bool excluded


def test_size_range_parser():
    """The dossier encodes a legal model-count range; _parse_size_range must read
    both ends and stay consistent with _parse_min_models (the min)."""
    from data.combat_terminal.engine import _parse_size_range, _parse_min_models
    assert _parse_size_range(["None ■ 10-20 Kroot Carnivores"]) == (10, 20)
    assert _parse_size_range(["1 Intercessor Sergeant", "4-9 Intercessors"]) == (5, 10)
    assert _parse_size_range(["1 Apothecary"]) == (1, 1)
    assert _parse_size_range([]) == (1, 1)
    # min half must equal the standalone min parser, always.
    for comp in (["None ■ 10-20 Kroot Carnivores"],
                 ["1 Blood Claw Pack Leader", "9-19 Blood Claws"],
                 ["1 Apothecary"]):
        assert _parse_size_range(comp)[0] == _parse_min_models(comp)


def test_size_flag_detection():
    """--n/--models tokens are recognised; real modifier flags are not."""
    from data.combat_terminal.engine import _size_flag_value, _extract_size_flags
    assert _size_flag_value("n20") == 20
    assert _size_flag_value("n:20") == 20
    assert _size_flag_value("models10") == 10
    assert _size_flag_value("models:10") == 10
    # Must NOT collide with real flags.
    for f in ("nocover", "ml", "lethal", "invuln4", "n", "n0"):
        assert _size_flag_value(f) is None, f"{f} wrongly read as a size flag"
    override, rest = _extract_size_flags(["lethal", "n20", "cover"])
    assert override == 20 and rest == ["lethal", "cover"]


def test_n_override_beats_roster_and_dossier():
    """Explicit --n wins over a loaded roster size, which wins over dossier min."""
    e = _engine()
    e.set_session("size")
    e.sync_roster_context({"my_units": [{"name": "kroot carnivores", "models": 10}]})
    # roster size (10) used when no override
    d = e.exec("kroot carnivores vs intercessors")["data"]
    assert d["att_models"] == 10 and d["att_models_assumed"] is False
    # explicit override (20) beats the roster
    d = e.exec("kroot carnivores --n20 vs intercessors")["data"]
    assert d["att_models"] == 20 and d["att_models_override"] == 20
    # the size token never leaks into the modifier flags
    assert all("n20" not in f for f in d["attacker_flags"])


def test_n_override_persists_through_rerun_and_warns_out_of_range():
    e = _engine()
    e.set_session("size2")
    e.exec("kroot carnivores --n30 vs intercessors")
    d = e.exec("rerun")["data"]
    assert d["att_models"] == 30, "rerun must keep the chosen size"
    texts = " ".join(n.get("text", "") for n in (d.get("flag_notes") or []))
    assert "outside" in texts and "10–20" in texts, "out-of-range override must warn"


def test_legend_covers_every_registry_flag():
    """Legend dedup (#3): the `legend` command's modifier-flag rows are generated
    from flags.FLAG_SPECS, so every registry flag must appear in the legend
    output — no flag can have a math effect with no documented entry."""
    from data.combat_terminal import flags as _flags
    legend = _engine()._query_legend({})["data"]
    shown = {row["flag"].lstrip("-").lower()
             for row in legend["offensive_modifier_flags"] + legend["defensive_modifier_flags"]}
    for spec in _flags.FLAG_SPECS:
        assert spec["base"] in shown, f"flag '{spec['base']}' missing from legend output"
    # Defensive/offensive split must match the registry classification.
    off = {r["flag"].lstrip("-") for r in legend["offensive_modifier_flags"]}
    deff = {r["flag"].lstrip("-") for r in legend["defensive_modifier_flags"]}
    assert "cover" in deff and "cover" not in off
    assert "lethal" in off and "lethal" not in deff


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
