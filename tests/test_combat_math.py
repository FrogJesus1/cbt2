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
    is_defensive_flag,
    validate_flags,
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
        """Cover (+1 save) should reduce damage against armoured targets.

        MM3 (2026-06-11): 10e Benefit of Cover gives NO bonus vs an AP0 attack on
        a 3+ or better save, so this test now uses AP-1 (where cover legitimately
        applies vs a 3+ model). A separate Sv4+ vs AP0 case below confirms cover
        still helps lighter armour against AP0.
        """
        wp  = WeaponProfile("Bolter", attacks=2, skill=3, strength=4, ap=1, damage=1)
        tgt_open  = _make_target(t=4, sv=3)
        tgt_cover = _make_target(t=4, sv=3)
        tgt_cover.cover = True
        r_open  = compute_attack_result(wp, tgt_open)
        r_cover = compute_attack_result(wp, tgt_cover)
        assert r_cover.expected_damage < r_open.expected_damage, \
            "Cover should reduce damage vs AP-1 on a 3+ save"


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
        # MM6 (2026-06-11): --lance now sets the use_lance flag bit only; the +1
        # to wound is gated on the per-weapon LANCE keyword (is_lance) at the math
        # sites — it no longer buffs every weapon's wound_bonus unconditionally.
        mods, tgt = self._fresh()
        mods, tgt = _apply_flags(["lance"], mods, tgt)
        assert mods.use_lance is True
        assert mods.wound_bonus == 0

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
        # Rapid Fire stores to rf_value — only applied when use_rapid_fire=True
        assert mods.rf_value >= 2.0

    def test_melta_stores_value(self):
        w = _make_weapon(keywords=["MELTA 2"])
        _, mods = _weapon_to_profile(w)
        # Melta stores to melta_value — only applied when use_melta=True
        assert mods.melta_value >= 2.0

    def test_anti_keyword(self):
        w = _make_weapon(keywords=["ANTI-INFANTRY 4+"])
        _, mods = _weapon_to_profile(w)
        # Keyword Anti is stored gated: (keyword, N), resolved vs the defender
        assert ("INFANTRY", 4) in mods.anti_entries

    def test_blast_keyword(self):
        w = _make_weapon(keywords=["BLAST"])
        _, mods = _weapon_to_profile(w)
        assert mods.use_blast is True

    def test_torrent_keyword(self):
        w = _make_weapon(keywords=["TORRENT"])
        _, mods = _weapon_to_profile(w)
        assert mods.use_torrent is True

    def test_lance_keyword(self):
        # MM6 (2026-06-11): the LANCE keyword now sets the per-weapon is_lance bit
        # (mirroring HEAVY → is_heavy); use_lance is the --lance flag bit.
        w = _make_weapon(keywords=["LANCE"])
        _, mods = _weapon_to_profile(w)
        assert mods.is_lance is True

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

class TestCrusadeDefensiveFlags:
    """Session 5 — defender stat-modifier flags + flag classification.

    Uses a high-volume weapon so per-attack effects are clearly visible in EV.
    """

    ATT = {
        "name": "Shooter",
        "weapons": [_make_weapon(name="autocannon", attacks="10", bs="3+", s=5, ap=1, d=2)],
    }
    DEF = {"name": "Mark", "T": "4", "Sv": "3", "W": "2", "abilities": []}

    def _dmg(self, flags):
        return compute_combat(self.ATT, self.DEF, flags)["ranged"]["expected_dmg"]

    def _kills(self, flags):
        # def_models=10: MM5 now caps expected_kills at the squad size, so a
        # single-model default (def_models=1) would flatten both sides to 1.0 and
        # hide the woundsplus differential. Use a large squad to keep kills uncapped.
        return compute_combat(self.ATT, self.DEF, flags, def_models=10)["ranged"]["expected_kills"]

    def test_woundsplus_increases_target_wounds(self):
        # +2 wounds per model → harder to kill → fewer expected kills.
        assert self._kills(["woundsplus2"]) < self._kills([]), \
            "woundsplus should raise target Wounds and reduce kills"

    def test_woundsplus_negative_floors_at_one(self):
        from data.combat_terminal.combat_math_engine import AttackModifiers, TargetProfile
        m, t = AttackModifiers(), _make_target(t=4, sv=3, w=1)
        _apply_flags(["woundsplus-5"], m, t)
        assert t.wounds == 1, f"Wounds must floor at 1, got {t.wounds}"

    def test_dmgreduce_lowers_damage(self):
        assert self._dmg(["dmgreduce1"]) < self._dmg([]), \
            "dmgreduce should reduce incoming damage"
        # dmgred alias behaves identically
        assert abs(self._dmg(["dmgred1"]) - self._dmg(["dmgreduce1"])) < 1e-9, \
            "dmgred alias must match dmgreduce"

    def test_svminus_increases_damage(self):
        assert self._dmg(["svminus1"]) > self._dmg([]), \
            "worse save (svminus) should increase damage taken"

    def test_svplus_decreases_damage(self):
        assert self._dmg(["svplus1"]) < self._dmg([]), \
            "better save (svplus) should decrease damage taken"

    def test_classification_offensive_vs_defensive(self):
        for f in ["fnp6", "invuln4", "woundsplus1", "dmgreduce1", "dmgred2",
                  "svplus1", "svminus1", "stealth", "eapdef", "cover", "halfdmg"]:
            assert is_defensive_flag(f), f"{f} should classify as defensive"
        for f in ["hitplus1", "wndplus1", "lethal", "dev", "sus1", "eap2",
                  "rrwound1", "twin", "lance"]:
            assert not is_defensive_flag(f), f"{f} should classify as offensive"

    def test_new_flags_validate(self):
        assert validate_flags(["woundsplus1", "woundsplus-1", "dmgreduce2",
                               "dmgred1", "svplus1", "svminus3"]) == [], \
            "new defensive flags must pass validation"


# ─────────────────────────────────────────────────────────────────────────────
# 11. Single-source wound chart — the three former copies must agree
# ─────────────────────────────────────────────────────────────────────────────

