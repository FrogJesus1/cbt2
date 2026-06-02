"""
tests/test_combat_math.py

Automated tests for:
  - Modifier application (every flag type)
  - Multi-model unit attack scaling
  - Special weapon types (torrent, lance, blast, devastating, lethal, twin-linked, sustained)
  - Unit vs unit combat math integrity

Run from the project root:
    python -m pytest tests/test_combat_math.py -v
    # or without pytest:
    python tests/test_combat_math.py
"""

from __future__ import annotations

import sys
import math
from pathlib import Path

# ── Path setup ────────────────────────────────────────────────────────────────
ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))

from data.combat_terminal.combat_math_engine import (
    AttackModifiers,
    AttackResult,
    TargetProfile,
    WeaponProfile,
    compute_attack_result,
    monte_carlo_attack,
    wound_target,
    compute_save_target,
)
from data.combat_terminal.math_adapter import (
    _apply_flags,
    _weapon_to_profile,
    _unit_to_target,
    compute_combat,
    compute_sensitivity,
    _merge_mods,
)

# ─────────────────────────────────────────────────────────────────────────────
# Fixtures
# ─────────────────────────────────────────────────────────────────────────────

def _make_weapon(
    name="Test Rifle", attacks="2", bs="4+", s=4, ap=0, damage=1, d=None,
    keywords=None, w_type="ranged", no_multiply=False,
) -> dict:
    if d is not None:
        damage = d
    return {
        "name": name, "type": w_type, "range": '24"',
        "a": attacks, "bs_ws": bs, "s": str(s), "ap": str(-ap),
        "d": str(damage), "keywords": keywords or [],
        "_no_multiply": no_multiply,
    }


def _make_unit(name="Test Unit", weapons=None, t=4, sv=3, w=1, composition=None) -> dict:
    return {
        "name": name,
        "T": t, "Sv": sv, "W": w,
        "weapons": weapons or [],
        "abilities": [],
        "unit_composition": composition or [f"\u25a0 1 {name}"],
    }


def _make_target(name="Target", t=4, sv=3, w=1, invuln=None, models=1) -> TargetProfile:
    return TargetProfile(
        name=name, toughness=t, save=sv, invulnerable_save=invuln,
        wounds=w, models=models,
    )


# ─────────────────────────────────────────────────────────────────────────────
# 1. Core math engine — baseline sanity
# ─────────────────────────────────────────────────────────────────────────────

