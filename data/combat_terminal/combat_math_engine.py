
"""
combat_math_engine.py

A flexible Warhammer 40K combat math engine designed for the Tau AI system.

Goals
-----
- Support exact expected value calculations.
- Support Monte Carlo simulation.
- Make modifier handling explicit and configurable.
- Allow optional inclusion of markerlight / guidance style hit bonuses.
- Allow stratagems, abilities, and temporary effects to modify:
    * hit rolls
    * wound rolls
    * save rolls
    * AP
    * damage
    * attacks/shots
    * lethal / sustained style effects
- Keep the interface generic enough for non-Tau factions later.
"""

from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Any, Dict, List, Optional, Tuple
import json
import math
import random
import re
import statistics


def clamp(n: int, low: int, high: int) -> int:
    return max(low, min(high, n))


def parse_roll_value(value: str | int | None) -> Optional[int]:
    if value is None:
        return None
    if isinstance(value, int):
        return value
    s = str(value).strip().replace("+", "")
    if s.isdigit():
        return int(s)
    return None


def success_probability(target: int, reroll: str = "none", crit_on: int = 6) -> float:
    # 10e: critical rolls (unmodified crit_on+) ALWAYS succeed, even when the
    # modified target is higher — e.g. BS 6+ with crits on 5+ hits on 5s and 6s.
    # crit_on defaults to 6, so callers without a crit concept (save rolls) are
    # unaffected: targets are clamped to 2–6 and min(target, 6) is a no-op.
    target = min(clamp(target, 2, 6), clamp(crit_on, 2, 6))
    base_successes = max(0, 7 - target)
    p_success = base_successes / 6.0

    if reroll == "none":
        return p_success
    if reroll == "ones":
        p_one = 1 / 6.0
        return p_success + p_one * p_success
    if reroll == "failed":
        return p_success + (1 - p_success) * p_success
    raise ValueError(f"Unknown reroll mode: {reroll}")


def crit_probability(target: int, reroll: str = "none", crit_on: int = 6) -> float:
    crit_on = clamp(crit_on, 2, 6)
    base_crit = max(0, 7 - crit_on) / 6.0

    if reroll == "none":
        return base_crit
    if reroll == "ones":
        return base_crit + (1 / 6.0) * base_crit
    if reroll == "failed":
        # Pass crit_on through: a crit below the modified target still succeeds,
        # so it is never rerolled — p_fail must use the crit-aware success prob.
        p_success = success_probability(target, reroll="none", crit_on=crit_on)
        p_fail = 1 - p_success
        return base_crit + p_fail * base_crit
    raise ValueError(f"Unknown reroll mode: {reroll}")


def wound_target(strength: int, toughness: int) -> int:
    """Standard 10th-ed Strength-vs-Toughness to-wound target (2–6).

    This is the single canonical wound chart for the whole project.  The display
    helpers ``engine._baseline_wr`` and ``math_ledger._s_vs_t_target`` both parse
    raw stat strings and delegate here via ``wound_target_from_raw`` so the
    *displayed* wound target can never desync from the *computed* one.
    """
    if strength >= toughness * 2:
        return 2
    if strength > toughness:
        return 3
    if strength == toughness:
        return 4
    if strength * 2 <= toughness:
        return 6
    return 5


def _coerce_stat_int(value) -> Optional[int]:
    """Parse a possibly-string stat like '5', '5+', '6"' → int, else None."""
    if value is None:
        return None
    try:
        return int(str(value).replace("+", "").replace('"', "").strip())
    except (TypeError, ValueError):
        return None


def wound_target_from_raw(strength, toughness) -> Optional[int]:
    """Parse raw (possibly-string) S and T and return the to-wound target, or
    None if either value can't be parsed.  Thin wrapper over ``wound_target``."""
    s = _coerce_stat_int(strength)
    t = _coerce_stat_int(toughness)
    if s is None or t is None:
        return None
    return wound_target(s, t)


@dataclass
class WeaponProfile:
    name: str
    attacks: float
    skill: int
    strength: int
    ap: int
    damage: float
    range: Optional[str] = None
    keywords: List[str] = field(default_factory=list)
    damage_is_variable: bool = False
    damage_expression: Optional[str] = None
    attacks_is_variable: bool = False
    attacks_expression: Optional[str] = None