class TestWoundTableSync:
    """The S-vs-T wound chart used to be reimplemented in three places
    (combat_math_engine.wound_target, engine._baseline_wr, math_ledger._s_vs_t_target).
    All three now delegate to one function — lock that they agree everywhere."""

    def test_canonical_chart_values(self):
        from data.combat_terminal.combat_math_engine import wound_target
        assert wound_target(4, 4) == 4
        assert wound_target(5, 4) == 3
        assert wound_target(8, 4) == 2   # S >= 2T
        assert wound_target(3, 4) == 5
        assert wound_target(2, 4) == 6   # 2S <= T

    def test_all_delegators_agree_over_grid(self):
        from data.combat_terminal.combat_math_engine import wound_target, wound_target_from_raw
        from data.combat_terminal.engine import _baseline_wr
        from data.combat_terminal.math_ledger import _s_vs_t_target
        for s in range(1, 15):
            for t in range(1, 15):
                base = wound_target(s, t)
                assert wound_target_from_raw(s, t) == base
                assert _baseline_wr(str(s), str(t)) == base, f"_baseline_wr desync at S{s} T{t}"
                assert _s_vs_t_target(str(s), t) == base, f"_s_vs_t_target desync at S{s} T{t}"

    def test_raw_parser_handles_strings_and_junk(self):
        from data.combat_terminal.combat_math_engine import wound_target_from_raw
        assert wound_target_from_raw("5+", '4"') == 3
        assert wound_target_from_raw(None, 4) is None
        assert wound_target_from_raw("x", 4) is None


# ─────────────────────────────────────────────────────────────────────────────
# 12. Flag registry ↔ math effect sync (kills the "silent flag" desync class)
# ─────────────────────────────────────────────────────────────────────────────

class TestFlagRegistrySync:
    """Guarantees the single flag registry (flags.py) and the math
    implementation (_apply_flags) cannot silently drift apart:

      * KNOWN_FLAG_BASES / DEFENSIVE_FLAG_BASES are derived from the registry
        and match the documented set.
      * EVERY registry flag produces a real, measurable change in _apply_flags
        (no flag can advertise a note while doing nothing to the math).
      * EVERY registry flag validates.
      * Parametric note text reflects the same N the math consumes.
    """

    def _sample_token(self, spec):
        # A representative token for each flag: parametric flags carry N=2.
        return spec["base"] + ("2" if spec["parametric"] else "")

    def _baseline(self):
        from data.combat_terminal.combat_math_engine import AttackModifiers
        return AttackModifiers(), _make_target(t=4, sv=3, w=2)

    def test_known_set_equals_registry(self):
        from data.combat_terminal import flags as F
        assert set(F.KNOWN_FLAG_BASES) == {s["base"] for s in F.FLAG_SPECS}
        assert set(F.DEFENSIVE_FLAG_BASES) == {s["base"] for s in F.FLAG_SPECS if s["defensive"]}

    def test_every_registry_flag_has_a_math_effect(self):
        from dataclasses import asdict
        from data.combat_terminal import flags as F
        for spec in F.FLAG_SPECS:
            token = self._sample_token(spec)
            m0, t0 = self._baseline()
            before = (asdict(m0), asdict(t0))
            m1, t1 = _apply_flags([token], m0, t0)
            after = (asdict(m1), asdict(t1))
            assert after != before, \
                f"flag '{token}' is in the registry but _apply_flags does nothing — silent flag"

    def test_every_registry_flag_validates(self):
        from data.combat_terminal import flags as F
        tokens = [self._sample_token(s) for s in F.FLAG_SPECS]
        assert validate_flags(tokens) == [], \
            f"registry flags must all validate: {validate_flags(tokens)}"

    def test_note_value_matches_math_value(self):
        """Parametric notes must echo the same N the math actually applies."""
        from data.combat_terminal import flags as F
        from data.combat_terminal.combat_math_engine import AttackModifiers

        # sustained: note says N, math sets sustained_hits = N
        m, t = AttackModifiers(), _make_target()
        _apply_flags(["sus3"], m, t)
        assert m.sustained_hits == 3
        assert "3" in F.note_for("sus3")["text"]

        # hitplus: note says +N, math sets hit_bonus = N
        m, t = AttackModifiers(), _make_target()
        _apply_flags(["hitplus2"], m, t)
        assert m.hit_bonus == 2
        assert "+2" in F.note_for("hitplus2")["text"]

        # invuln: note says N+, math sets invulnerable_save = N
        m, t = AttackModifiers(), _make_target()
        _, t2 = _apply_flags(["invuln4"], m, t)
        assert t2.invulnerable_save == 4
        assert "4+" in F.note_for("invuln4")["text"]

        # eapdef (defensive AP): note says -N, math worsens AP by N (ap_modifier += N)
        m, t = AttackModifiers(), _make_target()
        _apply_flags(["eapdef2"], m, t)
        assert m.ap_modifier == 2
        assert "-2" in F.note_for("eapdef2")["text"]

    def test_eapdef_beats_eap_in_lookup(self):
        # "eapdef" must not be misread as the offensive "eap" flag.
        from data.combat_terminal import flags as F
        assert F.is_defensive_flag("eapdef")
        assert not F.is_defensive_flag("eap")
        assert "worsens" in F.note_for("eapdef")["text"]
        assert "improves" in F.note_for("eap")["text"]

    def test_fixed_flag_does_not_prefix_match_junk(self):
        # A fixed (non-parametric) flag must match only its exact stem, so a
        # malformed token like 'mlx' produces no note (old behaviour).
        from data.combat_terminal import flags as F
        assert F.note_for("mlx") is None


# ─────────────────────────────────────────────────────────────────────────────
# 13. Monte Carlo damage/attacks variance — variable dice must spread wider
# ─────────────────────────────────────────────────────────────────────────────