class TestBaselineMath:
    """Verify fundamental EV calculations are correct."""

    def test_wound_target_lookup(self):
        assert wound_target(4, 4) == 4   # S == T → 4+
        assert wound_target(5, 4) == 3   # S >  T → 3+
        assert wound_target(3, 4) == 5   # S <  T → 5+
        assert wound_target(8, 4) == 2   # S ≥ 2T → 2+
        assert wound_target(2, 5) == 6   # 2S ≤ T → 6+

    def test_bs4_vs_sv3_no_ap(self):
        """BS4+, S4 vs T4 Sv3+, no AP, 1 attack → EV = 1 * 0.5 * 0.5 * (1-0.5) * 1"""
        wp = WeaponProfile("Rifle", attacks=1, skill=4, strength=4, ap=0, damage=1)
        tgt = _make_target(t=4, sv=3)
        r = compute_attack_result(wp, tgt)
        # hit 3/6, wound 3/6, save fails (3+0=3, need 3+ → p_save=4/6, fail=2/6≈0.333)
        # EV = 1 × (3/6) × (3/6) × (2/6) ≈ 0.0833
        # Actually: sv3+ means fail on 1,2 → p_fail=2/6=0.333
        # EV = 0.5 × 0.5 × 0.333 = 0.0833
        assert abs(r.expected_damage - 0.0833) < 0.005, f"Expected ~0.083, got {r.expected_damage}"

    def test_ap2_reduces_save(self):
        """AP-2 vs Sv3+ → effective save = 5+, harder to save → more damage."""
        wp_no_ap = WeaponProfile("No AP",   attacks=1, skill=3, strength=4, ap=0, damage=1)
        wp_ap2   = WeaponProfile("AP -2",   attacks=1, skill=3, strength=4, ap=2, damage=1)
        tgt = _make_target(t=4, sv=3)
        r_no = compute_attack_result(wp_no_ap, tgt)
        r_ap = compute_attack_result(wp_ap2,   tgt)
        assert r_ap.expected_damage > r_no.expected_damage, \
            "AP-2 weapon should deal more damage than no-AP weapon"

    def test_invuln_beats_heavy_ap(self):
        """Invuln 4+ trumps AP-5 (would otherwise need 8+ armour → no save)."""
        wp = WeaponProfile("Railgun", attacks=1, skill=4, strength=9, ap=5, damage=3)
        tgt_no_inv = _make_target(t=5, sv=3, invuln=None)
        tgt_inv4   = _make_target(t=5, sv=3, invuln=4)
        r_no  = compute_attack_result(wp, tgt_no_inv)
        r_inv = compute_attack_result(wp, tgt_inv4)
        assert r_inv.expected_damage < r_no.expected_damage, \
            "Target with invuln 4+ should take less damage than one with no invuln"

    def test_cover_increases_save(self):
        """Cover (+1 save) should reduce damage against armoured targets."""
        wp  = WeaponProfile("Bolter", attacks=2, skill=3, strength=4, ap=0, damage=1)
        tgt_open  = _make_target(t=4, sv=3)
        tgt_cover = _make_target(t=4, sv=3)
        tgt_cover.cover = True
        r_open  = compute_attack_result(wp, tgt_open)
        r_cover = compute_attack_result(wp, tgt_cover)
        assert r_cover.expected_damage < r_open.expected_damage, \
            "Cover should reduce damage"


# ─────────────────────────────────────────────────────────────────────────────
# 2. Modifier flags via _apply_flags
# ─────────────────────────────────────────────────────────────────────────────

class TestApplyFlags:
    """Verify _apply_flags correctly mutates AttackModifiers and TargetProfile."""

    def _fresh(self):
        return AttackModifiers(), _make_target()

    def test_ml_flag(self):
        mods, tgt = self._fresh()
        mods, tgt = _apply_flags(["ml"], mods, tgt)
        assert mods.use_markerlights is True

    def test_cover_flag(self):
        mods, tgt = self._fresh()
        mods, tgt = _apply_flags(["cover"], mods, tgt)
        assert tgt.cover is True

    def test_invuln_flag(self):
        mods, tgt = self._fresh()
        mods, tgt = _apply_flags(["invuln:4"], mods, tgt)
        assert tgt.invulnerable_save == 4

    def test_ea_flag_bare(self):
        mods, tgt = self._fresh()
        mods, tgt = _apply_flags(["ea1"], mods, tgt)
        assert mods.extra_attacks == 1.0

    def test_ea_flag_colon(self):
        mods, tgt = self._fresh()
        mods, tgt = _apply_flags(["ea:3"], mods, tgt)
        assert mods.extra_attacks == 3.0

    def test_lethal_flag(self):
        mods, tgt = self._fresh()
        mods, tgt = _apply_flags(["lethal"], mods, tgt)
        assert mods.lethal_hits is True

    def test_twin_flag(self):
        mods, tgt = self._fresh()
        mods, tgt = _apply_flags(["twin"], mods, tgt)
        assert mods.reroll_wounds == "failed"

    def test_sustained_bare_flag(self):
        mods, tgt = self._fresh()
        mods, tgt = _apply_flags(["sustained"], mods, tgt)
        assert mods.sustained_hits == 1

    def test_sustained1_flag(self):
        mods, tgt = self._fresh()
        mods, tgt = _apply_flags(["sustained1"], mods, tgt)
        assert mods.sustained_hits == 1

    def test_sustained_colon_flag(self):
        mods, tgt = self._fresh()
        mods, tgt = _apply_flags(["sustained:2"], mods, tgt)
        assert mods.sustained_hits == 2

    def test_dev_flag(self):
        mods, tgt = self._fresh()
        mods, tgt = _apply_flags(["dev"], mods, tgt)
        assert mods.devastating_wounds is True

    def test_devastating_flag(self):
        mods, tgt = self._fresh()
        mods, tgt = _apply_flags(["devastating"], mods, tgt)
        assert mods.devastating_wounds is True

    def test_blast_flag(self):
        mods, tgt = self._fresh()
        mods, tgt = _apply_flags(["blast"], mods, tgt)
        assert mods.use_blast is True

    def test_rf_flag(self):
        mods, tgt = self._fresh()
        mods, tgt = _apply_flags(["rf"], mods, tgt)
        assert mods.use_rapid_fire is True

    def test_torrent_flag(self):
        mods, tgt = self._fresh()
        mods, tgt = _apply_flags(["torrent"], mods, tgt)
        assert mods.use_torrent is True

    def test_lance_flag(self):
        mods, tgt = self._fresh()
        mods, tgt = _apply_flags(["lance"], mods, tgt)
        assert mods.wound_bonus >= 1

    def test_fnp_flag(self):
        mods, tgt = self._fresh()
        mods, tgt = _apply_flags(["fnp:6"], mods, tgt)
        assert tgt.feel_no_pain == 6

    def test_dmgplus_flag(self):
        mods, tgt = self._fresh()
        mods, tgt = _apply_flags(["dmgplus:2"], mods, tgt)
        assert mods.flat_damage_bonus == 2.0

    def test_combined_flags(self):
        mods, tgt = self._fresh()
        mods, tgt = _apply_flags(["ml", "lethal", "twin", "sustained1", "cover"], mods, tgt)
        assert mods.use_markerlights is True
        assert mods.lethal_hits is True
        assert mods.reroll_wounds == "failed"
        assert mods.sustained_hits == 1
        assert tgt.cover is True

    def test_unknown_flags_ignored(self):
        """Unknown flags must not raise an exception."""
        mods, tgt = self._fresh()
        mods, tgt = _apply_flags(["bogus_flag", "xyzzy:99"], mods, tgt)
        # Should arrive here without error; modifiers stay at defaults
        assert mods.lethal_hits is False