@dataclass
class TargetProfile:
    name: str
    toughness: int
    save: int
    invulnerable_save: Optional[int]
    wounds: int
    models: int = 1
    feel_no_pain: Optional[int] = None
    damage_reduction: int = 0
    cover: bool = False
    keywords: List[str] = field(default_factory=list)  # defender keywords — gate Anti-X


@dataclass
class AttackModifiers:
    hit_bonus: int = 0
    hit_penalty: int = 0
    reroll_hits: str = "none"
    crit_hits_on: int = 6
    sustained_hits: int = 0
    lethal_hits: bool = False

    wound_bonus: int = 0
    wound_penalty: int = 0
    reroll_wounds: str = "none"
    crit_wounds_on: int = 6
    devastating_wounds: bool = False

    save_bonus: int = 0
    save_penalty: int = 0
    ignore_cover: bool = False
    ap_modifier: int = 0
    invuln_modifier: int = 0

    extra_attacks: float = 0.0
    flat_damage_bonus: float = 0.0
    damage_multiplier: float = 1.0

    use_markerlights: bool = False
    markerlight_hit_bonus: int = 1

    use_rapid_fire: bool = False   # flag: signals weapon is within half range; RF N applied conditionally
    rf_value: float = 0.0          # RF N parsed from keyword — added to extra_attacks only when use_rapid_fire
    use_melta: bool = False        # flag: signals weapon is within half range; Melta N applied conditionally
    melta_value: float = 0.0      # Melta N parsed from keyword — added to flat_damage_bonus only when use_melta
    use_blast: bool = False        # flag: Blast → +1 Attack per 5 models in the target unit (10e)
    use_lance: bool = False        # flag: CLI resolves per-weapon Lance → +1 wound_bonus
    use_heavy: bool = False        # flag: unit Remained Stationary; Heavy weapons get +1 to hit
    is_heavy: bool = False         # per-weapon: weapon has HEAVY keyword

    use_torrent: bool = False      # auto-detected: weapon auto-hits (no BS roll needed)
    anti_wound_target: Optional[int] = None  # Manual/unconditional: Anti N+ regardless of target keywords
    # Keyword-gated Anti-X entries parsed from the weapon: list of (keyword, N).
    # Resolved vs the defender's keywords at compute time (10e: Anti-FLY only
    # applies against FLY units) — see resolve_anti_threshold().
    anti_entries: List[Any] = field(default_factory=list)

    use_overwatch: int = 0         # 0 = normal, 6 = overwatch (hits on 6+), 5 = hits on 5+

    active_effects: List[str] = field(default_factory=list)


@dataclass
class AttackResult:
    weapon_name: str
    hit_target: int
    wound_target: int
    save_target: Optional[int]
    hit_probability: float
    crit_hit_probability: float
    wound_probability_given_hit: float
    crit_wound_probability_given_wound_roll: float
    failed_save_probability: float
    expected_hits: float
    expected_wounds: float
    expected_unsaved_wounds: float
    expected_damage: float
    expected_kills: float
    notes: List[str] = field(default_factory=list)


def _target_keyword_tokens(target: TargetProfile) -> set:
    """Uppercased word tokens from the defender's keyword list.  Tokenising on
    whitespace survives the dossier parse artifacts ('KEYWORDS: Vehicle',
    merged tails like 'Broadside T'au Empire')."""
    tokens: set = set()
    for k in (target.keywords or []):
        for tok in str(k).upper().replace(",", " ").split():
            tokens.add(tok.strip(":"))
    return tokens


def resolve_anti_threshold(mods: AttackModifiers, target: TargetProfile) -> Optional[int]:
    """Effective Anti-X N+ threshold against THIS target, or None.

    10e: Anti-KEYWORD N+ only applies when the target has the matching keyword.
    Keyword-gated entries come from ``mods.anti_entries``; a directly-set
    ``mods.anti_wound_target`` (manual/legacy path) applies unconditionally.
    Returns the best (lowest) applicable threshold.
    """
    candidates: List[int] = []
    if mods.anti_wound_target is not None:
        candidates.append(int(mods.anti_wound_target))
    if mods.anti_entries:
        tokens = _target_keyword_tokens(target)
        for entry in mods.anti_entries:
            try:
                kw, t = entry
            except (TypeError, ValueError):
                continue
            if str(kw).upper() in tokens:
                candidates.append(int(t))
    return min(candidates) if candidates else None


