"""
Combat Terminal Engine

Implements EngineBase for the Warhammer 40K 10th edition toolkit.
Delegates data loading to loader.py and command parsing to commands.py.

Commands are defined in commands.py — that is the single source of truth.
The engine's schema() delegates to commands.to_schema().
The engine's exec() parses raw command strings (e.g. "spec broadside")
and dispatches to the appropriate query handler.
"""

from __future__ import annotations

import random
import re
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from data._base import EngineBase
from data.combat_terminal.loader import CombatTerminalLoader
from data.combat_terminal import commands as _cmds
from data.combat_terminal.math_adapter import compute_combat, compute_sensitivity, validate_flags, get_mc_config, set_mc_trials, is_defensive_flag
from data.combat_terminal.math_ledger import build_combat_ledger
from data.combat_terminal import term_aliases


# ─── Combat helpers ────────────────────────────────────────────────────────────

def _parse_min_models(composition: list) -> int:
    """Parse unit_composition text to extract minimum model count.

    Composition entries contain bullet markers (■ = \\u25a0) followed by a
    model count like '■ 1 Shas' or a range '■ 0-2 Shas'.  Sum the minimums.
    """
    BULLET = "\u25a0"
    total = 0
    for line in (composition or []):
        if BULLET not in line:
            continue
        for part in line.split(BULLET)[1:]:
            part = part.strip()
            m = re.match(r"^(\d+)(?:-\d+)?\s+\w", part)
            if m:
                total += int(m.group(1))
    return max(1, total)


def _baseline_wr(strength_str, toughness_str):
    """Return the standard 10th-ed wound roll needed given S vs T, or None."""
    try:
        s = int(str(strength_str or "").replace("+", "").strip())
        t = int(str(toughness_str or "").replace('"', "").strip())
    except (ValueError, TypeError):
        return None
    if s >= t * 2:  return 2
    if s >  t:      return 3
    if s == t:      return 4
    if s * 2 > t:   return 5
    return 6


# ─── Modifier-reason attribution ───────────────────────────────────────────────
# Maps an active modifier flag to the stat it shifts and the signed effect on the
# dice roll (positive = easier = lower target number = "better" / green).
# Used to explain *why* a BS / WR cell is coloured in the combat weapon table.

# (signed_effect, human_label).  signed_effect=None means "non-numeric" (e.g. auto-hit).
_HIT_FLAG_EFFECTS = {
    "ml":       (+1, "Markerlight"),
    "heavy":    (+1, "Heavy (stationary)"),   # only when weapon has HEAVY keyword
    "stealth":  (-1, "Stealth (target)"),
    "indirect": (-1, "Indirect Fire"),
    "torrent":  (None, "Torrent (auto-hit)"),
}
_WOUND_FLAG_EFFECTS = {
    "lance":    (+1, "Lance"),
}


def _signed(n):
    """Format a signed integer: 1 → '+1', -1 → '-1'."""
    return f"+{n}" if n >= 0 else str(n)


def _flag_int(flag, base, default=1):
    """Pull the integer arg out of a flag like 'hitplus:2' or 'hitplus2'."""
    key = flag.split(":")[0].lower()
    if ":" in flag:
        try:
            return int(flag.split(":")[1])
        except (ValueError, IndexError):
            return default
    if len(key) > len(base):
        try:
            return int(key[len(base):])
        except ValueError:
            return default
    return default


def _collect_stat_sources(flags, weapon_keywords):
    """Return (hit_sources, wound_sources) for the active flags.

    Each source is (signed_amount_or_None, label).  `weapon_keywords` gates
    conditional flags (HEAVY only applies to HEAVY-keyword weapons).
    """
    kw_upper = {str(k).upper() for k in (weapon_keywords or [])}
    hit, wound = [], []
    for f in (flags or []):
        key = f.split(":")[0].lower()
        if key == "heavy" and not any(k.startswith("HEAVY") for k in kw_upper):
            continue  # Heavy bonus only on Heavy weapons
        if key in _HIT_FLAG_EFFECTS:
            hit.append(_HIT_FLAG_EFFECTS[key])
        elif key in _WOUND_FLAG_EFFECTS:
            wound.append(_WOUND_FLAG_EFFECTS[key])
        elif key.startswith("hitplus"):
            # Generic to-Hit buff (ability / stratagem / Crusade trait) — the
            # amount is already shown as the delta, so no redundant source label.
            hit.append((_flag_int(f, "hitplus"), None))
        elif key.startswith("wndplus"):
            wound.append((_flag_int(f, "wndplus"), None))
    return hit, wound


def _build_stat_reason(stat, roll_word, frm_n, to_n, sources, direction):
    """Build a concise reason object for a coloured stat cell.

    stat       — column label, e.g. "BS" or "WR"
    roll_word  — "Hit" or "Wound" (used in the "+1 to Hit" phrasing)
    frm_n/to_n — integer roll targets (baseline → effective)
    sources    — list of (signed_amount_or_None, label)
    direction  — "better" | "worse"
    """
    frm = f"{frm_n}+"
    to  = f"{to_n}+"
    labels = [lbl for _, lbl in sources if lbl]
    nums   = [a for a, _ in sources if a is not None]
    net    = sum(nums) if nums else None
    delta  = f"{_signed(net)} to {roll_word}" if net else None
    via    = " + ".join(labels) if labels else None

    if delta and via:
        text = f"{delta} via {via}  ·  {stat} {frm} → {to}"
    elif delta:
        text = f"{delta}  ·  {stat} {frm} → {to}"
    elif via:
        text = f"{via}  ·  {stat} {frm} → {to}"
    else:
        text = f"{stat} {frm} → {to} (modified from baseline)"

    return {
        "stat":      stat,
        "roll":      roll_word,
        "from":      frm,
        "to":        to,
        "delta":     delta,
        "via":       via,
        "direction": direction,
        "text":      text,
    }


def _ap_magnitude(ap_val):
    """Unsigned AP magnitude: '-2' → 2, '0'/'' → 0, '2' → 2."""
    try:
        return abs(int(str(ap_val).replace("+", "").strip()))
    except (ValueError, TypeError):
        return 0


def _collect_ap_sources(flags):
    """Return AP-modifier sources from active --eap / --eapdef flags.

    Each source is (signed_magnitude_change, label).  Positive = AP improved
    (more penetration, attacker --eap buff); negative = AP worsened (a target
    ability such as the Commander in Enforcer Battlesuit, attacker-facing
    --eapdef).
    """
    sources = []
    for f in (flags or []):
        key = f.split(":")[0].lower()
        if key.startswith("eapdef"):         # defender worsens incoming AP
            sources.append((-_flag_int(f, "eapdef"), "target"))
        elif key.startswith("eap"):          # attacker improves AP
            sources.append((+_flag_int(f, "eap"), None))
    return sources


def _build_ap_reason(base_mag, eff_mag, sources, direction):
    """Concise reason object for a modified AP cell.

    base_mag/eff_mag — unsigned AP magnitudes (1 == AP-1).  AP is displayed
    signed (AP-1), so the headline reads e.g. "AP -1 → -2".
    """
    frm = f"-{base_mag}" if base_mag > 0 else "0"
    to  = f"-{eff_mag}"  if eff_mag  > 0 else "0"
    labels = [lbl for _, lbl in sources if lbl]
    nums   = [a for a, _ in sources if a is not None]
    net    = sum(nums) if nums else None
    delta  = f"{_signed(net)} AP" if net else None
    via    = " + ".join(labels) if labels else None

    if delta and via:
        text = f"{delta} via {via}  ·  AP {frm} → {to}"
    elif delta:
        text = f"{delta}  ·  AP {frm} → {to}"
    elif via:
        text = f"{via}  ·  AP {frm} → {to}"
    else:
        text = f"AP {frm} → {to} (modified from baseline)"

    return {
        "stat":      "AP",
        "roll":      "AP",
        "from":      frm,
        "to":        to,
        "delta":     delta,
        "via":       via,
        "direction": direction,
        "text":      text,
    }


# ─── Drone & attachment catalog ────────────────────────────────────────────────
# Maps drone type name (lowercase, as it appears in unit_composition text) to:
#   "weapons"    — list of weapon dicts to inject into the unit's weapon list
#   "stat_notes" — human-readable notes about stat modifications (displayed in cyan)
#
# Weapon dicts follow the standard dossier shape and carry _drone=True so the UI
# can style them distinctly (cyan name tint in spec/combat weapon tables).

_DRONE_CATALOG: dict = {
    "gun drone": {
        "weapons": [{
            "name": "Twin Pulse Carbine (Drone)",
            "type": "ranged", "range": '20"', "a": "2",
            "bs_ws": "5+", "s": "5", "ap": "0", "d": "1",
            "keywords": ["ASSAULT", "TWIN-LINKED"],
            "_drone": True,
        }],
        "stat_notes": [],
    },
    "missile drone": {
        "weapons": [{
            "name": "Missile Pod (Drone)",
            "type": "ranged", "range": '36"', "a": "2",
            "bs_ws": "5+", "s": "7", "ap": "-1", "d": "2",
            "keywords": [],
            "_drone": True,
        }],
        "stat_notes": [],
    },
    "shield drone": {
        "weapons": [],
        "stat_notes": [
            "Shield Drone — absorbs 1 unsaved wound on a 2+ (FNP 2+); effective +1 W",
        ],
    },
    "guardian drone": {
        "weapons": [],
        "stat_notes": [
            "Guardian Drone — +1 to armour save (effective Sv improves by 1)",
        ],
    },
    "marker drone": {
        "weapons": [],
        "stat_notes": [
            "Marker Drone — unit generates Markerlight support",
        ],
    },
    "pulse accelerator drone": {
        "weapons": [],
        "stat_notes": [
            "Pulse Accelerator Drone — +6\" range to all Pulse weapons in this unit",
        ],
    },
    "grav-inhibitor drone": {
        "weapons": [],
        "stat_notes": [
            "Grav-inhibitor Drone — enemy units within 6\" suffer −2\" to Move",
        ],
    },
    "recon drone": {
        "weapons": [],
        "stat_notes": [
            "Recon Drone — unit gains Scout 9\"",
        ],
    },
    "advanced guardian drone": {
        "weapons": [],
        "stat_notes": [
            "Advanced Guardian Drone — enhanced protective field for this model",
        ],
    },
    "command-link drone": {
        "weapons": [],
        "stat_notes": [
            "Command-link Drone — enables the For the Greater Good command ability",
        ],
    },
    "hover drone": {
        "weapons": [],
        "stat_notes": [
            "Hover Drone — this model gains the FLY keyword",
        ],
    },
}

# Additional weapons / equipment that are conditional or not stored in the dossier's
# weapons array (e.g. deploy-only turrets, wargear conditional on movement).
# Keys are uppercase unit names exactly as they appear in the dossier.

_UNIT_WEAPON_SUPPLEMENTS: dict = {
    "BREACHER TEAM": [
        {
            "name": "Support Turret Missile System (Turret)",
            "type": "ranged", "range": '24"', "a": "3",
            "bs_ws": "5+", "s": "7", "ap": "-1", "d": "2",
            "keywords": ["ASSAULT"],
            "_drone": False,
            # _no_multiply = True: this weapon belongs to the unit as a whole
            # (1 turret per unit, not one per model).  The shots count must NOT
            # be scaled by att_models when computing squad totals.
            "_no_multiply": True,
            "_supplement_note": "Requires Remains Stationary",
        },
    ],
}