# ─────────────────────────────────────────────────────────────────────────────
# 3. Modifier math effects
# ─────────────────────────────────────────────────────────────────────────────

class TestModifierMathEffects:
    """Verify each modifier flag actually changes computed damage."""

    BASE_WEAPON = WeaponProfile("Base", attacks=6, skill=4, strength=4, ap=0, damage=1)
    BASE_TARGET = TargetProfile("Target", toughness=4, save=4, invulnerable_save=None, wounds=1)

    def _dmg(self, mods=None) -> float:
        return compute_attack_result(self.BASE_WEAPON, self.BASE_TARGET, mods).expected_damage

    def test_markerlights_increase_damage(self):
        baseline = self._dmg()
        with_ml  = self._dmg(AttackModifiers(use_markerlights=True))
        assert with_ml > baseline, "Markerlights should increase damage"

    def test_lethal_hits_increase_damage(self):
        """Lethal Hits auto-wounds on 6s, bypassing the wound roll."""
        baseline = self._dmg()
        with_lh  = self._dmg(AttackModifiers(lethal_hits=True))
        assert with_lh > baseline, "Lethal Hits should increase damage"

    def test_twin_linked_increases_damage(self):
        baseline = self._dmg()
        with_tw  = self._dmg(AttackModifiers(reroll_wounds="failed"))
        assert with_tw > baseline, "Twin-linked reroll wounds should increase damage"

    def test_sustained_hits_increases_damage(self):
        baseline = self._dmg()
        with_sh  = self._dmg(AttackModifiers(sustained_hits=1))
        assert with_sh > baseline, "Sustained Hits should increase damage via extra hits on crits"

    def test_devastating_wounds_increases_damage_vs_good_save(self):
        """Devastating Wounds bypass saves → more damage vs heavily armoured targets."""
        tgt = TargetProfile("Heavy", toughness=4, save=2, invulnerable_save=None, wounds=1)
        base = compute_attack_result(self.BASE_WEAPON, tgt).expected_damage
        dw   = compute_attack_result(self.BASE_WEAPON, tgt, AttackModifiers(devastating_wounds=True)).expected_damage
        assert dw > base, "Devastating Wounds should increase damage vs strong save target"

    def test_extra_attacks_scale_linearly(self):
        """Adding N extra attacks should scale damage proportionally."""
        r0 = compute_attack_result(self.BASE_WEAPON, self.BASE_TARGET).expected_damage
        r2 = compute_attack_result(
            self.BASE_WEAPON, self.BASE_TARGET,
            AttackModifiers(extra_attacks=6),
        ).expected_damage
        # With 6 + 6 = 12 attacks, damage should be ~2× (within 5%)
        assert abs(r2 / r0 - 2.0) < 0.05, f"Expected ~2× damage, got {r2/r0:.3f}×"

    def test_cover_reduces_damage(self):
        tgt_cover = TargetProfile("Cover", toughness=4, save=4, invulnerable_save=None, wounds=1, cover=True)
        base  = compute_attack_result(self.BASE_WEAPON, self.BASE_TARGET).expected_damage
        cover = compute_attack_result(self.BASE_WEAPON, tgt_cover).expected_damage
        assert cover < base, "Cover should reduce damage"

    def test_torrent_auto_hits(self):
        """Torrent weapons should hit every attack (p_hit = 1.0)."""
        wp  = WeaponProfile("Flamer", attacks=6, skill=4, strength=4, ap=0, damage=1)
        tgt = self.BASE_TARGET
        r   = compute_attack_result(wp, tgt, AttackModifiers(use_torrent=True))
        assert r.hit_probability == 1.0, "Torrent should auto-hit"

    def test_flat_damage_bonus_increases_damage(self):
        base  = self._dmg()
        bonus = self._dmg(AttackModifiers(flat_damage_bonus=2.0))
        assert bonus > base, "flat_damage_bonus should increase damage"

    def test_damage_multiplier(self):
        base  = self._dmg()
        mult  = self._dmg(AttackModifiers(damage_multiplier=2.0))
        assert abs(mult / base - 2.0) < 0.05, "damage_multiplier=2 should double damage"


