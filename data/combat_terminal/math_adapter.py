"""
math_adapter.py

Translates between the dossier's data format (how parsed_dossier.json stores
weapons and units) and the CombatMathEngine's typed dataclasses.

Public surface:
    compute_combat(attacker_unit, defender_unit, flags) -> dict

The returned dict slots directly into engine.py's _query_combat response shape:
    {
        "ranged":         { expected_dmg, expected_kills, kill_chance_pct, ... }  or None,
        "melee":          { ... }  or None,
        "per_weapon_dmg": { weapon_name: { dmg, kills }, ... },
        "target_profile": { toughness, save, wounds, invuln },
    }
"""

from __future__ import annotations

import re
from copy import copy
from dataclasses import fields as dc_fields
from typing import Optional

from data.combat_terminal.combat_math_engine import (
    AttackModifiers,
    AttackResult,
    TargetProfile,
    WeaponProfile,
    compute_attack_result,
    monte_carlo_attack,
)

# ─── Monte Carlo config ────────────────────────────────────────────────────────
# Reduced trial count keeps UI response time under ~0.3s for typical unit matchups.
# The deterministic EV calculation always runs; MC runs on top to provide variance
# metrics (swinginess, error margin, kill distribution).
_MC_TRIALS = 5000
_MC_SEED   = 42


# ─── Dice expression parser ────────────────────────────────────────────────────

_DICE_RE = re.compile(r"(\d*)D(\d+)\s*([+-]\s*\d+)?", re.IGNORECASE)


def _expected_dice(expr) -> tuple[float, bool, Optional[str]]:
    """Return (expected_value, is_variable, raw_expression).

    Examples:
        "2"      → (2.0,  False, None)
        "D6"     → (3.5,  True,  "D6")
        "D6+1"   → (4.5,  True,  "D6+1")
        "2D6"    → (7.0,  True,  "2D6")
        "D3"     → (2.0,  True,  "D3")
        "D6+2"   → (5.5,  True,  "D6+2")
    """
    if expr is None:
        return 1.0, False, None
    s = str(expr).strip()

    # Plain integer
    if re.fullmatch(r"\d+", s):
        return float(int(s)), False, None

    m = _DICE_RE.search(s)
    if not m:
        try:
            return float(s), False, None
        except ValueError:
            return 1.0, False, s

    count   = int(m.group(1)) if m.group(1) else 1
    sides   = int(m.group(2))
    mod_str = (m.group(3) or "").replace(" ", "")
    mod     = int(mod_str) if mod_str else 0

    expected = count * (sides + 1) / 2.0 + mod
    return expected, True, s


# ─── Stat parsers ──────────────────────────────────────────────────────────────

def _parse_skill(val) -> Optional[int]:
    """'4+' → 4,  4 → 4,  None → None"""
    if val is None:
        return None
    s = str(val).strip().replace("+", "").replace("N/A", "")
    try:
        return int(s)
    except ValueError:
        return None


def _parse_stat(val, default: int = 4) -> int:
    """'6' → 6,  '3+' → 3,  None → default"""
    if val is None:
        return default
    s = str(val).strip().replace("+", "")
    try:
        return int(s)
    except ValueError:
        return default


def _parse_ap(val) -> int:
    """'-4' → 4,  '0' → 0,  '-1' → 1  (WeaponProfile takes unsigned AP)"""
    if val is None:
        return 0
    try:
        return abs(int(str(val).strip()))
    except ValueError:
        return 0


def _normalise_keywords(raw) -> list[str]:
    if isinstance(raw, str):
        return [k.strip().upper() for k in raw.split(",") if k.strip()]
    return [str(k).upper().strip() for k in (raw or [])]


# ─── Dossier → engine types ────────────────────────────────────────────────────