class TestMonteCarloVariance:
    """Before this fix variable damage/attacks were collapsed to their expected
    value at parse time, so a D6-damage weapon and a flat-3.5 weapon produced
    identical MC distributions and confidence bands. Now the dice are sampled."""

    # High BS/S/AP so almost every attack becomes an unsaved wound — this
    # isolates the damage/attacks dice as the dominant source of variance.
    def _flat_damage_wp(self):
        return WeaponProfile("Flat-3.5", attacks=4, skill=2, strength=10, ap=6,
                             damage=3.5)

    def _d6_damage_wp(self):
        return WeaponProfile("D6", attacks=4, skill=2, strength=10, ap=6,
                             damage=3.5, damage_is_variable=True, damage_expression="D6")

    def _big_target(self):
        # One large model so per-wound damage accumulates without overkill
        # truncation compressing the spread.
        return TargetProfile(name="Monster", toughness=4, save=3,
                             invulnerable_save=None, wounds=40, models=1)

    def test_d6_damage_spreads_wider_than_flat(self):
        tgt = self._big_target()
        flat = monte_carlo_attack(self._flat_damage_wp(), tgt, trials=20000, seed=42)
        d6   = monte_carlo_attack(self._d6_damage_wp(),   tgt, trials=20000, seed=42)
        assert d6["std_dev_damage"] > flat["std_dev_damage"] * 1.3, \
            f"D6 damage should be markedly swingier: d6={d6['std_dev_damage']} flat={flat['std_dev_damage']}"

    def test_variable_damage_preserves_expected_value(self):
        """Sampling must not shift the mean — only the spread."""
        tgt = self._big_target()
        flat = monte_carlo_attack(self._flat_damage_wp(), tgt, trials=20000, seed=42)
        d6   = monte_carlo_attack(self._d6_damage_wp(),   tgt, trials=20000, seed=42)
        assert abs(d6["mean_damage"] - flat["mean_damage"]) < 0.5, \
            f"D6 (EV 3.5) and flat 3.5 should share a mean: d6={d6['mean_damage']} flat={flat['mean_damage']}"

    def test_variable_attacks_spreads_wider_than_flat(self):
        tgt = self._big_target()
        flat = WeaponProfile("FlatA", attacks=3.5, skill=2, strength=10, ap=6, damage=1)
        var  = WeaponProfile("D6A", attacks=3.5, skill=2, strength=10, ap=6, damage=1,
                             attacks_is_variable=True, attacks_expression="D6")
        rf = monte_carlo_attack(flat, tgt, trials=20000, seed=42)
        rv = monte_carlo_attack(var,  tgt, trials=20000, seed=42)
        assert rv["std_dev_damage"] > rf["std_dev_damage"], \
            f"D6 attacks should be swingier than flat: var={rv['std_dev_damage']} flat={rf['std_dev_damage']}"

    def test_flat_weapon_unchanged_by_new_path(self):
        # A non-variable weapon must behave exactly as before (regression guard).
        tgt = _make_target(t=4, sv=3, w=2, models=5)
        wp = WeaponProfile("Bolter", attacks=2, skill=3, strength=4, ap=0, damage=1)
        r = monte_carlo_attack(wp, tgt, trials=5000, seed=42)
        assert r["mean_damage"] > 0
        assert r["std_dev_damage"] >= 0


class TestKeywordVariantNormalisation:
    """Dossier keyword spelling variants (underscores, spaced hyphens, dice
    values) must parse identically to the canonical forms — ~500 real weapon
    instances use them (2026-06-10 scan, MC1)."""

    def test_underscore_devastating_wounds(self):
        _, mods = _weapon_to_profile(_make_weapon(keywords=["DEVASTATING_WOUNDS"]))
        assert mods.devastating_wounds is True

    def test_underscore_lethal_hits(self):
        _, mods = _weapon_to_profile(_make_weapon(keywords=["LETHAL_HITS"]))
        assert mods.lethal_hits is True

    def test_underscore_twin_linked(self):
        _, mods = _weapon_to_profile(_make_weapon(keywords=["TWIN_LINKED"]))
        assert mods.reroll_wounds == "failed"

    def test_spaced_hyphen_twin_linked(self):
        _, mods = _weapon_to_profile(_make_weapon(keywords=["TWIN -LINKED"]))
        assert mods.reroll_wounds == "failed"

    def test_underscore_rapid_fire(self):
        _, mods = _weapon_to_profile(_make_weapon(keywords=["RAPID_FIRE_2"]))
        assert mods.rf_value >= 2.0

    def test_underscore_sustained_hits(self):
        _, mods = _weapon_to_profile(_make_weapon(keywords=["SUSTAINED_HITS_1"]))
        assert mods.sustained_hits == 1

    def test_underscore_anti(self):
        _, mods = _weapon_to_profile(_make_weapon(keywords=["ANTI_FLY_2+"]))
        assert ("FLY", 2) in mods.anti_entries

    def test_underscore_melta(self):
        _, mods = _weapon_to_profile(_make_weapon(keywords=["MELTA_2"]))
        assert mods.melta_value >= 2.0

    def test_ignores_cover_wired(self):
        for form in ("IGNORES COVER", "IGNORES_COVER"):
            _, mods = _weapon_to_profile(_make_weapon(keywords=[form]))
            assert mods.ignore_cover is True, form

    def test_dice_valued_sustained_hits(self):
        _, mods = _weapon_to_profile(_make_weapon(keywords=["SUSTAINED HITS D3"]))
        assert abs(mods.sustained_hits - 2.0) < 1e-9  # D3 EV

    def test_bare_sustained_hits(self):
        _, mods = _weapon_to_profile(_make_weapon(keywords=["SUSTAINED HITS"]))
        assert mods.sustained_hits == 1

    def test_dice_valued_rapid_fire(self):
        _, mods = _weapon_to_profile(_make_weapon(keywords=["RAPID FIRE D6"]))
        assert abs(mods.rf_value - 3.5) < 1e-9  # D6 EV

    def test_canonical_forms_still_parse(self):
        """Regression guard: original space/hyphen forms unaffected."""
        _, m1 = _weapon_to_profile(_make_weapon(keywords=["DEVASTATING WOUNDS"]))
        _, m2 = _weapon_to_profile(_make_weapon(keywords=["TWIN-LINKED"]))
        _, m3 = _weapon_to_profile(_make_weapon(keywords=["ANTI-INFANTRY 4+"]))
        assert m1.devastating_wounds is True
        assert m2.reroll_wounds == "failed"
        assert ("INFANTRY", 4) in m3.anti_entries

    def test_dice_sustained_does_not_crash_mc(self):
        """Float sustained_hits (D3 EV) must survive the MC integer hit loop."""
        w   = _make_weapon(name="Dice Gun", attacks="4", keywords=["SUSTAINED HITS D3"])
        att = _make_unit(name="Squad", weapons=[w])
        tgt = _make_unit(name="Target", weapons=[])
        r   = compute_combat(att, tgt, [], att_models=1)
        assert r["simulation"]["status"] == "ACTIVE"
        assert r["ranged"]["expected_dmg"] > 0