# ─────────────────────────────────────────────────────────────────────────────
# 4. Multi-model unit attack scaling
# ─────────────────────────────────────────────────────────────────────────────

class TestMultiModelScaling:
    """Verify that att_models correctly multiplies weapon attacks in compute_combat."""

    def _single_weapon_unit(self, attacks="2", bs="4+", s=4, ap=0, d=1):
        w = _make_weapon(name="Gun", attacks=attacks, bs=bs, s=s, ap=ap, damage=d)
        return _make_unit(name="Squad", weapons=[w], t=4, sv=4, w=1)

    def _target_unit(self, t=4, sv=4, w=1):
        return _make_unit(name="Target", weapons=[], t=t, sv=sv, w=w)

    def test_single_model_baseline(self):
        att = self._single_weapon_unit()
        tgt = self._target_unit()
        r   = compute_combat(att, tgt, [], att_models=1)
        dmg_1 = r["ranged"]["expected_dmg"]
        assert dmg_1 > 0

    def test_three_models_triple_damage(self):
        """3-model squad with identical weapons → exactly 3× damage of 1 model."""
        att = self._single_weapon_unit()
        tgt = self._target_unit()
        r1  = compute_combat(att, tgt, [], att_models=1)
        r3  = compute_combat(att, tgt, [], att_models=3)
        dmg_1 = r1["ranged"]["expected_dmg"]
        dmg_3 = r3["ranged"]["expected_dmg"]
        assert abs(dmg_3 / dmg_1 - 3.0) < 0.01, \
            f"3-model unit should deal 3× damage, got {dmg_3/dmg_1:.3f}×"

    def test_no_multiply_weapon_not_scaled(self):
        """Weapons with _no_multiply=True (e.g. support turrets) must not scale."""
        w_squad   = _make_weapon(name="Pulse Rifle",       attacks="2", no_multiply=False)
        w_turret  = _make_weapon(name="Support Turret",     attacks="3", no_multiply=True)
        att = _make_unit(name="Breacher", weapons=[w_squad, w_turret])
        tgt = self._target_unit()

        r1 = compute_combat(att, tgt, [], att_models=1)
        r5 = compute_combat(att, tgt, [], att_models=5)

        pw1 = r1["per_weapon_dmg"]
        pw5 = r5["per_weapon_dmg"]

        # Squad weapon scales with models
        ratio_squad = pw5["Pulse Rifle"]["dmg"] / pw1["Pulse Rifle"]["dmg"]
        assert abs(ratio_squad - 5.0) < 0.05, \
            f"Squad weapon should scale ×5, got ×{ratio_squad:.2f}"

        # Turret weapon does NOT scale
        ratio_turret = pw5["Support Turret"]["dmg"] / pw1["Support Turret"]["dmg"]
        assert abs(ratio_turret - 1.0) < 0.05, \
            f"Support turret should NOT scale, got ×{ratio_turret:.2f}"

    def test_variable_attack_weapon(self):
        """D3 attack weapon — model scaling should still work (uses expected value)."""
        w = _make_weapon(name="D3 Gun", attacks="D3", bs="3+", s=5, ap=1, d=2)
        att = _make_unit(name="D3 Squad", weapons=[w])
        tgt = self._target_unit()

        r1 = compute_combat(att, tgt, [], att_models=1)
        r4 = compute_combat(att, tgt, [], att_models=4)
        # D3 = EV 2.0 — 4 models = 8 attacks
        assert r4["ranged"]["expected_dmg"] > r1["ranged"]["expected_dmg"]


