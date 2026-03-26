"""
Combat Terminal Loader

Responsible for loading and indexing all data files.
Engine.py calls this; the rendering layer never touches it directly.

Data resolution order (checked in sequence, first found wins):
  1. Internal:  data/combat_terminal/data/factions/   (engine-local copy)
  2. External:  ../../combat_terminal/12_factions/    (original CT project)

Rules data:
  1. Internal:  data/combat_terminal/data/rules/rules.json
  2. External:  ../../combat_terminal/05_rules_and_missions/data/rules.json
"""

from __future__ import annotations

import json
import unicodedata
from pathlib import Path

# ─── Data directory paths ──────────────────────────────────────────────────────

_ENGINE_DIR = Path(__file__).parent                  # .../combat_terminal_2/data/combat_terminal
_INTERNAL   = _ENGINE_DIR / "data"                   # internal data store
_MNT_ROOT   = _ENGINE_DIR.parent.parent.parent       # .../mnt/
_EXTERNAL   = _MNT_ROOT / "combat_terminal"          # original CT project root

# Faction dossier search paths (first dir that exists wins)
_FACTION_PATHS = [
    _INTERNAL / "factions",
    _EXTERNAL / "12_factions",
]

# Rules file search paths
_RULES_PATHS = [
    _INTERNAL / "rules" / "rules.json",
    _EXTERNAL / "05_rules_and_missions" / "data" / "rules.json",
]


# ─── Normalisation helper ──────────────────────────────────────────────────────

def _normalise(s: str) -> str:
    """Strip accents and lowercase for fuzzy matching (handles Tau/Votann names)."""
    nfd = unicodedata.normalize("NFD", str(s))
    return "".join(c for c in nfd if unicodedata.category(c) != "Mn").lower()