def _weapon_to_profile(w: dict) -> tuple[WeaponProfile, AttackModifiers]:
    """Convert a dossier weapon dict to (WeaponProfile, AttackModifiers).

    Dossier shape (from build_all_factions.py):
        { name, type, range, a, bs_ws, s, ap, d, keywords }
    """
    attacks_val, attacks_var, attacks_expr = _expected_dice(
        w.get("a") or w.get("attacks") or 1
    )
    damage_val, damage_var, damage_expr = _expected_dice(
        w.get("d") or w.get("damage") or 1
    )

    skill    = _parse_skill(w.get("bs_ws") or w.get("bs") or w.get("ws")) or 4
    strength = _parse_stat(w.get("s") or w.get("strength"), default=4)
    ap       = _parse_ap(w.get("ap"))
    keywords = _normalise_keywords(w.get("keywords"))

    # Build weapon-level modifiers from keywords
    mods = AttackModifiers()
    for kw in keywords:
        if kw == "DEVASTATING WOUNDS":
            mods.devastating_wounds = True
        elif kw == "TORRENT":
            mods.use_torrent = True
        elif kw == "TWIN-LINKED":
            mods.reroll_wounds = "failed"
        elif kw == "LETHAL HITS":
            mods.lethal_hits = True
        elif kw == "LANCE":
            mods.use_lance = True
        elif kw == "BLAST":
            mods.use_blast = True
        elif kw == "HEAVY":
            mods.is_heavy = True
        else:
            m = re.search(r"SUSTAINED HITS\s+(\d+)", kw)
            if m:
                mods.sustained_hits = int(m.group(1))
                continue
            m = re.search(r"RAPID FIRE\s+(\d+)", kw)
            if m:
                # Store RF N in rf_value — only added to extra_attacks when
                # use_rapid_fire=True (i.e. the --rf flag signals within-half-range).
                mods.rf_value += float(m.group(1))
                continue
            m = re.search(r"MELTA\s+(\d+)", kw)
            if m:
                # Store Melta N in melta_value — only added to flat_damage_bonus
                # when use_melta=True (i.e. the --melta flag signals within-half-range).
                mods.melta_value += float(m.group(1))
                continue
            m = re.search(r"ANTI-\S+\s+(\d+)\+", kw)
            if m:
                t = int(m.group(1))
                if mods.anti_wound_target is None or t < mods.anti_wound_target:
                    mods.anti_wound_target = t

    wp = WeaponProfile(
        name              = w.get("name", "Unknown"),
        attacks           = attacks_val,
        skill             = skill,
        strength          = strength,
        ap                = ap,
        damage            = damage_val,
        range             = w.get("range"),
        keywords          = keywords,
        damage_is_variable   = damage_var,
        damage_expression    = damage_expr,
        attacks_is_variable  = attacks_var,
        attacks_expression   = attacks_expr,
    )
    return wp, mods


def _unit_to_target(unit: dict) -> TargetProfile:
    """Convert a dossier unit dict to a TargetProfile."""
    toughness = _parse_stat(unit.get("T"), default=4)
    save      = _parse_stat(unit.get("Sv"), default=5)
    wounds    = _parse_stat(unit.get("W"),  default=1)

    # Try to detect invuln from abilities text
    invuln = None
    for ab in unit.get("abilities", []):
        text = str(ab).lower()
        for pattern in [
            r"invulnerable save of (\d)\+",
            r"(\d)\+ invulnerable",
            r"invulnerable save: (\d)\+",
        ]:
            m = re.search(pattern, text)
            if m:
                invuln = int(m.group(1))
                break
        if invuln is not None:
            break

    return TargetProfile(
        name              = unit.get("name", "Unknown"),
        toughness         = toughness,
        save              = save,
        invulnerable_save = invuln,
        wounds            = wounds,
        models            = 1,
    )


# ─── Modifier merge ────────────────────────────────────────────────────────────

    # Fields that carry a non-zero default and represent a threshold or multiplier,
    # not a stacking bonus.  These should take the more aggressive (non-default) value
    # rather than summing — e.g. crit_hits_on defaults to 6 and should NOT become 12.
_NON_ADDITIVE_FIELDS = {"crit_hits_on", "crit_wounds_on", "damage_multiplier", "markerlight_hit_bonus"}

def _merge_mods(weapon: AttackModifiers, base: AttackModifiers) -> AttackModifiers:
    """Layer session-level (flag) mods on top of weapon-level mods."""
    defaults = AttackModifiers()
    merged   = AttackModifiers()
    for f in dc_fields(AttackModifiers):
        wv = getattr(weapon, f.name)
        bv = getattr(base, f.name)
        dv = getattr(defaults, f.name)

        if f.name in _NON_ADDITIVE_FIELDS:
            # Threshold/config fields: take whichever side changed from default,
            # preferring the more aggressive (lower for thresholds, different for multipliers).
            w_changed = wv != dv
            b_changed = bv != dv
            if w_changed and b_changed:
                setattr(merged, f.name, min(wv, bv) if isinstance(wv, (int, float)) else wv)
            elif w_changed:
                setattr(merged, f.name, wv)
            elif b_changed:
                setattr(merged, f.name, bv)
            else:
                setattr(merged, f.name, dv)
        elif isinstance(wv, bool):
            setattr(merged, f.name, wv or bv)
        elif isinstance(wv, (int, float)):
            setattr(merged, f.name, wv + bv)
        elif isinstance(wv, list):
            setattr(merged, f.name, wv + bv)
        elif isinstance(wv, str):
            # "none" is the default for reroll fields — prefer non-default
            setattr(merged, f.name, wv if wv != "none" else bv)
        elif wv is None and bv is None:
            setattr(merged, f.name, None)
        elif wv is None:
            setattr(merged, f.name, bv)
        elif bv is None:
            setattr(merged, f.name, wv)
        else:
            # Optional[int] threshold — take the more aggressive (lower number)
            setattr(merged, f.name, min(wv, bv))
    return merged