# ─────────────────────────────────────────────────────────────────────────────
# 5. Special weapon keyword parsing
# ─────────────────────────────────────────────────────────────────────────────

class TestWeaponKeywordParsing:
    """Verify _weapon_to_profile correctly reads keyword-encoded modifiers."""

    def test_devastating_wounds_keyword(self):
        w = _make_weapon(keywords=["DEVASTATING WOUNDS"])
        _, mods = _weapon_to_profile(w)
        assert mods.devastating_wounds is True

    def test_lethal_hits_keyword(self):
        w = _make_weapon(keywords=["LETHAL HITS"])
        _, mods = _weapon_to_profile(w)
        assert mods.lethal_hits is True

    def test_twin_linked_keyword(self):
        w = _make_weapon(keywords=["TWIN-LINKED"])
        _, mods = _weapon_to_profile(w)
        assert mods.reroll_wounds == "failed"

    def test_sustained_hits_1(self):
        w = _make_weapon(keywords=["SUSTAINED HITS 1"])
        _, mods = _weapon_to_profile(w)
        assert mods.sustained_hits == 1

    def test_sustained_hits_2(self):
        w = _make_weapon(keywords=["SUSTAINED HITS 2"])
        _, mods = _weapon_to_profile(w)
        assert mods.sustained_hits == 2

    def test_rapid_fire_adds_attacks(self):
        w = _make_weapon(attacks="2", keywords=["RAPID FIRE 2"])
        wp, mods = _weapon_to_profile(w)
        # Rapid Fire bakes extra_attacks into the weapon-level mods
        assert mods.extra_attacks >= 2.0

    def test_melta_adds_flat_damage(self):
        w = _make_weapon(keywords=["MELTA 2"])
        _, mods = _weapon_to_profile(w)
        assert mods.flat_damage_bonus >= 2.0

    def test_anti_keyword(self):
        w = _make_weapon(keywords=["ANTI-INFANTRY 4+"])
        _, mods = _weapon_to_profile(w)
        assert mods.anti_wound_target == 4

    def test_blast_keyword(self):
        w = _make_weapon(keywords=["BLAST"])
        _, mods = _weapon_to_profile(w)
        assert mods.use_blast is True

    def test_torrent_keyword(self):
        w = _make_weapon(keywords=["TORRENT"])
        _, mods = _weapon_to_profile(w)
        assert mods.use_torrent is True

    def test_lance_keyword(self):
        w = _make_weapon(keywords=["LANCE"])
        _, mods = _weapon_to_profile(w)
        assert mods.use_lance is True

    def test_unknown_keyword_ignored(self):
        w = _make_weapon(keywords=["SOME UNKNOWN KEYWORD"])
        wp, mods = _weapon_to_profile(w)
        # Should not raise
        assert wp.name == "Test Rifle"