class CombatTerminalEngine(EngineBase):

    def __init__(self):
        self._loader = CombatTerminalLoader()
        self._loader.load()

        # In-session state — persists for the server's lifetime
        self._session: dict[str, Any] = {
            "faction":        None,   # player's own faction
            "enemy_faction":  None,   # active enemy faction
            "turn":           0,      # current battle round
            "roster_my":      [],     # player's unit list
            "roster_enemy":   [],     # enemy unit list
            # Disambiguation state — set when a command has multiple matches.
            # Shape: { context, resolved_params, pending_field, matches: [unit, ...] }
            # Cleared once a numeric selection is made.
            "disambiguation": None,
            # Last combat params — used by rerun to re-execute with modifier changes.
            # Shape: {
            #   attacker, _attacker_faction, defender, _defender_faction,
            #   all_attacker_flags, all_defender_flags,   ← full original sets
            #   active_attacker_flags, active_defender_flags  ← currently live
            # }
            "last_combat": None,
            # Session-scoped issue log — populated by _log_issue() throughout the
            # session.  Surfaced by the `issues` command to show missing data
            # discovered during actual use (not just static domain checks).
            "issue_log": [],
        }

    # ─── Session issue logger ─────────────────────────────────────────────────

    def _log_issue(self, domain: str, message: str, context: str = "") -> None:
        """Append a runtime data gap or error to the session issue log.

        Called whenever a query encounters missing data, a math error, or a
        stub condition during normal use.  The log is surfaced by `issues`.

        Args:
            domain:  category label (e.g. "combat_math", "unit_lookup", "weapon_data")
            message: human-readable description of the problem
            context: optional detail string (unit name, faction, flag, etc.)
        """
        import datetime
        entry = {
            "domain":    domain,
            "message":   message,
            "context":   context,
            "timestamp": datetime.datetime.now().strftime("%H:%M:%S"),
        }
        log = self._session.setdefault("issue_log", [])
        # Deduplicate: skip if an identical (domain, message) already logged this session
        if not any(e["domain"] == domain and e["message"] == message for e in log):
            log.append(entry)

    # ─── Drone / supplement augmentation ──────────────────────────────────────

    @staticmethod
    def _augment_unit_with_supplements(unit: dict) -> dict:
        """Inject drone weapons, turret weapons, and stat notes into a unit dict.

        Scans unit_composition text for drone type mentions → adds weapon profiles
        (tagged _drone=True) and plain-text stat_notes.
        Also applies any unit-specific supplements from _UNIT_WEAPON_SUPPLEMENTS.

        Returns a shallow copy of the unit with augmented weapons/drone_notes.
        No-op (returns original) when nothing to add.
        """
        unit_name  = unit.get("name", "").upper()
        comp_text  = " ".join(unit.get("unit_composition", [])).lower()

        extra_weapons: list[dict] = []
        drone_notes:   list[str]  = []

        for drone_name, catalog in _DRONE_CATALOG.items():
            if drone_name in comp_text:
                extra_weapons.extend(catalog["weapons"])
                drone_notes.extend(catalog["stat_notes"])

        extra_weapons.extend(_UNIT_WEAPON_SUPPLEMENTS.get(unit_name, []))

        if not extra_weapons and not drone_notes:
            return unit

        augmented = dict(unit)
        augmented["weapons"]     = list(unit.get("weapons", [])) + extra_weapons
        augmented["drone_notes"] = drone_notes
        return augmented

    # ─── Identity ──────────────────────────────────────────────────────────────

    def name(self) -> str:
        return "Combat Terminal"

    def description(self) -> str:
        return "Warhammer 40K 10th edition — combat math, rules lookup, unit sheets, threat analysis."

    # ─── Schema ────────────────────────────────────────────────────────────────

    def schema(self) -> dict:
        return _cmds.to_schema()

    def aliases(self) -> dict[str, str]:
        return dict(_cmds.ALIAS_MAP)

    def help_groups(self) -> dict:
        return {
            "order":  list(_cmds.GROUP_ORDER),
            "labels": dict(_cmds.GROUP_LABELS),
        }

    # ─── Status ────────────────────────────────────────────────────────────────

    def status(self) -> dict:
        loader_status = self._loader.status()
        return {
            "engine":          self.name(),
            "ready":           loader_status["loaded"],
            "summary":         loader_status["summary"],
            "errors":          loader_status["errors"],
            # Simulation layer — reports live MC config
            "simulation_mode": "monte_carlo" if get_mc_config()["enabled"] else "deterministic",
            "simulation_config": {
                "trials":      get_mc_config()["trials"],
                "seed":        get_mc_config()["seed"],
                "status":      "ACTIVE" if get_mc_config()["enabled"] else "OFFLINE",
            },
            # Per-faction unit breakdown — powers the Data Integrity grid
            "per_faction":     loader_status.get("per_faction", {}),
            # Data pipeline stages — each True = that stage loaded successfully
            "pipeline": {
                "dossiers":    loader_status["loaded"],
                "rules":       loader_status["summary"].get("rules", 0) > 0,
                "modifiers":   True,   # hardcoded in math_adapter; always available
                "engine":      loader_status["loaded"],
                "output":      loader_status["loaded"],
            },
        }

    # ─── Raw command execution (console interface) ──────────────────────────────

    def exec(self, raw: str) -> dict:
        """Parse a raw terminal input string and execute it.

        Used by the web console and CLI when sending full command strings
        like "spec broadside" or "broadside vs intercessors".
        """
        command, params = self.parse_command(raw)
        return self.query(command, params)

    def parse_command(self, raw: str) -> tuple[str, dict]:
        """Parse a raw command string → (canonical_command, params dict).

        Handles:
          spec broadside
          broadside vs intercessors
          broadside --ml vs tervigon
          rule devastating wounds
          threat space marines
          list units fly --faction tau
          enemy tau
          session / status / clear / history / help [topic]
          dice 2d6
        """
        raw = raw.strip()
        if not raw:
            return ("help", {})

        # ── Two-word command normalisation ────────────────────────────────────
        # Convert natural-language multi-word prefixes to canonical command names
        # before first-token dispatch so aliases like "army rules" route correctly.
        _two_word_map = {
            "army rules":    "army_rules",
            "faction rules": "army_rules",
        }
        raw_lower = raw.lower()
        for prefix, canonical_cmd in _two_word_map.items():
            if raw_lower.startswith(prefix):
                suffix = raw[len(prefix):].strip()
                raw = f"{canonical_cmd} {suffix}".strip()
                break

        # ── Term alias expansion ──────────────────────────────────────────────
        # Expand user-defined term aliases (e.g. "deepstrike" → "deep strike")
        # before any command parsing.  Skip for learn/unlearn/aliases commands.
        _first = raw.split(None, 1)[0].lower() if raw else ""
        _first_cmd = _cmds.resolve(_first) or _first
        if _first_cmd not in ("learn", "unlearn", "aliases"):
            raw, _matched = term_aliases.expand(raw)

        # ── Numeric selection — resolves active disambiguation ─────────────────
        # A bare integer (e.g. "2") routes to the select handler when
        # disambiguation is active.  This must come before all other parsing.
        if re.match(r'^\d+$', raw) and self._session.get("disambiguation"):
            return ("_select", {"n": int(raw)})

        # ── "vs" pattern: <attacker> [flags] vs <defender> [flags] ───────────
        vs_match = re.search(r'\s+vs\s+', raw, re.IGNORECASE)
        if vs_match:
            before = raw[:vs_match.start()].strip()
            after  = raw[vs_match.end():].strip()
            # Strip leading "combat" keyword if present
            if re.match(r'^combat\s+', before, re.IGNORECASE):
                before = re.sub(r'^combat\s+', '', before, flags=re.IGNORECASE).strip()
            # Extract flags from both sides
            before_flags, before = self._extract_all_flags(before)
            after_flags,  after  = self._extract_all_flags(after)
            flags = before_flags + after_flags
            return ("combat", {
                "attacker":          before,
                "defender":          after,
                "flags":             flags,
                "attacker_flags":    before_flags,   # pre-vs flags (attacker side)
                "defender_flags":    after_flags,    # post-vs flags (defender side)
            })

        # ── Standard first-token dispatch ─────────────────────────────────────
        parts    = raw.split(None, 1)
        first    = parts[0].lower()
        rest     = parts[1].strip() if len(parts) > 1 else ""
        canonical = _cmds.resolve(first)

        if canonical == "spec":
            name, faction = self._extract_flag(rest, "faction")
            return ("spec", {"name": name, "faction": faction})

        elif canonical == "rule":
            return ("rule", {"term": rest})

        elif canonical == "threat":
            return ("threat", {"faction": rest})

        elif canonical in ("list", "search"):
            sub = rest.split(None, 1)
            list_type = sub[0].lower() if sub else ""
            remainder = sub[1] if len(sub) > 1 else ""
            # If first word isn't a recognised list type, treat the entire
            # remainder as a faction name and default to listing units.
            # e.g. "list chaos daemons" → list units --faction "chaos daemons"
            _VALID_LIST_TYPES = {"units", "unit", "weapons", "weapon", "factions", "faction", "stratagems", "stratagem"}
            if list_type and list_type not in _VALID_LIST_TYPES:
                # Whole input is treated as faction + optional flags
                remainder = rest
                list_type = "units"
                remainder, faction = self._extract_flag(remainder, "faction")
            else:
                remainder, faction = self._extract_flag(remainder, "faction")
            # Extract boolean --flags as keyword filters (--blast, --deepstrike, etc.)
            # These are always boolean; we do NOT consume the next word as a value.
            keyword_flags, remainder = self._extract_bool_flags(remainder)
            # Pull --ranged / --melee out of keyword flags (they're weapon type filters, not keyword searches)
            weapon_filter = None
            if "ranged" in keyword_flags:
                keyword_flags.remove("ranged")
                weapon_filter = "ranged"
            elif "melee" in keyword_flags:
                keyword_flags.remove("melee")
                weapon_filter = "melee"
            # If no explicit --faction flag, treat remaining text as faction name
            if not faction and remainder.strip():
                faction = remainder.strip()
                remainder = ""
            return ("list", {"type": list_type, "filter": remainder.strip(), "faction": faction, "keywords": keyword_flags, "weapon_filter": weapon_filter})

        elif canonical == "faction":
            return ("faction", {"name": rest})

        elif canonical == "enemy":
            return ("enemy", {"name": rest})

        elif canonical == "roster":
            return ("roster", {"side": rest or "my"})

        elif canonical == "session":
            return ("session", {})

        elif canonical == "nextturn":
            return ("nextturn", {})

        elif canonical == "status":
            return ("status", {})

        elif canonical == "help":
            return ("help", {"topic": rest})

        elif canonical == "clear":
            return ("clear", {})

        elif canonical == "history":
            return ("history", {})

        elif canonical == "dice":
            return ("dice", {"expression": rest})

        elif canonical == "stratagem":
            name, detachment = self._extract_flag(rest, "detachment")
            return ("stratagem", {"name": name, "detachment": detachment})

        elif canonical == "ability":
            return ("ability", {"name": rest})

        elif canonical == "enhancement":
            name, detachment = self._extract_flag(rest, "detachment")
            return ("enhancement", {"name": name, "detachment": detachment})

        elif canonical == "mission":
            name, source = self._extract_flag(rest, "source")
            return ("mission", {"name": name, "source": source})

        elif canonical == "analyze":
            no_counters = "--no-counters" in rest
            name = rest.replace("--no-counters", "").strip()
            return ("analyze", {"name": name, "no_counters": no_counters})

        elif canonical == "rerun":
            # "rerun [--flag [null] ...]" — modifier toggle replay
            return ("rerun", {"mods": rest})

        elif canonical == "legend":
            return ("legend", {})

        elif canonical == "detachment":
            return ("detachment", {"faction": rest})

        elif canonical == "army_rules":
            return ("army_rules", {"faction": rest})

        elif canonical == "learn":
            # "learn deepstrike = deep strike"
            return ("learn", {"args": rest})

        elif canonical == "unlearn":
            return ("unlearn", {"args": rest})

        elif canonical == "aliases":
            return ("aliases", {})

        elif canonical == "combat":
            # "combat" without "vs" — try to split on "vs" or return error
            inner_vs = re.search(r'\s+vs\s+', rest, re.IGNORECASE)
            if inner_vs:
                attacker = rest[:inner_vs.start()].strip()
                defender = rest[inner_vs.end():].strip()
                return ("combat", {"attacker": attacker, "defender": defender})
            return ("combat", {"attacker": rest, "defender": ""})

        elif canonical:
            return (canonical, {"args": rest})

        else:
            return ("unknown", {"input": raw})

    # ─── Flag extraction helpers ───────────────────────────────────────────────

    @staticmethod
    def _extract_flag(text: str, flag: str) -> tuple[str, str | None]:
        """Extract --<flag> <value> from text. Returns (cleaned_text, value_or_None)."""
        m = re.search(rf'--{flag}\s+(\S+)', text, re.IGNORECASE)
        if m:
            value   = m.group(1)
            cleaned = (text[:m.start()] + text[m.end():]).strip()
            return cleaned, value
        return text, None

    @staticmethod
    def _extract_all_flags(text: str) -> tuple[list[str], str]:
        """Extract all --flag and --flag value patterns.
        Returns (flags_list, cleaned_text).
        Boolean flags (--ml, --cover) → "ml", "cover"
        Value flags (--invuln 4) → "invuln:4"
        """
        flags   = []
        # Flag name may carry an inline ":value" (e.g. --invuln:4, --eap:-1) OR a
        # space-separated value (e.g. --invuln 4).  The inline-colon group must be
        # part of the name capture, otherwise the ":4" is left behind in the text
        # and corrupts the attacker's unit/loadout resolution.
        pattern = re.compile(r'--(\w+(?::-?\w+)?)(?:\s+([^\s-]\S*))?')
        for m in pattern.finditer(text):
            flag_name = m.group(1).lower()
            flag_val  = m.group(2)
            if ":" not in flag_name and flag_val and not flag_val.startswith('-'):
                flags.append(f"{flag_name}:{flag_val}")
            else:
                flags.append(flag_name)
        cleaned = pattern.sub('', text).strip()
        cleaned = ' '.join(cleaned.split())  # collapse whitespace
        return flags, cleaned

    @staticmethod
    def _extract_bool_flags(text: str) -> tuple[list[str], str]:
        """Extract boolean --flag tokens (no value consumption).
        `--deepstrike tau` → flags=['deepstrike'], remainder='tau'
        Returns (flags_list, cleaned_text).
        """
        flags   = []
        pattern = re.compile(r'--(\w+)')
        for m in pattern.finditer(text):
            flags.append(m.group(1).lower())
        cleaned = pattern.sub('', text).strip()
        cleaned = ' '.join(cleaned.split())  # collapse whitespace
        return flags, cleaned

    @staticmethod
    def _parse_rerun_mods(raw: str) -> tuple[list[str], list[str]]:
        """Parse rerun modifier string: '--lethal null --cover' →
        (flags_to_add=['cover'], flags_to_remove=['lethal']).

        A flag followed by 'null' is removed; a bare flag is added.
        Flag names are lowercased; value flags like 'invuln:4' are keyed by name.
        """
        add: list[str]    = []
        remove: list[str] = []
        pattern = re.compile(r'--(\w+)(?:\s+(null|\S+))?')
        for m in pattern.finditer(raw):
            flag = m.group(1).lower()
            val  = m.group(2)
            if val and val.lower() == "null":
                remove.append(flag)
            else:
                add.append(flag)
        return add, remove

    # ─── Query dispatch ────────────────────────────────────────────────────────

    def query(self, command: str, params: dict | None = None) -> dict:
        params = params or {}
        dispatch = {
            "_select":     self._query_select,
            "spec":        self._query_spec,
            "combat":      self._query_combat,
            "rerun":       self._query_rerun,
            "rule":        self._query_rule,
            "threat":      self._query_threats,
            "analyze":     self._query_analyze,
            "list":        self._query_list,
            "faction":     self._query_set_faction,
            "enemy":       self._query_enemy,
            "roster":      self._query_roster,
            "session":     self._query_session,
            "nextturn":    self._query_nextturn,
            "status":      self._query_status,
            "help":        self._query_help,
            "clear":       self._query_clear,
            "history":     self._query_history,
            "dice":        self._query_dice,
            "stratagem":   self._query_stratagem,
            "ability":     self._query_ability,
            "enhancement": self._query_enhancement,
            "mission":     self._query_mission,
            "issues":      self._query_issues,
            "legend":      self._query_legend,
            "unknown":     self._query_unknown,
            "mc":          self._query_mc,
            "learn":       self._query_learn,
            "unlearn":     self._query_unlearn,
            "aliases":     self._query_aliases,
            "mathmode":    self._query_mathmode,
            "detachment":  self._query_detachment,
            "army_rules":  self._query_army_rules,
        }

        if command not in dispatch:
            return {
                "ok":          False,
                "command":     command,
                "result_type": "error",
                "data":        f"Unknown command '{command}'. Type 'help' to see available commands.",
                "meta":        {},
            }

        try:
            return dispatch[command](params)
        except Exception as e:
            return {
                "ok":          False,
                "command":     command,
                "result_type": "error",
                "data":        f"Error running '{command}': {e}",
                "meta":        {},
            }

    # ─── Query handlers ────────────────────────────────────────────────────────

    # ── Roster-aware helpers ───────────────────────────────────────────────────

    def _find_roster_entries(self, unit_name: str, roster_key: str) -> list[dict]:
        """Find all roster entries matching a resolved unit name.

        Returns list of roster entry dicts (with weapons, models, etc).
        Matches by substring in either direction (case-insensitive).
        """
        roster = self._session.get(roster_key, [])
        name_lower = unit_name.lower()
        matches = []
        for entry in roster:
            entry_name = (entry.get("name") or "").lower()
            if entry_name and (entry_name in name_lower or name_lower in entry_name):
                matches.append(entry)
        return matches

    def _find_attached_leader(self, unit_name: str, roster_key: str,
                              nickname: str | None = None,
                              bodyguard_idx: int | None = None) -> dict | None:
        """Find a leader attached to the given bodyguard *instance* in the roster.

        Identity model: every roster entry carries a stable `_idx` (its position
        in the roster) stamped by `sync_roster_context`. A leader entry stores
        `attached_idx` — the index of the specific bodyguard instance it leads.
        This is what lets two identical, un-nicknamed units (e.g. two
        "Kroot Carnivores") carry different leaders independently.

        Resolution order:
          1. Index match — if `bodyguard_idx` is known, return the leader whose
             `attached_idx` points at exactly that instance. If none does, this
             instance has no leader, so we return None and DO NOT fall back to a
             name match (the old name fallback is what made one leader bleed onto
             every same-named unit).
          2. Legacy name/nickname match — only for entries that predate the index
             model (no `attached_idx`), so old rosters keep working.

        Returns the leader roster entry if one is attached, else None.
        """
        roster = self._session.get(roster_key, [])

        # 1. Instance-specific index match (preferred, unambiguous).
        if bodyguard_idx is not None:
            for entry in roster:
                if not entry.get("is_leader"):
                    continue
                a_idx = entry.get("attached_idx")
                if a_idx is None:
                    continue
                try:
                    if int(a_idx) == int(bodyguard_idx):
                        return entry
                except (TypeError, ValueError):
                    continue
            # A specific instance was named and no leader references it — there
            # is genuinely no leader on THIS unit. Stop here.
            return None

        # 2. Legacy name/nickname fallback (entries with no attached_idx only).
        name_lower = (unit_name or "").lower()
        nick_lower = (nickname or "").lower()
        target = nick_lower or name_lower
        for entry in roster:
            if not entry.get("is_leader"):
                continue
            if entry.get("attached_idx") is not None:
                continue  # index-keyed entries resolve only via the index path
            attached = (entry.get("attached_to") or "").lower()
            if not attached:
                continue
            # Exact match on the entry's identifying label (nickname or name).
            if target and attached == target:
                return entry
            # Lenient name-based match only when the bodyguard has no nickname
            # (so an attachment saved by unit name still resolves).
            if not nick_lower and (attached in name_lower or name_lower in attached):
                return entry
        return None

    def _find_bodyguard_for_leader(self, leader_name: str, roster_key: str) -> dict | None:
        """Find the bodyguard unit a leader is attached to.

        Returns the bodyguard roster entry if the leader has an attached_to, else None.
        """
        roster = self._session.get(roster_key, [])
        leader_lower = leader_name.lower()
        # First find the leader entry
        for entry in roster:
            entry_name = (entry.get("name") or "").lower()
            if entry.get("is_leader") and entry_name and (
                entry_name in leader_lower or leader_lower in entry_name
            ):
                # Prefer the instance-specific index pointer when present.
                a_idx = entry.get("attached_idx")
                if a_idx is not None:
                    try:
                        bg = roster[int(a_idx)]
                        if isinstance(bg, dict) and not bg.get("is_leader"):
                            return bg
                    except (IndexError, TypeError, ValueError):
                        pass
                # Legacy name-based fallback.
                attached_to = (entry.get("attached_to") or "").lower()
                if attached_to:
                    # Find the bodyguard unit
                    for bg in roster:
                        bg_name = (bg.get("name") or "").lower()
                        if bg_name and (bg_name in attached_to or attached_to in bg_name):
                            return bg
        return None

    def _resolve_unit_dossier(self, name: str, faction: str | None) -> dict | None:
        """Resolve a datasheet from a roster/crusade entry name, variant-aware.

        Crusade & army-list entries store full datasheet names like
        'Commander in Coldstar Battlesuit', but parsed dossiers sometimes
        collapse variant datasheets under a shared base name (e.g. the three
        Tau 'COMMANDER' variants) and keep the full name only inside
        `faction_keywords`. A plain get_unit() then returns None and the
        attached leader is silently dropped.

        Resolution order:
          1. Direct lookup (exact / substring / token) via the loader.
          2. Base-name lookup (text before an 'in'/'with' qualifier) plus
             variant disambiguation against each candidate's faction_keywords.

        Returns the unit dict (with 'faction') or None.
        """
        if not name:
            return None

        # 1. Direct lookup — handles the common case.
        unit = self._loader.get_unit(name, faction=faction)
        if unit:
            return unit

        # 2. Variant disambiguation.
        norm = lambda s: re.sub(r'[^a-z0-9 ]', '', (s or '').lower()).strip()
        q_norm = norm(name)
        base = re.split(r'\b(?:in|with)\b', name, flags=re.IGNORECASE)[0].strip() or name

        candidates = self._loader.get_units_matching(base, faction=faction, limit=9)
        if len(candidates) == 1:
            return candidates[0]

        if len(candidates) > 1:
            # Multiple datasheets share the base name (e.g. Coldstar / Crisis /
            # Enforcer Commanders). Pick the one whose faction_keywords (or
            # name) matches the descriptor carried in the full entry name.
            base_tokens = set(norm(base).split())
            filler = {"in", "with", "a", "an", "the", "of", "battlesuit", "battlesuits"}
            variant_tokens = (set(q_norm.split()) - base_tokens) - filler

            for cand in candidates:
                kw_parts = [
                    k if isinstance(k, str) else str(k)
                    for k in (cand.get("faction_keywords") or [])
                ]
                kw_text = norm(" ".join(kw_parts) + " " + (cand.get("name") or ""))
                kw_token_set = set(kw_text.split())
                if q_norm and q_norm in kw_text:
                    return cand
                if variant_tokens and variant_tokens.issubset(kw_token_set):
                    return cand

            # No variant matched — fall back to the first candidate rather than
            # dropping the leader entirely.
            return candidates[0]

        # 3. Space / punctuation-insensitive fallback. Army-list exports often
        #    run words together or hyphenate ("Kroot Trailshaper",
        #    "Kroot Trail-Shaper") where the datasheet has spaces
        #    ("Kroot Trail Shaper"). Broaden the pool via the first meaningful
        #    token and compare with all non-alphanumerics stripped.
        squash = lambda s: re.sub(r'[^a-z0-9]', '', (s or '').lower())
        q_sq = squash(name)
        if q_sq:
            first = (q_norm.split() or [""])[0]
            pool = self._loader.get_units_matching(first, faction=faction, limit=50) if first else []
            for cand in pool:                       # exact squashed match first
                if squash(cand.get("name")) == q_sq:
                    return cand
            for cand in pool:                       # then squashed containment
                c_sq = squash(cand.get("name"))
                if c_sq and (q_sq in c_sq or c_sq in q_sq):
                    return cand
        return None

    def _roster_disambiguate(
        self,
        context: str,
        resolved_params: dict,
        pending_field: str,
        unit_name: str,
        roster_entries: list[dict],
        roster_key: str,
    ) -> dict:
        """Disambiguate between multiple roster entries of the same unit.

        Shows a numbered list with concise weapon loadouts per entry so the
        player can pick which specific instance they mean (e.g. Hammerhead #1
        with railgun vs Hammerhead #2 with ion cannon).
        """
        self._session["disambiguation"] = {
            "context":         context,
            "resolved_params": resolved_params,
            "pending_field":   pending_field,
            "matches":         roster_entries,
            "_roster_key":     roster_key,
            "_roster_disambig": True,
        }

        labels = []
        for i, entry in enumerate(roster_entries):
            weapons = entry.get("weapons", [])
            pts = entry.get("points")
            models = entry.get("models", 1)
            nickname = entry.get("nickname")

            # Build concise weapon summary
            if weapons:
                weapon_str = ", ".join(weapons[:5])
                if len(weapons) > 5:
                    weapon_str += f" +{len(weapons) - 5}"
            else:
                weapon_str = "default loadout"

            parts = [f"{unit_name}"]
            if models and models > 1:
                parts[0] = f"{models}x {unit_name}"
            if nickname:
                parts[0] += f" ({nickname})"
            parts.append(f"[{weapon_str}]")
            if pts:
                parts.append(f"({pts} pts)")
            # Flag which entry has a leader attached so the player can tell the
            # instances apart (matched by this entry's stable roster index).
            ldr = self._find_attached_leader(
                unit_name, roster_key, nickname,
                bodyguard_idx=entry.get("_idx"),
            )
            if ldr:
                ldr_name = ldr.get("name") or "leader"
                parts.append(f"★ led by {ldr_name}")
            labels.append("  ".join(parts))

        return {
            "ok":          True,
            "command":     "disambiguation",
            "result_type": "disambiguation",
            "data": {
                "message": f"Multiple {unit_name} in roster — which loadout?",
                "matches": labels,
                "prompt":  f"Select loadout by number:",
            },
            "meta": {},
        }

    @staticmethod
    def _filter_weapons_by_roster(unit_weapons: list, roster_weapons: list[str]) -> list:
        """Filter a unit's weapon list to only weapons matching the roster loadout.

        Uses case-insensitive substring matching so roster entries like
        "Railgun" match dossier weapons like "Railgun" or "Heavy railgun".
        Returns all weapons if roster_weapons is empty (no filtering).
        """
        if not roster_weapons:
            return unit_weapons

        roster_lower = [w.lower() for w in roster_weapons]

        def _wname(w):
            return (w.get("name") or "").lower() if isinstance(w, dict) else str(w).lower()

        # All dossier weapon names — used to reject a shorter weapon being
        # swallowed by a longer roster entry that is itself a distinct weapon
        # (e.g. roster "High-output burst cannon" must NOT pull in the plain
        # "Burst cannon" datasheet weapon).
        dossier_names = {_wname(w) for w in unit_weapons}

        filtered = []
        for w in unit_weapons:
            w_name = _wname(w)

            for rw in roster_lower:
                if rw == w_name:
                    filtered.append(w); break
                # Roster term is part of a more-specific dossier weapon
                # (e.g. roster "railgun" → dossier "heavy railgun").
                if rw in w_name:
                    filtered.append(w); break
                # Dossier weapon is shorter than the roster entry — only accept
                # when the roster entry isn't itself a distinct dossier weapon.
                if w_name in rw and rw not in dossier_names:
                    filtered.append(w); break

        # If filtering removed everything (bad match), fall back to full list
        return filtered if filtered else unit_weapons

    # ── Disambiguation helpers ──────────────────────────────────────────────────

    def _disambiguate(
        self,
        context: str,
        resolved_params: dict,
        pending_field: str,
        matches: list[dict],
    ) -> dict:
        """Store disambiguation state and return a disambiguation result.

        context        — which command triggered this: "spec" | "analyze" |
                         "combat_attacker" | "combat_defender"
        resolved_params — params already resolved (e.g. attacker unit when
                          disambiguating the defender)
        pending_field  — which slot needs selection: "name" | "attacker" | "defender"
        matches        — ordered list of candidate unit dicts
        """
        self._session["disambiguation"] = {
            "context":         context,
            "resolved_params": resolved_params,
            "pending_field":   pending_field,
            "matches":         matches,
        }
        # Build labels.  When multiple matches share the same name+faction pair
        # (e.g. three "COMMANDER" entries in the Tau dossier) append a
        # distinguishing hint from the unit's unique ability so the player can tell
        # them apart:  "COMMANDER  [Coldstar Commander]  (Tau)"
        _SKIP_TAGS = frozenset({"CORE", "FACTION", "CHARACTER"})

        def _distinguisher(m: dict) -> str:
            for ab in m.get("abilities", []):
                if isinstance(ab, dict):
                    ab_name = (ab.get("name") or "").strip()
                    if ab_name.upper() not in _SKIP_TAGS and ab_name:
                        return ab_name
            return ""

        # Check for label collisions before building
        raw_labels = [
            "{name}  ({faction})".format(
                name    = m.get("name", "?"),
                faction = m.get("faction", "").replace("_", " ").title(),
            )
            for m in matches
        ]
        has_duplicates = len(set(raw_labels)) < len(raw_labels)

        labels = []
        for m, raw in zip(matches, raw_labels):
            if has_duplicates:
                hint = _distinguisher(m)
                labels.append(f"{raw}  [{hint}]" if hint else raw)
            else:
                labels.append(raw)

        noun = pending_field if pending_field != "name" else "unit"
        return {
            "ok":          True,
            "command":     "disambiguation",
            "result_type": "disambiguation",
            "data": {
                "message": f"Multiple {noun}s found:",
                "matches": labels,
                "prompt":  f"Select {pending_field} by number  (or type a more specific name):",
            },
            "meta": {},
        }

    def _query_select(self, params: dict) -> dict:
        """Resolve a numbered selection against the active disambiguation state."""
        n = params.get("n", 0)
        d = self._session.get("disambiguation")
        if not d:
            return self._err(
                "_select",
                "No selection pending — type a command first, e.g. 'spec broadside'."
            )

        matches = d["matches"]
        if n < 1 or n > len(matches):
            return self._err(
                "_select",
                f"Enter a number from 1 to {len(matches)}."
            )

        selected = matches[n - 1]
        ctx      = d["context"]
        rp       = dict(d["resolved_params"])
        is_roster = d.get("_roster_disambig", False)
        self._session["disambiguation"] = None  # clear before re-dispatch

        # ── Roster loadout disambiguation ────────────────────────────────────
        # selected is a roster entry dict with {name, weapons, models, ...}
        if is_roster:
            roster_key = d.get("_roster_key", "roster_my")
            roster_idx = n - 1  # index into the roster entries for this unit

            if ctx == "combat_attacker_roster":
                return self._query_combat({
                    **rp,
                    "_attacker_roster_entry": selected,
                })
            elif ctx == "combat_defender_roster":
                return self._query_combat({
                    **rp,
                    "_defender_roster_entry": selected,
                })
            return self._err("_select", f"Unknown roster disambiguation context '{ctx}'.")

        # ── Standard dossier disambiguation ──────────────────────────────────
        if ctx == "spec":
            return self._query_spec({"name": selected["name"], "faction": selected["faction"]})

        elif ctx == "analyze":
            return self._query_analyze({
                "name":        selected["name"],
                "_faction":    selected["faction"],
                "no_counters": rp.get("no_counters", False),
            })

        elif ctx == "combat_attacker":
            return self._query_combat({
                **rp,
                "attacker":          selected["name"],
                "_attacker_faction": selected["faction"],
            })

        elif ctx == "combat_defender":
            return self._query_combat({
                **rp,
                "defender":          selected["name"],
                "_defender_faction": selected["faction"],
            })

        return self._err("_select", f"Unknown disambiguation context '{ctx}'.")

    # ── Crusade enrichment (Session 3 — combat bridge) ──────────────────────────

    def _crusade_block_for(self, unit_name: str, roster_key: str = "roster_my") -> dict | None:
        """Return the roster entry carrying a `crusade` block for unit_name.

        Roster entries written by the Crusade muster include a `crusade` dict
        (rank, xp, honours, scars). Match on unit name (substring either way) so
        a dossier name like "HAMMERHEAD GUNSHIP" still matches a roster entry
        named "Hammerhead Gunship". Returns None when no crusade entry matches.
        """
        target = (unit_name or "").lower().strip()
        if not target:
            return None
        for ru in self._session.get(roster_key, []):
            if not isinstance(ru, dict) or not ru.get("crusade"):
                continue
            nm = (ru.get("name") or "").lower().strip()
            if nm and (nm == target or nm in target or target in nm):
                return ru
        return None

    @staticmethod
    def _crusade_combat_mods(entry: dict | None, side: str = "attacker") -> tuple[list, list, list]:
        """From a roster entry's crusade block, derive auto-applied combat data.

        `side` selects which flags apply to this combat:
          - "attacker": only OFFENSIVE flags (hit/wound/AP/damage buffs). A unit's
            defensive traits (FNP, invuln, +Wounds, …) are irrelevant when it is
            doing the shooting — and must NOT leak onto the target profile.
          - "defender": only DEFENSIVE flags (FNP, invuln, cover, +Wounds, damage
            reduction, save/−save). These modify the target profile so the unit's
            survivability traits actually affect incoming damage.

        Returns (auto_flags, notes, abilities):
          - auto_flags: combat flag strings to merge into the math (only honours/
            scars that carry a `flag` for the relevant side contribute).
          - notes:      ◈-prefixed flag_note dicts for the combat callout panel.
          - abilities:  ability dicts (amber honours, red scars) — attacker side
            only (the abilities panel describes the attacking unit).
        """
        crusade = (entry or {}).get("crusade") or {}
        is_def = side == "defender"
        side_tag = " (defender)" if is_def else ""
        auto_flags, notes, abilities = [], [], []

        def _wanted(flag) -> bool:
            # Keep a flag only if its side matches the side we're resolving.
            return bool(flag) and (is_defensive_flag(str(flag)) == is_def)

        for h in crusade.get("honours", []):
            if not isinstance(h, dict):
                continue
            name = h.get("name", "Honour")
            eff  = h.get("effect", "")
            flag = h.get("flag")
            applied = _wanted(flag)
            if applied:
                auto_flags.append(str(flag))
            # Show the note when the flag applies to this side, or (attacker side)
            # for descriptive-only honours so the player still sees them.
            if applied or (not is_def and not flag):
                notes.append({"icon": "star", "text": f"◈ {name}{side_tag}" + (f" — {eff}" if eff else "")})
            if not is_def:
                abilities.append({"name": f"◈ {name}", "description": eff, "color": "amber"})
        for s in crusade.get("scars", []):
            if not isinstance(s, dict):
                continue
            name = s.get("name", "Scar")
            eff  = s.get("effect", "")
            flag = s.get("flag")
            applied = _wanted(flag)
            if applied:
                auto_flags.append(str(flag))
            if applied or (not is_def and not flag):
                notes.append({"icon": "skull", "text": f"◈ {name} (scar){side_tag}" + (f" — {eff}" if eff else "")})
            if not is_def:
                abilities.append({"name": f"◈ {name} (scar)", "description": eff, "color": "red"})
        return auto_flags, notes, abilities

    def _build_spec_result(self, result: dict) -> dict:
        """Build the spec_sheet response from a resolved unit dict."""
        # Augment with drones / turrets / supplements before extracting fields
        result = self._augment_unit_with_supplements(result)

        unit_name    = result.get("name", "?")
        unit_faction = result.get("faction", "unknown")
        points       = result.get("points", "")
        subtitle_pts = f"{points}pts" if points else ""
        subtitle     = "  ·  ".join(p for p in [unit_faction.replace("_", " ").title(), subtitle_pts] if p)

        stat_keys = ["M", "T", "Sv", "W", "Ld", "OC"]
        stats     = {k: result[k] for k in stat_keys if k in result}
        ratings   = self._compute_ratings(result)
        abilities = [self._normalize_ability(ab) for ab in result.get("abilities", [])]

        # ── Crusade enrichment ──────────────────────────────────────────────
        # If this unit is in the player's mustered Crusade roster, surface its
        # rank in the subtitle and its honours/scars in the abilities list.
        cr_entry = self._crusade_block_for(unit_name)
        if cr_entry:
            cr   = cr_entry.get("crusade") or {}
            rank = cr.get("rank")
            xp   = cr.get("xp")
            if rank:
                badge = f"{rank} ◈"
                if xp is not None:
                    badge += f" {xp}XP"
                subtitle = "  ·  ".join(p for p in [subtitle, badge] if p)
            _, _, cr_abilities = self._crusade_combat_mods(cr_entry)
            abilities.extend(cr_abilities)

        return {
            "ok":          True,
            "command":     "spec",
            "result_type": "spec_sheet",
            "data": {
                "title":       unit_name,
                "subtitle":    subtitle,
                "stats":       stats,
                "weapons":     result.get("weapons", []),
                "abilities":   abilities,
                "keywords":    result.get("keywords", []),
                "ratings":     ratings,
                "drone_notes": result.get("drone_notes", []),
                "_stub":       result.get("_stub", False),
            },
            "meta": {"faction": unit_faction},
        }

    # ────────────────────────────────────────────────────────────────────────────

    def _query_spec(self, params: dict) -> dict:
        name    = params.get("name", "").strip()
        faction = params.get("faction") or None

        if not name:
            return self._err("spec", "Usage: spec <unit name>  e.g. spec broadside")

        # If a faction hint is provided (from disambiguation resolution or --faction flag),
        # do an exact lookup — this path always finds exactly one unit.
        if faction:
            result = self._loader.get_unit(name, faction=faction)
            if not result:
                return self._err("spec", f"No unit found matching '{name}' in faction '{faction}'.")
            return self._build_spec_result(result)

        # No explicit faction — check session faction first.
        # When a player roster is active the session faction is set, which lets
        # `spec <unit>` resolve without cross-faction disambiguation when the unit
        # exists in the player's faction.
        session_faction = self._session.get("faction")
        if session_faction:
            session_matches = self._loader.get_units_matching(name, faction=session_faction, limit=9)
            if len(session_matches) == 1:
                # Unambiguous match within player's faction — use it directly
                return self._build_spec_result(session_matches[0])
            elif len(session_matches) > 1:
                # Multiple variants in the same faction (e.g. COMMANDER variants) — disambiguate
                return self._disambiguate("spec", {}, "name", session_matches)
            # Zero matches in session faction — fall through to global search

        # Global multi-faction search — only reached when no session faction is set
        # or when the unit doesn't exist in the session faction.
        matches = self._loader.get_units_matching(name, limit=9)
        if not matches:
            return self._err("spec", f"No unit found matching '{name}'.")
        if len(matches) > 1:
            return self._disambiguate("spec", {}, "name", matches)
        return self._build_spec_result(matches[0])

    def _query_combat(self, params: dict) -> dict:
        attacker_raw    = params.get("attacker", "").strip()
        defender_raw    = params.get("defender", "").strip()
        flags           = params.get("flags", [])
        # Attacker / defender flag split — used to drive the toggle UI.
        # When coming from parse_command these are populated; when called
        # directly (e.g. disambiguation re-dispatch) they fall back to an
        # empty list so the merged `flags` list is used for calculation.
        attacker_flags  = params.get("attacker_flags", [])
        defender_flags  = params.get("defender_flags", [])
        # Full original flag universe — carried through reruns so the UI
        # can keep showing dimmed tokens for deactivated modifiers.
        all_attacker_flags = params.get("all_attacker_flags", None)
        all_defender_flags = params.get("all_defender_flags", None)

        if not attacker_raw or not defender_raw:
            return self._err("combat", "Usage: <attacker> vs <defender>  e.g. broadside vs intercessors")

        # ── Resolve attacker ──────────────────────────────────────────────────
        # Resolution order:
        #   1. _attacker_faction param (set after disambiguation selection)
        #   2. Session player faction (auto-prefer when roster is loaded)
        #   3. Global all-faction search → may trigger disambiguation
        att_faction = params.get("_attacker_faction")
        if att_faction:
            att_unit = self._loader.get_unit(attacker_raw, faction=att_faction)
        else:
            session_faction = self._session.get("faction")
            if session_faction:
                sf_matches = self._loader.get_units_matching(attacker_raw, faction=session_faction, limit=9)
                if len(sf_matches) == 1:
                    att_unit = sf_matches[0]
                elif len(sf_matches) > 1:
                    return self._disambiguate(
                        "combat_attacker",
                        {"attacker": attacker_raw, "defender": defender_raw, "flags": flags},
                        "attacker",
                        sf_matches,
                    )
                else:
                    # Not in session faction — fall to global search
                    sf_matches = None
                    att_matches = self._loader.get_units_matching(attacker_raw, limit=9)
                    if len(att_matches) > 1:
                        return self._disambiguate(
                            "combat_attacker",
                            {"attacker": attacker_raw, "defender": defender_raw, "flags": flags},
                            "attacker",
                            att_matches,
                        )
                    att_unit = att_matches[0] if att_matches else None
            else:
                att_matches = self._loader.get_units_matching(attacker_raw, limit=9)
                if len(att_matches) > 1:
                    return self._disambiguate(
                        "combat_attacker",
                        {"attacker": attacker_raw, "defender": defender_raw, "flags": flags},
                        "attacker",
                        att_matches,
                    )
                att_unit = att_matches[0] if att_matches else None

        # ── Resolve defender ──────────────────────────────────────────────────
        # Resolution order:
        #   1. _defender_faction param (set after disambiguation selection)
        #   2. Session enemy faction (auto-prefer when enemy roster is loaded)
        #   3. Global all-faction search → may trigger disambiguation
        def_faction = params.get("_defender_faction")
        if def_faction:
            def_unit = self._loader.get_unit(defender_raw, faction=def_faction)
        else:
            enemy_faction = self._session.get("enemy_faction")
            if enemy_faction:
                ef_matches = self._loader.get_units_matching(defender_raw, faction=enemy_faction, limit=9)
                if len(ef_matches) == 1:
                    def_unit = ef_matches[0]
                elif len(ef_matches) > 1:
                    return self._disambiguate(
                        "combat_defender",
                        {
                            "attacker":          att_unit.get("name", attacker_raw) if att_unit else attacker_raw,
                            "_attacker_faction": att_unit.get("faction") if att_unit else None,
                            "defender":          defender_raw,
                            "flags":             flags,
                        },
                        "defender",
                        ef_matches,
                    )
                else:
                    # Not in enemy faction — fall to global search
                    def_matches = self._loader.get_units_matching(defender_raw, limit=9)
                    if len(def_matches) > 1:
                        return self._disambiguate(
                            "combat_defender",
                            {
                                "attacker":          att_unit.get("name", attacker_raw) if att_unit else attacker_raw,
                                "_attacker_faction": att_unit.get("faction") if att_unit else None,
                                "defender":          defender_raw,
                                "flags":             flags,
                            },
                            "defender",
                            def_matches,
                        )
                    def_unit = def_matches[0] if def_matches else None
            else:
                def_matches = self._loader.get_units_matching(defender_raw, limit=9)
                if len(def_matches) > 1:
                    # Attacker is already resolved — carry its identity forward
                    return self._disambiguate(
                        "combat_defender",
                        {
                            "attacker":          att_unit.get("name", attacker_raw) if att_unit else attacker_raw,
                            "_attacker_faction": att_unit.get("faction") if att_unit else None,
                            "defender":          defender_raw,
                            "flags":             flags,
                        },
                        "defender",
                        def_matches,
                    )
                def_unit = def_matches[0] if def_matches else None

        att_name = att_unit.get("name", attacker_raw) if att_unit else attacker_raw
        def_name = def_unit.get("name", defender_raw) if def_unit else defender_raw

        # ── Roster loadout disambiguation ────────────────────────────────────
        # If a roster is loaded and has multiple entries for the same unit name
        # (e.g. 2x Hammerhead with different loadouts), ask which one.
        # Skip if a roster entry was already selected via _attacker_roster_entry.
        att_roster_entry = params.get("_attacker_roster_entry")
        def_roster_entry = params.get("_defender_roster_entry")

        if att_unit and not att_roster_entry:
            att_roster_matches = self._find_roster_entries(att_name, "roster_my")
            if len(att_roster_matches) > 1:
                return self._roster_disambiguate(
                    "combat_attacker_roster",
                    {
                        "attacker":          att_name,
                        "_attacker_faction": att_unit.get("faction"),
                        "defender":          defender_raw,
                        "_defender_faction": params.get("_defender_faction"),
                        "_defender_roster_entry": def_roster_entry,
                        "flags":             flags,
                        "attacker_flags":    attacker_flags,
                        "defender_flags":    defender_flags,
                        "all_attacker_flags": all_attacker_flags,
                        "all_defender_flags": all_defender_flags,
                    },
                    "attacker",
                    att_name,
                    att_roster_matches,
                    "roster_my",
                )
            elif len(att_roster_matches) == 1:
                att_roster_entry = att_roster_matches[0]

        if def_unit and not def_roster_entry:
            def_roster_matches = self._find_roster_entries(def_name, "roster_enemy")
            if len(def_roster_matches) > 1:
                return self._roster_disambiguate(
                    "combat_defender_roster",
                    {
                        "attacker":          att_name,
                        "_attacker_faction": att_unit.get("faction") if att_unit else None,
                        "_attacker_roster_entry": att_roster_entry,
                        "defender":          def_name,
                        "_defender_faction": def_unit.get("faction") if def_unit else None,
                        "flags":             flags,
                        "attacker_flags":    attacker_flags,
                        "defender_flags":    defender_flags,
                        "all_attacker_flags": all_attacker_flags,
                        "all_defender_flags": all_defender_flags,
                    },
                    "defender",
                    def_name,
                    def_roster_matches,
                    "roster_enemy",
                )
            elif len(def_roster_matches) == 1:
                def_roster_entry = def_roster_matches[0]

        # ── Leader attachment — merge leader weapons into bodyguard unit ─────
        # If a unit has an attached leader, merge the leader's dossier weapons
        # into the unit for combat. If a leader is called directly, also pull
        # in the bodyguard's weapons.
        att_leader_unit = None
        def_leader_unit = None
        att_leader_missing = None   # leader attached in roster but no datasheet found

        if att_unit:
            att_bg_nick = (att_roster_entry or {}).get("nickname")
            att_bg_idx  = (att_roster_entry or {}).get("_idx")
            leader_entry = self._find_attached_leader(
                att_name, "roster_my", att_bg_nick, bodyguard_idx=att_bg_idx)
            if leader_entry:
                # A leader is attached to this unit — look up leader dossier
                leader_name = leader_entry.get("name", "")
                att_leader_unit = self._resolve_unit_dossier(leader_name, att_unit.get("faction"))
                # Stash the leader's own roster loadout so weapon filtering
                # uses the exact attached entry (the dossier name may differ,
                # e.g. 'COMMANDER' vs 'Commander in Coldstar Battlesuit').
                if att_leader_unit and leader_entry.get("weapons"):
                    att_leader_unit = {**att_leader_unit,
                                       "_roster_weapons": leader_entry["weapons"]}
                elif not att_leader_unit:
                    # Leader is attached but we have no datasheet for it — surface
                    # this instead of silently omitting the leader's firepower.
                    att_leader_missing = leader_name or "attached leader"
                    self._log_issue(
                        "unit_lookup",
                        f"Attached leader has no datasheet: '{leader_name}'",
                        f"bodyguard={att_name}",
                    )
            else:
                # Maybe WE are the leader — check if we're attached to a bodyguard
                bg_entry = self._find_bodyguard_for_leader(att_name, "roster_my")
                if bg_entry:
                    bg_name = bg_entry.get("name", "")
                    att_leader_unit = att_unit  # the "leader" is us
                    bg_unit = self._resolve_unit_dossier(bg_name, att_unit.get("faction"))
                    if bg_unit:
                        # Swap: bodyguard becomes the base unit, leader augments it
                        att_leader_unit = att_unit
                        att_unit = bg_unit
                        att_name = bg_unit.get("name", att_name)
                        # Use the bodyguard's roster entry for model count/weapons
                        if not att_roster_entry:
                            bg_matches = self._find_roster_entries(bg_name, "roster_my")
                            if bg_matches:
                                att_roster_entry = bg_matches[0]

        if def_unit:
            def_bg_nick = (def_roster_entry or {}).get("nickname")
            def_bg_idx  = (def_roster_entry or {}).get("_idx")
            leader_entry = self._find_attached_leader(
                def_name, "roster_enemy", def_bg_nick, bodyguard_idx=def_bg_idx)
            if leader_entry:
                leader_name = leader_entry.get("name", "")
                def_leader_unit = self._resolve_unit_dossier(leader_name, def_unit.get("faction"))
            else:
                bg_entry = self._find_bodyguard_for_leader(def_name, "roster_enemy")
                if bg_entry:
                    bg_name = bg_entry.get("name", "")
                    def_leader_unit = def_unit
                    bg_unit = self._resolve_unit_dossier(bg_name, def_unit.get("faction"))
                    if bg_unit:
                        def_leader_unit = def_unit
                        def_unit = bg_unit
                        def_name = bg_unit.get("name", def_name)
                        if not def_roster_entry:
                            bg_matches = self._find_roster_entries(bg_name, "roster_enemy")
                            if bg_matches:
                                def_roster_entry = bg_matches[0]

        # ── Validate flags — reject unknown modifiers with suggestions ───────
        flag_errors = validate_flags(flags)
        if flag_errors:
            parts = []
            for fe in flag_errors:
                msg = f"Unknown modifier: --{fe['flag']}"
                if fe["suggestions"]:
                    msg += f". Did you mean: {', '.join('--' + s for s in fe['suggestions'])}?"
                parts.append(msg)
            return self._err("combat", "\n".join(parts))

        # Log lookup failures to the session issue log
        if not att_unit:
            self._log_issue("unit_lookup", f"Attacker not found: '{attacker_raw}'", f"query={attacker_raw}")
        if not def_unit:
            self._log_issue("unit_lookup", f"Defender not found: '{defender_raw}'", f"query={defender_raw}")

        # ── Crusade combat bridge ────────────────────────────────────────────
        # If the attacker's roster entry carries a crusade block, its OFFENSIVE
        # honours / scars contribute auto-flags to the math (no manual --flags
        # needed) and ◈-tagged notes + abilities to the display. crusade_flags
        # skip validate_flags (already past) so descriptive-only traits never
        # raise "unknown modifier".
        crusade_flags, crusade_notes, crusade_abilities = self._crusade_combat_mods(att_roster_entry, "attacker")
        if not crusade_flags and not crusade_notes:
            # Fall back to a name match in case the roster entry wasn't resolved
            # (e.g. single-loadout unit auto-matched without _attacker_roster_entry).
            _cr_entry = self._crusade_block_for(att_name)
            if _cr_entry:
                crusade_flags, crusade_notes, crusade_abilities = self._crusade_combat_mods(_cr_entry, "attacker")

        # Defender-side crusade: a unit's DEFENSIVE honours/scars (FNP, invuln,
        # +Wounds, damage reduction, save modifiers) modify the target profile
        # when the unit is defending. The player's crusade units live in
        # roster_my regardless of which side of `vs` they sit on, so search there
        # first, then the enemy roster.
        def_cr_entry = def_roster_entry if (def_roster_entry and def_roster_entry.get("crusade")) else None
        if not def_cr_entry:
            def_cr_entry = (self._crusade_block_for(def_name, "roster_my")
                            or self._crusade_block_for(def_name, "roster_enemy"))
        def_crusade_flags, def_crusade_notes, _ = self._crusade_combat_mods(def_cr_entry, "defender")

        # Augment attacker with drone / turret weapons so they appear in the
        # combat weapon table and are included in combat math.
        if att_unit:
            att_unit = self._augment_unit_with_supplements(att_unit)

        # Model count — prefer roster entry (already resolved above),
        # then fall back to scanning the roster list, then dossier minimum.
        att_models = _parse_min_models(att_unit.get("unit_composition", [])) if att_unit else 1
        if att_roster_entry and att_roster_entry.get("models"):
            att_models = int(att_roster_entry["models"])
        elif att_unit:
            _att_name = att_unit.get("name", "").lower()
            for _ru in self._session.get("roster_my", []):
                _ru_name = (_ru.get("name") or "").lower()
                if _ru_name and (_ru_name in _att_name or _att_name in _ru_name):
                    if _ru.get("models"):
                        att_models = int(_ru["models"])
                    break

        # Defender model count — drives BLAST minimum-3-attacks rule.
        def_models = _parse_min_models(def_unit.get("unit_composition", [])) if def_unit else 1
        if def_roster_entry and def_roster_entry.get("models"):
            def_models = int(def_roster_entry["models"])
        elif def_unit:
            _def_name = def_unit.get("name", "").lower()
            for _ru in self._session.get("roster_enemy", []):
                _ru_name = (_ru.get("name") or "").lower()
                if _ru_name and (_ru_name in _def_name or _def_name in _ru_name):
                    if _ru.get("models"):
                        def_models = int(_ru["models"])
                    break

        # ── Filter attacker weapons by roster loadout ────────────────────────
        # If a roster entry was selected (or auto-matched), only include
        # the weapons that are actually in that loadout.
        att_weapons_source = att_unit.get("weapons", []) if att_unit else []
        if att_roster_entry and att_roster_entry.get("weapons"):
            att_weapons_source = self._filter_weapons_by_roster(
                att_weapons_source, att_roster_entry["weapons"]
            )

        # Merge attached leader weapons (they fire independently, 1 model)
        att_leader_weapons = []
        if att_leader_unit:
            leader_augmented = self._augment_unit_with_supplements(att_leader_unit)
            leader_ws = leader_augmented.get("weapons", [])
            # Prefer the leader's exact attached roster loadout (stashed at
            # resolution time); fall back to a name-based roster search.
            _stashed = att_leader_unit.get("_roster_weapons")
            if _stashed:
                leader_ws = self._filter_weapons_by_roster(leader_ws, _stashed)
            else:
                leader_name_lower = att_leader_unit.get("name", "").lower()
                for _ru in self._session.get("roster_my", []):
                    _rn = (_ru.get("name") or "").lower()
                    if _rn and (_rn in leader_name_lower or leader_name_lower in _rn):
                        if _ru.get("weapons"):
                            leader_ws = self._filter_weapons_by_roster(leader_ws, _ru["weapons"])
                        break
            att_leader_weapons = leader_ws

        # Extra attacks per model from attacker-side flags.
        # Supports both --ea 1 (stored as "ea:1") and --ea1 (stored as "ea1").
        _ea_extra = 0
        for _f in (attacker_flags if attacker_flags else flags):
            _key = _f.split(":")[0].lower()
            if _key == "ea" or re.match(r'^ea\d+$', _key):
                try:
                    _ea_extra += int(_f.split(":")[1]) if ":" in _f else int(re.sub(r'^ea', '', _key) or 0)
                except (ValueError, TypeError):
                    pass

        # Build structured weapon list from attacker unit
        weapons = []
        if att_unit:
            for w in att_weapons_source:
                if isinstance(w, dict):
                    w_name = w.get("name", "Unknown")
                    # Dossiers use "type": "melee"/"ranged" or range "Melee"
                    w_type = "melee" if (
                        w.get("type") == "melee"
                        or str(w.get("range", "")).lower() == "melee"
                        or "melee" in str(w.get("keywords", "")).lower()
                    ) else "ranged"
                    # Dossiers store attacks as "a" (build_all_factions.py output)
                    # fall back to "attacks" / "shots" for any other schema
                    shots_raw = (
                        w.get("a")
                        or w.get("attacks")
                        or w.get("shots")
                    )
                    # Compute total attacks across all models when count > 1
                    # and shots_raw is a plain integer (not a dice expression).
                    # Apply extra attacks from --ea flag before computing total.
                    shots_total = None
                    if shots_raw is not None:
                        try:
                            shots_num = int(str(shots_raw).strip()) + _ea_extra
                            shots_raw = shots_num  # update displayed per-model value
                            # Only multiply by model count if this weapon is per-model.
                            # Unit-level weapons (support turrets, etc.) carry
                            # _no_multiply=True to prevent incorrect inflation.
                            if att_models > 1 and not w.get("_no_multiply"):
                                shots_total = shots_num * att_models
                        except ValueError:
                            pass  # dice expression (D6 etc.) — leave as None
                    keywords = w.get("keywords", [])
                    if isinstance(keywords, str):
                        keywords = [k.strip() for k in keywords.split(",") if k.strip()]
                    weapons.append({
                        "name":        w_name,
                        "type":        w_type,
                        "shots":       shots_raw,    # attacks per model (raw string)
                        "shots_total": shots_total,  # total across squad (int or None)
                        "models":      att_models,
                        "range":       w.get("range", "—"),
                        "bs_ws":       w.get("bs_ws") or w.get("bs") or w.get("ws", "—"),
                        "strength":    w.get("s") or w.get("strength", "—"),
                        "ap":          w.get("ap", "—"),
                        "damage":      w.get("d") or w.get("damage", "—"),
                        "keywords":    keywords,
                        "_drone":      w.get("_drone", False),   # True → cyan tint in UI
                        "dmg":         None,   # filled by math engine below
                        "kills":       None,
                        # probability chain — filled below
                        "hit_pct":     None,
                        "wound_pct":   None,
                        "kill_pct":    None,
                        # raw targets — filled below (used for delta colouring)
                        "hit_target":  None,
                        "wound_target": None,
                        # modifier delta signals for frontend colour-coding
                        "bs_delta":    None,  # "better" | "worse" | None
                        "wr_delta":    None,  # "better" | "worse" | None
                    })
                else:
                    w_str  = str(w).strip()
                    # First segment before stats gap is the weapon name
                    parts  = re.split(r'\s{2,}', w_str)
                    w_name = parts[0].strip() if parts else w_str
                    w_type = "melee" if "melee" in w_str.lower() else "ranged"
                    weapons.append({
                        "name":        w_name,
                        "type":        w_type,
                        "shots":       None,
                        "shots_total": None,
                        "models":      att_models,
                        "range":       None,
                        "bs_ws":       None,
                        "strength":    None,
                        "ap":          None,
                        "damage":      None,
                        "keywords":    [],
                        "dmg":         None,
                        "kills":       None,
                        "hit_pct":     None,
                        "wound_pct":   None,
                        "kill_pct":    None,
                        "hit_target":  None,
                        "wound_target": None,
                        "bs_delta":    None,
                        "wr_delta":    None,
                    })

        # ── Append leader weapons (1 model, independent) ─────────────────────
        if att_leader_weapons:
            leader_label = att_leader_unit.get("name", "Leader") if att_leader_unit else "Leader"
            for w in att_leader_weapons:
                if isinstance(w, dict):
                    w_name = w.get("name", "Unknown")
                    w_type = "melee" if (
                        w.get("type") == "melee"
                        or str(w.get("range", "")).lower() == "melee"
                        or "melee" in str(w.get("keywords", "")).lower()
                    ) else "ranged"
                    shots_raw = w.get("a") or w.get("attacks") or w.get("shots")
                    keywords = w.get("keywords", [])
                    if isinstance(keywords, str):
                        keywords = [k.strip() for k in keywords.split(",") if k.strip()]
                    weapons.append({
                        "name":        f"{w_name} ({leader_label})",
                        "type":        w_type,
                        "shots":       shots_raw,
                        "shots_total": None,  # leader is always 1 model
                        "models":      1,
                        "range":       w.get("range", "—"),
                        "bs_ws":       w.get("bs_ws") or w.get("bs") or w.get("ws", "—"),
                        "strength":    w.get("s") or w.get("strength", "—"),
                        "ap":          w.get("ap", "—"),
                        "damage":      w.get("d") or w.get("damage", "—"),
                        "keywords":    keywords,
                        "_drone":      False,
                        "_leader":     True,  # tag for UI styling
                        "dmg":         None,
                        "kills":       None,
                        "hit_pct":     None,
                        "wound_pct":   None,
                        "kill_pct":    None,
                        "hit_target":  None,
                        "wound_target": None,
                        "bs_delta":    None,
                        "wr_delta":    None,
                    })

        # Abilities from attacker
        abilities = []
        if att_unit:
            for ab in att_unit.get("abilities", []):
                norm = self._normalize_ability(ab)
                abilities.append({"name": norm["name"], "description": norm["description"], "color": "cyan"})
        # Merge leader abilities if attached
        if att_leader_unit:
            for ab in att_leader_unit.get("abilities", []):
                norm = self._normalize_ability(ab)
                abilities.append({"name": norm["name"], "description": norm["description"], "color": "amber"})
        # Crusade honours (amber) + scars (red) from the mustered roster entry
        if crusade_abilities:
            abilities.extend(crusade_abilities)

        # Flag notes for active modifiers
        FLAG_NOTE_MAP = {
            "ml":        {"icon": "target",    "text": "Markerlights active — +1 to Hit rolls, Ignores Cover"},
            "cover":     {"icon": "shield",    "text": "Target in cover — +1 to armour saves"},
            "dev":       {"icon": "skull",     "text": "Devastating Wounds — critical wounds bypass saves"},
            "lethal":    {"icon": "lightning", "text": "Lethal Hits — unmodified 6s to Hit auto-wound"},
            "twin":      {"icon": "star",      "text": "Twin-linked — re-roll all failed wound rolls"},
            "sustained": {"icon": "star",      "text": "Sustained Hits 1 — critical hits generate +1 extra hit"},
            "blast":     {"icon": "skull",     "text": "Blast — makes minimum 3 attacks against units of 6+ models"},
            "rf":        {"icon": "lightning", "text": "Rapid Fire — +attacks equal to weapon's Rapid Fire value within half range"},
            "melta":     {"icon": "skull",     "text": "Melta — +damage equal to weapon's Melta value within half range"},
            "torrent":   {"icon": "target",    "text": "Torrent — weapon auto-hits (no ballistic skill roll needed)"},
            "lance":     {"icon": "star",      "text": "Lance — +1 to Wound rolls (charged this turn)"},
            "heavy":     {"icon": "target",    "text": "Heavy — Remained Stationary: Heavy weapons get +1 to Hit rolls"},
            "stealth":   {"icon": "shield",    "text": "Stealth — -1 to Hit rolls against this target"},
            "indirect":  {"icon": "shield",    "text": "Indirect Fire — -1 to Hit rolls, target benefits from cover"},
            "halfdmg":   {"icon": "shield",    "text": "Half Damage — damage output halved (e.g. Duty Eternal)"},
            "igncover":  {"icon": "target",    "text": "Ignore Cover — attacker ignores benefit of cover"},
            "nocover":   {"icon": "target",    "text": "Ignore Cover — attacker ignores benefit of cover"},
            "rrhit":     {"icon": "star",      "text": "Re-roll Hits — re-roll all failed Hit rolls"},
            "rrhits":    {"icon": "star",      "text": "Re-roll Hits — re-roll all failed Hit rolls"},
            "rrhit1":    {"icon": "star",      "text": "Re-roll Hit 1s — re-roll Hit rolls of 1"},
            "rrhits1":   {"icon": "star",      "text": "Re-roll Hit 1s — re-roll Hit rolls of 1"},
            "rrwound1":  {"icon": "star",      "text": "Re-roll Wound 1s — re-roll Wound rolls of 1"},
            "rrwounds1": {"icon": "star",      "text": "Re-roll Wound 1s — re-roll Wound rolls of 1"},
            "oath":      {"icon": "star",      "text": "Oath of Moment — re-roll all failed Hit and Wound rolls"},
        }
        flag_notes = []
        if att_leader_missing:
            flag_notes.append({
                "icon": "alert",
                "text": (f"Attached leader “{att_leader_missing}” has no datasheet in the "
                         f"dossier — its weapons are NOT included. Add the unit to the "
                         f"faction dossier to include it."),
            })
        for f in flags:
            key = f.split(":")[0]
            if key in FLAG_NOTE_MAP:
                flag_notes.append(FLAG_NOTE_MAP[key])
            elif key.startswith("invuln"):
                val = f.split(":")[1] if ":" in f else re.sub(r'^invuln', '', key) or "?"
                flag_notes.append({"icon": "diamond", "text": f"Invulnerable save active — {val}+ invuln overrides armour save"})
            elif key == "ea" or re.match(r'^ea\d+$', key):
                val = f.split(":")[1] if ":" in f else re.sub(r'^ea', '', key)
                flag_notes.append({"icon": "zap", "text": f"+{val} extra attack(s) per model"})
            elif key in ("ed", "dmgplus") or re.match(r'^ed\d+$', key):
                val = f.split(":")[1] if ":" in f else re.sub(r'^(ed|dmgplus)', '', key) or "1"
                flag_notes.append({"icon": "zap", "text": f"+{val} extra damage per unsaved wound"})
            elif key.startswith("fnp"):
                val = f.split(":")[1] if ":" in f else re.sub(r'^fnp', '', key) or "?"
                flag_notes.append({"icon": "shield", "text": f"Feel No Pain {val}+ — target ignores wounds on {val}+"})
            elif key.startswith("criton"):
                val = f.split(":")[1] if ":" in f else re.sub(r'^criton', '', key) or "?"
                flag_notes.append({"icon": "lightning", "text": f"Critical hits on {val}+ instead of 6+"})
            elif key.startswith("critwound"):
                val = f.split(":")[1] if ":" in f else re.sub(r'^critwound', '', key) or "?"
                flag_notes.append({"icon": "lightning", "text": f"Critical wounds on {val}+ instead of 6+"})
            elif key.startswith("hitplus"):
                val = f.split(":")[1] if ":" in f else (re.sub(r'^hitplus', '', key) or "1")
                flag_notes.append({"icon": "target", "text": f"+{val} to Hit rolls"})
            elif key.startswith("wndplus"):
                val = f.split(":")[1] if ":" in f else (re.sub(r'^wndplus', '', key) or "1")
                flag_notes.append({"icon": "star", "text": f"+{val} to Wound rolls"})
            elif key.startswith("woundsplus"):
                val = f.split(":")[1] if ":" in f else (re.sub(r'^woundsplus', '', key) or "1")
                flag_notes.append({"icon": "shield", "text": f"{'+' if not str(val).startswith('-') else ''}{val} to target Wounds characteristic (min 1)"})
            elif key.startswith("dmgred"):
                base = "dmgreduce" if key.startswith("dmgreduce") else "dmgred"
                val = f.split(":")[1] if ":" in f else (re.sub(rf'^{base}', '', key) or "1")
                flag_notes.append({"icon": "shield", "text": f"-{val} Damage suffered per attack (final damage floored at 1)"})
            elif key.startswith("svplus"):
                val = f.split(":")[1] if ":" in f else (re.sub(r'^svplus', '', key) or "1")
                flag_notes.append({"icon": "shield", "text": f"+{val} to target Save rolls (better armour save)"})
            elif key.startswith("svminus"):
                val = f.split(":")[1] if ":" in f else (re.sub(r'^svminus', '', key) or "1")
                flag_notes.append({"icon": "shield", "text": f"-{val} to target Save rolls (worse armour save)"})
            elif key.startswith("sus"):
                base = "sustained" if key.startswith("sustained") else "sus"
                raw = f.split(":")[1] if ":" in f else (key[len(base):] or "1")
                try: n = int(raw)
                except ValueError: n = 1
                flag_notes.append({"icon": "star", "text": f"Sustained Hits {n} — critical hits generate +{n} extra hit(s)"})
            elif key.startswith("eapdef"):
                raw = f.split(":")[1] if ":" in f else (re.sub(r'^eapdef', '', key) or "1")
                try: n = int(raw)
                except ValueError: n = 1
                flag_notes.append({"icon": "shield", "text": f"-{n} Armour Penetration — target worsens incoming AP (e.g. Commander in Enforcer Battlesuit)"})
            elif key.startswith("eap"):
                raw = f.split(":")[1] if ":" in f else (re.sub(r'^eap', '', key) or "1")
                try: n = int(raw)
                except ValueError: n = 1
                flag_notes.append({"icon": "skull", "text": f"+{n} Armour Penetration — improves weapon AP (e.g. AP-1 → AP-{1 + n})"})

        # Crusade honour/scar notes — auto-applied, shown with a ◈ marker
        if crusade_notes:
            flag_notes.extend(crusade_notes)
        if def_crusade_notes:
            flag_notes.extend(def_crusade_notes)

        n_ranged = len([w for w in weapons if w["type"] != "melee"])
        n_melee  = len([w for w in weapons if w["type"] == "melee"])
        footer_parts = []
        if n_ranged: footer_parts.append(f"{n_ranged} ranged")
        if n_melee:  footer_parts.append(f"{n_melee} melee")
        model_note = f"{att_models} model{'s' if att_models != 1 else ''}"
        footer = " · ".join(footer_parts) + f" · {model_note} · ranked by kills" if footer_parts else ""

        # ── Run combat math ──────────────────────────────────────────────────
        # att_models: multiplies per-model attack counts by squad size.
        # def_models: used by BLAST minimum-3-attacks rule (rule applies vs 6+ model units).
        #
        # Pass a copy of att_unit with weapons filtered to the roster loadout
        # (plus leader weapons) so the math engine only computes for equipped weapons.
        #
        # math_flags merges the user's command flags with auto-applied Crusade
        # honour/scar flags so battle traits modify the math with no manual flags.
        # Attacker contributes offensive flags; defender contributes defensive ones.
        math_flags = list(flags) + list(crusade_flags) + list(def_crusade_flags)
        math_result = {}
        sensitivity = []
        if att_unit and def_unit:
            # Build a math-unit with the roster-filtered weapons
            att_unit_for_math = dict(att_unit)
            math_weapons = list(att_weapons_source)
            if att_leader_weapons and att_leader_unit:
                # Rename leader weapons to match the display names used in the
                # UI weapon list (e.g. "Lashwhip (HIVE TYRANT)") so that the
                # per_weapon_dmg dict keys line up with the weapon entries.
                leader_label = att_leader_unit.get("name", "Leader")
                for lw in att_leader_weapons:
                    if isinstance(lw, dict):
                        renamed = dict(lw)
                        renamed["name"] = f"{lw.get('name', 'Unknown')} ({leader_label})"
                        renamed["_no_multiply"] = True  # leader is always 1 model
                        math_weapons.append(renamed)
                    else:
                        math_weapons.append(lw)
            elif att_leader_weapons:
                math_weapons = math_weapons + list(att_leader_weapons)
            att_unit_for_math["weapons"] = math_weapons

            try:
                math_result = compute_combat(
                    att_unit_for_math, def_unit, math_flags,
                    att_models=att_models, def_models=def_models,
                )
                sensitivity = compute_sensitivity(
                    att_unit_for_math, def_unit, math_flags,
                    att_models=att_models, def_models=def_models,
                )
            except Exception as _ce:
                math_result = {}
                sensitivity = []
                self._log_issue("combat_math", f"Math engine error for {att_name} vs {def_name}: {_ce}")

        # Defender toughness — needed for wound-roll delta baseline
        def_T = None
        if def_unit:
            raw_t = (def_unit.get("T")
                     or (def_unit.get("stats") or {}).get("T"))
            try:
                def_T = int(str(raw_t or "").replace('"', "").strip())
            except (ValueError, TypeError):
                def_T = None

        # Stamp computed values + delta signals onto each weapon entry
        per_weapon_dmg = math_result.get("per_weapon_dmg", {})
        for w in weapons:
            pw = per_weapon_dmg.get(w["name"], {})
            w["dmg"]          = pw.get("dmg")
            w["kills"]        = pw.get("kills")
            w["hit_pct"]      = pw.get("hit_pct")
            w["wound_pct"]    = pw.get("wound_pct")
            w["kill_pct"]     = pw.get("kill_chance_pct")  # P(≥1 kill) from MC distribution
            w["fail_save_pct"] = pw.get("fail_save_pct")   # prob of unsaved wound — kept for completeness
            w["hit_target"]   = pw.get("hit_target")
            w["wound_target"] = pw.get("wound_target")
            w["overkill_pct"] = pw.get("overkill_waste_pct")

            # Active modifier sources for this weapon (gates HEAVY by keyword).
            hit_sources, wound_sources = _collect_stat_sources(
                math_flags, w.get("keywords"))

            # BS delta: compare effective hit roll vs the weapon's baseline BS/WS
            try:
                bs_base = int(str(w.get("bs_ws", "")).replace("+", "").strip())
                ht = pw.get("hit_target")
                if ht is not None:
                    if   ht < bs_base: w["bs_delta"] = "better"
                    elif ht > bs_base: w["bs_delta"] = "worse"
                    if w.get("bs_delta"):
                        w["bs_reason"] = _build_stat_reason(
                            "BS", "Hit", bs_base, ht, hit_sources, w["bs_delta"])
            except (ValueError, TypeError):
                pass

            # WR delta: compare effective wound target vs S-vs-T standard formula
            if def_T is not None:
                base_wr = _baseline_wr(w.get("strength"), def_T)
                wt = pw.get("wound_target")
                if base_wr is not None and wt is not None:
                    if   wt < base_wr: w["wr_delta"] = "better"
                    elif wt > base_wr: w["wr_delta"] = "worse"
                    if w.get("wr_delta"):
                        w["wr_reason"] = _build_stat_reason(
                            "WR", "Wound", base_wr, wt, wound_sources, w["wr_delta"])

            # AP delta: --eap (attacker improves AP) / --eapdef (target worsens it).
            # Recompute the effective AP and overwrite the displayed value so the
            # cell shows the modified AP, with a popover explaining the shift.
            ap_sources = _collect_ap_sources(math_flags)
            ap_net = sum(a for a, _ in ap_sources if a is not None)
            if ap_net:
                base_mag = _ap_magnitude(w.get("ap"))
                eff_mag  = max(0, base_mag + ap_net)
                if eff_mag != base_mag:
                    w["ap"] = f"-{eff_mag}" if eff_mag > 0 else "0"
                    w["ap_delta"]  = "better" if eff_mag > base_mag else "worse"
                    w["ap_reason"] = _build_ap_reason(
                        base_mag, eff_mag, ap_sources, w["ap_delta"])

        # Sort: ranged by dmg desc, melee by dmg desc
        ranged_ws = sorted([w for w in weapons if w["type"] != "melee"],
                           key=lambda x: x["dmg"] or 0, reverse=True)
        melee_ws  = sorted([w for w in weapons if w["type"] == "melee"],
                           key=lambda x: x["dmg"] or 0, reverse=True)
        weapons = ranged_ws + melee_ws

        # ── Modifier toggle metadata ────────────────────────────────────────
        # On the first run, attacker_flags and defender_flags come from the parsed
        # command.  On reruns they are the currently-active subsets.
        # all_attacker_flags / all_defender_flags preserve the full original set
        # across reruns so the UI can show dimmed tokens for inactive modifiers.
        final_all_att = all_attacker_flags if all_attacker_flags is not None else list(attacker_flags)
        final_all_def = all_defender_flags if all_defender_flags is not None else list(defender_flags)

        # Store last_combat for rerun support (includes roster entries so
        # reruns preserve the specific loadout selection).
        att_identity = att_unit.get("name", attacker_raw) if att_unit else attacker_raw
        def_identity = def_unit.get("name", defender_raw) if def_unit else defender_raw
        self._session["last_combat"] = {
            "attacker":              att_identity,
            "_attacker_faction":     att_unit.get("faction") if att_unit else None,
            "_attacker_roster_entry": att_roster_entry,
            "defender":              def_identity,
            "_defender_faction":     def_unit.get("faction") if def_unit else None,
            "_defender_roster_entry": def_roster_entry,
            "all_attacker_flags":    final_all_att,
            "all_defender_flags":    final_all_def,
            "active_attacker_flags": list(attacker_flags),
            "active_defender_flags": list(defender_flags),
        }

        # Build display names — annotate with nickname and/or leader
        att_nick = att_roster_entry.get("nickname") if att_roster_entry else None
        def_nick = def_roster_entry.get("nickname") if def_roster_entry else None

        att_display = f"{att_name} ({att_nick})" if att_nick else att_name
        def_display = f"{def_name} ({def_nick})" if def_nick else def_name
        if att_leader_unit:
            leader_n = att_leader_unit.get("name", "")
            if leader_n.lower() != att_name.lower():
                att_display = f"{att_display} + {leader_n}"
        if def_leader_unit:
            leader_n = def_leader_unit.get("name", "")
            if leader_n.lower() != def_name.lower():
                def_display = f"{def_display} + {leader_n}"

        return {
            "ok":          True,
            "command":     "combat",
            "result_type": "combat",
            "data": {
                "attacker_name":       att_display,
                "defender_name":       def_display,
                "flags":               flags,
                # Per-side flag breakdowns — power the interactive toggle UI
                "attacker_flags":      list(attacker_flags),
                "defender_flags":      list(defender_flags),
                "all_attacker_flags":  final_all_att,
                "all_defender_flags":  final_all_def,
                "ranged":              math_result.get("ranged"),
                "melee":               math_result.get("melee"),
                "weapons":             weapons,
                "damage_distribution": None,   # Monte Carlo kill-bucket chart — future
                "modifier_impact":     sensitivity or None,
                "simulation":          math_result.get("simulation"),
                "simulation_status":   math_result.get("simulation_status", "OFFLINE"),
                "flag_notes":          flag_notes,
                "abilities":           abilities,
                "footer":              footer,
            },
            "meta": {
                "attacker": attacker_raw,
                "defender": defender_raw,
                "math_ledger": (
                    build_combat_ledger(att_unit, def_unit, math_flags, math_result, weapons)
                    if att_unit and def_unit else []
                ),
            },
        }

    def _query_rerun(self, params: dict) -> dict:
        """Re-run the last combat simulation with modifier changes.

        Parses the 'mods' string (e.g. '--lethal null --cover') to determine
        which flags to add or remove from the currently-active set, then
        dispatches back through _query_combat with updated params.

        The returned result carries  data._in_place = True  so the frontend
        knows to update the previous combat block rather than append a new one.
        """
        last = self._session.get("last_combat")
        if not last:
            return self._err(
                "rerun",
                "No previous combat to rerun. Run a combat simulation first,  "
                "e.g.  broadside vs tervigon",
            )

        raw_mods = params.get("mods", "").strip()
        to_add, to_remove = self._parse_rerun_mods(raw_mods)

        all_att    = last["all_attacker_flags"]
        all_def    = last["all_defender_flags"]
        active_att = list(last["active_attacker_flags"])
        active_def = list(last["active_defender_flags"])

        # ── Apply removals (matched by flag name, ignoring value suffix) ────
        def flag_name(f: str) -> str:
            return f.split(":")[0]

        for name in to_remove:
            active_att = [f for f in active_att if flag_name(f) != name]
            active_def = [f for f in active_def if flag_name(f) != name]

        # ── Apply additions (restore from the full original set) ────────────
        already_att = {flag_name(f) for f in active_att}
        already_def = {flag_name(f) for f in active_def}

        for name in to_add:
            if name not in already_att and name not in already_def:
                # Try to find original flag (preserves value suffixes like "invuln:4")
                orig_att = next((f for f in all_att if flag_name(f) == name), None)
                orig_def = next((f for f in all_def if flag_name(f) == name), None)
                if orig_att is not None:
                    active_att.append(orig_att)
                elif orig_def is not None:
                    active_def.append(orig_def)
                # If not in originals, ignore safely

        new_flags = active_att + active_def

        combat_params = {
            "attacker":              last["attacker"],
            "_attacker_faction":     last["_attacker_faction"],
            "_attacker_roster_entry": last.get("_attacker_roster_entry"),
            "defender":              last["defender"],
            "_defender_faction":     last["_defender_faction"],
            "_defender_roster_entry": last.get("_defender_roster_entry"),
            "flags":                 new_flags,
            "attacker_flags":        active_att,
            "defender_flags":        active_def,
            # Pass through full originals so they survive the next round too
            "all_attacker_flags":    all_att,
            "all_defender_flags":    all_def,
        }

        result = self._query_combat(combat_params)
        if result.get("ok") and result.get("data"):
            result["data"]["_in_place"] = True
        return result

    def _query_rule(self, params: dict) -> dict:
        term = params.get("term", "").strip()
        if not term:
            return self._err("rule", "Usage: rule <term>  e.g. rule fly")

        result = self._loader.get_rule(term)
        if not result:
            return self._err("rule", f"No rule found for '{term}'.")

        return {
            "ok":          True,
            "command":     "rule",
            "result_type": "rule_block",
            "data": {
                "name":        result.get("name", term),
                "type":        result.get("type", "Keyword"),
                "source":      result.get("source", result.get("book", "")),
                "description": result.get("description", result.get("effect", "—")),
                "related":     result.get("related", result.get("see_also", [])),
                "_stub":       result.get("_stub", False),
            },
            "meta": {},
        }

    def _query_threats(self, params: dict) -> dict:
        faction = (params.get("faction") or self._session.get("enemy_faction") or "").strip()
        if not faction:
            return self._err(
                "threat",
                "No enemy faction set. Usage: threat <faction>  or  enemy <faction>  then  threat"
            )

        # Resolve faction and units
        matched_faction, raw_units = self._loader.get_faction_units(faction)
        is_stub = not matched_faction

        if is_stub:
            # Check if the user accidentally passed a unit name instead of a faction.
            # e.g. "threat beast of nurgle" — Beast of Nurgle is a unit, not a faction.
            unit_matches = self._loader.get_units_matching(faction, limit=1)
            if unit_matches:
                unit_name = unit_matches[0].get("name", faction).title()
                unit_faction = unit_matches[0].get("faction", "")
                faction_hint = f" ({unit_faction.title()})" if unit_faction else ""
                return self._err(
                    "threat",
                    f"'{faction}' is a unit{faction_hint}, not a faction. "
                    f"Try:  threat {unit_faction}  to see all {unit_faction.title()} threats, "
                    f"or:  analyze {faction}  for a counter-pick analysis of {unit_name}."
                )
            matched_faction = faction

        faction_label = matched_faction.replace("_", " ").title()

        # Pre-resolve my roster once so _compute_counters_math can iterate it
        # cheaply for every enemy unit without repeated loader lookups.
        roster_my = self._session.get("roster_my", [])
        resolved_roster: list[dict] = []
        for ru in roster_my:
            if isinstance(ru, dict):
                resolved_roster.append(ru)
            else:
                ruu = self._loader.get_unit(str(ru))
                if ruu:
                    resolved_roster.append(ruu)

        # Build per-unit threat data (same shape as threat_card with real counters)
        unit_data = []
        for unit in raw_units:
            metrics      = self._compute_metrics(unit)
            threat_level = self._compute_threat_level(metrics)

            profile = {k: unit[k] for k in ("T", "Sv", "W", "M", "OC") if k in unit}

            abilities = [self._normalize_ability(ab) for ab in unit.get("abilities", [])]

            # Compute real counter picks when roster is loaded
            if resolved_roster:
                counters      = self._compute_counters_math(unit, resolved_roster, top_n=3)
                show_counters = True
            else:
                counters      = []
                show_counters = False

            unit_data.append({
                "name":          unit.get("name", "Unknown"),
                "threat_level":  threat_level,
                "metrics":       metrics,
                "profile":       profile,
                "keywords":      unit.get("keywords", []),
                "abilities":     abilities,
                "enhancement":   str(unit.get("enhancement", unit.get("warlord_trait", "")) or ""),
                "counters":      counters,
                "show_counters": show_counters,
                "_stub":         unit.get("_stub", False),
            })

        # Sort: HIGH → MEDIUM → LOW, then by threat score descending within each tier
        _order = {"high": 0, "medium": 1, "low": 2}
        unit_data.sort(
            key=lambda u: (_order.get(u["threat_level"], 3), -(u["metrics"].get("threat", 0)))
        )

        # Aggregate stats
        threat_dist: dict[str, int] = {"high": 0, "medium": 0, "low": 0}
        for u in unit_data:
            tier = u["threat_level"]
            threat_dist[tier] = threat_dist.get(tier, 0) + 1

        skew  = self._compute_skew(raw_units)
        stats = {
            "unit_count":     len(unit_data),
            "skew_label":     skew["label"],
            "skew_breakdown": skew["breakdown"],
            "threat_dist":    threat_dist,
        }

        strategic_notes   = self._generate_strategic_notes(unit_data, faction_label)

        # Real detachment + stratagem data from the faction dossier
        raw_dets = self._loader.get_detachments(matched_faction) or []
        detachments = []
        stratagems  = []
        for det in raw_dets:
            det_name = det.get("name", "")
            # Reshape for DetachmentBlock: { name, rules, description }
            detachments.append({
                "name":        det_name,
                "description": det.get("description", ""),
                "rules":       [{"name": det.get("rule_name", det_name),
                                 "description": det.get("description", "")}]
                               if det.get("rule_name") or det.get("description") else [],
            })
            # Flatten stratagems, adding cost + detachment fields for StratagemList
            for s in det.get("stratagems", []):
                if not isinstance(s, dict):
                    continue
                cp_raw   = s.get("cp", s.get("cost", "?"))
                cost_str = f"{cp_raw}CP" if str(cp_raw).lstrip("-").isdigit() else str(cp_raw)
                stratagems.append({
                    "name":       s.get("name", "?"),
                    "cost":       cost_str,
                    "when":       s.get("when", ""),
                    "target":     s.get("target", ""),
                    "effect":     s.get("effect", s.get("description", "")),
                    "phase":      s.get("phase", ""),
                    "detachment": det_name,
                })
        # Fall back to stubs only if no real data found
        if not detachments:
            detachments = self._loader.get_stub_detachments(faction_label)
        if not stratagems:
            stratagems = self._loader.get_stub_stratagems(faction_label)
        roster_loaded     = bool(self._session.get("roster_my"))
        active_detachment = self._session.get("detachment") or None

        return {
            "ok":          True,
            "command":     "threat",
            "result_type": "threat_view",
            "data": {
                "faction":           matched_faction,
                "faction_label":     faction_label,
                "units":             unit_data,
                "stats":             stats,
                "detachments":       detachments,
                "stratagems":        stratagems,
                "strategic_notes":   strategic_notes,
                "roster_loaded":     roster_loaded,
                "active_detachment": active_detachment,
                "_stub":             is_stub,
            },
            "meta": {
                "enemy_faction": matched_faction,
                "unit_count":    len(unit_data),
            },
        }

    def _query_list(self, params: dict) -> dict:
        list_type     = params.get("type", "").strip().lower()
        filter_text   = (params.get("filter") or "").strip()
        faction       = (params.get("faction") or None)
        keywords      = params.get("keywords") or []
        weapon_filter = params.get("weapon_filter")   # "ranged" | "melee" | None

        if not list_type:
            return self._err("list", "Usage: list <units|weapons|factions|stratagems> [keyword]")

        result = self._loader.get_list(list_type, filter_text, faction, keywords=keywords,
                                       weapon_filter=weapon_filter)

        if result.get("error"):
            return self._err("list", result["error"])

        items = result.get("items", [])

        if list_type in ("units", "unit"):
            # Sort alphabetically for numbered navigation
            items_sorted = sorted(items, key=lambda u: u.get("name", "").lower())
            return {
                "ok":          True,
                "command":     "list",
                "result_type": "unit_list_rich",
                "data":        items_sorted,
                "meta":        {"type": list_type, "filter": filter_text, "count": len(items_sorted), "faction": faction},
            }

        elif list_type in ("weapons", "weapon"):
            return {
                "ok":          True,
                "command":     "list",
                "result_type": "table",
                "data": {
                    "columns": ["Unit", "Weapon", "Faction"],
                    "rows":    [[w.get("unit", "?"), w.get("weapon", "?"), w.get("faction", "?")] for w in items],
                },
                "meta": {"type": list_type, "filter": filter_text, "count": len(items)},
            }

        else:
            # Factions, stratagems, or other — simple list
            return {
                "ok":          True,
                "command":     "list",
                "result_type": "list",
                "data":        [str(item) if not isinstance(item, str) else item for item in items],
                "meta":        {"type": list_type, "count": len(items)},
            }

    def _query_set_faction(self, params: dict) -> dict:
        """Set the player's own faction in the session.

        Called by the client whenever a player roster is activated so that
        subsequent unit lookups (spec, combat) can auto-prefer this faction
        without requiring --faction flags or triggering cross-faction disambiguation.
        """
        name = (params.get("name") or "").strip()
        if not name:
            current = self._session.get("faction") or "not set"
            return {
                "ok":          True,
                "command":     "faction",
                "result_type": "text",
                "data":        f"Player faction: {current}\nUsage: faction <faction name>",
                "meta":        {},
            }
        self._session["faction"] = name
        return {
            "ok":          True,
            "command":     "faction",
            "result_type": "system_msg",
            "data":        f"Player faction set: {name}",
            "meta":        {"faction": name},
        }

    def _query_enemy(self, params: dict) -> dict:
        name = (params.get("name") or "").strip()
        if not name:
            current = self._session.get("enemy_faction") or "not set"
            return {
                "ok":          True,
                "command":     "enemy",
                "result_type": "text",
                "data":        f"Enemy faction: {current}\nUsage: enemy <faction name>",
                "meta":        {},
            }
        self._session["enemy_faction"] = name
        return {
            "ok":          True,
            "command":     "enemy",
            "result_type": "text",
            "data":        f"Enemy faction set: {name}\nRun 'threat' to analyze threats, or 'spec <unit>' for enemy unit sheets.",
            "meta":        {"enemy_faction": name},
        }

    # ─── Roster context sync (called by the web layer on every exec) ─────────

    def sync_roster_context(self, context: dict) -> None:
        """Sync frontend VFS roster state into engine session.

        Called by the FastAPI exec handler before every command dispatch so
        that _session["roster_my"] / _session["roster_enemy"] always reflect
        the rosters the user currently has loaded in the UI.

        Expected context shape:
          {
            "my_units":       [{ "name": str, "faction": str, "models": int,
                                 "weapons": [str], "is_leader": bool,
                                 "points": int|null, "attached_to": str|null }, ...],
            "opponent_units": [... same shape ...],
          }
        Either key may be absent — only present keys are updated.
        """
        def _stamp(units):
            # Stamp each entry with its stable roster position so leader
            # attachments can target a specific instance (two identical units
            # are told apart by index, not name). attached_idx is normalised to
            # an int here so downstream comparisons are type-safe.
            out = units or []
            for i, entry in enumerate(out):
                if isinstance(entry, dict):
                    entry["_idx"] = i
                    a_idx = entry.get("attached_idx")
                    if a_idx is not None:
                        try:
                            entry["attached_idx"] = int(a_idx)
                        except (TypeError, ValueError):
                            entry["attached_idx"] = None
            return out

        if "my_units" in context:
            self._session["roster_my"] = _stamp(context["my_units"])
        if "opponent_units" in context:
            self._session["roster_enemy"] = _stamp(context["opponent_units"])

    def _query_roster(self, params: dict) -> dict:
        side   = (params.get("side") or "my").strip().lower()
        key    = "roster_enemy" if side in ("enemy", "opp", "opponent") else "roster_my"
        roster = self._session.get(key, [])
        label  = "Enemy" if key == "roster_enemy" else "My"

        if not roster:
            return {
                "ok":          True,
                "command":     "roster",
                "result_type": "text",
                "data":        f"No {label.lower()} roster loaded.\nUse the ROSTERS tab or type 'load roster' to assign one.",
                "meta":        {"side": side},
            }

        return {
            "ok":          True,
            "command":     "roster",
            "result_type": "list",
            "data":        roster,
            "meta":        {"side": side, "count": len(roster)},
        }

    def _query_session(self, params: dict) -> dict:
        turn          = self._session.get("turn", 0)
        faction       = self._session.get("faction")
        enemy_faction = self._session.get("enemy_faction")
        roster_my     = self._session.get("roster_my", [])
        roster_enemy  = self._session.get("roster_enemy", [])

        def _roster_meta(units, name_override=None):
            total_pts = 0
            unit_list = []
            for u in units:
                if isinstance(u, dict):
                    pts = u.get("points", 0)
                    try:
                        total_pts += int(str(pts).replace("pts", "").strip())
                    except (ValueError, TypeError):
                        pass
                    unit_list.append(u)
                else:
                    unit_list.append({"name": str(u), "points": ""})
            return {
                "name":         name_override or faction or "MY ROSTER",
                "unit_count":   len(unit_list),
                "total_points": total_pts or "",
                "units":        unit_list,
            }

        def _enemy_meta(units):
            total_pts = 0
            unit_list = []
            for u in units:
                if isinstance(u, dict):
                    pts = u.get("points", 0)
                    try:
                        total_pts += int(str(pts).replace("pts", "").strip())
                    except (ValueError, TypeError):
                        pass
                    unit_list.append(u)
                else:
                    unit_list.append({"name": str(u), "points": ""})
            return {
                "name":         (enemy_faction or "ENEMY").upper(),
                "unit_count":   len(unit_list),
                "total_points": total_pts or "",
                "units":        unit_list,
            }

        return {
            "ok":          True,
            "command":     "session",
            "result_type": "session_summary",
            "data": {
                "state": {
                    "turn":         turn,
                    "roster_mode":  "ON" if roster_my else "OFF",
                    "faction":      faction or "—",
                    "enemy":        enemy_faction or "—",
                },
                "my_roster":    _roster_meta(roster_my),
                "enemy_roster": _enemy_meta(roster_enemy),
            },
            "meta": {"turn": turn},
        }

    def _query_nextturn(self, params: dict) -> dict:
        self._session["turn"] = self._session.get("turn", 0) + 1
        turn = self._session["turn"]

        # ── Phase reminders — turn-sensitive notes for standard matched play ──
        phase_reminders = []
        phase_reminders.append({
            "icon": "◈",
            "text": "Command phase: gain 1 Command Point (standard matched play).",
        })
        if turn == 1:
            phase_reminders.append({
                "icon": "◎",
                "text": "Declare Battle Tactics stratagem before scoring begins.",
            })
        if turn >= 2:
            phase_reminders.append({
                "icon": "◎",
                "text": "Secondary objectives can be scored this round.",
            })
        if turn >= 3:
            phase_reminders.append({
                "icon": "◎",
                "text": "Turn 3+: Decisive Action and fixed-score primaries now active.",
            })
        if turn == 4:
            phase_reminders.append({
                "icon": "⚠",
                "text": "Penultimate round — position for final objective push.",
            })
        if turn == 5:
            phase_reminders.append({
                "icon": "⚠",
                "text": "Final battle round — all objectives contested. No more scoring after this.",
            })
        if turn > 5:
            phase_reminders.append({
                "icon": "⚠",
                "text": f"Round {turn} exceeds standard 5-round mission length.",
            })

        # ── Active modifiers from last combat (for reminder display) ──
        last      = self._session.get("last_combat") or {}
        att_flags = list(last.get("active_attacker_flags") or [])
        def_flags = list(last.get("active_defender_flags") or [])
        all_mods  = att_flags + def_flags

        return {
            "ok":          True,
            "command":     "nextturn",
            "result_type": "nextturn_block",
            "data": {
                "turn":             turn,
                "cp_gained":        1,
                "phase_reminders":  phase_reminders,
                "active_modifiers": all_mods,
                "attacker":         last.get("attacker"),
                "defender":         last.get("defender"),
                "faction":          self._session.get("faction"),
                "enemy_faction":    self._session.get("enemy_faction"),
            },
            "meta": {"turn": turn},
        }

    def _query_status(self, params: dict) -> dict:
        s = self.status()
        rows = [[k, str(v)] for k, v in s["summary"].items()]
        if s.get("errors"):
            rows.append(["Errors", str(len(s["errors"]))])
        return {
            "ok":          True,
            "command":     "status",
            "result_type": "table",
            "data":        {"columns": ["Key", "Value"], "rows": rows},
            "meta":        {"ready": s["ready"], "errors": s.get("errors", [])},
        }

    def _query_help(self, params: dict) -> dict:
        topic = (params.get("topic") or "").strip().lower()

        if not topic:
            # Full help — all commands grouped
            groups: dict[str, list] = {}
            for name, cmd in _cmds.REGISTRY.items():
                groups.setdefault(cmd.group, []).append({
                    "name":        name,
                    "usage":       cmd.usage,
                    "description": cmd.description,
                    "stub":        cmd.stub,
                })
            return {
                "ok":          True,
                "command":     "help",
                "result_type": "help",
                "data":        {"type": "full", "groups": groups},
                "meta":        {},
            }

        # Topic-specific help
        canonical = _cmds.resolve(topic)
        if canonical and canonical in _cmds.REGISTRY:
            cmd = _cmds.REGISTRY[canonical]
            return {
                "ok":          True,
                "command":     "help",
                "result_type": "help",
                "data": {
                    "type":        "command",
                    "name":        canonical,
                    "usage":       cmd.usage,
                    "description": cmd.description,
                    "aliases":     cmd.aliases,
                    "params": {
                        k: {
                            "description": v.description,
                            "example":     v.example,
                            "required":    v.required,
                        }
                        for k, v in cmd.params.items()
                    },
                    "examples": cmd.examples,
                    "stub":     cmd.stub,
                },
                "meta": {},
            }

        return self._err("help", f"No help found for '{topic}'. Type 'help' to see all commands.")

    def _query_clear(self, params: dict) -> dict:
        return {
            "ok":          True,
            "command":     "clear",
            "result_type": "clear",
            "data":        None,
            "meta":        {},
        }

    def _query_history(self, params: dict) -> dict:
        return {
            "ok":          True,
            "command":     "history",
            "result_type": "history",
            "data":        None,
            "meta":        {},
        }

    def _query_dice(self, params: dict) -> dict:
        """
        Roll dice.  Supports:
          NdN            — e.g. 2d6, d6, 3d8
          NdN+M / NdN-M  — flat modifier, e.g. 2d6+3
          reroll <N>     — reroll any die showing N (first occurrence)
          explode        — dice showing max face are rerolled and added

        Returns result_type: "text" with individual rolls shown.
        """
        expr = (params.get("expression") or "").strip()
        if not expr:
            return self._err("dice", "Usage: dice 2d6  |  dice 3d6+2  |  dice d6 reroll 1")

        # ── Parse ────────────────────────────────────────────────────────────
        # Base expression:  [N]dF[+/-M]
        base_pat = re.match(
            r'^(\d*)d(\d+)([+-]\d+)?',
            expr, re.IGNORECASE
        )
        if not base_pat:
            return self._err("dice", f"Could not parse dice expression: '{expr}'.  "
                             "Use a format like  2d6,  d6+3,  3d8-1.")

        n_dice  = int(base_pat.group(1)) if base_pat.group(1) else 1
        faces   = int(base_pat.group(2))
        mod     = int(base_pat.group(3)) if base_pat.group(3) else 0
        rest    = expr[base_pat.end():].strip().lower()

        if n_dice < 1 or n_dice > 100:
            return self._err("dice", "Number of dice must be between 1 and 100.")
        if faces < 2 or faces > 1000:
            return self._err("dice", "Die faces must be between 2 and 1000.")

        # Optional modifiers in the rest of the expression
        reroll_on: set[int] = set()
        explode = False

        reroll_match = re.search(r'reroll\s+(\d+(?:,\s*\d+)*)', rest)
        if reroll_match:
            reroll_on = {int(v.strip()) for v in reroll_match.group(1).split(",")}

        if "explode" in rest:
            explode = True

        # ── Roll ─────────────────────────────────────────────────────────────
        def roll_one(faces: int) -> int:
            return random.randint(1, faces)

        rolls: list[int] = []
        notes: list[str] = []

        for _ in range(n_dice):
            r = roll_one(faces)
            if reroll_on and r in reroll_on:
                old = r
                r = roll_one(faces)
                notes.append(f"rerolled {old} → {r}")
            if explode and r == faces:
                extra = roll_one(faces)
                notes.append(f"exploded {r} + {extra}")
                r += extra
            rolls.append(r)

        total = sum(rolls) + mod

        # ── Format output ─────────────────────────────────────────────────────
        dice_label = f"{n_dice}d{faces}"
        mod_label  = f"{'+' if mod >= 0 else ''}{mod}" if mod != 0 else ""
        rolls_str  = "  [" + "  ".join(str(r) for r in rolls) + "]"

        lines = [
            f"  🎲  {dice_label}{mod_label}",
            f"",
            f"  Rolls:  {rolls_str}",
        ]
        if mod != 0:
            lines.append(f"  Modifier:  {'+' if mod >= 0 else ''}{mod}")
        lines.append(f"")
        lines.append(f"  Total:  {total}")

        if notes:
            lines.append("")
            for note in notes:
                lines.append(f"  ↳ {note}")

        return {
            "ok":          True,
            "command":     "dice",
            "result_type": "text",
            "data":        "\n".join(lines),
            "meta": {
                "expression": f"{dice_label}{mod_label}",
                "rolls":      rolls,
                "total":      total,
            },
        }

    def _query_stratagem(self, params: dict) -> dict:
        name       = (params.get("name") or "").strip()
        detachment = (params.get("detachment") or "").strip()

        if not name:
            return self._err("stratagem", "Usage: stratagem <name>  e.g. stratagem photon grenades")

        result = self._loader.get_stratagem(name, detachment=detachment or None)
        if not result:
            suffix = f" in detachment '{detachment}'" if detachment else ""
            return self._err("stratagem", f"No stratagem found matching '{name}'{suffix}.")

        return {
            "ok":          True,
            "command":     "stratagem",
            "result_type": "stratagem_block",
            "data": {
                "name":       result.get("name", name),
                "cost":       result.get("cost", result.get("cp_cost", "?CP")),
                "detachment": result.get("detachment", ""),
                "faction":    result.get("faction", ""),
                "when":       result.get("when", ""),
                "target":     result.get("target", ""),
                "effect":     result.get("effect", result.get("description", "")),
                "phase":      result.get("phase", ""),
                "source":     result.get("source", result.get("book", "")),
                "_stub":      result.get("_stub", False),
            },
            "meta": {"name": name},
        }

    def _query_ability(self, params: dict) -> dict:
        name = (params.get("name") or "").strip()

        if not name:
            return self._err("ability", "Usage: ability <name>  e.g. ability feel no pain")

        result = self._loader.get_ability(name)
        if not result:
            return self._err(
                "ability",
                f"No ability found matching '{name}'. "
                "Try: ability <name>  e.g. ability deadly demise d3 · ability one shot · ability for the greater good"
            )

        # Build display text — for CORE/FACTION/CHARACTER, the "name" IS the ability
        # name (e.g. "Deadly Demise D3") and the type tag is carried separately.
        ability_type = result.get("type")  # "CORE" | "FACTION" | None
        display_name = result.get("name", name)
        display_text = result.get("description", "")

        # For unit-list: cap at 8 so the output stays readable
        units = result.get("units", [])
        units_preview = units[:8]
        units_more    = max(0, len(units) - 8)

        return {
            "ok":          True,
            "command":     "ability",
            "result_type": "ability_block",
            "data": {
                "name":       display_name,
                "type_tag":   ability_type,   # "CORE" | "FACTION" | None — for display
                "text":       display_text or "—",
                "units":      units_preview,
                "units_more": units_more,
                "factions":   result.get("factions", []),
                "phase":      result.get("phase", ""),
                "source":     result.get("source", ""),
                "_stub":      False,
            },
            "meta": {"name": name},
        }

    def _query_enhancement(self, params: dict) -> dict:
        name       = (params.get("name") or "").strip()
        detachment = (params.get("detachment") or "").strip()

        if not name:
            return self._err("enhancement", "Usage: enhancement <name>  e.g. enhancement supernova launcher")

        result = self._loader.get_enhancement(name, detachment=detachment or None)
        if not result:
            suffix = f" in detachment '{detachment}'" if detachment else ""
            return self._err("enhancement", f"No enhancement found matching '{name}'{suffix}.")

        pts_raw = result.get("points", result.get("cost", ""))
        pts_str = f"{pts_raw}pts" if str(pts_raw).lstrip("-").isdigit() else str(pts_raw)

        return {
            "ok":          True,
            "command":     "enhancement",
            "result_type": "enhancement_block",
            "data": {
                "name":       result.get("name", name),
                "points":     pts_str,
                "detachment": result.get("detachment", ""),
                "faction":    result.get("faction", ""),
                "text":       result.get("description", result.get("text", result.get("effect", "—"))),
                "links":      result.get("links", result.get("units", [])),
                "_stub":      result.get("_stub", False),
            },
            "meta": {"name": name},
        }

    def _query_mission(self, params: dict) -> dict:
        name   = (params.get("name") or "").strip()
        source = (params.get("source") or "").strip()

        if not name:
            return self._err("mission", "Usage: mission <name>  e.g. mission purge the foe")

        result = self._loader.get_mission(name, source=source or None)
        if not result:
            suffix = f" from '{source}'" if source else ""
            return self._err("mission", f"No mission found matching '{name}'{suffix}.")

        return {
            "ok":          True,
            "command":     "mission",
            "result_type": "mission_block",
            "data": {
                "name":          result.get("name", name),
                "type":          result.get("type", result.get("mission_type", "")),
                "source":        result.get("source", result.get("book", "")),
                "size":          result.get("size", result.get("game_size", "")),
                "deployment":    result.get("deployment", ""),
                "description":   result.get("description", result.get("flavour", result.get("lore", ""))),
                "scoring":       result.get("scoring", []),
                "mission_rules": result.get("mission_rules", result.get("rules", [])),
                "tip":           result.get("tip", result.get("hint", "")),
                "_stub":         result.get("_stub", False),
            },
            "meta": {"name": name},
        }

    def _query_detachment(self, params: dict) -> dict:
        """Return all detachments for a faction with their rules, enhancements, stratagems."""
        faction_raw = (params.get("faction") or "").strip()

        # Fall back to session faction if none specified
        if not faction_raw:
            faction_raw = self._session.get("faction") or ""

        if not faction_raw:
            return self._err(
                "detachment",
                "Specify a faction: e.g. detachment tau  |  or set one with: faction tau",
            )

        detachments = self._loader.get_detachments(faction_raw)
        if detachments is None:
            return self._err(
                "detachment",
                f"No detachment data found for '{faction_raw}'. "
                "Check that the faction dossier has a detachments[] array.",
            )

        # Resolve the display-friendly faction label
        faction_label = faction_raw.replace("_", " ").title()
        # Try to get canonical label from the units index
        matched, _ = self._loader.get_faction_units(faction_raw)
        if matched:
            faction_label = matched.replace("_", " ").title()

        return {
            "ok":          True,
            "command":     "detachment",
            "result_type": "detachment_block",
            "data": {
                "faction":     faction_label,
                "detachments": [
                    {
                        "name":         d.get("name", ""),
                        "rule_name":    d.get("rule_name", ""),
                        "description":  d.get("description", ""),
                        "enhancements": d.get("enhancements", []),
                        "stratagems":   d.get("stratagems", []),
                    }
                    for d in detachments
                ],
            },
            "meta": {"faction": faction_raw},
        }

    def _query_army_rules(self, params: dict) -> dict:
        """Return faction-level army rules for a faction."""
        faction_raw = (params.get("faction") or "").strip()

        # Fall back to session faction if none specified
        if not faction_raw:
            faction_raw = self._session.get("faction") or ""

        if not faction_raw:
            return self._err(
                "army_rules",
                "Specify a faction: e.g. army_rules tau  |  or set one with: faction tau",
            )

        rules = self._loader.get_army_rules(faction_raw)
        if rules is None:
            return self._err(
                "army_rules",
                f"No army rules data found for '{faction_raw}'. "
                "Check that the faction dossier has an army_rules[] array.",
            )

        # Resolve the display-friendly faction label
        faction_label = faction_raw.replace("_", " ").title()
        matched, _ = self._loader.get_faction_units(faction_raw)
        if matched:
            faction_label = matched.replace("_", " ").title()

        return {
            "ok":          True,
            "command":     "army_rules",
            "result_type": "army_rules_block",
            "data": {
                "faction": faction_label,
                "rules":   [
                    {
                        "name":        r.get("name", ""),
                        "description": r.get("description", ""),
                    }
                    for r in rules
                ],
            },
            "meta": {"faction": faction_raw},
        }

    def _query_analyze(self, params: dict) -> dict:
        name          = (params.get("name") or "").strip()
        no_counters   = params.get("no_counters", False)
        show_counters = not no_counters
        _faction      = params.get("_faction")  # faction hint from disambiguation

        if not name:
            return self._err("analyze", "Usage: analyze <unit name>  e.g. analyze hierophant")

        # Exact faction-scoped lookup (post-disambiguation path)
        if _faction:
            unit = self._loader.get_unit(name, faction=_faction)
            if not unit:
                return self._err("analyze", f"No unit found matching '{name}' in faction '{_faction}'.")
        else:
            matches = self._loader.get_units_matching(name, limit=9)
            if not matches:
                return self._err("analyze", f"No unit found matching '{name}'.")
            if len(matches) > 1:
                return self._disambiguate(
                    "analyze",
                    {"no_counters": no_counters},
                    "name",
                    matches,
                )
            unit = matches[0]

        metrics      = self._compute_metrics(unit)
        threat_level = self._compute_threat_level(metrics)

        # Profile
        profile = {}
        for k in ("T", "Sv", "W", "M", "OC"):
            if k in unit:
                profile[k] = unit[k]

        # Abilities as structured list
        abilities = [self._normalize_ability(ab) for ab in unit.get("abilities", [])]

        # Enhancement (field may not exist in all schemas)
        enhancement = str(unit.get("enhancement", unit.get("warlord_trait", "")) or "")

        # Counter picks — real math (deterministic EV, no MC) per roster unit
        counters = []
        if show_counters:
            roster_my = self._session.get("roster_my", [])
            if roster_my:
                # Roster loaded: score each of my units vs the threat target
                counters = self._compute_counters_math(unit, roster_my, top_n=5)
            else:
                # No roster: sample up to 10 units from the player's faction as a preview
                my_faction = self._session.get("faction", "")
                if my_faction:
                    try:
                        _, faction_units = self._loader.get_faction_units(my_faction)
                        sample   = (faction_units or [])[:10]
                        counters = self._compute_counters_math(unit, sample, top_n=5)
                    except Exception:
                        counters = self._suggest_counters(metrics, unit.get("name", name))
                else:
                    counters = self._suggest_counters(metrics, unit.get("name", name))

        return {
            "ok":          True,
            "command":     "analyze",
            "result_type": "threat_card",
            "data": {
                "name":          unit.get("name", name),
                "threat_level":  threat_level,
                "metrics":       metrics,
                "profile":       profile,
                "keywords":      unit.get("keywords", []),
                "abilities":     abilities,
                "enhancement":   enhancement,
                "counters":      counters,
                "show_counters": show_counters,
                "_stub":         unit.get("_stub", False),
            },
            "meta": {"threat_level": threat_level},
        }

    # ── Term Aliases ───────────────────────────────────────────────────────────

    def _query_learn(self, params: dict) -> dict:
        """learn deepstrike = deep strike"""
        raw = params.get("args", "").strip()
        if "=" not in raw:
            return self._err("learn", "Usage:  learn <shorthand> = <full term>    e.g.  learn deepstrike = deep strike")

        left, right = raw.split("=", 1)
        shorthand = left.strip()
        full_term = right.strip()

        if not shorthand or not full_term:
            return self._err("learn", "Usage:  learn <shorthand> = <full term>    e.g.  learn deepstrike = deep strike")

        term_aliases.add(shorthand, full_term)
        return {
            "ok":          True,
            "command":     "learn",
            "result_type": "text",
            "data":        f"Learned: \"{shorthand}\" → \"{full_term}\"",
            "meta":        {},
        }

    def _query_unlearn(self, params: dict) -> dict:
        """Remove a term alias."""
        shorthand = params.get("args", "").strip()
        if not shorthand:
            return self._err("unlearn", "Usage:  unlearn <shorthand>    e.g.  unlearn deepstrike")

        if term_aliases.remove(shorthand):
            return {
                "ok":          True,
                "command":     "unlearn",
                "result_type": "text",
                "data":        f"Removed alias \"{shorthand}\".",
                "meta":        {},
            }
        return self._err("unlearn", f"No alias found for \"{shorthand}\".")

    def _query_aliases(self, params: dict) -> dict:
        """Show all term aliases."""
        all_aliases = term_aliases.get_all()
        if not all_aliases:
            return {
                "ok":          True,
                "command":     "aliases",
                "result_type": "text",
                "data":        "No term aliases defined. Use  learn <shorthand> = <full term>  to add one.",
                "meta":        {},
            }
        return {
            "ok":          True,
            "command":     "aliases",
            "result_type": "aliases_list",
            "data": {
                "aliases": [
                    {"shorthand": k, "full_term": v}
                    for k, v in sorted(all_aliases.items())
                ],
            },
            "meta":        {"count": len(all_aliases)},
        }

    def _query_mc(self, params: dict) -> dict:
        """Toggle Monte Carlo simulation on/off or set trial count."""
        arg = params.get("args", "").strip().lower()

        if not arg:
            # No argument — show current status
            cfg = get_mc_config()
            state = "ON" if cfg["enabled"] else "OFF"
            return {
                "ok":          True,
                "command":     "mc",
                "result_type": "text",
                "data":        f"Monte Carlo: {state}  ·  {cfg['trials']} trials  ·  seed {cfg['seed']}",
                "meta":        {},
            }

        if arg == "off":
            set_mc_trials(0)
            return {
                "ok":          True,
                "command":     "mc",
                "result_type": "text",
                "data":        "Monte Carlo OFF — showing deterministic averages only.",
                "meta":        {},
            }

        if arg == "on":
            cfg = get_mc_config()
            # If already enabled, keep current count; otherwise restore default
            if cfg["trials"] == 0:
                set_mc_trials(5000)
            cfg = get_mc_config()
            return {
                "ok":          True,
                "command":     "mc",
                "result_type": "text",
                "data":        f"Monte Carlo ON — {cfg['trials']} trials per weapon.",
                "meta":        {},
            }

        # Numeric argument — set trial count
        try:
            n = int(arg)
        except ValueError:
            return {
                "ok":          False,
                "command":     "mc",
                "result_type": "error",
                "data":        f"Invalid argument '{arg}'. Usage:  mc [on|off|<number>]",
                "meta":        {},
            }

        if n < 0:
            return {
                "ok":          False,
                "command":     "mc",
                "result_type": "error",
                "data":        "Trial count must be 0 or higher.",
                "meta":        {},
            }

        set_mc_trials(n)
        state = "ON" if n > 0 else "OFF"
        return {
            "ok":          True,
            "command":     "mc",
            "result_type": "text",
            "data":        f"Monte Carlo {state} — {n} trials per weapon.",
            "meta":        {},
        }

    def _query_mathmode(self, params: dict) -> dict:
        """Math Mode toggle — handled client-side; this handler exists so the
        engine gracefully acknowledges the command when routed to the backend.
        The actual Math Mode state and replay UI live entirely in Terminal.jsx
        and MathModeBlock.jsx.
        """
        state = params.get("args", "").strip().lower()
        if state in ("on", "off"):
            msg = (
                f"Math Mode {state.upper()} — "
                + ("post-execution math ledger active." if state == "on"
                   else "math ledger display disabled.")
            )
        else:
            msg = "Math Mode: type  math on  or  math off  to toggle."
        return {
            "ok":          True,
            "command":     "mathmode",
            "result_type": "text",
            "data":        msg,
            "meta":        {},
        }

    def _query_issues(self, params: dict) -> dict:
        """Report engine data gaps: commands still returning stubs vs real data.

        Checks each major data domain and reports loaded count vs expected.
        Marks each as D0 (stub / no data), D1 (real data, no computation),
        or D2 (full computation).
        """
        loader_status = self._loader.status()
        summary = loader_status.get("summary", {})

        entries = []

        # ── Domain checks ──────────────────────────────────────────────────────
        domains = [
            {
                "command":  "strat <name>",
                "domain":   "Stratagems",
                "count":    summary.get("stratagems", 0),
                "level":    "D1" if summary.get("stratagems", 0) > 0 else "D0",
                "note":     f"{summary.get('stratagems', 0)} loaded from faction dossiers"
                            if summary.get("stratagems", 0) > 0
                            else "No stratagem data indexed — run load()",
            },
            {
                "command":  "enhancement <name>",
                "domain":   "Enhancements",
                "count":    summary.get("enhancements", 0),
                "level":    "D1" if summary.get("enhancements", 0) > 0 else "D0",
                "note":     f"{summary.get('enhancements', 0)} loaded from faction dossiers"
                            if summary.get("enhancements", 0) > 0
                            else "No enhancement data indexed — run load()",
            },
            {
                "command":  "mission <name>",
                "domain":   "Missions",
                "count":    summary.get("missions", 0),
                "level":    "D1" if summary.get("missions", 0) > 0 else "D0",
                "note":     f"{summary.get('missions', 0)} loaded from missions.json"
                            if summary.get("missions", 0) > 0
                            else "No mission data — add data/rules/missions.json",
            },
            {
                "command":  "rule <term>",
                "domain":   "Rules + Hierarchy",
                "count":    summary.get("rules", 0),
                "level":    "D1" if summary.get("rules", 0) > 0 else "D0",
                "note":     f"{summary.get('rules', 0)} rules with related-rule graph"
                            if summary.get("rules", 0) > 0
                            else "No rules data — check data/rules/rules.json",
            },
            {
                "command":  "ability <name>",
                "domain":   "Abilities",
                "count":    summary.get("abilities", 0),
                "level":    "D1" if summary.get("abilities", 0) > 0 else "D0",
                "note":     f"{summary.get('abilities', 0)} indexed from unit ability lists"
                            if summary.get("abilities", 0) > 0
                            else "No ability index built",
            },
            {
                "command":  "threat <faction>",
                "domain":   "Threat Scoring",
                "count":    None,
                "level":    "D1",  # heuristic only, no stat-based scoring yet
                "note":     "Keyword heuristic scoring only — no stat-based damage/durability math yet (D2 gap)",
            },
            {
                "command":  "analyze <unit>",
                "domain":   "Counter Picks",
                "count":    None,
                "level":    "D1",
                "note":     "Threat metrics computed; counters list always empty — no cross-unit stat matching yet",
            },
        ]

        # ── Session-discovered issues ─────────────────────────────────────────
        # Issues logged during actual use this session (unit lookups, math errors, etc.)
        session_log = list(self._session.get("issue_log", []))
        for entry in session_log:
            entries.append({
                "domain":  entry["domain"],
                "command": entry.get("context", ""),
                "level":   "D0",
                "note":    entry["message"],
                "time":    entry.get("timestamp", ""),
            })

        # Loader errors
        errors = loader_status.get("errors", [])

        return {
            "ok":          True,
            "command":     "issues",
            "result_type": "stub_log",
            "data":        {
                "entries": entries,
                "domains": domains,
                "errors":  errors,
                "summary": summary,
                "session_issues_count": len(session_log),
            },
            "meta":        {"total_domains": len(domains)},
        }

    def _query_legend(self, params: dict) -> dict:
        """Return a structured glossary of all abbreviations, column headers,
        probability chain fields, and modifier flags used in combat output.

        result_type: "legend"

        Data shape:
            {
                "stat_columns":   [ {abbrev, full_name, description}, ... ],
                "probability_chain": [ {label, description, example}, ... ],
                "modifier_flags":    [ {flag, display, description, math_effect}, ... ],
                "swinginess_labels": [ {label, range, meaning}, ... ],
                "notes":             [ str, ... ],
            }
        """
        stat_columns = [
            {"abbrev": "A",   "full": "Attacks",              "desc": "Number of attack dice rolled per model per shooting/fight phase"},
            {"abbrev": "A(T)","full": "Attacks (Total)",      "desc": "Total attacks from the whole squad: A × model count, shown in parentheses"},
            {"abbrev": "BS",  "full": "Ballistic Skill",      "desc": "Hit roll needed for ranged weapons — e.g. 3+ means you need a 3 or higher"},
            {"abbrev": "WS",  "full": "Weapon Skill",         "desc": "Hit roll needed for melee weapons"},
            {"abbrev": "S",   "full": "Strength",             "desc": "Used with target Toughness to determine wound roll needed"},
            {"abbrev": "AP",  "full": "Armour Penetration",   "desc": "Modifier applied to target's armour save. AP-2 means the defender saves on their armour +2"},
            {"abbrev": "D",   "full": "Damage",               "desc": "Wounds dealt per unsaved wound. Can be a fixed value or a dice expression (e.g. D6)"},
            {"abbrev": "T",   "full": "Toughness",            "desc": "Target stat — compared vs attacker Strength to determine wound threshold"},
            {"abbrev": "Sv",  "full": "Save",                 "desc": "Armour save value of the defending unit (e.g. 3+ = roll 3 or higher to save)"},
            {"abbrev": "W",   "full": "Wounds",               "desc": "Number of wounds a model has — damage is applied until this reaches 0 (model dies)"},
            {"abbrev": "Rng", "full": "Range",                "desc": "Maximum range of the weapon in inches"},
            {"abbrev": "OC",  "full": "Objective Control",    "desc": "How many models count toward holding an objective marker"},
            {"abbrev": "M",   "full": "Move",                 "desc": "Distance in inches the unit can move per Movement phase"},
            {"abbrev": "Ld",  "full": "Leadership",           "desc": "Used for Battle-shock tests — roll 2D6, if result exceeds Ld the unit is Battle-shocked"},
        ]

        probability_chain = [
            {
                "label":  "Hit%",
                "desc":   "Probability that a single attack roll hits (reaches the BS/WS threshold or better)",
                "note":   "Colour-coded green when a modifier (e.g. --ml) improves BS; red when worsened",
                "example":"BS 4+ → Hit% = 50%.  BS 4+ with --ml (+1 hit) → BS 3+ → Hit% = 67%",
            },
            {
                "label":  "Wound%",
                "desc":   "Probability that a hit roll then succeeds at wounding (S vs T lookup, then dice roll). Conditional on a hit.",
                "note":   "Colour-coded green when a modifier (e.g. Twin-linked reroll) improves WR; red when worsened",
                "example":"S4 vs T4 → wound on 4+ → Wound% = 50%",
            },
            {
                "label":  "Save%",
                "desc":   "Probability that a wound is NOT saved (= 1 − P(armour save succeeds)). Conditional on a wound.",
                "note":   "AP makes this higher (harder to save); cover makes it lower",
                "example":"AP-2 vs Sv3+ → defender needs 5+ → Save% (unsaved) = 67%",
            },
            {
                "label":  "Dmg",
                "desc":   "Expected damage output per weapon per phase: A × Hit% × Wound% × Save% × damage_value",
                "note":   "Accounts for squad size — uses total attacks across all models in the unit",
                "example":"3 Broadsides, railgun A2 → 6 total attacks × probabilities × D3+3 damage",
            },
            {
                "label":  "Kills",
                "desc":   "Expected number of models removed: Dmg ÷ target Wounds",
                "note":   "Kill% (in TargetingOutcome bars) = P(at least 1 kill) from Monte Carlo distribution",
                "example":"Expected damage 6 vs 3W Terminators → ~2 expected kills",
            },
        ]

        offensive_modifier_flags = [
            {"flag": "--lethal",      "display": "[lethal]",     "desc": "Lethal Hits",                "effect": "Unmodified 6s to Hit auto-wound (skip wound roll, proceed to saves)"},
            {"flag": "--twin",        "display": "[twin]",       "desc": "Twin-linked",                "effect": "Re-roll all failed wound rolls"},
            {"flag": "--sus1",        "display": "[sus]",        "desc": "Sustained Hits 1",           "effect": "Critical hit (6+) generates 1 additional hit. Use --sus2, --sus3 for Sustained Hits 2/3"},
            {"flag": "--dev",         "display": "[dev]",        "desc": "Devastating Wounds",         "effect": "Critical wounds (6+ on wound roll) bypass all saves (mortal wound equivalent)"},
            {"flag": "--blast",       "display": "[blast]",      "desc": "Blast",                      "effect": "Minimum 3 attacks when targeting 6+ model units — defender model count required for full resolution"},
            {"flag": "--rf",          "display": "[rf]",         "desc": "Rapid Fire (in range)",      "effect": "Rapid Fire N already baked into A count; flag signals in-half-range condition"},
            {"flag": "--melta",       "display": "[melta]",      "desc": "Melta (in range)",           "effect": "Uses weapon's Melta N for +N flat damage. Override with --melta2, --melta:4 etc."},
            {"flag": "--lance",       "display": "[lance]",      "desc": "Lance",                      "effect": "+1 to wound rolls (approximation — full rule applies vs VEHICLES/MONSTERS only)"},
            {"flag": "--torrent",     "display": "[torrent]",    "desc": "Torrent",                    "effect": "Weapon auto-hits (no BS roll required); natural 6s on separate die still trigger crits"},
            {"flag": "--heavy",       "display": "[heavy]",      "desc": "Heavy (Remained Stationary)","effect": "+1 to Hit rolls on weapons with the Heavy keyword"},
            {"flag": "--eap",         "display": "[eap]",        "desc": "Extra AP +N (attacker)",     "effect": "Improves the weapon's Armour Penetration by N (AP-1 → AP-2). Forms: --eap, --eap2, --eap3. The many 'improve the Armour Penetration characteristic by 1' abilities/stratagems."},
            {"flag": "--igncover",    "display": "[igncover]",   "desc": "Ignore Cover",               "effect": "Attacker ignores benefit of cover (standalone — --ml also includes this)"},
            {"flag": "--ea1",         "display": "[ea1]",        "desc": "Extra Attacks +1",           "effect": "+1 extra attack per model before squad scaling (also: --ea2, --ea:3 etc.)"},
            {"flag": "--ed1",         "display": "[ed1]",        "desc": "Extra Damage +1",            "effect": "+N flat damage per unsaved wound. Also: --ed2, --ed:3 etc."},
            {"flag": "--rrhit",       "display": "[rrhit]",      "desc": "Re-roll Hits (all failed)",  "effect": "Re-roll all failed Hit rolls"},
            {"flag": "--rrhit1",      "display": "[rrhit1]",     "desc": "Re-roll Hits (1s only)",     "effect": "Re-roll Hit rolls of 1"},
            {"flag": "--rrwound1",    "display": "[rrwound1]",   "desc": "Re-roll Wounds (1s only)",   "effect": "Re-roll Wound rolls of 1 (--twin re-rolls ALL failed wounds)"},
            {"flag": "--criton5",     "display": "[criton:5]",   "desc": "Crit Hits on 5+",            "effect": "Critical hits trigger on 5+ instead of 6+. Also: --criton4 etc."},
            {"flag": "--critwound5",  "display": "[critwound:5]","desc": "Crit Wounds on 5+",          "effect": "Critical wounds trigger on 5+ instead of 6+. Also: --critwound4 etc."},
        ]

        defensive_modifier_flags = [
            {"flag": "--cover",       "display": "[cover]",      "desc": "Target in cover",            "effect": "+1 to target armour saves (e.g. Sv3+ → Sv2+)"},
            {"flag": "--stealth",     "display": "[stealth]",    "desc": "Stealth",                    "effect": "-1 to Hit rolls against this target (many faction abilities grant this)"},
            {"flag": "--indirect",    "display": "[indirect]",   "desc": "Indirect Fire",              "effect": "-1 to Hit rolls AND target gets benefit of cover (+1 save)"},
            {"flag": "--invuln4",     "display": "[invuln4]",    "desc": "Invulnerable Save Override", "effect": "Forces target invulnerable save to 4+. Also: --invuln5, --invuln6"},
            {"flag": "--eapdef",      "display": "[eapdef]",     "desc": "Extra AP (defender)",        "effect": "Defender worsens the AP of incoming attacks by N (AP-2 → AP-1, e.g. Commander in Enforcer Battlesuit). Forms: --eapdef, --eapdef2. Place after vs on the defender."},
            {"flag": "--fnp6",        "display": "[fnp:6]",      "desc": "Feel No Pain Override",      "effect": "Target gains/overrides Feel No Pain save to 6+. Also: --fnp5, --fnp:4 etc."},
            {"flag": "--halfdmg",     "display": "[halfdmg]",    "desc": "Half Damage",                "effect": "Halves damage inflicted (e.g. Duty Eternal, damage reduction abilities)"},
            {"flag": "--woundsplus1", "display": "[woundsplus1]","desc": "Target +N Wounds",           "effect": "Adds N to the target's Wounds characteristic, floored at 1 (e.g. Reinforced Hull). Negative forms reduce it: --woundsplus-1. Crusade defensive trait."},
            {"flag": "--dmgreduce1",  "display": "[dmgreduce1]", "desc": "Damage Reduction",           "effect": "Reduces incoming damage by N per attack, final damage floored at 1 (e.g. Armour Plating). Alias: --dmgred1. Crusade defensive trait."},
            {"flag": "--svplus1",     "display": "[svplus1]",    "desc": "Target +N Save",             "effect": "Improves the target's armour save rolls by N (better save)."},
            {"flag": "--svminus1",    "display": "[svminus1]",   "desc": "Target -N Save",             "effect": "Worsens the target's armour save rolls by N (e.g. Shell Shocked scar)."},
        ]

        faction_modifier_flags = [
            {"flag": "--oath",   "display": "[oath]",   "faction": "Space Marines",  "desc": "Oath of Moment",             "effect": "Re-roll ALL failed Hit and Wound rolls against the sworn target"},
            {"flag": "--ml",     "display": "[ml]",     "faction": "T'au Empire",    "desc": "Markerlights / Guided",      "effect": "+1 to Hit rolls, Ignore Cover"},
        ]

        swinginess_labels = [
            {"label": "Stable",   "cv_range": "< 0.15", "meaning": "Very consistent output — close to expected value every time"},
            {"label": "Moderate", "cv_range": "0.15–0.30", "meaning": "Some variance — typical for multi-shot medium-damage weapons"},
            {"label": "Variable", "cv_range": "0.30–0.50", "meaning": "Notable variance — low shot counts or high damage dice"},
            {"label": "Swingy",   "cv_range": "> 0.50",  "meaning": "High variance — e.g. single-shot railguns, D6 damage weapons"},
        ]

        notes = [
            "Hit%, Wound%, Save% are CONDITIONAL probabilities in the attack chain — each is conditioned on the previous step succeeding.",
            "Dmg and Kills are EXPECTED VALUES — the average result over many simulations. Monte Carlo (5,000 trials) provides the distribution.",
            "Squad attacks: A column shows per-model attacks; parenthetical value (e.g. 2 (6)) shows total for the whole squad.",
            "AP in dossiers is stored as unsigned integer — AP-2 is stored as 2. The save formula: effective_save = armour_save + AP.",
            "Blast minimum-3 attacks requires knowing the defender's squad size; currently uses dossier minimum composition.",
            "Rapid Fire attacks are baked in at full value — the --rf flag is informational only (no additional math effect).",
        ]

        return {
            "ok":          True,
            "command":     "legend",
            "result_type": "legend",
            "data": {
                "stat_columns":              stat_columns,
                "probability_chain":         probability_chain,
                "offensive_modifier_flags":  offensive_modifier_flags,
                "defensive_modifier_flags":  defensive_modifier_flags,
                "faction_modifier_flags":    faction_modifier_flags,
                "swinginess_labels":         swinginess_labels,
                "notes":                     notes,
            },
            "meta": {},
        }

    def _query_unknown(self, params: dict) -> dict:
        raw = params.get("input", "")
        return self._err("unknown", f"Unknown command: '{raw}'. Type 'help' to see available commands.")

    # ─── Helpers ───────────────────────────────────────────────────────────────

    @staticmethod
    def _normalize_ability(ab) -> dict:
        """Normalize a raw ability (dict or string) to {name, description}.

        Dossier format uses 'summary' as the text field; older or alternate
        schemas may use 'description', 'text', or 'effect'.  Strings are
        treated as name-only entries with no body text.

        For CATEGORY tag abilities (CORE/FACTION/CHARACTER), the 'summary'
        field IS the ability name and there's no description in the dossier.
        We look up the rule text from the loader's built-in descriptions table.
        """
        _CATEGORY_TAGS = {"CORE", "FACTION", "CHARACTER"}
        if isinstance(ab, dict):
            raw_name = (ab.get("name") or "").strip()
            raw_summary = (
                ab.get("summary")
                or ab.get("description")
                or ab.get("text")
                or ab.get("effect")
                or ""
            )
            # For category tags, summary is the ability name — look up rule text
            if raw_name.upper() in _CATEGORY_TAGS and raw_summary:
                from data.combat_terminal.loader import CombatTerminalLoader
                descs = CombatTerminalLoader._FACTION_ABILITY_DESCRIPTIONS
                key = raw_summary.lower().strip()
                base_key = key.rstrip("* 0123456789").strip()
                rule_text = descs.get(key) or descs.get(base_key) or ""
                return {
                    "name": raw_name,
                    "description": raw_summary,
                    "rule_text": rule_text,
                }
            return {
                "name": raw_name,
                "description": raw_summary,
            }
        return {"name": str(ab), "description": ""}

    # ── Shared stat-parsing helper (used by _compute_unit_scores) ──────────────

    @staticmethod
    def _stat_num(val, default=0.0) -> float:
        """Parse a stat value to float, handling dice expressions and suffixes."""
        if val is None:
            return default
        s = str(val).replace('"', '').replace("'", '').replace('+', '').strip()
        dice_m = re.match(r'^(\d*)d(\d+)$', s, re.IGNORECASE)
        if dice_m:
            n = int(dice_m.group(1) or 1)
            d = int(dice_m.group(2))
            return n * (d + 1) / 2.0
        try:
            return float(s)
        except (ValueError, TypeError):
            return default

    @staticmethod
    def _weapon_score(weapons, want_melee: bool, _num_fn=None) -> float:
        """Score weapons by type (ranged or melee). Uses _stat_num for parsing."""
        _num = _num_fn or CombatTerminalEngine._stat_num
        score = 0.0
        for w_item in weapons:
            if isinstance(w_item, dict):
                w_type   = str(w_item.get("type", "ranged")).lower()
                kw_str   = str(w_item.get("keywords", w_item.get("abilities", ""))).lower()
                is_melee = "melee" in w_type or "melee" in kw_str
                if is_melee != want_melee:
                    continue
                a   = _num(w_item.get("attacks") or w_item.get("A"), 1)
                s_v = _num(w_item.get("strength") or w_item.get("S"), 4)
                ap  = abs(_num(w_item.get("ap") or w_item.get("AP"), 0))
                d   = _num(w_item.get("damage") or w_item.get("D"), 1)
                score += a * (s_v * 0.25 + ap * 1.0 + d * 0.75)
            elif isinstance(w_item, str):
                w_str    = w_item.lower()
                is_melee = "melee" in w_str
                if is_melee != want_melee:
                    continue
                bonus = 1.0
                for kw in ("melta", "lascannon", "plasma", "railgun", "heavy rail"):
                    if kw in w_str:
                        bonus = 3.0
                        break
                for kw in ("power", "force", "thunder", "chainsword"):
                    if kw in w_str:
                        bonus = 2.0
                        break
                score += bonus
        return score

    @staticmethod
    def _compute_unit_scores(unit: dict) -> dict:
        """Compute all unit scores in a single pass.

        Returns:
            {
                "ratings": { <name>: {"score": 0-1 float, "label": str}, ... },
                "metrics": { "threat": 0-100, "dur": 0-100, "dmg": 0-100,
                             "mob": 0-100, "buff": 0-100 },
            }
        """
        _num = CombatTerminalEngine._stat_num

        # ── Core stats ──────────────────────────────────────────────────────
        t     = _num(unit.get("T"),  4)
        sv    = _num(unit.get("Sv"), 4)
        w     = _num(unit.get("W"),  1)
        oc    = _num(unit.get("OC"), 1)
        m_raw = str(unit.get("M", '6"')).replace('"', '').replace("'", '').strip()
        try:
            m = float(m_raw)
        except (ValueError, TypeError):
            m = 6.0

        sv_val = sv if 1 <= sv <= 7 else 4.0

        # ── Durability ──────────────────────────────────────────────────────
        t_norm    = min(t  / 14.0,  1.0)
        sv_norm   = max(0.0, (7.0 - sv_val) / 5.0)
        w_norm    = min(w  / 30.0,  1.0)
        dur_score = t_norm * 0.40 + sv_norm * 0.35 + w_norm * 0.25

        sv_str = unit.get("Sv", f"{int(sv_val)}+")
        if "+" not in str(sv_str):
            sv_str = f"{sv_str}+"
        dur_label = f"T{int(t)} {sv_str} {int(w)}W"

        # ── Mobility ────────────────────────────────────────────────────────
        mob_score = min(m / 16.0, 1.0)
        m_str     = unit.get("M", f'{int(m)}"')
        if '"' not in str(m_str):
            m_str = f'{m_str}"'
        mob_label = str(m_str)

        # ── Objective Control ───────────────────────────────────────────────
        oc_score = min(oc / 10.0, 1.0)
        oc_label = f"OC {int(oc)}"

        # ── Weapon scoring ──────────────────────────────────────────────────
        weapons = unit.get("weapons", [])
        fp_raw   = CombatTerminalEngine._weapon_score(weapons, want_melee=False, _num_fn=_num)
        mt_raw   = CombatTerminalEngine._weapon_score(weapons, want_melee=True,  _num_fn=_num)
        fp_score = min(fp_raw / 25.0, 1.0)
        mt_score = min(mt_raw / 25.0, 1.0)
        fp_label = f"{fp_raw:.1f} est"
        mt_label = f"{mt_raw:.1f} est"

        # ── Damage composite (for metrics) ──────────────────────────────────
        dmg_raw   = fp_raw * 0.65 + mt_raw * 0.35
        dmg_score = min(dmg_raw / 20.0, 1.0)

        # ── Buff / support heuristic ────────────────────────────────────────
        keywords  = [str(k).lower() for k in unit.get("keywords", [])]
        ab_texts  = " ".join(str(a).lower() for a in unit.get("abilities", []))
        buff = 10
        for kw in ("psyker", "leader", "priest", "character"):
            if kw in keywords:
                buff += 20
        for word in ("aura", "buff", "re-roll", "reroll", "friendly", "grant", "within"):
            if word in ab_texts:
                buff += 5
        buff = min(buff, 100)

        # ── Overall threat ──────────────────────────────────────────────────
        threat = int(round(dur_score * 0.45 * 100 + dmg_score * 0.55 * 100))
        threat = min(threat, 100)

        return {
            "ratings": {
                "durability":   {"score": dur_score, "label": dur_label},
                "mobility":     {"score": mob_score, "label": mob_label},
                "obj_control":  {"score": oc_score,  "label": oc_label},
                "firepower":    {"score": fp_score,  "label": fp_label},
                "melee_threat": {"score": mt_score,  "label": mt_label},
            },
            "metrics": {
                "threat": threat,
                "dur":    int(round(dur_score * 100)),
                "dmg":    int(round(dmg_score * 100)),
                "mob":    int(round(mob_score * 100)),
                "buff":   buff,
            },
        }

    @staticmethod
    def _compute_ratings(unit: dict) -> dict:
        """Derive normalized (0.0–1.0) combat ratings from a unit dict."""
        return CombatTerminalEngine._compute_unit_scores(unit)["ratings"]

    @staticmethod
    def _compute_metrics(unit: dict) -> dict:
        """Compute 5 threat metrics (0–100 int each) from a unit dict."""
        return CombatTerminalEngine._compute_unit_scores(unit)["metrics"]

    @staticmethod
    def _compute_threat_level(metrics: dict) -> str:
        """Return 'high' / 'medium' / 'low' based on overall threat score."""
        t = metrics.get("threat", 0)
        if t >= 65:
            return "high"
        elif t >= 35:
            return "medium"
        return "low"

    def _compute_threat_score(self, attacker_unit: dict, defender_unit: dict) -> float:
        """Deterministic expected damage: attacker → defender, no Monte Carlo.

        Iterates every weapon on attacker_unit, runs probability math against
        defender_unit stats, and returns the total expected damage.

        Fast (pure arithmetic, no simulation) — safe to call in bulk for
        counter-pick ranking across many unit pairs.

        Returns 0.0 on any error.
        """
        try:
            from data.combat_terminal.math_adapter import (
                _unit_to_target,
                _weapon_to_profile,
                _merge_mods,
            )
            from data.combat_terminal.combat_math_engine import (
                AttackModifiers,
                compute_attack_result,
            )

            target    = _unit_to_target(defender_unit)
            base_mods = AttackModifiers()
            total_dmg = 0.0

            for w in attacker_unit.get("weapons", []):
                if not isinstance(w, dict):
                    continue
                try:
                    wp, weapon_mods = _weapon_to_profile(w)
                    merged          = _merge_mods(weapon_mods, base_mods)
                    result          = compute_attack_result(wp, target, base_mods=merged)
                    total_dmg      += result.expected_damage
                except Exception:
                    pass

            return total_dmg

        except Exception:
            return 0.0


    def _compute_counters_math(
        self, enemy_unit: dict, my_roster: list, top_n: int = 5
    ) -> list[dict]:
        """Real-math counter-pick ranking for one enemy unit vs my roster.

        For each unit in my_roster:
          - dmg_dealt    = expected damage MY unit deals to ENEMY (deterministic EV)
          - dmg_received = expected damage ENEMY deals to MY unit (reverse)
          - efficiency   = dmg_dealt / max(dmg_received, 0.01)

        Score (0–100) is normalised: the best counter always shows 100 and the
        rest scale relative to it by dmg_dealt.

        Returns top_n entries sorted by dmg_dealt descending.
        Each entry: { name, score, reason, dmg_dealt, dmg_received, efficiency }
        """
        scored = []
        for u in my_roster:
            if isinstance(u, dict):
                my_unit = u
            else:
                my_unit = self._loader.get_unit(str(u)) or {"name": str(u)}

            dmg_dealt    = self._compute_threat_score(my_unit, enemy_unit)
            dmg_received = self._compute_threat_score(enemy_unit, my_unit)
            efficiency   = dmg_dealt / max(dmg_received, 0.01)

            scored.append({
                "name":         my_unit.get("name", str(u)),
                "dmg_dealt":    round(dmg_dealt,    2),
                "dmg_received": round(dmg_received, 2),
                "efficiency":   round(efficiency,   2),
                "_sort_key":    dmg_dealt,
            })

        scored.sort(key=lambda x: x["_sort_key"], reverse=True)
        top = scored[:top_n]

        # Normalise score: best unit = 100, rest scale proportionally
        max_dmg = max((x["dmg_dealt"] for x in top), default=0.0)

        for entry in top:
            raw_score    = (entry["dmg_dealt"] / max_dmg * 100) if max_dmg > 0 else 0
            entry["score"] = int(round(raw_score))

            parts = [f"{entry['dmg_dealt']:.1f} dmg dealt"]
            if entry["dmg_received"] > 0:
                parts.append(f"{entry['dmg_received']:.1f} back")
            parts.append(f"ratio {entry['efficiency']:.1f}x")
            entry["reason"] = " · ".join(parts)

            del entry["_sort_key"]

        return top


    @staticmethod
    def _suggest_counters(enemy_metrics: dict, enemy_name: str) -> list[dict]:
        """Generic tactical suggestions when no roster is loaded."""
        en_dur = enemy_metrics.get("dur", 50)
        en_dmg = enemy_metrics.get("dmg", 50)
        en_mob = enemy_metrics.get("mob", 50)

        suggestions: list[dict] = []

        if en_dur >= 70:
            suggestions.append({
                "name": "High-AP firepower unit", "score": 75,
                "reason": "Penetrate tough armour"
            })
        else:
            suggestions.append({
                "name": "Massed firepower unit", "score": 65,
                "reason": "Overwhelm weaker save"
            })

        if en_dmg >= 65:
            suggestions.append({
                "name": "Long-range shooters", "score": 70,
                "reason": "Engage from safety"
            })
        else:
            suggestions.append({
                "name": "Objective holders", "score": 60,
                "reason": "Contest objectives safely"
            })

        if en_mob >= 65:
            suggestions.append({
                "name": "Screen / blocker units", "score": 55,
                "reason": "Block fast advances"
            })
        else:
            suggestions.append({
                "name": "Aggressive flankers", "score": 50,
                "reason": "Exploit limited mobility"
            })

        return suggestions[:3]

    @staticmethod
    def _compute_skew(units: list) -> dict:
        """Analyse unit type composition from a raw units list.

        Returns {"label": str, "breakdown": [{"type": str, "count": int}, ...]}
        ordered by count descending, only non-zero types included.
        """
        counts: dict[str, int] = {
            "Infantry": 0, "Vehicle": 0, "Monster": 0, "Mounted": 0, "Other": 0
        }
        for unit in units:
            kws = [str(k).lower() for k in unit.get("keywords", [])]
            if "vehicle" in kws:
                counts["Vehicle"] += 1
            elif "monster" in kws:
                counts["Monster"] += 1
            elif "mounted" in kws:
                counts["Mounted"] += 1
            elif "infantry" in kws:
                counts["Infantry"] += 1
            else:
                counts["Other"] += 1

        total      = len(units) or 1
        dominant   = max(counts, key=lambda k: counts[k])
        dom_pct    = counts[dominant] / total
        heavy_pct  = (counts["Vehicle"] + counts["Monster"]) / total

        if dom_pct >= 0.6:
            label = f"{dominant} Skew"
        elif heavy_pct >= 0.5:
            label = "Heavy Skew"
        else:
            label = "Mixed"

        breakdown = [
            {"type": t, "count": c}
            for t, c in sorted(counts.items(), key=lambda x: -x[1])
            if c > 0
        ]
        return {"label": label, "breakdown": breakdown}

    @staticmethod
    def _generate_strategic_notes(unit_data: list, faction: str) -> list:
        """Derive tips, warnings, and focus notes from processed threat unit data.

        unit_data items are the dicts built in _query_threats — each has
        name, threat_level, metrics (threat/dur/dmg/mob/buff), keywords.

        Returns a list of up to 6 {"type": "warning"|"tip"|"focus", "text": str} dicts.
        """
        if not unit_data:
            return []

        notes: list[dict] = []

        high_units = [u for u in unit_data if u["threat_level"] == "high"]
        med_units  = [u for u in unit_data if u["threat_level"] == "medium"]
        low_units  = [u for u in unit_data if u["threat_level"] == "low"]

        # ── Warnings ──────────────────────────────────────────────────────────

        if len(high_units) >= 4:
            notes.append({
                "type": "warning",
                "text": (
                    f"{faction} fields {len(high_units)} high-threat units. "
                    "Expect intense early pressure — establish clear target priority before deployment."
                ),
            })
        elif high_units:
            top = high_units[0]["name"]
            notes.append({
                "type": "warning",
                "text": (
                    f"{top} is your primary concern. "
                    "Remove or neutralise it in rounds 1–2 before it can reach your lines."
                ),
            })

        tanky = [u for u in unit_data if u["metrics"].get("dur", 0) >= 70]
        if tanky:
            names = ", ".join(u["name"] for u in tanky[:2])
            suffix = f" and {len(tanky) - 2} more" if len(tanky) > 2 else ""
            notes.append({
                "type": "warning",
                "text": (
                    f"High-durability units detected: {names}{suffix}. "
                    "AP-2 or better weapons are required to crack their saves efficiently."
                ),
            })

        # ── Tips ──────────────────────────────────────────────────────────────

        fast_units = [u for u in unit_data if u["metrics"].get("mob", 0) >= 70]
        if fast_units:
            names = ", ".join(u["name"] for u in fast_units[:2])
            notes.append({
                "type": "tip",
                "text": (
                    f"Fast flankers detected ({names}). "
                    "Deploy screening units to protect backfield objectives from turn 1."
                ),
            })

        buff_units = [u for u in unit_data if u["metrics"].get("buff", 0) >= 50]
        if buff_units:
            notes.append({
                "type": "tip",
                "text": (
                    "Multiple support units detected. "
                    "Targeting their leader/character units early degrades the faction's overall efficiency."
                ),
            })

        if len(low_units) >= len(unit_data) * 0.4 and low_units:
            notes.append({
                "type": "tip",
                "text": (
                    "A large portion of units are low threat — your opponent may use them "
                    "to bait your activations. Preserve your high-value units until mid-game."
                ),
            })

        # ── Focus ─────────────────────────────────────────────────────────────

        top_threat = max(unit_data, key=lambda u: u["metrics"].get("threat", 0), default=None)
        if top_threat:
            score = top_threat["metrics"].get("threat", 0)
            notes.append({
                "type": "focus",
                "text": (
                    f"Priority target: {top_threat['name']} "
                    f"(threat score {score}). "
                    "Concentrate fire early and do not let it consolidate into your lines."
                ),
            })

        return notes[:6]

    @staticmethod
    def _err(command: str, message: str) -> dict:
        return {
            "ok":          False,
            "command":     command,
            "result_type": "error",
            "data":        message,
            "meta":        {},
        }