class TestPerModelAttackBonusScaling:
    """RF N raises the Attacks characteristic of EVERY firing model, and --ea is
    documented per-model — both must scale with squad size (2026-06-10 scan, MC2/MH3)."""

    def _unit(self, weapons):
        return _make_unit(name="Squad", weapons=weapons)

    def _tgt(self):
        # sv=4 → per-attack chain 0.5×0.5×0.5 = 0.125: products round cleanly
        # to 2dp, so exact-ratio assertions aren't distorted by display rounding.
        return _make_unit(name="Target", weapons=[], sv=4)

    def test_rapid_fire_scales_per_model(self):
        """10-model A1 RF1 squad in half range fires 20 attacks → exactly 2× no-rf damage."""
        w   = _make_weapon(name="Pulse Rifle", attacks="1", keywords=["RAPID FIRE 1"])
        att = self._unit([w])
        no_rf = compute_combat(att, self._tgt(), [],     att_models=10)["ranged"]["expected_dmg"]
        rf    = compute_combat(att, self._tgt(), ["rf"], att_models=10)["ranged"]["expected_dmg"]
        assert abs(rf / no_rf - 2.0) < 0.01, f"RF1 on A1 ×10 models should double damage, got ×{rf/no_rf:.3f}"

    def test_rapid_fire_squad_equals_n_times_single(self):
        w   = _make_weapon(name="Pulse Rifle", attacks="1", keywords=["RAPID FIRE 1"])
        att = self._unit([w])
        one = compute_combat(att, self._tgt(), ["rf"], att_models=1)["ranged"]["expected_dmg"]
        ten = compute_combat(att, self._tgt(), ["rf"], att_models=10)["ranged"]["expected_dmg"]
        assert abs(ten / one - 10.0) < 0.01, f"10-model RF squad should deal 10× a single model, got ×{ten/one:.3f}"

    def test_ea_flag_scales_per_model(self):
        """5-model A2 squad with --ea1 fires 15 attacks → exactly 1.5× baseline."""
        w    = _make_weapon(name="Gun", attacks="2")
        att  = self._unit([w])
        base = compute_combat(att, self._tgt(), [],      att_models=5)["ranged"]["expected_dmg"]
        ea   = compute_combat(att, self._tgt(), ["ea1"], att_models=5)["ranged"]["expected_dmg"]
        assert abs(ea / base - 1.5) < 0.01, f"--ea1 on A2 ×5 models should be 1.5×, got ×{ea/base:.3f}"

    def test_no_multiply_weapon_rf_not_scaled(self):
        """A unit-level weapon (_no_multiply) gets its RF bonus once, not ×models."""
        w   = _make_weapon(name="Turret", attacks="2", keywords=["RAPID FIRE 2"], no_multiply=True)
        att = self._unit([w])
        one  = compute_combat(att, self._tgt(), ["rf"], att_models=1)["per_weapon_dmg"]["Turret"]["dmg"]
        five = compute_combat(att, self._tgt(), ["rf"], att_models=5)["per_weapon_dmg"]["Turret"]["dmg"]
        assert abs(five / one - 1.0) < 0.05, f"_no_multiply RF weapon must not scale, got ×{five/one:.2f}"

    def test_mc_mean_tracks_ev_with_rf_scaling(self):
        """MC and EV must agree on the scaled attack count (10-model RF squad)."""
        w   = _make_weapon(name="Pulse Rifle", attacks="1", keywords=["RAPID FIRE 1"])
        att = self._unit([w])
        r   = compute_combat(att, self._tgt(), ["rf"], att_models=10)
        ev  = r["ranged"]["expected_dmg"]
        mc  = r["per_weapon_dmg"]["Pulse Rifle"]["mc"]["mean_damage"]
        assert abs(mc - ev) / ev < 0.10, f"MC mean {mc:.2f} should track EV {ev:.2f}"