# ─────────────────────────────────────────────────────────────────────────────
# 6. Flag → math integration (end-to-end via compute_combat)
# ─────────────────────────────────────────────────────────────────────────────

class TestFlagMathIntegration:
    """End-to-end: verify CLI flags actually change damage output in compute_combat."""

    def _base_result(self, flags=()):
        w   = _make_weapon(name="Rifle", attacks="4", bs="4+", s=4, ap=0, d=1)
        att = _make_unit("Attacker", weapons=[w])
        tgt = _make_unit("Target",   weapons=[], t=4, sv=4, w=1)
        return compute_combat(att, tgt, list(flags), att_models=1)

    def test_lethal_flag_increases_damage(self):
        base = self._base_result()["ranged"]["expected_dmg"]
        mod  = self._base_result(["lethal"])["ranged"]["expected_dmg"]
        assert mod > base, "--lethal flag must increase damage"

    def test_twin_flag_increases_damage(self):
        base = self._base_result()["ranged"]["expected_dmg"]
        mod  = self._base_result(["twin"])["ranged"]["expected_dmg"]
        assert mod > base, "--twin flag must increase damage"

    def test_sustained1_flag_increases_damage(self):
        base = self._base_result()["ranged"]["expected_dmg"]
        mod  = self._base_result(["sustained1"])["ranged"]["expected_dmg"]
        assert mod > base, "--sustained1 flag must increase damage"

    def test_dev_flag_increases_damage_vs_good_save(self):
        w   = _make_weapon(name="Rifle", attacks="4", bs="4+", s=4, ap=0, d=1)
        att = _make_unit("Attacker", weapons=[w])
        tgt = _make_unit("Heavy",    weapons=[], t=4, sv=2, w=1)  # 2+ save is hard to beat
        base = compute_combat(att, tgt, [],      att_models=1)["ranged"]["expected_dmg"]
        mod  = compute_combat(att, tgt, ["dev"], att_models=1)["ranged"]["expected_dmg"]
        assert mod > base, "--dev flag must increase damage vs heavily armoured target"

    def test_ml_flag_increases_damage(self):
        base = self._base_result()["ranged"]["expected_dmg"]
        mod  = self._base_result(["ml"])["ranged"]["expected_dmg"]
        assert mod > base, "--ml flag must increase damage"

    def test_cover_flag_reduces_damage(self):
        base = self._base_result()["ranged"]["expected_dmg"]
        cov  = self._base_result(["cover"])["ranged"]["expected_dmg"]
        assert cov < base, "--cover flag must reduce damage"

    def test_combined_all_attack_buffs(self):
        base = self._base_result()["ranged"]["expected_dmg"]
        mod  = self._base_result(["ml", "lethal", "twin", "sustained1"])["ranged"]["expected_dmg"]
        assert mod > base * 1.3, "Stacked buffs should significantly increase damage"

    def test_invuln_override_reduces_damage_vs_ap_weapon(self):
        """High-AP weapon vs target with no invuln vs same with invuln:4."""
        w   = _make_weapon(name="Railgun", attacks="2", bs="3+", s=9, ap=3, d=3)
        att = _make_unit("Broadside",  weapons=[w])
        tgt = _make_unit("Heavy",      weapons=[], t=5, sv=3, w=3)
        base = compute_combat(att, tgt, [],           att_models=1)["ranged"]["expected_dmg"]
        inv  = compute_combat(att, tgt, ["invuln:4"], att_models=1)["ranged"]["expected_dmg"]
        assert inv < base, "--invuln:4 must reduce damage for high-AP weapon"