def apply_tau_markerlights(mods: AttackModifiers) -> AttackModifiers:
    new_mods = AttackModifiers(**asdict(mods))
    if new_mods.use_markerlights:
        new_mods.hit_bonus += new_mods.markerlight_hit_bonus
        new_mods.ignore_cover = True  # Markerlights / Guided grants Ignores Cover
        if "Markerlights / Guided bonus applied" not in new_mods.active_effects:
            new_mods.active_effects.append("Markerlights / Guided bonus applied")
    return new_mods


def make_stratagem(name: str, **kwargs: Any) -> Dict[str, Any]:
    payload = {"name": name}
    payload.update(kwargs)
    return payload


def apply_effects(base_mods: Optional[AttackModifiers], effects: Optional[List[Dict[str, Any]]]) -> AttackModifiers:
    mods = AttackModifiers(**asdict(base_mods or AttackModifiers()))
    for effect in effects or []:
        name = effect.get("name", "Unnamed effect")
        for key, value in effect.items():
            if key == "name":
                continue
            if not hasattr(mods, key):
                continue
            current = getattr(mods, key)
            if isinstance(current, (int, float)) and isinstance(value, (int, float)):
                setattr(mods, key, current + value)
            elif isinstance(current, list) and isinstance(value, list):
                setattr(mods, key, current + value)
            elif isinstance(current, bool) and isinstance(value, bool):
                setattr(mods, key, current or value)
            else:
                setattr(mods, key, value)
        mods.active_effects.append(name)
    return mods


def compute_save_target(target: TargetProfile, weapon: WeaponProfile, mods: AttackModifiers) -> Optional[int]:
    # ap_modifier < 0 improves AP (more penetration); > 0 worsens it.
    # Floor effective AP at 0 — worsening AP can cancel penetration but never
    # grants the defender a *bonus* save below their printed armour.
    effective_ap = max(0, weapon.ap - mods.ap_modifier)
    armor_save = target.save

    cover_bonus = 0
    if target.cover and not mods.ignore_cover:
        cover_bonus += 1

    # AP adds to the roll target the defender needs — more AP (more negative in 40K)
    # means a higher roll is required to save, so effective_ap is ADDED here.
    # e.g. AP-2 (stored unsigned as 2) vs 3+ save → need 5+ to save (3+2=5).
    effective_armor = armor_save - cover_bonus - mods.save_bonus + mods.save_penalty + effective_ap
    effective_armor = clamp(effective_armor, 2, 7)

    invuln = target.invulnerable_save
    if invuln is not None:
        invuln = clamp(invuln - mods.invuln_modifier, 2, 7)

    candidates = []
    if effective_armor <= 6:
        candidates.append(effective_armor)
    if invuln is not None and invuln <= 6:
        candidates.append(invuln)

    if not candidates:
        return None
    return min(candidates)