# ─── Public API ────────────────────────────────────────────────────────────────

def _apply_flags(flags: list, base_mods: "AttackModifiers", target: "TargetProfile") -> tuple["AttackModifiers", "TargetProfile"]:
    """Centralised flag → modifier/target application.

    Handles all recognised CLI modifier flags and returns the updated
    (base_mods, target) pair.  Called from both compute_combat and
    compute_sensitivity so flag semantics stay in sync.

    Supported flags:
        ml          — Markerlights / Guided: +1 to Hit, Ignores Cover
        cover       — Target in cover: +1 armour save
        invuln:N    — Override target invulnerable save to N+
        ea / ea1    — Extra attacks per model (ea:1 or ea1 form)
        ed / ed1    — Extra damage per unsaved wound (ed:2 or ed2 form). Also: dmgplus
        lethal      — Lethal Hits: unmodified 6s to Hit auto-wound
        twin        — Twin-linked: re-roll all failed wound rolls
        sustained / sustained1 / sustained:N  — Sustained Hits N: crit hits add N extra hits
        dev / devastating — Devastating Wounds: crit wounds bypass all saves
        blast       — Blast: flag; adapter notes minimum-3-attacks semantic
        rf          — Rapid Fire: within half range; adds RF N to extra attacks
        melta       — Melta: within half range; adds Melta N to flat damage bonus
        torrent     — Torrent: weapon auto-hits (no BS roll)
        lance       — Lance: +1 to wound roll (applied as wound_bonus)
        fnp:N       — Override target Feel No Pain save to N+
        heavy       — Heavy: +1 to hit when stationary (on Heavy-keyword weapons)
        stealth     — Stealth: -1 to hit rolls against target
        indirect    — Indirect Fire: -1 to hit, target benefits from cover
        halfdmg     — Half Damage: damage multiplier 0.5
        igncover    — Ignore Cover: standalone (also nocover)
        rrhit       — Re-roll all failed hit rolls
        rrhit1      — Re-roll hit rolls of 1
        rrwound1    — Re-roll wound rolls of 1
        criton:N    — Critical hits on N+ instead of 6+
        critwound:N — Critical wounds on N+ instead of 6+
        oath        — Oath of Moment: re-roll all failed hits and wounds
    """
    for f in flags:
        key = f.split(":")[0].lower()

        # ── Hit modifiers ─────────────────────────────────────────────────────
        if key == "ml":
            base_mods.use_markerlights = True

        elif key == "lethal":
            base_mods.lethal_hits = True

        elif key == "torrent":
            base_mods.use_torrent = True

        elif key == "lance":
            # Lance: +1 to wound roll (most impactful approximation without target keyword check)
            base_mods.wound_bonus = max(base_mods.wound_bonus, 1)
            if "Lance bonus applied" not in base_mods.active_effects:
                base_mods.active_effects.append("Lance bonus applied")

        # ── Wound modifiers ───────────────────────────────────────────────────
        elif key == "twin":
            base_mods.reroll_wounds = "failed"

        elif key.startswith("sustained"):
            # Accepts: "sustained" (→1), "sustained1", "sustained:2", etc.
            n = 1
            if ":" in f:
                try:
                    n = int(f.split(":")[1])
                except (ValueError, IndexError):
                    n = 1
            elif len(key) > len("sustained"):
                try:
                    n = int(key[len("sustained"):])
                except ValueError:
                    n = 1
            base_mods.sustained_hits = max(base_mods.sustained_hits, n)

        elif key in ("dev", "devastating"):
            base_mods.devastating_wounds = True

        # ── Save/AP modifiers ─────────────────────────────────────────────────
        elif key == "cover":
            target = TargetProfile(
                name=target.name, toughness=target.toughness, save=target.save,
                invulnerable_save=target.invulnerable_save, wounds=target.wounds,
                models=target.models, feel_no_pain=target.feel_no_pain,
                damage_reduction=target.damage_reduction, cover=True,
            )

        elif key.startswith("invuln"):
            # Accepts: --invuln:4, --invuln 4, --invuln4
            iv = None
            if ":" in f:
                try: iv = int(f.split(":")[1])
                except (ValueError, IndexError): pass
            elif len(key) > len("invuln"):
                try: iv = int(key[len("invuln"):])
                except ValueError: pass
            if iv is not None:
                target = TargetProfile(
                    name=target.name, toughness=target.toughness, save=target.save,
                    invulnerable_save=iv, wounds=target.wounds,
                    models=target.models, feel_no_pain=target.feel_no_pain,
                    damage_reduction=target.damage_reduction, cover=target.cover,
                )

        # ── Damage modifiers ──────────────────────────────────────────────────
        elif key == "ea" or re.match(r'^ea\d+$', key):
            # Extra attacks per model.  Accepts both --ea 1 (stored as "ea:1")
            # and --ea1 (stored as "ea1" — number embedded in flag name).
            try:
                if ":" in f:
                    n = float(f.split(":")[1])
                else:
                    n = float(re.sub(r'^ea', '', key) or 0)
                base_mods.extra_attacks += n
            except (ValueError, TypeError):
                pass

        elif key in ("ed", "dmgplus") or re.match(r'^ed\d+$', key):
            # Extra Damage: --ed1, --ed:2, --ed 3 (also legacy --dmgplus:N)
            try:
                if ":" in f:
                    n = float(f.split(":")[1])
                elif len(key) > 2 and key.startswith("ed"):
                    n = float(key[2:])
                else:
                    n = 1.0
                base_mods.flat_damage_bonus += n
            except (ValueError, TypeError, IndexError):
                pass

        elif key.startswith("fnp"):
            # Accepts: --fnp:5, --fnp 5, --fnp5
            fnp_val = None
            if ":" in f:
                try: fnp_val = int(f.split(":")[1])
                except (ValueError, IndexError): pass
            elif len(key) > len("fnp"):
                try: fnp_val = int(key[len("fnp"):])
                except ValueError: pass
            if fnp_val is not None:
                target = TargetProfile(
                    name=target.name, toughness=target.toughness, save=target.save,
                    invulnerable_save=target.invulnerable_save, wounds=target.wounds,
                    models=target.models, feel_no_pain=fnp_val,
                    damage_reduction=target.damage_reduction, cover=target.cover,
                )

        # ── Blast / Rapid Fire ────────────────────────────────────────────────
        # Blast:  use_blast is set here (flag side) and also auto-detected in
        #         _weapon_to_profile (keyword side).  The minimum-3-attacks rule
        #         is applied in _run_ev / _run_mc after merging, using def_models.
        # Rapid Fire: rf_value is stored per-weapon in _weapon_to_profile and
        #         carried through _merge_mods.  The --rf flag (within half range)
        #         sets use_rapid_fire=True; rf_value is only added to extra_attacks
        #         when use_rapid_fire is True — in _run_ev / _run_mc after merging.
        elif key == "blast":
            base_mods.use_blast = True
        elif key == "rf":
            base_mods.use_rapid_fire = True
        elif key == "melta" or re.match(r'^melta\d+$', key):
            # Accepts: --melta (boolean toggle, uses weapon keyword value),
            #          --melta:2, --melta 2, --melta2 (overrides melta damage to N)
            base_mods.use_melta = True
            melta_override = None
            if ":" in f:
                try: melta_override = float(f.split(":")[1])
                except (ValueError, IndexError): pass
            elif len(key) > len("melta"):
                try: melta_override = float(key[len("melta"):])
                except ValueError: pass
            if melta_override is not None:
                base_mods.melta_value = melta_override
        elif key == "heavy":
            base_mods.use_heavy = True

        # ── Defensive / situational modifiers ────────────────────────────────
        elif key == "stealth":
            # Stealth: -1 to hit rolls against this target
            base_mods.hit_penalty = max(base_mods.hit_penalty, 1)

        elif key == "indirect":
            # Indirect Fire: -1 to hit, benefit of cover (+1 save)
            base_mods.hit_penalty = max(base_mods.hit_penalty, 1)
            target = TargetProfile(
                name=target.name, toughness=target.toughness, save=target.save,
                invulnerable_save=target.invulnerable_save, wounds=target.wounds,
                models=target.models, feel_no_pain=target.feel_no_pain,
                damage_reduction=target.damage_reduction, cover=True,
            )

        elif key == "halfdmg":
            base_mods.damage_multiplier = 0.5

        elif key in ("igncover", "nocover"):
            base_mods.ignore_cover = True

        # ── Reroll flags ─────────────────────────────────────────────────────
        elif key in ("rrhit", "rrhits"):
            # Reroll all failed hit rolls
            base_mods.reroll_hits = "failed"

        elif key in ("rrhit1", "rrhits1"):
            # Reroll hit rolls of 1
            base_mods.reroll_hits = "ones"

        elif key in ("rrwound1", "rrwounds1"):
            # Reroll wound rolls of 1
            base_mods.reroll_wounds = "ones"

        # ── Critical threshold overrides ─────────────────────────────────────
        elif key.startswith("criton"):
            # Change crit hit threshold: --criton5, --criton:5
            cv = None
            if ":" in f:
                try: cv = int(f.split(":")[1])
                except (ValueError, IndexError): pass
            elif len(key) > len("criton"):
                try: cv = int(key[len("criton"):])
                except ValueError: pass
            if cv is not None:
                base_mods.crit_hits_on = cv

        elif key.startswith("critwound"):
            # Change crit wound threshold: --critwound5, --critwound:5
            cv = None
            if ":" in f:
                try: cv = int(f.split(":")[1])
                except (ValueError, IndexError): pass
            elif len(key) > len("critwound"):
                try: cv = int(key[len("critwound"):])
                except ValueError: pass
            if cv is not None:
                base_mods.crit_wounds_on = cv

        # ── Faction-specific compound modifiers ──────────────────────────────
        elif key == "oath":
            # Oath of Moment (Space Marines): reroll all hits and wounds vs target
            base_mods.reroll_hits = "failed"
            base_mods.reroll_wounds = "failed"

    return base_mods, target