# ─────────────────────────────────────────────────────────────────────────────
# 7. Monte Carlo sanity
# ─────────────────────────────────────────────────────────────────────────────

class TestMonteCarlo:
    """Verify MC output is consistent with deterministic EV within error bounds."""

    def test_mc_mean_matches_ev(self):
        wp  = WeaponProfile("Bolter", attacks=4, skill=3, strength=4, ap=0, damage=1)
        tgt = _make_target(t=4, sv=4)
        ev  = compute_attack_result(wp, tgt).expected_damage
        mc  = monte_carlo_attack(wp, tgt, trials=20000, seed=7)
        # MC mean should be within ±8% of deterministic EV
        diff_pct = abs(mc["mean_damage"] - ev) / ev * 100 if ev > 0 else 0
        assert diff_pct < 8.0, \
            f"MC mean {mc['mean_damage']:.3f} diverges too far from EV {ev:.3f} ({diff_pct:.1f}%)"

    def test_mc_simulation_status_in_compute_combat(self):
        w   = _make_weapon(name="Rifle", attacks="3", bs="4+", s=4, ap=0, d=1)
        att = _make_unit("Att", weapons=[w])
        tgt = _make_unit("Tgt", weapons=[], t=4, sv=4, w=1)
        r   = compute_combat(att, tgt, [], att_models=1)
        assert r["simulation_status"] == "ACTIVE", \
            "MC should be ACTIVE for a valid weapon profile"
        assert r["simulation"]["mode"] == "monte_carlo"


# ─────────────────────────────────────────────────────────────────────────────
# 8. Sensitivity sweep
# ─────────────────────────────────────────────────────────────────────────────

class TestSensitivity:
    def test_sensitivity_returns_four_entries(self):
        w   = _make_weapon(name="Rifle", attacks="4", bs="4+", s=4, ap=0, d=2)
        att = _make_unit("Att", weapons=[w])
        tgt = _make_unit("Tgt", weapons=[], t=4, sv=4, w=1)
        rows = compute_sensitivity(att, tgt, [])
        assert len(rows) == 4, f"Expected 4 sensitivity rows, got {len(rows)}"
        labels = {r["label"] for r in rows}
        assert "Hit roll +1" in labels
        assert "Wound roll +1" in labels

    def test_sensitivity_all_positive(self):
        """Improving hit, wound, AP, damage should all increase damage (positive %)."""
        w   = _make_weapon(name="Rifle", attacks="4", bs="4+", s=4, ap=0, d=2)
        att = _make_unit("Att", weapons=[w])
        tgt = _make_unit("Tgt", weapons=[], t=4, sv=4, w=1)
        rows = compute_sensitivity(att, tgt, [])
        for row in rows:
            assert row["value"] >= 0, \
                f"Sensitivity '{row['label']}' unexpectedly negative: {row['value']}%"

    def test_sensitivity_respects_flags(self):
        """With --ml already active, hit-roll +1 benefit should be smaller (already near cap)."""
        w   = _make_weapon(name="Rifle", attacks="4", bs="4+", s=4, ap=0, d=2)
        att = _make_unit("Att", weapons=[w])
        tgt = _make_unit("Tgt", weapons=[], t=4, sv=4, w=1)
        rows_base = compute_sensitivity(att, tgt, [])
        rows_ml   = compute_sensitivity(att, tgt, ["ml"])
        hit_base = next(r["value"] for r in rows_base if r["label"] == "Hit roll +1")
        hit_ml   = next(r["value"] for r in rows_ml   if r["label"] == "Hit roll +1")
        # With --ml (BS 4+→3+ already applied), +1 hit has diminishing returns
        assert hit_ml <= hit_base, \
            "Hit sensitivity should decrease when ML is already boosting hit rolls"


# ─────────────────────────────────────────────────────────────────────────────
# 9. Edge cases
# ─────────────────────────────────────────────────────────────────────────────