def compute_attack_result(
    weapon: WeaponProfile,
    target: TargetProfile,
    base_mods: Optional[AttackModifiers] = None,
    extra_effects: Optional[List[Dict[str, Any]]] = None,
) -> AttackResult:
    mods = apply_tau_markerlights(apply_effects(base_mods, extra_effects))

    raw_hit = parse_roll_value(weapon.skill)
    if raw_hit is None:
        raise ValueError(f"Invalid weapon skill for {weapon.name}: {weapon.skill}")

    hit_target = clamp(raw_hit - mods.hit_bonus + mods.hit_penalty, 2, 6)
    p_hit = success_probability(hit_target, reroll=mods.reroll_hits, crit_on=mods.crit_hits_on)
    p_crit_hit = crit_probability(hit_target, reroll=mods.reroll_hits, crit_on=mods.crit_hits_on)

    # Torrent: weapon auto-hits — no BS roll needed; crits still trigger on natural 6s
    if mods.use_torrent:
        p_hit = 1.0
        p_crit_hit = 1 / 6.0

    base_wound_target = wound_target(weapon.strength, target.toughness)
    final_wound_target = clamp(base_wound_target - mods.wound_bonus + mods.wound_penalty, 2, 6)

    # Anti-X N+ (keyword-gated vs this target): an unmodified wound roll of N+
    # is a CRITICAL wound (10e) — it both auto-succeeds and triggers crit-wound
    # effects (Devastating Wounds), so the crit threshold drops to N as well.
    crit_wounds_eff = mods.crit_wounds_on
    anti_t = resolve_anti_threshold(mods, target)
    if anti_t is not None:
        final_wound_target = clamp(min(final_wound_target, anti_t), 2, 6)
        crit_wounds_eff = min(crit_wounds_eff, anti_t)
    p_wound_roll_success = success_probability(final_wound_target, reroll=mods.reroll_wounds, crit_on=crit_wounds_eff)
    p_crit_wound = crit_probability(final_wound_target, reroll=mods.reroll_wounds, crit_on=crit_wounds_eff)

    save_target = compute_save_target(target, weapon, mods)
    p_fail_save = 1.0 if save_target is None else (1 - success_probability(save_target, reroll="none"))

    attacks = max(0.0, weapon.attacks + mods.extra_attacks)

    expected_hits = attacks * (p_hit + p_crit_hit * mods.sustained_hits)

    # ── Lethal Hits ──────────────────────────────────────────────────────────
    # Crit hits auto-wound (skip wound roll) and proceed directly to saves.
    expected_auto_wounds = attacks * p_crit_hit if mods.lethal_hits else 0.0

    # ── Hits that roll to wound ───────────────────────────────────────────────
    # With Lethal Hits: only non-crit hits + sustained extras roll to wound
    #                   (crit itself already became an auto-wound)
    # Without Lethal Hits: ALL hits (including crits) roll to wound,
    #                      plus any sustained extras from crits
    if mods.lethal_hits:
        expected_wound_roll_hits = (attacks * max(0.0, p_hit - p_crit_hit)
                                    + attacks * p_crit_hit * mods.sustained_hits)
    else:
        expected_wound_roll_hits = (attacks * p_hit
                                    + attacks * p_crit_hit * mods.sustained_hits)

    # ── Devastating Wounds ───────────────────────────────────────────────────
    # Crit wound rolls (natural 6 on wound) bypass ALL saves as mortal wounds.
    # Normal wound successes still go through armor/invuln saves.
    if mods.devastating_wounds:
        expected_dev_wounds    = expected_wound_roll_hits * p_crit_wound
        expected_normal_wounds = expected_wound_roll_hits * (p_wound_roll_success - p_crit_wound)
        expected_wounds  = expected_auto_wounds + expected_dev_wounds + expected_normal_wounds
        # Auto-wounds (lethal) + normal wounds → armor/invuln saves
        # Devastating crit wounds → bypass saves entirely
        expected_unsaved = ((expected_auto_wounds + expected_normal_wounds) * p_fail_save
                            + expected_dev_wounds)
    else:
        expected_wound_roll_wounds = expected_wound_roll_hits * p_wound_roll_success
        expected_wounds  = expected_auto_wounds + expected_wound_roll_wounds
        expected_unsaved = expected_wounds * p_fail_save

    effective_damage = max(1.0, ((weapon.damage + mods.flat_damage_bonus) * mods.damage_multiplier) - target.damage_reduction)
    expected_damage = expected_unsaved * effective_damage

    if target.feel_no_pain is not None:
        fnp_success = success_probability(target.feel_no_pain, reroll="none")
        expected_damage *= (1 - fnp_success)

    # Kill calculation with overkill correction.
    # In 40K, excess damage on a model is wasted — it doesn't spill to the next model.
    # Each unsaved wound can kill at most 1 model.  When effective_damage > target.wounds,
    # the useful fraction of each wound's damage is (wounds / effective_damage).
    wounds_per_model = max(1, target.wounds)
    if effective_damage <= wounds_per_model:
        # Low-damage weapons: multiple wounds needed per kill, no overkill waste
        expected_kills = expected_damage / wounds_per_model
    else:
        # High-damage weapons: each unsaved wound kills exactly 1 model (excess wasted)
        # Apply FNP-adjusted unsaved wound count directly
        expected_kills = expected_unsaved
        if target.feel_no_pain is not None:
            fnp_success_rate = success_probability(target.feel_no_pain, reroll="none")
            expected_kills *= (1 - fnp_success_rate)

    notes = []
    if mods.use_markerlights:
        notes.append("Markerlights / guided bonus included.")
    if mods.active_effects:
        notes.append("Active effects: " + ", ".join(mods.active_effects))

    return AttackResult(
        weapon_name=weapon.name,
        hit_target=hit_target,
        wound_target=final_wound_target,
        save_target=save_target,
        hit_probability=p_hit,
        crit_hit_probability=p_crit_hit,
        wound_probability_given_hit=p_wound_roll_success,
        crit_wound_probability_given_wound_roll=p_crit_wound,
        failed_save_probability=p_fail_save,
        expected_hits=expected_hits,
        expected_wounds=expected_wounds,
        expected_unsaved_wounds=expected_unsaved,
        expected_damage=expected_damage,
        expected_kills=expected_kills,
        notes=notes,
    )