class CombatTerminalLoader:

    def __init__(self):
        self._units:   dict[str, list]  = {}   # faction_name → [unit, ...]
        self._rules:   dict[str, dict]  = {}   # keyword_lower → rule dict
        self._loaded:  bool             = False
        self._errors:  list[str]        = []

    # ─── Load ──────────────────────────────────────────────────────────────────

    def load(self):
        """Load all data. Safe to call multiple times (idempotent)."""
        if self._loaded:
            return
        self._load_units()
        self._load_rules()
        self._loaded = True

    def _load_units(self):
        """Load faction dossiers from the first available factions directory."""
        factions_dir = self._find_factions_dir()
        if not factions_dir:
            self._errors.append(
                "No faction data found. Checked: "
                + ", ".join(str(p) for p in _FACTION_PATHS)
            )
            return

        for faction_dir in sorted(factions_dir.iterdir()):
            if not faction_dir.is_dir() or faction_dir.name.startswith("."):
                continue
            faction = faction_dir.name

            # Look for a parsed dossier JSON — accept any *_parsed_dossier.json
            dossier = faction_dir / f"{faction}_parsed_dossier.json"
            if not dossier.exists():
                # Fallback: first JSON file in the folder
                candidates = list(faction_dir.glob("*parsed_dossier*.json"))
                dossier    = candidates[0] if candidates else None

            if not dossier:
                continue

            try:
                with open(dossier, encoding="utf-8") as f:
                    raw = json.load(f)
                units = raw if isinstance(raw, list) else raw.get("units", [])
                if units:
                    self._units[faction] = [self._normalise_unit(u) for u in units]
            except Exception as e:
                self._errors.append(f"[{faction}] Failed to load {dossier.name}: {e}")

    def _load_rules(self):
        """Load rules from the first available rules.json."""
        rules_file = self._find_rules_file()
        if not rules_file:
            # Non-fatal — rules lookup will just return nothing
            return

        try:
            with open(rules_file, encoding="utf-8") as f:
                data = json.load(f)

            # Handle three shapes:
            #   list of rule dicts
            #   {"rules": [rule, ...]}
            #   {"rules": {"id": rule_dict, ...}}
            raw_rules = data if isinstance(data, list) else data.get("rules", [])
            if isinstance(raw_rules, dict):
                rules_list = list(raw_rules.values())
            else:
                rules_list = raw_rules

            for rule in rules_list:
                if not isinstance(rule, dict):
                    continue
                key = _normalise(rule.get("name", ""))
                if key:
                    self._rules[key] = rule
        except Exception as e:
            self._errors.append(f"Failed to load rules: {e}")

    # ─── Path resolution ───────────────────────────────────────────────────────

    @staticmethod
    def _find_factions_dir() -> Path | None:
        for p in _FACTION_PATHS:
            if p.exists() and p.is_dir():
                return p
        return None

    @staticmethod
    def _find_rules_file() -> Path | None:
        for p in _RULES_PATHS:
            if p.exists() and p.is_file():
                return p
        return None

    # ─── Unit normalisation ────────────────────────────────────────────────────

    @staticmethod
    def _normalise_unit(unit: dict) -> dict:
        """Flatten nested 'stats' dict into top-level keys so the engine can
        always read unit['M'], unit['T'], unit['Sv'], etc. regardless of which
        parser produced the dossier.

        Dossier shape coming from build_all_factions.py:
          { "name": ..., "stats": {"M": "5\"", "T": 6, ...}, ... }

        After normalisation the unit will have BOTH the nested stats dict AND
        top-level keys — existing code that already handles top-level keys
        continues to work, and code that reads the nested dict also works.
        """
        nested = unit.get("stats")
        if isinstance(nested, dict):
            merged = dict(unit)  # shallow copy
            for k, v in nested.items():
                if k not in merged or merged[k] is None:
                    merged[k] = v
            return merged
        return unit

    # ─── Status ────────────────────────────────────────────────────────────────

    def status(self) -> dict:
        total_units = sum(len(v) for v in self._units.values())
        # Per-faction unit counts — sorted by count descending for display
        per_faction = {
            faction: len(units)
            for faction, units in sorted(
                self._units.items(), key=lambda x: len(x[1]), reverse=True
            )
        }
        return {
            "loaded": self._loaded,
            "summary": {
                "factions":    len(self._units),
                "total_units": total_units,
                "rules":       len(self._rules),
            },
            "per_faction": per_faction,
            "errors": self._errors,
        }

    # ─── Query: unit ───────────────────────────────────────────────────────────

    def get_unit(self, name: str, faction: str | None = None) -> dict | None:
        """Find a unit by name (partial, accent-insensitive). Optionally filter by faction."""
        query = _normalise(name)

        factions_to_search = (
            {faction: self._units[faction]}
            if faction and faction in self._units
            else self._units
        )

        # Exact match first (normalised)
        for faction_name, units in factions_to_search.items():
            for unit in units:
                if _normalise(unit.get("name", "")) == query:
                    return {**unit, "faction": faction_name}

        # Substring match
        for faction_name, units in factions_to_search.items():
            for unit in units:
                if query in _normalise(unit.get("name", "")):
                    return {**unit, "faction": faction_name}

        # Stub fallback when no data is loaded at all
        if not self._units:
            return self._stub_unit(name)

        return None

    def get_units_matching(self, name: str, faction: str | None = None, limit: int = 9) -> list[dict]:
        """Return up to `limit` units matching name (exact-first, then substring).

        Unlike get_unit() which returns the first match, this returns ALL matches
        up to `limit` so the caller can detect ambiguity and trigger disambiguation.
        """
        query = _normalise(name)

        factions_to_search = (
            {faction: self._units[faction]}
            if faction and faction in self._units
            else self._units
        )

        results: list[dict] = []
        seen: set[tuple] = set()

        # 1. Exact normalised matches first
        for faction_name, units in factions_to_search.items():
            for unit in units:
                if _normalise(unit.get("name", "")) == query:
                    key = (unit.get("name", ""), faction_name)
                    if key not in seen:
                        seen.add(key)
                        results.append({**unit, "faction": faction_name})
                        if len(results) >= limit:
                            return results

        # 2. Substring matches (not already found by exact pass)
        for faction_name, units in factions_to_search.items():
            for unit in units:
                u_norm = _normalise(unit.get("name", ""))
                if query in u_norm:
                    key = (unit.get("name", ""), faction_name)
                    if key not in seen:
                        seen.add(key)
                        results.append({**unit, "faction": faction_name})
                        if len(results) >= limit:
                            return results

        return results

    # ─── Query: combat math ────────────────────────────────────────────────────

    def get_combat_math(self, attacker: str, defender: str) -> dict:
        """Calculate hit/wound/kill probabilities.

        STUB — full dice math engine will be wired here.
        Currently returns placeholder values.
        """
        att_unit = self.get_unit(attacker) if attacker else None
        def_unit = self.get_unit(defender) if defender else None

        return {
            "Attacker":         att_unit.get("name", attacker) if att_unit else attacker,
            "Defender":         def_unit.get("name", defender) if def_unit else defender,
            "Hit probability":  "—",
            "Wound probability":"—",
            "Kill probability": "—",
            "Note":             "Combat math engine not yet wired. Stat sheets loaded.",
        }

    # ─── Query: rules ─────────────────────────────────────────────────────────

    def get_rule(self, term: str) -> dict | None:
        """Look up a rule or keyword by name (normalised match)."""
        key = _normalise(term)

        # Exact match
        if key in self._rules:
            return self._rules[key]

        # Substring match
        for rule_key, rule in self._rules.items():
            if key in rule_key:
                return rule

        # Stub fallback when no rules loaded
        if not self._rules:
            return self._stub_rule(term)

        return None

    # ─── Query: faction units ─────────────────────────────────────────────────

    def get_faction_units(self, faction_query: str) -> tuple:
        """Return (matched_faction_name, units_list) for the given faction query.

        Tries exact match first, then substring match.
        Returns (None, []) if no faction data is loaded or faction not found.
        """
        query = _normalise(faction_query)

        # Exact normalised match
        for faction_name in self._units:
            if _normalise(faction_name) == query:
                return faction_name, self._units[faction_name]

        # Substring match
        for faction_name in self._units:
            if query in _normalise(faction_name):
                return faction_name, self._units[faction_name]

        return None, []

    def get_stub_detachments(self, faction_label: str) -> list:
        """Return a single stub detachment entry for a faction."""
        return [
            {
                "name":        "Detachment Rules",
                "description": (
                    f"Detachment data for '{faction_label}' not yet loaded. "
                    "Add detachment JSON to data/combat_terminal/data/detachments/."
                ),
                "rules": [
                    {
                        "name":        "Data Pending",
                        "description": "Full detachment rules will appear here once data is loaded.",
                    }
                ],
                "_stub": True,
            }
        ]

    def get_stub_stratagems(self, faction_label: str) -> list:
        """Return a single stub stratagem entry for a faction."""
        return [
            {
                "name":       "Stratagem Data Pending",
                "cost":       "?CP",
                "detachment": "—",
                "when":       "Stratagem data not yet loaded.",
                "target":     "",
                "effect":     (
                    f"Add stratagem data for '{faction_label}' to "
                    "data/combat_terminal/data/stratagems/ to see full entries."
                ),
                "phase":  "",
                "_stub":  True,
            }
        ]

    # ─── Query: threats ───────────────────────────────────────────────────────

    def get_threats(self, enemy_faction: str) -> list[dict]:
        """Return threat list for an enemy faction.

        STUB — full threat scoring will be wired here.
        """
        query = _normalise(enemy_faction)

        # Find best matching faction
        matched_faction = None
        for faction_name in self._units:
            if query in _normalise(faction_name):
                matched_faction = faction_name
                break

        units = self._units.get(matched_faction, []) if matched_faction else []
        if not units:
            return [{
                "name":         "No data",
                "threat_level": "—",
                "reason":       f"Faction '{enemy_faction}' not found in loaded data.",
            }]

        return [
            {
                "name":         unit.get("name", "Unknown"),
                "threat_level": "—",
                "reason":       "Threat scoring not yet implemented.",
            }
            for unit in units[:15]
        ]

    # ─── Query: list ──────────────────────────────────────────────────────────

    def get_list(self, list_type: str, filter_text: str = "", faction: str | None = None, keywords: list | None = None) -> dict:
        """Return a structured list for the given type and optional filter.

        keywords — list of keyword flag strings extracted from --flags, e.g. ["deepstrike", "blast"].
                   Each flag is checked against the full unit JSON (normalised lowercase) using a
                   built-in alias map so --deepstrike matches "deep strike" in unit keyword arrays.
        """
        filter_q = _normalise(filter_text) if filter_text else None

        # Resolve faction by fuzzy match so "tau" finds the "tau" key even if stored differently
        resolved_faction = None
        if faction:
            faction_q = _normalise(faction)
            for fn in self._units:
                if faction_q in _normalise(fn):
                    resolved_faction = fn
                    break

        factions_to_search = (
            {resolved_faction: self._units[resolved_faction]}
            if resolved_faction
            else self._units
        )

        if list_type in ("factions", "faction"):
            items = sorted(self._units.keys())
            if filter_q:
                items = [f for f in items if filter_q in _normalise(f)]
            # Pretty-print faction names
            items = [f.replace("_", " ").title() for f in items]
            return {"type": "factions", "items": items}

        elif list_type in ("units", "unit"):
            # Expand keyword flag aliases to searchable strings
            KW_ALIAS: dict[str, str] = {
                "blast":         "blast",
                "deepstrike":    "deep strike",
                "deep":          "deep strike",
                "heavy":         "heavy",
                "twinlinked":    "twin-linked",
                "twin":          "twin-linked",
                "rapid":         "rapid fire",
                "rapidfire":     "rapid fire",
                "lethal":        "lethal hits",
                "lethalhi":      "lethal hits",
                "dev":           "devastating wounds",
                "devastating":   "devastating wounds",
                "devwounds":     "devastating wounds",
                "fly":           "fly",
                "scouts":        "scouts",
                "infiltrators":  "infiltrators",
                "stealth":       "stealth",
            }
            expanded_kws = [KW_ALIAS.get(k.lower(), k.lower()) for k in (keywords or [])]

            results = []
            for faction_name, units in factions_to_search.items():
                for unit in units:
                    # Build a targeted search string: name + faction + keywords + ability names only.
                    # This avoids false positives from analysis fields like tau_counterplay.
                    unit_keywords = unit.get("keywords", []) or []
                    faction_kws   = unit.get("faction_keywords", []) or []
                    ability_names = [a.get("name", "") for a in (unit.get("abilities", []) or [])]
                    weapon_names  = [w.get("name", "") for w in (unit.get("weapons", []) or [])]
                    search_blob   = _normalise(" ".join([
                        unit.get("name", ""),
                        faction_name,
                        *unit_keywords,
                        *faction_kws,
                        *ability_names,
                        *weapon_names,
                    ]))
                    if filter_q and filter_q not in search_blob:
                        continue
                    # For keyword flag filters, also search the full JSON so rules text is checked
                    # (e.g. "deep strike" may appear in ability description, not just keyword list)
                    unit_json = _normalise(json.dumps(unit))
                    if expanded_kws and not all(kw in unit_json for kw in expanded_kws):
                        continue
                    # Include stats for rich list display
                    stats = unit.get("stats", {}) if isinstance(unit.get("stats"), dict) else {}
                    results.append({
                        "name":      unit.get("name", "?"),
                        "faction":   faction_name,
                        "T":         unit.get("T") or stats.get("T") or "—",
                        "W":         unit.get("W") or stats.get("W") or "—",
                        "Sv":        unit.get("Sv") or stats.get("Sv") or "—",
                        "points":    unit.get("points") or unit.get("points_per_model") or "—",
                        "abilities": unit.get("abilities", []),
                    })
            return {"type": "units", "items": results}

        elif list_type in ("weapons", "weapon"):
            results = []
            for faction_name, units in factions_to_search.items():
                for unit in units:
                    for weapon in unit.get("weapons", []):
                        weapon_str = str(weapon)
                        if not filter_q or filter_q in _normalise(weapon_str):
                            results.append({
                                "unit":    unit.get("name", "?"),
                                "weapon":  weapon_str,
                                "faction": faction_name,
                            })
            return {"type": "weapons", "items": results}

        else:
            return {
                "type":  list_type,
                "items": [],
                "error": f"Unknown list type '{list_type}'. Valid: units, weapons, factions.",
            }

    # ─── Query: stratagems ────────────────────────────────────────────────────

    def get_stratagem(self, name: str, detachment: str | None = None) -> dict | None:
        """Look up a stratagem by name (partial match). Stub until data is loaded."""
        query = _normalise(name)
        # Search loaded stratagems once that data layer exists
        stratagems = getattr(self, "_stratagems", {})
        for key, s in stratagems.items():
            if query in key:
                if detachment and _normalise(detachment) not in _normalise(s.get("detachment", "")):
                    continue
                return s
        # Stub fallback
        return self._stub_stratagem(name, detachment)

    # ─── Query: abilities ─────────────────────────────────────────────────────

    def get_ability(self, name: str) -> dict | None:
        """Look up an ability by name (partial match). Stub until data is loaded."""
        query = _normalise(name)
        abilities = getattr(self, "_abilities", {})
        for key, a in abilities.items():
            if query in key:
                return a
        return self._stub_ability(name)

    # ─── Query: enhancements ──────────────────────────────────────────────────

    def get_enhancement(self, name: str, detachment: str | None = None) -> dict | None:
        """Look up an enhancement by name (partial match). Stub until data is loaded."""
        query = _normalise(name)
        enhancements = getattr(self, "_enhancements", {})
        for key, e in enhancements.items():
            if query in key:
                if detachment and _normalise(detachment) not in _normalise(e.get("detachment", "")):
                    continue
                return e
        return self._stub_enhancement(name, detachment)

    # ─── Query: missions ──────────────────────────────────────────────────────

    def get_mission(self, name: str, source: str | None = None) -> dict | None:
        """Look up a mission by name (partial match). Stub until data is loaded."""
        query = _normalise(name)
        missions = getattr(self, "_missions", {})
        for key, m in missions.items():
            if query in key:
                if source and _normalise(source) not in _normalise(m.get("source", "")):
                    continue
                return m
        return self._stub_mission(name, source)

    # ─── Stubs ────────────────────────────────────────────────────────────────

    @staticmethod
    def _stub_unit(name: str) -> dict:
        return {
            "name":      name,
            "M":         "6\"",
            "T":         "4",
            "Sv":        "3+",
            "W":         "2",
            "Ld":        "6+",
            "OC":        "1",
            "weapons":   ["Bolter  24\"  A:2  BS:3+  S:4  AP:0  D:1"],
            "abilities": ["And They Shall Know No Fear"],
            "keywords":  ["Infantry", "Adeptus Astartes"],
            "points":    20,
            "_stub":     True,
            "faction":   "stub",
        }

    @staticmethod
    def _stub_rule(term: str) -> dict:
        return {
            "name":        term,
            "type":        "Keyword",
            "description": f"Rule definition for '{term}' not yet loaded. Add data to data/rules/rules.json.",
            "_stub":       True,
        }

    @staticmethod
    def _stub_stratagem(name: str, detachment: str | None = None) -> dict:
        return {
            "name":       name,
            "cost":       "?CP",
            "detachment": detachment or "—",
            "faction":    "",
            "when":       "Stratagem data not yet loaded.",
            "target":     "Add stratagem data to data/combat_terminal/data/stratagems/.",
            "effect":     "Once stratagem data is loaded, full When / Target / Effect will display here.",
            "phase":      "",
            "source":     "",
            "_stub":      True,
        }

    @staticmethod
    def _stub_ability(name: str) -> dict:
        return {
            "name":        name,
            "description": f"Ability data for '{name}' not yet loaded. Add ability data to the faction dossiers.",
            "units":       [],
            "phase":       "",
            "source":      "",
            "_stub":       True,
        }

    @staticmethod
    def _stub_enhancement(name: str, detachment: str | None = None) -> dict:
        return {
            "name":       name,
            "points":     "?pts",
            "detachment": detachment or "—",
            "faction":    "",
            "description": f"Enhancement data for '{name}' not yet loaded. Add data to the faction dossiers.",
            "links":      [],
            "_stub":      True,
        }

    @staticmethod
    def _stub_mission(name: str, source: str | None = None) -> dict:
        return {
            "name":          name,
            "type":          "Primary",
            "source":        source or "—",
            "size":          "—",
            "deployment":    "—",
            "description":   f"Mission data for '{name}' not yet loaded. Add data to data/combat_terminal/data/missions/.",
            "scoring":       [{"header": "Primary Scoring", "text": "Scoring data not yet loaded."}],
            "mission_rules": [],
            "tip":           "Add mission data to see full details.",
            "_stub":         True,
        }