class TestEdgeCases:
    def test_no_weapons_returns_none_ranged(self):
        att = _make_unit("Puncher", weapons=[])
        tgt = _make_unit("Target",  weapons=[], t=4, sv=4, w=1)
        r   = compute_combat(att, tgt, [], att_models=1)
        assert r["ranged"] is None
        assert r["melee"]  is None

    def test_melee_weapon_type(self):
        w   = _make_weapon(name="Power Sword", attacks="3", bs="3+", s=4, ap=2, d=1, w_type="melee")
        att = _make_unit("Swordsman", weapons=[w])
        tgt = _make_unit("Target",    weapons=[], t=4, sv=4, w=1)
        r   = compute_combat(att, tgt, [], att_models=1)
        assert r["ranged"] is None,  "Melee-only unit should have no ranged summary"
        assert r["melee"]  is not None, "Melee-only unit should have a melee summary"

    def test_mixed_ranged_and_melee(self):
        r_w = _make_weapon(name="Rifle",  attacks="2", bs="3+", s=4, ap=0, d=1, w_type="ranged")
        m_w = _make_weapon(name="Knife",  attacks="2", bs="3+", s=3, ap=0, d=1, w_type="melee")
        att = _make_unit("Marine", weapons=[r_w, m_w])
        tgt = _make_unit("Target", weapons=[], t=4, sv=4, w=1)
        r   = compute_combat(att, tgt, [], att_models=1)
        assert r["ranged"] is not None
        assert r["melee"]  is not None

    def test_zero_models_fallback(self):
        """att_models=0 should not crash and should default to baseline."""
        w   = _make_weapon(name="Rifle", attacks="2")
        att = _make_unit("Att", weapons=[w])
        tgt = _make_unit("Tgt", weapons=[], t=4, sv=4, w=1)
        r   = compute_combat(att, tgt, [], att_models=0)
        # With 0 models attacks scale to 0 → damage = 0 (or small float)
        assert r["ranged"]["expected_dmg"] >= 0

    def test_target_with_fnp_reduces_damage(self):
        """Feel No Pain 5+ should reduce expected damage."""
        wp  = WeaponProfile("Rifle", attacks=10, skill=3, strength=4, ap=0, damage=1)
        tgt_no  = _make_target(t=4, sv=4)
        tgt_fnp = TargetProfile("FNP", toughness=4, save=4, invulnerable_save=None, wounds=1, feel_no_pain=5)
        r_no  = compute_attack_result(wp, tgt_no).expected_damage
        r_fnp = compute_attack_result(wp, tgt_fnp).expected_damage
        assert r_fnp < r_no, "Feel No Pain should reduce expected damage"


# ─────────────────────────────────────────────────────────────────────────────
# Runner (no pytest required)
# ─────────────────────────────────────────────────────────────────────────────

def _run_all() -> None:
    """Run all test classes and report results."""
    import traceback

    suites = [
        TestBaselineMath,
        TestApplyFlags,
        TestModifierMathEffects,
        TestMultiModelScaling,
        TestWeaponKeywordParsing,
        TestFlagMathIntegration,
        TestMonteCarlo,
        TestSensitivity,
        TestEdgeCases,
    ]

    passed = 0
    failed = 0
    errors = []

    for suite_class in suites:
        suite = suite_class()
        methods = [m for m in dir(suite) if m.startswith("test_")]
        for method_name in methods:
            test_label = f"{suite_class.__name__}.{method_name}"
            try:
                getattr(suite, method_name)()
                print(f"  ✓  {test_label}")
                passed += 1
            except AssertionError as e:
                print(f"  ✗  {test_label}")
                print(f"       AssertionError: {e}")
                failed += 1
                errors.append((test_label, str(e)))
            except Exception as e:
                print(f"  ✗  {test_label}")
                print(f"       Exception: {e}")
                traceback.print_exc()
                failed += 1
                errors.append((test_label, str(e)))

    print()
    print(f"{'─'*60}")
    print(f"  Results: {passed} passed, {failed} failed")
    if errors:
        print()
        print("  Failures:")
        for label, msg in errors:
            print(f"    {label}: {msg}")
    print(f"{'─'*60}")
    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    print("\nCombat Terminal — Math Engine Test Suite")
    print("─" * 60)
    _run_all()