class TestTenthEdRulesFixes:
    """2026-06-10 round 2: MC-disable crash path (MC3), Anti-X keyword gating +
    crit-wound threshold (MH1/MH2), 10e Blast (MH4), crit auto-success (MH5)."""

    def _tgt_unit(self, keywords=None, t=4, sv=4, w=1):
        u = _make_unit(name="Target", weapons=[], t=t, sv=sv, w=w)
        u["keywords"] = keywords or []
        return u

    # ── MC3: set_mc_trials(0) must degrade cleanly, not crash ─────────────────
    def test_mc_disabled_clean_fallback(self):
        from data.combat_terminal.math_adapter import set_mc_trials
        att = _make_unit(name="Squad", weapons=[_make_weapon(name="Gun")])
        try:
            set_mc_trials(0)
            r = compute_combat(att, self._tgt_unit(), [], att_models=1)
        finally:
            set_mc_trials(5000)
        assert r["simulation"]["status"] == "OFFLINE"
        assert r["ranged"]["expected_dmg"] > 0          # EV numbers survive
        assert r["ranged"]["kill_chance_pct"] is None   # MC-derived stat absent

    # ── MH1: Anti-X only applies vs targets with the matching keyword ─────────
    def test_anti_requires_matching_keyword(self):
        wp   = WeaponProfile("Missiles", attacks=4, skill=4, strength=4, ap=0, damage=1)
        mods = AttackModifiers(anti_entries=[("FLY", 2)])
        ground = TargetProfile("Tank", toughness=10, save=3, invulnerable_save=None,
                               wounds=10, keywords=["KEYWORDS: Vehicle", "Tracked"])
        flyer  = TargetProfile("Jet",  toughness=10, save=3, invulnerable_save=None,
                               wounds=10, keywords=["KEYWORDS: Vehicle", "Fly"])
        r_ground = compute_attack_result(wp, ground, mods)
        r_fly    = compute_attack_result(wp, flyer,  mods)
        assert r_ground.wound_target == 6, "S4 vs T10 without matching keyword: anti must NOT apply"
        assert r_fly.wound_target == 2,    "Anti-FLY 2+ must apply vs a FLY target"
        assert r_fly.expected_damage > r_ground.expected_damage * 2

    def test_manual_anti_wound_target_unconditional(self):
        """A directly-set anti_wound_target (manual/legacy path) ignores keywords."""
        wp   = WeaponProfile("Gun", attacks=4, skill=4, strength=4, ap=0, damage=1)
        mods = AttackModifiers(anti_wound_target=3)
        tank = TargetProfile("Tank", toughness=10, save=3, invulnerable_save=None,
                             wounds=10, keywords=["Vehicle"])
        assert compute_attack_result(wp, tank, mods).wound_target == 3

    # ── MH2: Anti N+ lowers the critical-wound threshold (Anti+Dev combo) ─────
    def test_anti_lowers_crit_wound_threshold_with_dev(self):
        wp   = WeaponProfile("Haywire", attacks=6, skill=3, strength=4, ap=0, damage=2)
        tank = TargetProfile("Tank", toughness=10, save=2, invulnerable_save=None,
                             wounds=12, keywords=["Vehicle"])
        r_dev  = compute_attack_result(wp, tank, AttackModifiers(devastating_wounds=True))
        r_anti = compute_attack_result(wp, tank, AttackModifiers(
            devastating_wounds=True, anti_entries=[("VEHICLE", 2)]))
        # vs a 2+ save: anti 2+ makes (nearly) every wound a save-bypassing crit
        assert r_anti.expected_damage > r_dev.expected_damage * 3, \
            f"Anti-2+ + Dev should dwarf Dev alone vs 2+ save: {r_anti.expected_damage} vs {r_dev.expected_damage}"

    def test_anti_crit_threshold_ev_mc_agree(self):
        wp   = WeaponProfile("Haywire", attacks=6, skill=3, strength=4, ap=0, damage=2)
        tank = TargetProfile("Tank", toughness=10, save=2, invulnerable_save=None,
                             wounds=12, keywords=["Vehicle"])
        mods = AttackModifiers(devastating_wounds=True, anti_entries=[("VEHICLE", 2)])
        ev = compute_attack_result(wp, tank, mods).expected_damage
        mc = monte_carlo_attack(wp, tank, mods, trials=8000, seed=42)["mean_damage"]
        assert abs(mc - ev) / ev < 0.10, f"EV {ev:.2f} and MC {mc:.2f} must agree"

    # ── MH4: Blast = +1 Attack per 5 models in the target unit (10e) ──────────
    # damage=4 vs T4/Sv4+ at BS4+ → exactly 0.5 dmg per attack: clean ratios.
    def _blast_unit(self, attacks):
        w = _make_weapon(name="Frag", attacks=attacks, damage=4, keywords=["BLAST"])
        return _make_unit(name="Squad", weapons=[w])

    def test_blast_plus_one_per_five_models(self):
        att = self._blast_unit("4")
        d1  = compute_combat(att, self._tgt_unit(), [], att_models=1, def_models=1)["ranged"]["expected_dmg"]
        d5  = compute_combat(att, self._tgt_unit(), [], att_models=1, def_models=5)["ranged"]["expected_dmg"]
        d10 = compute_combat(att, self._tgt_unit(), [], att_models=1, def_models=10)["ranged"]["expected_dmg"]
        assert abs(d5 / d1 - 5/4)  < 0.02, f"vs 5 models: 4→5 attacks, got ×{d5/d1:.3f}"
        assert abs(d10 / d1 - 6/4) < 0.02, f"vs 10 models: 4→6 attacks, got ×{d10/d1:.3f}"

    def test_blast_no_nine_ed_minimum_three_floor(self):
        att = self._blast_unit("1")
        d1 = compute_combat(att, self._tgt_unit(), [], att_models=1, def_models=1)["ranged"]["expected_dmg"]
        d5 = compute_combat(att, self._tgt_unit(), [], att_models=1, def_models=5)["ranged"]["expected_dmg"]
        d6 = compute_combat(att, self._tgt_unit(), [], att_models=1, def_models=6)["ranged"]["expected_dmg"]
        # 10e: A1 vs 5 models → 2 attacks (old rule gave nothing below 6 models)
        assert abs(d5 / d1 - 2.0) < 0.02, f"A1 blast vs 5 models should double, got ×{d5/d1:.3f}"
        # 10e: A1 vs 6 models → 2 attacks (old 9e floor forced 3)
        assert abs(d6 / d1 - 2.0) < 0.02, f"A1 blast vs 6 models is 2 attacks not the 9e min-3, got ×{d6/d1:.3f}"

    def test_blast_bonus_scales_per_firing_model(self):
        att = self._blast_unit("4")
        one   = compute_combat(att, self._tgt_unit(), [], att_models=1, def_models=10)["ranged"]["expected_dmg"]
        three = compute_combat(att, self._tgt_unit(), [], att_models=3, def_models=10)["ranged"]["expected_dmg"]
        assert abs(three / one - 3.0) < 0.02, f"Blast bonus applies per firing model, got ×{three/one:.3f}"

    # ── MH5: critical rolls auto-succeed even below the modified target ───────
    def test_crit_below_target_auto_hits_ev(self):
        wp   = WeaponProfile("Gun", attacks=6, skill=6, strength=4, ap=0, damage=1)
        tgt  = TargetProfile("T", toughness=4, save=4, invulnerable_save=None, wounds=1)
        r = compute_attack_result(wp, tgt, AttackModifiers(crit_hits_on=5))
        assert abs(r.hit_probability - 2/6) < 1e-9, \
            f"BS6+ with crits on 5+ must hit on 5s AND 6s: p={r.hit_probability}"

    def test_criton_lethal_ev_mc_agree(self):
        wp   = WeaponProfile("Gun", attacks=6, skill=6, strength=4, ap=0, damage=1)
        tgt  = TargetProfile("T", toughness=8, save=4, invulnerable_save=None, wounds=3)
        mods = AttackModifiers(crit_hits_on=5, lethal_hits=True)
        ev = compute_attack_result(wp, tgt, mods).expected_damage
        mc = monte_carlo_attack(wp, tgt, mods, trials=10000, seed=42)["mean_damage"]
        assert ev > 0
        assert abs(mc - ev) / ev < 0.10, \
            f"criton+lethal EV {ev:.2f} and MC {mc:.2f} must describe the same universe"