def roll_d6(rng=random) -> int:
    return rng.randint(1, 6)


_DICE_EXPR_RE = re.compile(r"(\d*)D(\d+)\s*([+-]\s*\d+)?", re.IGNORECASE)


def roll_dice_expression(expr, rng=random) -> Optional[int]:
    """Roll an actual result for a dice expression like 'D6', '2D6+1', 'D3'.

    Returns a sampled integer (NOT the expected value):
        "3"     → 3
        "D6"    → 1..6
        "D6+1"  → 2..7
        "2D6"   → 2..12
    Plain integers return themselves; unparsable expressions return None so the
    caller can fall back to the weapon's stored expected value.
    """
    if expr is None:
        return None
    s = str(expr).strip()
    if re.fullmatch(r"\d+", s):
        return int(s)
    m = _DICE_EXPR_RE.search(s)
    if not m:
        try:
            return int(round(float(s)))
        except ValueError:
            return None
    count   = int(m.group(1)) if m.group(1) else 1
    sides   = int(m.group(2))
    mod_str = (m.group(3) or "").replace(" ", "")
    mod     = int(mod_str) if mod_str else 0
    return sum(rng.randint(1, sides) for _ in range(count)) + mod


def _passes_roll(target: int, rng=random) -> bool:
    return roll_d6(rng) >= target


def _reroll_mode(target: int, mode: str, rng=random) -> Tuple[bool, int]:
    first = roll_d6(rng)
    if first >= target:
        return True, first

    if mode == "none":
        return False, first
    if mode == "ones":
        if first == 1:
            second = roll_d6(rng)
            return second >= target, second
        return False, first
    if mode == "failed":
        second = roll_d6(rng)
        return second >= target, second

    raise ValueError(f"Unknown reroll mode: {mode}")


