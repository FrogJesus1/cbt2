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
        }

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
            remainder, faction = self._extract_flag(remainder, "faction")
            remainder, _ = self._extract_flag(remainder, "ranged")
            remainder, _ = self._extract_flag(remainder, "melee")
            # Extract boolean --flags as keyword filters (--blast, --deepstrike, etc.)
            # These are always boolean; we do NOT consume the next word as a value.
            keyword_flags, remainder = self._extract_bool_flags(remainder)
            return ("list", {"type": list_type, "filter": remainder.strip(), "faction": faction, "keywords": keyword_flags})

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

    def query(self, command: str, params: dict = {}) -> dict:
        dispatch = {
            "_select":     self._query_select,
            "spec":        self._query_spec,
            "combat":      self._query_combat,
            "rerun":       self._query_rerun,
            "rule":        self._query_rule,
            "threat":      self._query_threats,
            "analyze":     self._query_analyze,
            "list":        self._query_list,
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
            "unknown":     self._query_unknown,
            "mathmode":    self._query_mathmode,
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
        labels = [
            "{name}  ({faction})".format(
                name    = m.get("name", "?"),
                faction = m.get("faction", "").replace("_", " ").title(),
            )
            for m in matches
        ]
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

        # If a faction hint is provided (from disambiguation resolution), do an
        # exact lookup — this path always finds exactly one unit.
        if faction:
            result = self._loader.get_unit(name, faction=faction)
            if not result:
                return self._err("spec", f"No unit found matching '{name}' in faction '{faction}'.")
            return self._build_spec_result(result)

        # Multi-match check — trigger disambiguation when more than one unit matches.
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
        # _attacker_faction is set when coming from a disambiguation selection,
        # ensuring exact lookup without retriggering disambiguation.
        att_faction = params.get("_attacker_faction")
        if att_faction:
            att_unit = self._loader.get_unit(attacker_raw, faction=att_faction)
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
        def_faction = params.get("_defender_faction")
        if def_faction:
            def_unit = self._loader.get_unit(defender_raw, faction=def_faction)
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

        # Augment attacker with drone / turret weapons so they appear in the
        # combat weapon table and are included in combat math.
        if att_unit:
            att_unit = self._augment_unit_with_supplements(att_unit)

        # Model count — parsed from unit_composition bullet entries.
        # Used to compute shots_total so the UI can show "A: 2 (4)".
        # When a roster is eventually wired, override this with roster data.
        att_models = _parse_min_models(att_unit.get("unit_composition", [])) if att_unit else 1

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
                            if att_models > 1:
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
            "ml":    {"icon": "target",    "text": "Markerlights active — +1 to Hit rolls, Ignores Cover"},
            "cover": {"icon": "shield",    "text": "Target in cover — +1 to armour saves"},
            "dev":   {"icon": "skull",     "text": "Devastating Wounds — critical wounds bypass saves"},
        }
        flag_notes = []
        for f in flags:
            key = f.split(":")[0]
            if key in FLAG_NOTE_MAP:
                flag_notes.append(FLAG_NOTE_MAP[key])
            elif key.startswith("invuln"):
                val = f.split(":")[1] if ":" in f else "?"
                flag_notes.append({"icon": "diamond", "text": f"Invulnerable save: {val}+"})
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
        math_result = {}
        sensitivity = []
        if att_unit and def_unit:
            try:
                math_result = compute_combat(att_unit, def_unit, flags)
                sensitivity = compute_sensitivity(att_unit, def_unit, flags)
            except Exception:
                math_result = {}
                sensitivity = []

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
            w["kill_pct"]     = pw.get("fail_save_pct")  # prob of unsaved wound
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
            matched_faction = faction

        faction_label = matched_faction.replace("_", " ").title()

        # Build per-unit threat data (same shape as threat_card but without counters)
        unit_data = []
        for unit in raw_units:
            metrics      = self._compute_metrics(unit)
            threat_level = self._compute_threat_level(metrics)

            profile = {k: unit[k] for k in ("T", "Sv", "W", "M", "OC") if k in unit}

            abilities = [self._normalize_ability(ab) for ab in unit.get("abilities", [])]

            unit_data.append({
                "name":          unit.get("name", "Unknown"),
                "threat_level":  threat_level,
                "metrics":       metrics,
                "profile":       profile,
                "keywords":      unit.get("keywords", []),
                "abilities":     abilities,
                "enhancement":   str(unit.get("enhancement", unit.get("warlord_trait", "")) or ""),
                "counters":      [],
                "show_counters": False,
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
        detachments       = self._loader.get_stub_detachments(faction_label)
        stratagems        = self._loader.get_stub_stratagems(faction_label)
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
        list_type   = params.get("type", "").strip().lower()
        filter_text = (params.get("filter") or "").strip()
        faction     = (params.get("faction") or None)
        keywords    = params.get("keywords") or []

        if not list_type:
            return self._err("list", "Usage: list <units|weapons|factions|stratagems> [keyword]")

        result = self._loader.get_list(list_type, filter_text, faction, keywords=keywords)

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
                "data":        f"No {label.lower()} roster loaded.\nRoster import coming soon.",
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
                    "target":       None,
                    "mods":         None,
                    "campaign":     None,
                },
                "my_roster":    _roster_meta(roster_my),
                "enemy_roster": _enemy_meta(roster_enemy),
            },
            "meta": {"turn": turn},
        }

    def _query_nextturn(self, params: dict) -> dict:
        self._session["turn"] = self._session.get("turn", 0) + 1
        turn = self._session["turn"]
        return {
            "ok":          True,
            "command":     "nextturn",
            "result_type": "text",
            "data":        f"Battle round {turn} begins.\nGood luck, Commander.",
            "meta":        {"turn": turn},
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
        return self._err("dice", "Dice roller not yet implemented. Coming soon.")

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
            return self._err("ability", f"No ability found matching '{name}'.")

        return {
            "ok":          True,
            "command":     "ability",
            "result_type": "ability_block",
            "data": {
                "name":   result.get("name", name),
                "text":   result.get("description", result.get("text", result.get("effect", "—"))),
                "units":  result.get("units", []),
                "phase":  result.get("phase", ""),
                "source": result.get("source", result.get("book", "")),
                "_stub":  result.get("_stub", False),
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

        # Counters
        counters = []
        if show_counters:
            roster_my = self._session.get("roster_my", [])
            if roster_my:
                counters = self._compute_counters(metrics, unit, roster_my)
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

    @staticmethod
    def _compute_ratings(unit: dict) -> dict:
        """Derive normalized (0.0–1.0) combat ratings from a unit dict.

        Returns a dict keyed by rating name, each with:
            score (float 0–1), label (display string)
        """
        def _num(val, default=0.0) -> float:
            if val is None:
                return default
            s = str(val).replace('"', '').replace("'", '').replace('+', '').strip()
            # Handle "D6", "d6" dice values — use average
            import re as _re
            dice_m = _re.match(r'^(\d*)d(\d+)$', s, _re.IGNORECASE)
            if dice_m:
                n = int(dice_m.group(1) or 1)
                d = int(dice_m.group(2))
                return n * (d + 1) / 2.0
            try:
                return float(s)
            except (ValueError, TypeError):
                return default

        # Core stats
        t     = _num(unit.get("T"),  4)
        sv    = _num(unit.get("Sv"), 4)     # save value e.g. 3 for "3+"
        w     = _num(unit.get("W"),  1)
        oc    = _num(unit.get("OC"), 1)
        m_raw = str(unit.get("M", "6\"")).replace('"', '').replace("'", '').strip()
        try:
            m = float(m_raw)
        except (ValueError, TypeError):
            m = 6.0

        sv_val = sv if 1 <= sv <= 7 else 4.0

        # ── Durability ─────────────────────────────────────────────────────────
        t_norm   = min(t  / 14.0,  1.0)
        sv_norm  = max(0.0, (7.0 - sv_val) / 5.0)   # 2+=1.0, 7+=0.0
        w_norm   = min(w  / 30.0,  1.0)
        dur_score = t_norm * 0.40 + sv_norm * 0.35 + w_norm * 0.25

        sv_str = unit.get("Sv", f"{int(sv_val)}+")
        if "+" not in str(sv_str):
            sv_str = f"{sv_str}+"
        dur_label = f"T{int(t)} {sv_str} {int(w)}W"

        # ── Mobility ────────────────────────────────────────────────────────────
        mob_score = min(m / 16.0, 1.0)
        m_str     = unit.get("M", f'{int(m)}"')
        if '"' not in str(m_str):
            m_str = f'{m_str}"'
        mob_label = str(m_str)

        # ── Objective Control ───────────────────────────────────────────────────
        oc_score = min(oc / 10.0, 1.0)
        oc_label = f"OC {int(oc)}"

        # ── Weapon scoring helpers ───────────────────────────────────────────────
        def _weapon_score(weapons, want_melee: bool) -> float:
            score = 0.0
            for w_item in weapons:
                if isinstance(w_item, dict):
                    w_type   = str(w_item.get("type", "ranged")).lower()
                    kw_str   = str(w_item.get("keywords", w_item.get("abilities", ""))).lower()
                    is_melee = "melee" in w_type or "melee" in kw_str
                    if is_melee != want_melee:
                        continue
                    # Try varied key names from different data schemas
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
                    # Keyword heuristics for string-format weapons
                    bonus = 1.0
                    for kw in ["melta", "lascannon", "plasma", "railgun", "heavy rail"]:
                        if kw in w_str:
                            bonus = 3.0
                            break
                    for kw in ["power", "force", "thunder", "chainsword"]:
                        if kw in w_str:
                            bonus = 2.0
                            break
                    score += bonus
            return score

        fp_raw   = _weapon_score(unit.get("weapons", []), want_melee=False)
        mt_raw   = _weapon_score(unit.get("weapons", []), want_melee=True)
        fp_score = min(fp_raw / 25.0, 1.0)
        mt_score = min(mt_raw / 25.0, 1.0)

        fp_label = f"{fp_raw:.1f} est"
        mt_label = f"{mt_raw:.1f} est"

        return {
            "durability":    {"score": dur_score, "label": dur_label},
            "mobility":      {"score": mob_score, "label": mob_label},
            "obj_control":   {"score": oc_score,  "label": oc_label},
            "firepower":     {"score": fp_score,  "label": fp_label},
            "melee_threat":  {"score": mt_score,  "label": mt_label},
        }

    @staticmethod
    def _compute_metrics(unit: dict) -> dict:
        """Compute 5 threat metrics (0–100 int each) from a unit dict.

        Returns: {threat, dur, dmg, mob, buff}
        - threat: overall danger (combines offence + durability)
        - dur:    survivability
        - dmg:    damage output (ranged + melee weighted)
        - mob:    movement speed
        - buff:   buffing / support potential (heuristic)
        """
        import re as _re

        def _num(val, default=0.0) -> float:
            if val is None:
                return default
            s = str(val).replace('"', '').replace("'", '').replace('+', '').strip()
            dice_m = _re.match(r'^(\d*)d(\d+)$', s, _re.IGNORECASE)
            if dice_m:
                n = int(dice_m.group(1) or 1)
                d = int(dice_m.group(2))
                return n * (d + 1) / 2.0
            try:
                return float(s)
            except (ValueError, TypeError):
                return default

        t     = _num(unit.get("T"),  4)
        sv    = _num(unit.get("Sv"), 4)
        w     = _num(unit.get("W"),  1)
        oc    = _num(unit.get("OC"), 1)  # noqa: F841 (kept for future use)
        m_raw = str(unit.get("M", '6"')).replace('"', '').replace("'", '').strip()
        try:
            m = float(m_raw)
        except (ValueError, TypeError):
            m = 6.0

        sv_val = sv if 1 <= sv <= 7 else 4.0

        # ── Durability ──────────────────────────────────────────────────────
        t_norm  = min(t  / 14.0, 1.0)
        sv_norm = max(0.0, (7.0 - sv_val) / 5.0)
        w_norm  = min(w  / 30.0, 1.0)
        dur_raw = t_norm * 0.40 + sv_norm * 0.35 + w_norm * 0.25
        dur     = int(round(dur_raw * 100))

        # ── Mobility ────────────────────────────────────────────────────────
        mob = int(round(min(m / 16.0, 1.0) * 100))

        # ── Weapon scoring ───────────────────────────────────────────────────
        def _wscore(weapons, want_melee: bool) -> float:
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

        fp_raw  = _wscore(unit.get("weapons", []), want_melee=False)
        mt_raw  = _wscore(unit.get("weapons", []), want_melee=True)
        dmg_raw = fp_raw * 0.65 + mt_raw * 0.35
        dmg     = int(round(min(dmg_raw / 20.0, 1.0) * 100))

        # ── Buff / support heuristic ─────────────────────────────────────────
        keywords  = [str(k).lower() for k in unit.get("keywords", [])]
        ab_texts  = " ".join(str(a).lower() for a in unit.get("abilities", []))
        buff      = 10
        for kw in ("psyker", "leader", "priest", "character"):
            if kw in keywords:
                buff += 20
        for word in ("aura", "buff", "re-roll", "reroll", "friendly", "grant", "within"):
            if word in ab_texts:
                buff += 5
        buff = min(buff, 100)

        # ── Overall threat (offence × weight + durability × weight) ──────────
        threat = int(round(dur_raw * 0.45 * 100 + min(dmg_raw / 20.0, 1.0) * 0.55 * 100))
        threat = min(threat, 100)

        return {"threat": threat, "dur": dur, "dmg": dmg, "mob": mob, "buff": buff}

    @staticmethod
    def _compute_threat_level(metrics: dict) -> str:
        """Return 'high' / 'medium' / 'low' based on overall threat score."""
        t = metrics.get("threat", 0)
        if t >= 65:
            return "high"
        elif t >= 35:
            return "medium"
        return "low"

    def _compute_counters(
        self, enemy_metrics: dict, enemy_unit: dict, my_roster: list
    ) -> list[dict]:
        """Score each unit in my_roster vs the enemy and return the top 3."""
        scored = []
        for u in my_roster:
            if isinstance(u, dict):
                my_unit = u
            else:
                my_unit = self._loader.get_unit(str(u)) or {"name": str(u)}

            my_metrics = self._compute_metrics(my_unit)
            score      = self._counter_score_vs(my_metrics, enemy_metrics)
            reason     = self._counter_reason_str(my_metrics, enemy_metrics)
            scored.append({
                "name":   my_unit.get("name", str(u)),
                "score":  int(round(score)),
                "reason": reason,
            })

        scored.sort(key=lambda x: x["score"], reverse=True)
        return scored[:3]

    @staticmethod
    def _counter_score_vs(my_metrics: dict, enemy_metrics: dict) -> float:
        """0–100 score: how well my unit counters the enemy."""
        dmg_vs_dur = my_metrics.get("dmg", 0) * (enemy_metrics.get("dur", 50) / 100)
        dur_vs_dmg = my_metrics.get("dur", 0) * (enemy_metrics.get("dmg", 50) / 100)
        return min(dmg_vs_dur * 0.60 + dur_vs_dmg * 0.40, 100)

    @staticmethod
    def _counter_reason_str(my_metrics: dict, enemy_metrics: dict) -> str:
        """Brief human-readable rationale."""
        my_dmg = my_metrics.get("dmg", 0)
        en_dur = enemy_metrics.get("dur", 50)
        my_dur = my_metrics.get("dur", 0)
        en_dmg = enemy_metrics.get("dmg", 50)
        parts  = []
        if my_dmg >= 60 and en_dur >= 60:
            parts.append("High dmg vs tough target")
        elif my_dmg >= 60:
            parts.append("High damage output")
        if my_dur >= 60 and en_dmg >= 60:
            parts.append("Durable vs heavy hitter")
        return " · ".join(parts) if parts else ""

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

    @staticmethod
    def _unit_to_fields(unit: dict) -> list:
        fields = []

        stat_keys = ["M", "T", "Sv", "W", "Ld", "OC"]
        stats = {k: unit[k] for k in stat_keys if k in unit}
        if stats:
            fields.append({"label": "Stats", "value": stats})

        for key in ["weapons", "abilities", "keywords"]:
            if key in unit:
                fields.append({"label": key.capitalize(), "value": unit[key]})

        if "points" in unit:
            fields.append({"label": "Points", "value": unit["points"]})

        return fields