class TestRound3MedFixes:
    """2026-06-11 round 3: MEDIUM 10e rules-fidelity cluster —
    net ±1 modifier cap (MM1), torrent no crits (MM2), cover vs AP0 on 3+ (MM3),
    real defender model count (MM5), melta override (MM7), lance gating (MM6)."""

    def _tgt_unit(self, keywords=None, t=4, sv=4, w=1):
        u = _make_unit(name="Target", weapons=[], t=t, sv=sv, w=w)
        u["keywords"] = keywords or []
        return u

    # ── MM1: ±1 net modifier cap on hit and wound rolls ───────────────────────
    def test_hit_net_modifier_cap(self):
        # BS5+ with +3 to hit must cap at +1 → hits on 4+ (not 2+).
        wp  = WeaponProfile("Gun", attacks=1, skill=5, strength=4, ap=0, damage=1)
        tgt = _make_target(t=4, sv=4)
        r = compute_attack_result(wp, tgt, AttackModifiers(hit_bonus=3))
        assert r.hit_target == 4, f"net hit cap +1: BS5+ +3 → 4+, got {r.hit_target}"

    def test_wound_net_modifier_cap(self):
        # S4 vs T4 (4+) with +3 to wound must cap at +1 → wounds on 3+ (not 2+).
        wp  = WeaponProfile("Gun", attacks=1, skill=4, strength=4, ap=0, damage=1)
        tgt = _make_target(t=4, sv=4)
        r = compute_attack_result(wp, tgt, AttackModifiers(wound_bonus=3))
        assert r.wound_target == 3, f"net wound cap +1: 4+ with +3 → 3+, got {r.wound_target}"

    def test_hit_net_cap_mc_matches_ev(self):
        wp  = WeaponProfile("Gun", attacks=20, skill=5, strength=4, ap=0, damage=1)
        tgt = TargetProfile("T", toughness=4, save=4, invulnerable_save=None, wounds=1)
        mods = AttackModifiers(hit_bonus=3)
        ev = compute_attack_result(wp, tgt, mods).expected_damage
        mc = monte_carlo_attack(wp, tgt, mods, trials=8000, seed=42)["mean_damage"]
        assert abs(mc - ev) / ev < 0.10, f"net-cap EV {ev:.2f} and MC {mc:.2f} must agree"

    def test_flag_level_net_cap_equals_single_plus_one(self):
        # ml + heavy + hitplus1 on a HEAVY weapon = three +1s → capped to one +1.
        # Damage must equal the single-+1 (--ml alone) case.
        w   = _make_weapon(name="HBolter", attacks="4", bs="4+", s=4, ap=0, d=1, keywords=["HEAVY"])
        att = _make_unit(name="Squad", weapons=[w])
        dfn = _make_unit(name="Tgt", t=4, sv=4, w=1)
        triple = compute_combat(att, dfn, ["ml", "heavy", "hitplus1"])["ranged"]["expected_dmg"]
        single = compute_combat(att, dfn, ["ml"])["ranged"]["expected_dmg"]
        assert abs(triple - single) < 1e-9, \
            f"three stacked +1s must equal one +1 (net cap): {triple} vs {single}"

    # ── MM2: Torrent weapons cannot score Critical Hits ───────────────────────
    def test_torrent_no_crit_hits_ev(self):
        wp  = WeaponProfile("Flamer", attacks=6, skill=4, strength=4, ap=0, damage=1)
        tgt = TargetProfile("T", toughness=4, save=4, invulnerable_save=None, wounds=1)
        # Torrent + Sustained 1 + Lethal: crits never trigger, so exactly 6 hits.
        mods = AttackModifiers(use_torrent=True, sustained_hits=1, lethal_hits=True)
        r = compute_attack_result(wp, tgt, mods)
        assert r.expected_hits == 6.0, f"torrent auto-hits, no crit sustained: {r.expected_hits}"
        assert r.crit_hit_probability == 0.0, "torrent must score no critical hits"

    def test_torrent_no_crit_ev_mc_agree(self):
        wp  = WeaponProfile("Flamer", attacks=6, skill=4, strength=4, ap=0, damage=1)
        tgt = TargetProfile("T", toughness=4, save=4, invulnerable_save=None, wounds=3)
        mods = AttackModifiers(use_torrent=True, sustained_hits=1, lethal_hits=True)
        ev = compute_attack_result(wp, tgt, mods).expected_damage
        mc = monte_carlo_attack(wp, tgt, mods, trials=10000, seed=42)["mean_damage"]
        assert abs(mc - ev) / ev < 0.10, f"torrent EV {ev:.2f} and MC {mc:.2f} must agree"

    # ── MM3: Benefit of Cover gives no bonus vs AP0 on a 3+ or better save ────
    def test_cover_no_bonus_vs_ap0_on_three_plus(self):
        from data.combat_terminal.combat_math_engine import compute_save_target
        wp  = WeaponProfile("Bolter", attacks=1, skill=3, strength=4, ap=0, damage=1)
        tgt = TargetProfile("Marine", toughness=4, save=3, invulnerable_save=None,
                            wounds=2, cover=True)
        assert compute_save_target(tgt, wp, AttackModifiers()) == 3, \
            "Sv3+ in cover vs AP0 must stay 3+ (no cover bonus)"

    def test_cover_applies_vs_ap1_on_three_plus(self):
        from data.combat_terminal.combat_math_engine import compute_save_target
        wp  = WeaponProfile("Bolter", attacks=1, skill=3, strength=4, ap=1, damage=1)
        tgt = TargetProfile("Marine", toughness=4, save=3, invulnerable_save=None,
                            wounds=2, cover=True)
        # AP-1 worsens save to 4+, cover pulls it back to 3+ (cover DOES apply vs AP1).
        assert compute_save_target(tgt, wp, AttackModifiers()) == 3, \
            "Sv3+ in cover vs AP-1: cover applies → 3+"

    def test_cover_applies_vs_ap0_on_four_plus(self):
        from data.combat_terminal.combat_math_engine import compute_save_target
        wp  = WeaponProfile("Lasgun", attacks=1, skill=3, strength=3, ap=0, damage=1)
        tgt = TargetProfile("Guard", toughness=3, save=4, invulnerable_save=None,
                            wounds=1, cover=True)
        # Sv4+ is worse than 3+, so the AP0 cover restriction does NOT apply → 3+.
        assert compute_save_target(tgt, wp, AttackModifiers()) == 3, \
            "Sv4+ in cover vs AP0: cover applies → 3+"

    # ── MM5: target.models must be the real defender size ─────────────────────
    def test_expected_kills_capped_at_def_models(self):
        w   = _make_weapon(name="BigGun", attacks="10", bs="3+", s=8, ap=2, d="D3")
        att = _make_unit(name="Squad", weapons=[w])
        dfn = self._tgt_unit(t=4, sv=5, w=1)
        r = compute_combat(att, dfn, [], att_models=1, def_models=5)["ranged"]
        assert r["expected_kills"] <= 5, \
            f"expected_kills must be capped at squad size (5): {r['expected_kills']}"

    def test_kill_buckets_extend_past_one(self):
        w   = _make_weapon(name="BigGun", attacks="10", bs="3+", s=8, ap=2, d="D3")
        att = _make_unit(name="Squad", weapons=[w])
        dfn = self._tgt_unit(t=4, sv=5, w=1)
        r = compute_combat(att, dfn, [], att_models=1, def_models=5)
        mc = r["per_weapon_dmg"]["BigGun"]["mc"]
        buckets = mc["kill_bucket_probabilities"]
        assert any(int(k) > 1 for k in buckets), \
            f"MC kill buckets must extend past 1 for a 5-model squad: {list(buckets)}"

    # ── MM7: --melta:N overrides, does not stack with weapon Melta ────────────
    def test_melta_flag_overrides_keyword(self):
        w   = _make_weapon(name="Multimelta", attacks="2", bs="3+", s=9, ap=4, d="D6", keywords=["MELTA 2"])
        att = _make_unit(name="Squad", weapons=[w])
        dfn = self._tgt_unit(t=9, sv=3, w=12)
        # weapon Melta 2 + flag --melta2 must NOT become Melta 4 — identical to bare --melta.
        override = compute_combat(att, dfn, ["melta2"], att_models=1)["ranged"]["expected_dmg"]
        bare     = compute_combat(att, dfn, ["melta"],  att_models=1)["ranged"]["expected_dmg"]
        assert abs(override - bare) < 1e-9, \
            f"--melta2 on a MELTA 2 weapon must match bare --melta (no stacking): {override} vs {bare}"

    def test_bare_melta_applies_keyword_value(self):
        w   = _make_weapon(name="Multimelta", attacks="2", bs="3+", s=9, ap=4, d="D6", keywords=["MELTA 2"])
        att = _make_unit(name="Squad", weapons=[w])
        dfn = self._tgt_unit(t=9, sv=3, w=12)
        on  = compute_combat(att, dfn, ["melta"], att_models=1)["ranged"]["expected_dmg"]
        off = compute_combat(att, dfn, [],         att_models=1)["ranged"]["expected_dmg"]
        assert on > off, f"bare --melta must still add the keyword's Melta 2: {on} vs {off}"

    # ── MM6: --lance gated on the LANCE keyword ───────────────────────────────
    def test_lance_flag_only_buffs_lance_weapons(self):
        lance_w = _make_weapon(name="LanceWpn", attacks="6", bs="3+", s=6, ap=2, d=2, keywords=["LANCE"])
        plain_w = _make_weapon(name="PlainWpn", attacks="6", bs="3+", s=6, ap=2, d=2)
        att_l = _make_unit(name="L", weapons=[lance_w])
        att_p = _make_unit(name="P", weapons=[plain_w])
        dfn = self._tgt_unit(t=7, sv=3, w=3)
        l_on  = compute_combat(att_l, dfn, ["lance"], att_models=1)["ranged"]["expected_dmg"]
        l_off = compute_combat(att_l, dfn, [],        att_models=1)["ranged"]["expected_dmg"]
        p_on  = compute_combat(att_p, dfn, ["lance"], att_models=1)["ranged"]["expected_dmg"]
        p_off = compute_combat(att_p, dfn, [],        att_models=1)["ranged"]["expected_dmg"]
        assert l_on > l_off, f"--lance must buff a LANCE weapon: {l_on} vs {l_off}"
        assert abs(p_on - p_off) < 1e-9, \
            f"--lance must NOT buff a non-LANCE weapon: {p_on} vs {p_off}"

    # ── MM10: math ledger reads the engine's computed save_target ─────────────
    def test_ledger_save_event_matches_engine_for_invuln_unit(self):
        from data.combat_terminal.math_ledger import build_combat_ledger
        from data.combat_terminal.math_adapter import _weapon_to_profile, _unit_to_target
        from data.combat_terminal.combat_math_engine import compute_attack_result

        w   = _make_weapon(name="Lascannon", attacks="3", bs="3+", s=9, ap=2, d=3)
        att = _make_unit(name="Squad", weapons=[w])
        dfn = _make_unit(name="Daemon", t=5, sv=3, w=3)
        dfn["abilities"] = ["This model has a 4+ invulnerable save."]

        res = compute_combat(att, dfn, [], att_models=1, def_models=3)

        # Authoritative engine save target: AP-2 vs Sv3 → 5+, invuln 4+ wins → 4.
        ar = compute_attack_result(_weapon_to_profile(w)[0], _unit_to_target(dfn))
        assert ar.save_target == 4, f"engine save_target should be 4, got {ar.save_target}"
        assert res["per_weapon_dmg"]["Lascannon"]["save_target"] == ar.save_target, \
            "math_adapter must stamp the engine's save_target into per_weapon_dmg"

        weapons = [{
            "name": "Lascannon", "bs_ws": "3+", "strength": "9", "ap": "-2", "d": "3",
            "hit_pct": res["per_weapon_dmg"]["Lascannon"]["hit_pct"],
        }]
        ledger = build_combat_ledger(att, dfn, [], res, weapons)
        save_events = [ev for grp in ledger if grp.get("type") == "group"
                       for ev in grp["events"] if ev.get("label") == "save_target"]
        assert save_events, "ledger must contain a save_target event"
        assert save_events[0]["result"] == f"{ar.save_target}+", \
            f"ledger save event must reflect the engine's invuln-aware save_target: {save_events[0]['result']}"