# ─── Flag validation ─────────────────────────────────────────────────────────

KNOWN_FLAG_BASES = {
    "ml", "cover", "lethal", "twin", "sustained", "blast", "rf",
    "torrent", "lance", "invuln", "ea", "dev", "devastating",
    "fnp", "dmgplus", "ed", "melta", "heavy",
    "stealth", "indirect", "halfdmg", "igncover", "nocover",
    "rrhit", "rrhits", "rrhit1", "rrhits1",
    "rrwound1", "rrwounds1",
    "criton", "critwound",
    "oath",
}


def _levenshtein(a: str, b: str) -> int:
    """Simple Levenshtein distance."""
    if len(a) < len(b):
        return _levenshtein(b, a)
    if not b:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a):
        curr = [i + 1]
        for j, cb in enumerate(b):
            curr.append(min(prev[j + 1] + 1, curr[j] + 1, prev[j] + (ca != cb)))
        prev = curr
    return prev[-1]


def validate_flags(flags: list[str]) -> list[dict]:
    """Check flags against KNOWN_FLAG_BASES.
    Returns a list of error dicts for unknown flags, each with:
      {"flag": str, "suggestions": list[str]}
    Returns [] if all flags are valid.
    """
    errors = []
    for f in flags:
        key = f.split(":")[0].lower()
        # Direct match
        if key in KNOWN_FLAG_BASES:
            continue
        # Prefix match (ea1, sustained2, invuln4, fnp5)
        if any(key.startswith(base) for base in KNOWN_FLAG_BASES):
            continue
        # Unknown — find suggestions
        candidates = sorted(KNOWN_FLAG_BASES, key=lambda k: _levenshtein(key, k))
        suggestions = [c for c in candidates[:3] if _levenshtein(key, c) <= max(2, len(key) // 2)]
        errors.append({"flag": key, "suggestions": suggestions})
    return errors


def compute_combat(
    attacker_unit: dict,
    defender_unit: dict,
    flags: list,
    att_models: int = 1,
    def_models: int = 1,
) -> dict:
    """Run combat math for every weapon on attacker_unit vs defender_unit.

    flags:      list of strings from the CLI — e.g. ["ml", "cover", "invuln:4"]
    att_models: number of models in the attacking unit (from unit_composition).
                Weapon attacks are multiplied by this unless the weapon carries
                _no_multiply=True (e.g. support turrets — 1 per unit, not 1 per model).
    def_models: number of models in the defending unit.  Used for BLAST
                minimum-3-attacks rule (only applies vs units of 6+ models).

    Returns:
        {
            "ranged":         summary dict or None,
            "melee":          summary dict or None,
            "per_weapon_dmg": { weapon_name: { dmg, kills } },
            "target_profile": { toughness, save, wounds, invuln },
        }
    """
    target    = _unit_to_target(defender_unit)
    base_mods = AttackModifiers()

    base_mods, target = _apply_flags(flags, base_mods, target)

    # Split weapons by type
    ranged_weapons, melee_weapons = [], []
    for w in attacker_unit.get("weapons", []):
        if not isinstance(w, dict):
            continue
        is_melee = (
            w.get("type") == "melee"
            or str(w.get("range", "")).lower() == "melee"
        )
        (melee_weapons if is_melee else ranged_weapons).append(w)

    # ── Deterministic EV pass ──────────────────────────────────────────────────

    def _run_ev(weapon_list: list) -> list[tuple[dict, Optional[AttackResult]]]:
        out = []
        for w in weapon_list:
            try:
                wp, weapon_mods = _weapon_to_profile(w)
                merged = _merge_mods(weapon_mods, base_mods)
                # ── Rapid Fire: only add RF attacks when within half range ────────
                # rf_value is stored per-weapon in weapon_mods; use_rapid_fire is
                # set by the --rf flag.  Only apply when the flag is active.
                if merged.use_rapid_fire and merged.rf_value > 0:
                    merged.extra_attacks += merged.rf_value
                # ── Melta: only add flat damage bonus when within half range ─────
                if merged.use_melta and merged.melta_value > 0:
                    merged.flat_damage_bonus += merged.melta_value
                # ── Heavy: +1 to hit when unit Remained Stationary ──────────
                if merged.use_heavy and merged.is_heavy:
                    merged.hit_bonus += 1
                # ── Blast: minimum 3 per-model attacks vs 6+ model units ─────────
                if merged.use_blast and def_models >= 6:
                    wp.attacks = max(wp.attacks, 3.0)
                # Scale attacks by squad size — skip for unit-level weapons (e.g. support turrets)
                if att_models > 1 and not w.get("_no_multiply"):
                    wp.attacks = wp.attacks * att_models
                result = compute_attack_result(wp, target, base_mods=merged)
                out.append((w, result))
            except Exception:
                out.append((w, None))
        return out

    def _summarize_ev(weapon_results: list, mc_per_weapon: dict) -> tuple[Optional[dict], dict]:
        valid = [(w, r) for w, r in weapon_results if r is not None]
        if not valid:
            return None, {}

        total_dmg   = sum(r.expected_damage for _, r in valid)
        total_kills = sum(r.expected_kills  for _, r in valid)
        n_weapons   = len(valid)
        kill_chance = None  # computed from MC below if available

        # Pull swinginess / overkill from MC if available
        mc_valid = [mc_per_weapon[w.get("name", "?")] for w, _ in valid if w.get("name", "?") in mc_per_weapon]
        swinginess_cv    = None
        swinginess_label = None
        overkill_pct     = None
        squad_wipe_pct   = None
        if mc_valid:
            # Weighted average swinginess by mean_damage
            total_mc_dmg = sum(r["mean_damage"] for r in mc_valid)
            if total_mc_dmg > 0:
                swinginess_cv = round(
                    sum(r["swinginess_cv"] * r["mean_damage"] for r in mc_valid) / total_mc_dmg, 3
                )
                if   swinginess_cv < 0.15:  swinginess_label = "Stable"
                elif swinginess_cv < 0.30:  swinginess_label = "Moderate"
                elif swinginess_cv < 0.50:  swinginess_label = "Variable"
                else:                        swinginess_label = "Swingy"
                # Weighted average overkill across weapons
                overkill_pct = round(
                    sum(r.get("overkill_waste_pct", 0) * r["mean_damage"] for r in mc_valid) / total_mc_dmg, 1
                )
            # P(≥1 kill from ANY weapon) = 1 - product(P(0 kills per weapon))
            def _p_zero_kills(r):
                b = r.get("kill_bucket_probabilities", {})
                return float(b.get("0", 1.0))
            p_all_zero = 1.0
            for r in mc_valid:
                p_all_zero *= _p_zero_kills(r)
            kill_chance = round((1.0 - p_all_zero) * 100, 1)
            # Squad wipe: average per-weapon P(≥1 kill) — rough proxy
            squad_wipe_pct = round(
                sum(1.0 - _p_zero_kills(r) for r in mc_valid) / len(mc_valid) * 100, 1
            )

        summary = {
            "expected_dmg":       round(total_dmg,   2),
            "expected_kills":     round(total_kills,  2),
            "kill_chance_pct":    round(kill_chance,  1),
            "avg_dmg_per_attack": round(total_dmg / n_weapons, 2),
            "overkill_waste_pct": overkill_pct,
            "swinginess":         swinginess_cv,
            "swinginess_label":   swinginess_label,
            "squad_wipe_pct":     squad_wipe_pct,
        }
        def _kill_chance_from_mc(mc_result) -> Optional[float]:
            """P(≥1 kill) from MC kill-bucket distribution, or None if MC offline."""
            if not mc_result:
                return None
            b = mc_result.get("kill_bucket_probabilities", {})
            p_zero = float(b.get("0", 1.0))
            return round((1.0 - p_zero) * 100, 1)

        per_weapon = {
            w.get("name", "?"): {
                "dmg":           round(r.expected_damage, 2),
                "kills":         round(r.expected_kills,  2),
                # Probability chain — shown in TargetingOutcome bar chart
                "hit_pct":       round(r.hit_probability * 100, 1),
                "wound_pct":     round(r.wound_probability_given_hit * 100, 1),
                # fail_save_pct: probability of an unsaved wound (per attack in the chain)
                "fail_save_pct": round(r.failed_save_probability * 100, 1),
                # kill_chance_pct: P(≥1 model killed) from Monte Carlo — semantically correct
                # kill probability for the full weapon output. Falls back to None if MC offline.
                "kill_chance_pct": _kill_chance_from_mc(mc_per_weapon.get(w.get("name", "?"))),
                "overkill_waste_pct": (mc_per_weapon.get(w.get("name", "?")) or {}).get("overkill_waste_pct"),
                # Raw roll targets — used for modifier delta colour-coding
                "hit_target":    r.hit_target,
                "wound_target":  r.wound_target,
                # MC variance metrics (if available)
                "mc": mc_per_weapon.get(w.get("name", "?")),
            }
            for w, r in valid
        }
        return summary, per_weapon

    # ── Monte Carlo pass ───────────────────────────────────────────────────────
    # Runs per-weapon to compute variance, swinginess, and kill distributions.
    # Silently falls back to OFFLINE if any exception occurs.

    mc_per_weapon: dict = {}
    mc_covers: list[str] = []
    mc_error: Optional[str] = None

    def _run_mc(weapon_list: list, category: str) -> None:
        nonlocal mc_error
        for w in weapon_list:
            if not isinstance(w, dict):
                continue
            try:
                wp, weapon_mods = _weapon_to_profile(w)
                merged = _merge_mods(weapon_mods, base_mods)
                # Apply same RF, Melta, Heavy, and BLAST logic as _run_ev for consistency
                if merged.use_rapid_fire and merged.rf_value > 0:
                    merged.extra_attacks += merged.rf_value
                if merged.use_melta and merged.melta_value > 0:
                    merged.flat_damage_bonus += merged.melta_value
                if merged.use_heavy and merged.is_heavy:
                    merged.hit_bonus += 1
                if merged.use_blast and def_models >= 6:
                    wp.attacks = max(wp.attacks, 3.0)
                # Scale attacks by squad size — skip for unit-level weapons
                if att_models > 1 and not w.get("_no_multiply"):
                    wp.attacks = wp.attacks * att_models
                mc_result = monte_carlo_attack(
                    wp, target, base_mods=merged,
                    trials=_MC_TRIALS, seed=_MC_SEED,
                )
                mc_per_weapon[w.get("name", "?")] = mc_result
                if category not in mc_covers:
                    mc_covers.append(category)
            except Exception as exc:
                mc_error = str(exc)

    _run_mc(ranged_weapons, "ranged")
    _run_mc(melee_weapons,  "melee")

    # ── Aggregate simulation block ────────────────────────────────────────────

    simulation_status = "ACTIVE" if mc_per_weapon else "OFFLINE"

    if simulation_status == "ACTIVE":
        # Compute weighted error margin and confidence rating
        all_mc = list(mc_per_weapon.values())
        total_mean = sum(r["mean_damage"] for r in all_mc)
        if total_mean > 0:
            w_margin = sum(
                r["margin_of_error_95ci_pct"] * r["mean_damage"] for r in all_mc
            ) / total_mean
        else:
            w_margin = 0.0
        w_margin = round(w_margin, 2)

        if   w_margin <= 1.0:  confidence = "Very High"
        elif w_margin <= 3.0:  confidence = "High"
        elif w_margin <= 7.0:  confidence = "Medium"
        else:                   confidence = "Low"

        simulation = {
            "status":      "ACTIVE",
            "mode":        "monte_carlo",
            "iterations":  _MC_TRIALS,
            "error_margin": w_margin,
            "confidence":  confidence,
            "covers":      mc_covers,
            "message":     None,
        }
    else:
        simulation = {
            "status":      "OFFLINE",
            "mode":        "deterministic",
            "iterations":  None,
            "error_margin": None,
            "confidence":  None,
            "covers":      [],
            "message":     (
                "Simulation Engine Offline: Showing Deterministic Averages. "
                + (f"MC error: {mc_error}" if mc_error else "Monte Carlo loop was not triggered.")
            ),
        }

    ranged_results  = _run_ev(ranged_weapons)
    melee_results   = _run_ev(melee_weapons)
    ranged_summary, ranged_pw = _summarize_ev(ranged_results, mc_per_weapon)
    melee_summary,  melee_pw  = _summarize_ev(melee_results,  mc_per_weapon)

    return {
        "ranged":            ranged_summary,
        "melee":             melee_summary,
        "per_weapon_dmg":    {**ranged_pw, **melee_pw},
        "simulation_status": simulation_status,
        "simulation":        simulation,
        "target_profile": {
            "toughness": target.toughness,
            "save":      target.save,
            "wounds":    target.wounds,
            "invuln":    target.invulnerable_save,
        },
    }


# ─── Sensitivity sweep ────────────────────────────────────────────────────────

def compute_sensitivity(
    attacker_unit: dict,
    defender_unit: dict,
    flags: list,
    att_models: int = 1,
    def_models: int = 1,
) -> list:
    """% damage gain from +1 to each key stat (hit, wound, AP, damage).

    Runs EV 4 extra times with one modifier bumped each pass.
    Returns list of {label: str, value: int} sorted by value descending.
    Empty list if baseline damage is zero or too few weapons.
    """
    # ── Build target + base_mods via the shared flag parser ──────────────────
    target    = _unit_to_target(defender_unit)
    base_mods = AttackModifiers()
    base_mods, target = _apply_flags(flags or [], base_mods, target)

    all_weapons = [w for w in attacker_unit.get("weapons", []) if isinstance(w, dict)]
    if not all_weapons:
        return []

    def _run_total(extra: dict) -> float:
        mods = copy(base_mods)
        for field, delta in extra.items():
            setattr(mods, field, getattr(mods, field, 0) + delta)
        total = 0.0
        for w in all_weapons:
            try:
                wp, weapon_mods = _weapon_to_profile(w)
                merged = _merge_mods(weapon_mods, mods)
                # Apply same RF / Melta / Heavy / BLAST rules as compute_combat
                if merged.use_rapid_fire and merged.rf_value > 0:
                    merged.extra_attacks += merged.rf_value
                if merged.use_melta and merged.melta_value > 0:
                    merged.flat_damage_bonus += merged.melta_value
                if merged.use_heavy and merged.is_heavy:
                    merged.hit_bonus += 1
                if merged.use_blast and def_models >= 6:
                    wp.attacks = max(wp.attacks, 3.0)
                if att_models > 1 and not w.get("_no_multiply"):
                    wp.attacks = wp.attacks * att_models
                result = compute_attack_result(wp, target, merged)
                total += result.expected_damage
            except Exception:
                pass
        return total

    baseline = _run_total({})
    if baseline <= 0:
        return []

    sweeps = [
        ("Hit roll +1",   {"hit_bonus":          1}),
        ("Wound roll +1", {"wound_bonus":         1}),
        ("AP −1",         {"ap_modifier":        -1}),   # ap_modifier=-1 → effective_ap+1 → harder save → more dmg
        ("Damage +1",     {"flat_damage_bonus":   1}),
    ]

    results = []
    for label, extra in sweeps:
        modified = _run_total(extra)
        pct = int(round((modified - baseline) / baseline * 100))
        results.append({"label": label, "value": pct})

    return sorted(results, key=lambda x: x["value"], reverse=True)
