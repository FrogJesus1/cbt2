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
from data.combat_terminal.math_adapter import compute_combat, compute_sensitivity
from data.combat_terminal.math_ledger import build_combat_ledger


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
            # Simulation layer — always reports current mode
            "simulation_mode": "monte_carlo",   # math_adapter runs MC on every combat query
            "simulation_config": {
                "trials":      5000,
                "seed":        42,
                "status":      "ACTIVE",        # healthy if loader is ready; OFFLINE otherwise
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
        pattern = re.compile(r'--(\w+)(?:\s+([^\s-]\S*))?')
        for m in pattern.finditer(text):
            flag_name = m.group(1).lower()
            flag_val  = m.group(2)
            if flag_val and not flag_val.startswith('-'):
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
        self._session["disambiguation"] = None  # clear before re-dispatch

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

        # Log lookup failures to the session issue log
        if not att_unit:
            self._log_issue("unit_lookup", f"Attacker not found: '{attacker_raw}'", f"query={attacker_raw}")
        if not def_unit:
            self._log_issue("unit_lookup", f"Defender not found: '{defender_raw}'", f"query={defender_raw}")

        # Augment attacker with drone / turret weapons so they appear in the
        # combat weapon table and are included in combat math.
        if att_unit:
            att_unit = self._augment_unit_with_supplements(att_unit)

        # Model count — start from the dossier's unit_composition minimum,
        # then override with the actual roster squad size when available.
        att_models = _parse_min_models(att_unit.get("unit_composition", [])) if att_unit else 1
        if att_unit:
            _att_name = att_unit.get("name", "").lower()
            for _ru in self._session.get("roster_my", []):
                _ru_name = (_ru.get("name") or "").lower()
                if _ru_name and (_ru_name in _att_name or _att_name in _ru_name):
                    if _ru.get("models"):
                        att_models = int(_ru["models"])
                    break

        # Defender model count — drives BLAST minimum-3-attacks rule.
        def_models = _parse_min_models(def_unit.get("unit_composition", [])) if def_unit else 1
        if def_unit:
            _def_name = def_unit.get("name", "").lower()
            for _ru in self._session.get("roster_enemy", []):
                _ru_name = (_ru.get("name") or "").lower()
                if _ru_name and (_ru_name in _def_name or _def_name in _ru_name):
                    if _ru.get("models"):
                        def_models = int(_ru["models"])
                    break

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
            for w in att_unit.get("weapons", []):
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

        # Abilities from attacker
        abilities = []
        if att_unit:
            for ab in att_unit.get("abilities", []):
                norm = self._normalize_ability(ab)
                abilities.append({"name": norm["name"], "description": norm["description"], "color": "cyan"})

        # Flag notes for active modifiers
        FLAG_NOTE_MAP = {
            "ml":        {"icon": "target",    "text": "Markerlights active — +1 to Hit rolls, Ignores Cover"},
            "cover":     {"icon": "shield",    "text": "Target in cover — +1 to armour saves"},
            "dev":       {"icon": "skull",     "text": "Devastating Wounds — critical wounds bypass saves"},
            "lethal":    {"icon": "lightning", "text": "Lethal Hits — unmodified 6s to Hit auto-wound"},
            "twin":      {"icon": "star",      "text": "Twin-linked — re-roll all wound rolls"},
            "sustained": {"icon": "star",      "text": "Sustained Hits 1 — critical hits generate +1 extra hit"},
            "blast":     {"icon": "skull",     "text": "Blast — makes minimum 3 attacks against units of 6+ models"},
            "rf":        {"icon": "lightning", "text": "Rapid Fire — +attacks equal to weapon's Rapid Fire value within half range"},
            "melta":     {"icon": "skull",     "text": "Melta — +damage equal to weapon's Melta value within half range"},
            "torrent":   {"icon": "target",    "text": "Torrent — weapon auto-hits (no ballistic skill roll needed)"},
            "lance":     {"icon": "star",      "text": "Lance — +1 to Wound rolls (charged this turn)"},
            "fnp":       {"icon": "shield",    "text": "Feel No Pain — target ignores wounds on a roll of N+"},
            "dmgplus":   {"icon": "zap",       "text": "Flat damage bonus — +N damage per unsaved wound"},
        }
        flag_notes = []
        for f in flags:
            key = f.split(":")[0]
            if key in FLAG_NOTE_MAP:
                flag_notes.append(FLAG_NOTE_MAP[key])
            elif key.startswith("invuln"):
                val = f.split(":")[1] if ":" in f else "?"
                flag_notes.append({"icon": "diamond", "text": f"Invulnerable save active — {val}+ invuln overrides armour save"})
            elif key == "ea" or re.match(r'^ea\d+$', key):
                val = f.split(":")[1] if ":" in f else re.sub(r'^ea', '', key)
                flag_notes.append({"icon": "zap", "text": f"+{val} extra attack(s) per model"})

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
        math_result = {}
        sensitivity = []
        if att_unit and def_unit:
            try:
                math_result = compute_combat(
                    att_unit, def_unit, flags,
                    att_models=att_models, def_models=def_models,
                )
                sensitivity = compute_sensitivity(
                    att_unit, def_unit, flags,
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

            # BS delta: compare effective hit roll vs the weapon's baseline BS/WS
            try:
                bs_base = int(str(w.get("bs_ws", "")).replace("+", "").strip())
                ht = pw.get("hit_target")
                if ht is not None:
                    if   ht < bs_base: w["bs_delta"] = "better"
                    elif ht > bs_base: w["bs_delta"] = "worse"
            except (ValueError, TypeError):
                pass

            # WR delta: compare effective wound target vs S-vs-T standard formula
            if def_T is not None:
                base_wr = _baseline_wr(w.get("strength"), def_T)
                wt = pw.get("wound_target")
                if base_wr is not None and wt is not None:
                    if   wt < base_wr: w["wr_delta"] = "better"
                    elif wt > base_wr: w["wr_delta"] = "worse"

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

        # Store last_combat for rerun support
        att_identity = att_unit.get("name", attacker_raw) if att_unit else attacker_raw
        def_identity = def_unit.get("name", defender_raw) if def_unit else defender_raw
        self._session["last_combat"] = {
            "attacker":              att_identity,
            "_attacker_faction":     att_unit.get("faction") if att_unit else None,
            "defender":              def_identity,
            "_defender_faction":     def_unit.get("faction") if def_unit else None,
            "all_attacker_flags":    final_all_att,
            "all_defender_flags":    final_all_def,
            "active_attacker_flags": list(attacker_flags),
            "active_defender_flags": list(defender_flags),
        }

        return {
            "ok":          True,
            "command":     "combat",
            "result_type": "combat",
            "data": {
                "attacker_name":       att_name,
                "defender_name":       def_name,
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
                    build_combat_ledger(att_unit, def_unit, flags, math_result, weapons)
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
            "defender":              last["defender"],
            "_defender_faction":     last["_defender_faction"],
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
            "my_units":       [{ "name": str, "faction": str, "models": int }, ...],
            "opponent_units": [{ "name": str, "faction": str, "models": int }, ...],
          }
        Either key may be absent — only present keys are updated.
        """
        if "my_units" in context:
            self._session["roster_my"] = context["my_units"] or []
        if "opponent_units" in context:
            self._session["roster_enemy"] = context["opponent_units"] or []

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

        modifier_flags = [
            {"flag": "--ml",          "display": "[ml]",         "desc": "Markerlights / Guided",      "effect": "+1 to all Hit rolls, Ignores Cover"},
            {"flag": "--cover",       "display": "[cover]",      "desc": "Target in cover",            "effect": "+1 to target armour saves (e.g. Sv3+ → Sv2+)"},
            {"flag": "--lethal",      "display": "[lethal]",     "desc": "Lethal Hits",                "effect": "Unmodified 6s to Hit auto-wound (skip wound roll, proceed to saves)"},
            {"flag": "--twin",        "display": "[twin]",       "desc": "Twin-linked",                "effect": "Re-roll all failed wound rolls"},
            {"flag": "--sustained1",  "display": "[sustained]",  "desc": "Sustained Hits 1",           "effect": "Critical hit (6+) generates 1 additional hit. Use --sustained:2 for Sustained Hits 2"},
            {"flag": "--dev",         "display": "[dev]",        "desc": "Devastating Wounds",         "effect": "Critical wounds (6+ on wound roll) bypass all saves (mortal wound equivalent)"},
            {"flag": "--blast",       "display": "[blast]",      "desc": "Blast",                      "effect": "Minimum 3 attacks when targeting 6+ model units — defender model count required for full resolution"},
            {"flag": "--rf",          "display": "[rf]",         "desc": "Rapid Fire (in range)",      "effect": "Rapid Fire N already baked into A count; flag signals in-half-range condition"},
            {"flag": "--melta",       "display": "[melta]",      "desc": "Melta (in range)",           "effect": "Melta N already parsed from weapon keyword; flag signals within-half-range for +N flat damage"},
            {"flag": "--ea1",         "display": "[ea1]",        "desc": "Extra Attacks +1",           "effect": "+1 extra attack per model before squad scaling (also: --ea:2, --ea:3 etc.)"},
            {"flag": "--invuln:4",    "display": "[invuln:4]",   "desc": "Invulnerable Save Override", "effect": "Forces target invulnerable save to the specified value (e.g. 4+)"},
            {"flag": "--lance",       "display": "[lance]",      "desc": "Lance",                      "effect": "+1 to wound rolls (approximation — full rule applies vs VEHICLES/MONSTERS only)"},
            {"flag": "--torrent",     "display": "[torrent]",    "desc": "Torrent",                    "effect": "Weapon auto-hits (no BS roll required); natural 6s on separate die still trigger crits"},
            {"flag": "--fnp:6",       "display": "[fnp:6]",      "desc": "Feel No Pain Override",      "effect": "Target gains/overrides Feel No Pain save to specified value (e.g. 6+)"},
            {"flag": "--dmgplus:1",   "display": "[dmgplus:1]",  "desc": "Flat Damage Bonus",          "effect": "+N flat damage per unsaved wound (stacks with other damage modifiers)"},
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
                "stat_columns":       stat_columns,
                "probability_chain":  probability_chain,
                "modifier_flags":     modifier_flags,
                "swinginess_labels":  swinginess_labels,
                "notes":              notes,
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
        """
        if isinstance(ab, dict):
            return {
                "name": ab.get("name", ""),
                "description": (
                    ab.get("summary")
                    or ab.get("description")
                    or ab.get("text")
                    or ab.get("effect")
                    or ""
                ),
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