class TestRound4MathFixes:
    """2026-06-11 round 4: MM4 (EV FNP per-damage-point kill math),
    MM9 (melee strike/sweep + pistol profile summing), MM11 (defender leader)."""

    def _tgt_unit(self, keywords=None, t=4, sv=4, w=1):
        u = _make_unit(name="Target", weapons=[], t=t, sv=sv, w=w)
        u["keywords"] = keywords or []
        return u

    # ── MM4: EV kills apply FNP per damage point and agree with MC ────────────
    def _ev_mc(self, wp, tgt, trials=40000):
        ev = compute_attack_result(wp, tgt)
        mc = monte_carlo_attack(wp, tgt, trials=trials, seed=42)
        return ev.expected_kills, mc["mean_kills"]

    def test_fnp_d3_multiwound_kills_ev_mc_agree(self):
        # D3 damage vs W2 + FNP5 — the case the old EV overstated ~30%.
        wp  = WeaponProfile("G", attacks=12, skill=3, strength=8, ap=3,
                            damage=2.0, damage_is_variable=True, damage_expression="D3")
        tgt = TargetProfile("T", toughness=6, save=4, invulnerable_save=None,
                            wounds=2, feel_no_pain=5, models=20)
        ek, mk = self._ev_mc(wp, tgt)
        assert abs(ek - mk) / mk < 0.10, f"D3/W2/FNP5 EV {ek:.2f} must track MC {mk:.2f}"

    def test_fnp_high_damage_kills_ev_mc_agree(self):
        # D6 damage vs W1 + FNP5 — old EV applied one FNP roll per whole wound (−27%).
        wp  = WeaponProfile("G", attacks=12, skill=3, strength=8, ap=3,
                            damage=3.5, damage_is_variable=True, damage_expression="D6")
        tgt = TargetProfile("T", toughness=6, save=4, invulnerable_save=None,
                            wounds=1, feel_no_pain=5, models=20)
        ek, mk = self._ev_mc(wp, tgt)
        assert abs(ek - mk) / mk < 0.08, f"D6/W1/FNP5 EV {ek:.2f} must track MC {mk:.2f}"

    def test_fnp_flat_damage_kills_ev_mc_agree(self):
        wp  = WeaponProfile("G", attacks=12, skill=3, strength=8, ap=3, damage=2.0)
        tgt = TargetProfile("T", toughness=6, save=4, invulnerable_save=None,
                            wounds=2, feel_no_pain=5, models=20)
        ek, mk = self._ev_mc(wp, tgt)
        assert abs(ek - mk) / mk < 0.10, f"flat2/W2/FNP5 EV {ek:.2f} must track MC {mk:.2f}"

    def test_no_fnp_oneshot_kills_preserved(self):
        # No FNP, damage ≥ W: every unsaved wound kills exactly one model. The
        # MM4 rewrite must NOT regress this previously-correct case.
        wp  = WeaponProfile("G", attacks=12, skill=3, strength=8, ap=3, damage=3.0)
        tgt = TargetProfile("T", toughness=6, save=4, invulnerable_save=None,
                            wounds=1, models=20)
        r = compute_attack_result(wp, tgt)
        assert abs(r.expected_kills - r.expected_unsaved_wounds) < 1e-9, \
            "no-FNP one-shot kills must equal unsaved wounds"

    # ── MM9: multi-profile weapons fire ONE profile, not all summed ───────────
    def test_multiprofile_not_double_summed(self):
        strike = _make_weapon(name="Sword - strike", attacks="4", bs="2+", s=8, ap=3, d=3, w_type="melee")
        sweep  = _make_weapon(name="Sword - sweep",  attacks="8", bs="2+", s=5, ap=1, d=1, w_type="melee")
        both   = _make_unit(name="Champ", weapons=[strike, sweep])
        only_s = _make_unit(name="Champ", weapons=[strike])
        only_w = _make_unit(name="Champ", weapons=[sweep])
        dfn = self._tgt_unit(t=4, sv=3, w=2)
        d_both = compute_combat(both,   dfn, [], att_models=1, def_models=5)["melee"]["expected_dmg"]
        d_s    = compute_combat(only_s, dfn, [], att_models=1, def_models=5)["melee"]["expected_dmg"]
        d_w    = compute_combat(only_w, dfn, [], att_models=1, def_models=5)["melee"]["expected_dmg"]
        assert abs(d_both - max(d_s, d_w)) < 1e-9, \
            f"multi-profile must equal the best single profile, not the sum: {d_both} vs max({d_s},{d_w})"
        assert d_both < d_s + d_w - 1e-9, "must NOT sum both profiles"

    def test_multiprofile_picks_best_for_target(self):
        strike = _make_weapon(name="Blade - strike", attacks="3", bs="2+", s=9, ap=3, d=3, w_type="melee")
        sweep  = _make_weapon(name="Blade - sweep",  attacks="9", bs="2+", s=4, ap=0, d=1, w_type="melee")
        att    = _make_unit(name="C", weapons=[strike, sweep])
        # vs a tough multi-wound elite → strike (high S/AP/D) wins
        elite  = self._tgt_unit(t=9, sv=2, w=4)
        d_pick  = compute_combat(att, elite, [], att_models=1, def_models=1)["melee"]["expected_dmg"]
        d_strike = compute_combat(_make_unit(name="C", weapons=[strike]), elite, [], att_models=1, def_models=1)["melee"]["expected_dmg"]
        assert abs(d_pick - d_strike) < 1e-9, "vs elite the engine must pick the strike profile"
        # vs a weak horde → sweep (more attacks) wins
        horde  = self._tgt_unit(t=3, sv=6, w=1)
        d_pick2 = compute_combat(att, horde, [], att_models=1, def_models=10)["melee"]["expected_dmg"]
        d_sweep = compute_combat(_make_unit(name="C", weapons=[sweep]), horde, [], att_models=1, def_models=10)["melee"]["expected_dmg"]
        assert abs(d_pick2 - d_sweep) < 1e-9, "vs a horde the engine must pick the sweep profile"

    def test_single_profile_weapon_unaffected(self):
        # A lone profile (its siblings filtered out) must pass through unchanged.
        w   = _make_weapon(name="Plasma pistol - standard", attacks="1", bs="3+", s=7, ap=2, d=1)
        att = _make_unit(name="C", weapons=[w])
        plain = _make_unit(name="C", weapons=[_make_weapon(name="Plasma pistol", attacks="1", bs="3+", s=7, ap=2, d=1)])
        dfn = self._tgt_unit(t=4, sv=3, w=1)
        d1 = compute_combat(att,   dfn, [], att_models=1, def_models=1)["ranged"]["expected_dmg"]
        d2 = compute_combat(plain, dfn, [], att_models=1, def_models=1)["ranged"]["expected_dmg"]
        assert abs(d1 - d2) < 1e-9, "a single surviving profile must compute identically to a plain weapon"

    def test_fnp_reduces_kills_more_than_old_per_wound(self):
        # Sanity: FNP must reduce kills vs no FNP, and the multi-damage case must
        # come out BELOW the naive expected_damage/W the old code used.
        wp  = WeaponProfile("G", attacks=12, skill=3, strength=8, ap=3,
                            damage=3.5, damage_is_variable=True, damage_expression="D6")
        no_fnp = compute_attack_result(
            wp, TargetProfile("T", 6, 4, None, 3, models=20)).expected_kills
        fnp = compute_attack_result(
            wp, TargetProfile("T", 6, 4, None, 3, feel_no_pain=5, models=20)).expected_kills
        assert fnp < no_fnp, "FNP must reduce expected kills"


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
        TestCrusadeDefensiveFlags,
        TestWoundTableSync,
        TestFlagRegistrySync,
        TestMonteCarloVariance,
        TestKeywordVariantNormalisation,
        TestPerModelAttackBonusScaling,
        TestTenthEdRulesFixes,
        TestRound3MedFixes,
        TestRound4MathFixes,
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