def monte_carlo_attack(
    weapon: WeaponProfile,
    target: TargetProfile,
    base_mods: Optional[AttackModifiers] = None,
    extra_effects: Optional[List[Dict[str, Any]]] = None,
    trials: int = 100000,
    seed: Optional[int] = 42,
    attacks_volleys: int = 1,
) -> Dict[str, Any]:
    """Monte Carlo attack simulation.

    Variable damage and attacks are *sampled* per trial (not collapsed to their
    expected value) when ``weapon.damage_is_variable`` / ``weapon.attacks_is_variable``
    are set and an expression is present — so a D6-damage weapon shows wider
    spread (and a wider confidence band) than a flat-damage weapon of equal EV.

    ``attacks_volleys``: for a variable-attacks weapon fired by a squad, roll the
    attacks expression this many times per trial and sum (one volley per firing
    model), instead of pre-multiplying the expected value.
    """
    # trials=0 is the adapter's "MC disabled" sentinel — it must short-circuit
    # in the caller (math_adapter._run_mc), never reach the simulation (the
    # kill-probability division and statistics.mean would both blow up).
    if trials <= 0:
        raise ValueError(f"monte_carlo_attack requires trials >= 1 (got {trials})")

    # Dedicated RNG per simulation — never touch the global `random` stream.
    # Previously this did `random.seed(42)`, which clobbered the module-global
    # RNG that the `dice` roller also draws from, so rolling a combat then
    # rolling dice produced correlated results. A local Random keeps the
    # seed=42 reproducibility of the confidence bands while staying independent
    # (seed=None → seeded from OS entropy).
    rng = random.Random(seed)

    mods = apply_tau_markerlights(apply_effects(base_mods, extra_effects))

    raw_hit = parse_roll_value(weapon.skill)
    if raw_hit is None:
        raise ValueError(f"Invalid weapon skill for {weapon.name}: {weapon.skill}")

    hit_target = clamp(raw_hit - mods.hit_bonus + mods.hit_penalty, 2, 6)
    wound_t = clamp(wound_target(weapon.strength, target.toughness) - mods.wound_bonus + mods.wound_penalty, 2, 6)

    # Anti-X N+ (keyword-gated): N+ wound rolls are CRITICAL wounds (10e) —
    # they auto-succeed and the crit-wound threshold drops to N.
    crit_wounds_eff = mods.crit_wounds_on
    anti_t = resolve_anti_threshold(mods, target)
    if anti_t is not None:
        wound_t = clamp(min(wound_t, anti_t), 2, 6)
        crit_wounds_eff = min(crit_wounds_eff, anti_t)

    # Critical rolls always succeed (10e) — the roll target a die must meet is
    # the better of the modified target and the crit threshold, mirroring
    # success_probability in the EV path.
    hit_roll_target   = min(hit_target, clamp(mods.crit_hits_on, 2, 6))
    wound_roll_target = min(wound_t, clamp(crit_wounds_eff, 2, 6))

    save_t = compute_save_target(target, weapon, mods)

    # Fixed (EV) attack count — used when the weapon's attacks are not variable.
    attacks_fixed = int(max(0, round(weapon.attacks + mods.extra_attacks)))
    sample_attacks = bool(weapon.attacks_is_variable and weapon.attacks_expression)

    sample_damage = bool(weapon.damage_is_variable and weapon.damage_expression)
    # EV per-wound damage (used when damage is not variable, or as a fallback).
    effective_damage = max(1.0, ((weapon.damage + mods.flat_damage_bonus) * mods.damage_multiplier) - target.damage_reduction)

    def _sample_attacks() -> int:
        if not sample_attacks:
            return attacks_fixed
        rolled = 0
        for _ in range(max(1, attacks_volleys)):
            r = roll_dice_expression(weapon.attacks_expression, rng)
            rolled += r if r is not None else weapon.attacks
        return int(max(0, round(rolled + mods.extra_attacks)))

    def _roll_damage() -> float:
        """Effective damage for one unsaved wound, sampling the damage dice when
        the weapon has variable damage."""
        if not sample_damage:
            return effective_damage
        base = roll_dice_expression(weapon.damage_expression, rng)
        if base is None:
            base = weapon.damage
        return max(1.0, ((base + mods.flat_damage_bonus) * mods.damage_multiplier) - target.damage_reduction)

    total_damage = []
    total_kills = []
    total_overkill = []
    wounds_per_model = max(1, target.wounds)

    for _ in range(trials):
        damage_this_trial = 0.0
        overkill_this_trial = 0.0
        # Track wound allocation per-model: in 40K, each unsaved wound's damage
        # is allocated to one model.  Excess damage on a model is WASTED — it does
        # not spill to the next model.  We track remaining HP on the current model.
        current_model_hp = wounds_per_model
        kills_this_trial = 0

        attacks = _sample_attacks()
        for _ in range(attacks):
            # Torrent: auto-hits — roll a d6 only to check for crit
            if mods.use_torrent:
                hit_success = True
                natural_hit = roll_d6(rng)
            else:
                hit_success, natural_hit = _reroll_mode(hit_roll_target, mods.reroll_hits, rng)
            if not hit_success:
                continue

            crit_hit = natural_hit >= mods.crit_hits_on
            # sustained_hits may be a float EV (dice-valued keyword, e.g. "SUSTAINED
            # HITS D3" → 2.0) — round per crit so the hit count stays integral.
            pending_hits = 1 + (int(round(mods.sustained_hits)) if crit_hit else 0)

            auto_wounds = 1 if (mods.lethal_hits and crit_hit) else 0
            rolled_hits = pending_hits - auto_wounds

            # wounds: go through save roll normally (lethal auto-wounds + normal wound rolls)
            # wounds_dev: devastating crit wounds — bypass all saves
            wounds = auto_wounds
            wounds_dev = 0

            for _ in range(max(0, rolled_hits)):
                wound_success, natural_wound = _reroll_mode(wound_roll_target, mods.reroll_wounds, rng)
                if wound_success:
                    crit_wound = natural_wound >= crit_wounds_eff
                    if mods.devastating_wounds and crit_wound:
                        wounds_dev += 1
                    else:
                        wounds += 1

            # Normal wounds — roll saves, allocate damage per-wound
            for _ in range(wounds):
                failed = True
                if save_t is not None:
                    failed = not _passes_roll(save_t, rng)
                if failed:
                    dmg = _roll_damage()
                    if target.feel_no_pain is not None:
                        prevented = 0
                        for _ in range(int(math.floor(dmg))):
                            if _passes_roll(target.feel_no_pain, rng):
                                prevented += 1
                        dmg = max(0, dmg - prevented)
                    damage_this_trial += dmg
                    # Allocate to current model — excess is wasted overkill
                    current_model_hp -= dmg
                    if current_model_hp <= 0:
                        overkill_this_trial += abs(current_model_hp)  # excess beyond 0 HP
                        kills_this_trial += 1
                        current_model_hp = wounds_per_model  # next model at full HP

            # Devastating wounds — bypass saves, FNP still applies
            for _ in range(wounds_dev):
                dmg = _roll_damage()
                if target.feel_no_pain is not None:
                    prevented = 0
                    for _ in range(int(math.floor(dmg))):
                        if _passes_roll(target.feel_no_pain, rng):
                            prevented += 1
                    dmg = max(0, dmg - prevented)
                damage_this_trial += dmg
                # Allocate to current model — excess is wasted overkill
                current_model_hp -= dmg
                if current_model_hp <= 0:
                    overkill_this_trial += abs(current_model_hp)
                    kills_this_trial += 1
                    current_model_hp = wounds_per_model

        total_damage.append(damage_this_trial)
        total_kills.append(kills_this_trial)
        total_overkill.append(overkill_this_trial)

    kill_probs = {}
    max_bucket = min(10, max(1, target.models))
    for bucket in range(0, max_bucket + 1):
        kill_probs[str(bucket)] = sum(1 for k in total_kills if k == bucket) / trials

    mean_dmg   = statistics.mean(total_damage)
    std_dmg    = statistics.stdev(total_damage) if len(total_damage) > 1 else 0.0
    mean_kills = statistics.mean(total_kills)

    # 95% confidence interval half-width as % of mean (margin of error)
    # Using standard error: SE = std / sqrt(n); 95% CI ≈ 1.96 * SE
    std_err     = std_dmg / math.sqrt(trials) if trials > 0 else 0.0
    margin_95ci = 1.96 * std_err
    # Express as % of mean for display (avoid div/0 when mean is 0)
    margin_95ci_pct = round((margin_95ci / mean_dmg * 100), 2) if mean_dmg > 0 else 0.0

    # Swinginess: coefficient of variation (std/mean) — 0 = perfectly predictable
    swinginess_cv = round(std_dmg / mean_dmg, 3) if mean_dmg > 0 else 0.0
    if   swinginess_cv < 0.15:  swinginess_label = "Stable"
    elif swinginess_cv < 0.30:  swinginess_label = "Moderate"
    elif swinginess_cv < 0.50:  swinginess_label = "Variable"
    else:                        swinginess_label = "Swingy"

    # Overkill: % of total damage that was excess on killed models.
    # Only counts damage beyond what was needed to remove a model — NOT
    # damage that wounded a model without killing it (that's still useful).
    mean_overkill = statistics.mean(total_overkill) if total_overkill else 0.0
    overkill_waste_pct = round((mean_overkill / mean_dmg * 100), 1) if mean_dmg > 0 else 0.0

    return {
        "weapon_name":            weapon.name,
        "trials":                 trials,
        "mean_damage":            round(mean_dmg,   3),
        "mean_kills":             round(mean_kills,  3),
        "median_damage":          round(statistics.median(total_damage), 3),
        "std_dev_damage":         round(std_dmg,    3),
        "margin_of_error_95ci":   round(margin_95ci, 3),
        "margin_of_error_95ci_pct": margin_95ci_pct,
        "swinginess_cv":          swinginess_cv,
        "swinginess_label":       swinginess_label,
        "overkill_waste_pct":     overkill_waste_pct,
        "max_damage_observed":    max(total_damage) if total_damage else 0,
        "kill_bucket_probabilities": kill_probs,
        "notes": [
            "Monte Carlo output approximates discrete outcomes better than exact EV alone.",
            "Use especially for low-shot high-damage weapons like railguns."
        ],
    }


