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

    # Category tags whose `name` field is the tag type and `summary` is the ability name.
    _CATEGORY_TAGS = frozenset({"CORE", "FACTION", "CHARACTER"})

    def __init__(self):
        self._units:        dict[str, list]  = {}   # faction_name → [unit, ...]
        self._rules:        dict[str, dict]  = {}   # keyword_lower → rule dict
        self._rule_related: dict[str, list]  = {}   # rule_id → [related rule names]
        self._abilities:    dict[str, dict]  = {}   # ability_name_lower → ability dict
        self._stratagems:   dict[str, dict]  = {}   # norm_name_lower → stratagem dict
        self._enhancements: dict[str, dict]  = {}   # norm_name_lower → enhancement dict
        self._missions:     dict[str, dict]  = {}   # norm_name_lower → mission dict
        self._detachments:  dict[str, list]  = {}   # faction_key → [detachment_dict, ...]
        self._army_rules:   dict[str, list]  = {}   # faction_key → [rule_dict, ...]
        self._loaded:       bool             = False
        self._errors:       list[str]        = []

        # Lazy loading support
        self._faction_dossier_paths: dict[str, Path] = {}  # faction_key → dossier path
        self._loaded_factions: set[str] = set()             # which factions have been loaded

    # ─── Load ──────────────────────────────────────────────────────────────────

    def load(self):
        """Discover factions and load non-faction data. Safe to call multiple times (idempotent).

        Faction data is loaded lazily on first access via _ensure_faction_loaded().
        """
        if self._loaded:
            return
        self._discover_factions()   # fast — just records paths
        self._load_rules()          # rules are not per-faction
        self._load_missions()       # missions are not per-faction
        self._loaded = True

    # ─── Lazy faction loading ─────────────────────────────────────────────────

    def _discover_factions(self):
        """Scan the factions directory and record dossier paths without loading them.

        This replaces the old _load_units() for the discovery phase — same directory
        scanning logic but only records paths instead of parsing JSON.
        """
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
                candidates = list(faction_dir.glob("*parsed_dossier*.json"))
                dossier = candidates[0] if candidates else None

            if dossier:
                self._faction_dossier_paths[faction] = dossier

    def _load_faction(self, faction_key: str):
        """Load a single faction dossier and extract ALL data in one pass.

        Extracts: units, stratagems, enhancements, detachments, army rules,
        and abilities — all from one JSON parse.
        """
        if faction_key in self._loaded_factions:
            return

        dossier_path = self._faction_dossier_paths.get(faction_key)
        if not dossier_path:
            return

        try:
            with open(dossier_path, encoding="utf-8") as f:
                raw = json.load(f)
        except Exception as e:
            self._errors.append(f"[{faction_key}] Failed to load {dossier_path.name}: {e}")
            self._loaded_factions.add(faction_key)
            return

        is_list = isinstance(raw, list)

        # ── Units ─────────────────────────────────────────────────────────────
        units_raw = raw if is_list else raw.get("units", [])
        if units_raw:
            self._units[faction_key] = [self._normalise_unit(u) for u in units_raw]

        # Everything below requires dict-format dossiers (not old list-format)
        if not is_list:
            # ── Stratagems ────────────────────────────────────────────────────
            for det in raw.get("detachments", []):
                det_name = det.get("name", "")
                for s in det.get("stratagems", []):
                    if not isinstance(s, dict):
                        continue
                    name = (s.get("name") or "").strip()
                    if not name:
                        continue
                    key = _normalise(name)
                    # First-seen wins (dedup across factions)
                    if key not in self._stratagems:
                        cp_raw = s.get("cp", s.get("cost", "?"))
                        cost_str = (
                            f"{cp_raw}CP" if str(cp_raw).lstrip("-").isdigit()
                            else str(cp_raw)
                        )
                        self._stratagems[key] = {
                            "name":       name,
                            "cost":       cost_str,
                            "type":       s.get("type", ""),
                            "flavour":    s.get("flavour", ""),
                            "when":       s.get("when", ""),
                            "target":     s.get("target", ""),
                            "effect":     s.get("effect", s.get("description", "")),
                            "phase":      s.get("phase", ""),
                            "faction":    faction_key.replace("_", " ").title(),
                            "detachment": det_name,
                            "_stub":      False,
                        }

            # ── Enhancements ──────────────────────────────────────────────────
            for det in raw.get("detachments", []):
                det_name = det.get("name", "")
                for e in det.get("enhancements", []):
                    if not isinstance(e, dict):
                        continue
                    name = (e.get("name") or "").strip()
                    if not name:
                        continue
                    key = _normalise(name)
                    # First-seen wins (dedup across factions)
                    if key not in self._enhancements:
                        pts_raw = e.get("points", e.get("cost", "?"))
                        self._enhancements[key] = {
                            "name":        name,
                            "points":      pts_raw,
                            "description": e.get("description", e.get("effect", e.get("text", ""))),
                            "links":       e.get("applies_to", e.get("units", [])),
                            "faction":     faction_key.replace("_", " ").title(),
                            "detachment":  det_name,
                            "_stub":       False,
                        }

            # ── Detachments ───────────────────────────────────────────────────
            raw_dets = raw.get("detachments", [])
            if raw_dets:
                entries = []
                for det in raw_dets:
                    if not isinstance(det, dict):
                        continue
                    name = (det.get("name") or "").strip()
                    if not name:
                        continue
                    entries.append({
                        "name":         name,
                        "rule_name":    (det.get("detachment_rule") or "").strip(),
                        "description":  (det.get("rule_summary") or det.get("description") or "").strip(),
                        "enhancements": det.get("enhancements", []),
                        "stratagems":   det.get("stratagems", []),
                    })
                if entries:
                    self._detachments[faction_key] = entries

            # ── Army rules ────────────────────────────────────────────────────
            raw_rules = raw.get("army_rules", [])
            if raw_rules:
                entries = []
                for rule in raw_rules:
                    if not isinstance(rule, dict):
                        continue
                    name = (rule.get("name") or "").strip()
                    desc = (rule.get("summary") or rule.get("description") or "").strip()

                    # Skip obvious navigation garbage
                    if _normalise(name) in self._ARMY_RULES_GARBAGE_NORM:
                        continue
                    desc_lower = desc.lower()
                    if any(frag in desc_lower for frag in self._ARMY_RULES_GARBAGE_FRAGMENTS):
                        continue
                    if not name:
                        continue

                    entries.append({
                        "name":        name,
                        "description": desc,
                    })
                if entries:
                    self._army_rules[faction_key] = entries

        # ── Abilities (from loaded units) ─────────────────────────────────────
        faction_units = self._units.get(faction_key, [])
        for unit in faction_units:
            unit_name = unit.get("name", "")
            for ab in unit.get("abilities", []):
                if not isinstance(ab, dict):
                    ab_name = str(ab).strip()
                    ab_desc = ""
                    ab_type = None
                else:
                    raw_name    = (ab.get("name") or "").strip()
                    raw_summary = (
                        ab.get("summary") or ab.get("description") or
                        ab.get("text")    or ab.get("effect") or ""
                    ).strip()
                    if raw_name.upper() in self._CATEGORY_TAGS:
                        ab_name = raw_summary
                        ab_desc = ""
                        ab_type = raw_name.upper()
                    else:
                        ab_name = raw_name
                        ab_desc = raw_summary
                        ab_type = None

                if not ab_name:
                    continue

                ab_key = _normalise(ab_name)
                if ab_key not in self._abilities:
                    self._abilities[ab_key] = {
                        "name":        ab_name,
                        "description": ab_desc,
                        "type":        ab_type,
                        "units":       [],
                        "factions":    [],
                    }
                entry = self._abilities[ab_key]
                if unit_name and unit_name not in entry["units"]:
                    entry["units"].append(unit_name)
                if faction_key not in entry.get("factions", []):
                    entry.setdefault("factions", []).append(faction_key)

        self._loaded_factions.add(faction_key)

    def _ensure_faction_loaded(self, faction_key: str):
        """Load a faction if not already loaded."""
        if faction_key not in self._loaded_factions:
            self._load_faction(faction_key)

    def _ensure_all_loaded(self):
        """Load all discovered factions that haven't been loaded yet."""
        for faction_key in self._faction_dossier_paths:
            self._ensure_faction_loaded(faction_key)

    def _resolve_faction_key(self, faction_query: str) -> str | None:
        """Resolve a fuzzy faction query to a discovered faction key.

        Checks both already-loaded factions (self._units keys) and all
        discovered factions (self._faction_dossier_paths keys).
        Returns the matching faction key, or None if not found.
        """
        query = _normalise(faction_query)
        all_keys = set(self._units.keys()) | set(self._faction_dossier_paths.keys())

        # Exact normalised match
        for key in all_keys:
            if _normalise(key) == query:
                return key

        # Substring match
        for key in all_keys:
            if query in _normalise(key):
                return key

        return None

    # Names / patterns that indicate a garbage army_rules entry scraped from
    # navigation chrome rather than actual rules text.
    _ARMY_RULES_GARBAGE = frozenset({
        "datasheets", "no filter", "no Filter", "pause", "watch on",
    })
    _ARMY_RULES_GARBAGE_NORM = frozenset(
        _normalise(g) for g in _ARMY_RULES_GARBAGE
    )
    _ARMY_RULES_GARBAGE_FRAGMENTS = (
        "factions search this site",
        "search this site",
        "watch on",
        "video channel logo",
        "now playing",
        "books book",
    )

    def _load_missions(self):
        """Load missions from missions.json if it exists in the rules data directory."""
        missions_paths = [
            _INTERNAL / "rules" / "missions.json",
        ]
        for path in missions_paths:
            if not path.exists():
                continue
            try:
                with open(path, encoding="utf-8") as f:
                    raw = json.load(f)
                missions_list = raw if isinstance(raw, list) else raw.get("missions", [])
                for m in missions_list:
                    if not isinstance(m, dict):
                        continue
                    name = (m.get("name") or "").strip()
                    if not name:
                        continue
                    key = _normalise(name)
                    self._missions[key] = m
                return  # first found wins
            except Exception as e:
                self._errors.append(f"Failed to load missions: {e}")

    # _load_units() has been replaced by _discover_factions() + lazy _load_faction()

    def _load_rules(self):
        """Load rules from the first available rules.json, then build the
        related-rules graph from rule_index.json (same directory).

        rules.json shape: {"_meta": ..., "rules": {"id": rule_dict, ...}}
        rule_index.json shape: {"by_mechanic": {"mechanic": [id, ...]}, ...}

        After loading, self._rule_related maps each rule *name* (normalised)
        to a list of related rule *names* — built by collecting all rules in
        the same mechanic group (excluding self) + any explicit 'related' list.
        """
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
            id_to_rule: dict = {}   # rule id → rule dict (for index cross-ref)
            if isinstance(raw_rules, dict):
                id_to_rule = raw_rules
                rules_list = list(raw_rules.values())
            else:
                rules_list = raw_rules

            for rule in rules_list:
                if not isinstance(rule, dict):
                    continue
                key = _normalise(rule.get("name", ""))
                if key:
                    self._rules[key] = rule
                    if not id_to_rule and rule.get("id"):
                        id_to_rule[rule["id"]] = rule

            # ── Build related-rules graph from rule_index.json ─────────────────
            index_path = rules_file.parent / "rule_index.json"
            if not index_path.exists():
                return
            with open(index_path, encoding="utf-8") as f:
                idx = json.load(f)

            by_mechanic: dict[str, list] = idx.get("by_mechanic", {})
            # For each rule, find peers in the same mechanic group
            for rule in rules_list:
                if not isinstance(rule, dict):
                    continue
                rule_id   = rule.get("id", "")
                rule_name = rule.get("name", "")
                mechanic  = rule.get("mechanic", "")
                if not rule_name:
                    continue

                norm_key = _normalise(rule_name)
                related: list[str] = []

                # Peers in same mechanic group
                mechanic_peers = by_mechanic.get(mechanic, [])
                for peer_id in mechanic_peers:
                    # by_mechanic values are plain IDs (e.g. "battle_shock_test")
                    if peer_id == rule_id:
                        continue
                    peer = id_to_rule.get(peer_id)
                    if peer and isinstance(peer, dict):
                        peer_name = peer.get("name", "")
                        if peer_name and peer_name not in related:
                            related.append(peer_name)

                # If no mechanic peers, fall back to multi-tag intersection peers —
                # require at least 2 overlapping tags to avoid noise matches.
                if not related:
                    rule_tags = set(rule.get("tags", []))
                    if len(rule_tags) >= 2:
                        for peer_id, peer in id_to_rule.items():
                            if peer_id == rule_id or not isinstance(peer, dict):
                                continue
                            peer_tags = set(peer.get("tags", []))
                            if len(rule_tags & peer_tags) >= 2:
                                peer_name = peer.get("name", "")
                                if peer_name and peer_name not in related:
                                    related.append(peer_name)
                                if len(related) >= 6:
                                    break

                # Explicit see_also / related in the rule itself
                for r in rule.get("related", rule.get("see_also", [])):
                    if r and r not in related:
                        related.append(r)

                # Cap at 6 for readability
                self._rule_related[norm_key] = related[:6]

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
        self._ensure_all_loaded()
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
                "stratagems":  len(self._stratagems),
                "enhancements":len(self._enhancements),
                "missions":    len(self._missions),
                "abilities":   len(self._abilities),
                "detachment_factions": len(self._detachments),
                "army_rules_factions": len(self._army_rules),
            },
            "per_faction": per_faction,
            "errors": self._errors,
        }

    # ─── Query: unit ───────────────────────────────────────────────────────────

    def get_unit(self, name: str, faction: str | None = None) -> dict | None:
        """Find a unit by name (partial, accent-insensitive). Optionally filter by faction."""
        if faction:
            resolved = self._resolve_faction_key(faction)
            if resolved:
                self._ensure_faction_loaded(resolved)
            else:
                # No matching faction discovered at all
                self._ensure_all_loaded()
        else:
            self._ensure_all_loaded()

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

        # Word-token match — handles singular/plural differences and partial names.
        # Strips common filler words and requires all remaining query tokens to
        # appear anywhere in the unit name (e.g. "beast of nurgle" → "beasts of nurgle").
        _STOP_WORDS = {"of", "the", "a", "an"}
        query_tokens = [t for t in query.split() if t not in _STOP_WORDS] or query.split()
        if query_tokens:
            for faction_name, units in factions_to_search.items():
                for unit in units:
                    u_norm = _normalise(unit.get("name", ""))
                    if all(tok in u_norm for tok in query_tokens):
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
        if faction:
            resolved = self._resolve_faction_key(faction)
            if resolved:
                self._ensure_faction_loaded(resolved)
            else:
                self._ensure_all_loaded()
        else:
            self._ensure_all_loaded()

        query = _normalise(name)

        factions_to_search = (
            {faction: self._units[faction]}
            if faction and faction in self._units
            else self._units
        )

        results: list[dict] = []
        seen: set[tuple] = set()

        def _unit_key(unit: dict, faction_name: str) -> tuple:
            """Build a unique key for a unit.

            Units sharing a name within the same faction (e.g. the three Tau
            COMMANDER variants) are distinguished by their first non-CORE /
            non-FACTION / non-CHARACTER ability name.  This keeps deduplication
            tight while still surfacing all true variants.
            """
            base_name = unit.get("name", "")
            # Find a distinguishing ability (skips generic category tags)
            distinguisher = ""
            for ab in unit.get("abilities", []):
                if isinstance(ab, dict):
                    ab_name = (ab.get("name") or "").strip().upper()
                    if ab_name not in ("CORE", "FACTION", "CHARACTER") and ab_name:
                        distinguisher = ab_name
                        break
            return (base_name, faction_name, distinguisher)

        # 1. Exact normalised matches first
        for faction_name, units in factions_to_search.items():
            for unit in units:
                if _normalise(unit.get("name", "")) == query:
                    key = _unit_key(unit, faction_name)
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
                    key = _unit_key(unit, faction_name)
                    if key not in seen:
                        seen.add(key)
                        results.append({**unit, "faction": faction_name})
                        if len(results) >= limit:
                            return results

        # 3. Word-token matches — handles singular/plural and partial names.
        # e.g. "beast of nurgle" → all of ["beast", "nurgle"] appear in "beasts of nurgle"
        _STOP_WORDS = {"of", "the", "a", "an"}
        query_tokens = [t for t in query.split() if t not in _STOP_WORDS] or query.split()
        if query_tokens:
            for faction_name, units in factions_to_search.items():
                for unit in units:
                    u_norm = _normalise(unit.get("name", ""))
                    if all(tok in u_norm for tok in query_tokens):
                        key = _unit_key(unit, faction_name)
                        if key not in seen:
                            seen.add(key)
                            results.append({**unit, "faction": faction_name})
                            if len(results) >= limit:
                                return results

        return results


    # ─── Query: rules ─────────────────────────────────────────────────────────

    def get_rule(self, term: str) -> dict | None:
        """Look up a rule or keyword by name (normalised match).

        Returns the matched rule dict augmented with a 'related' list built
        from the rule_index mechanic-peer graph loaded at startup.
        """
        key = _normalise(term)

        matched_key = None
        # Exact match
        if key in self._rules:
            matched_key = key
        else:
            # Substring match — prefer shortest key (closest match)
            candidates = [(k, v) for k, v in self._rules.items() if key in k]
            if candidates:
                candidates.sort(key=lambda x: len(x[0]))
                matched_key = candidates[0][0]

        if matched_key:
            rule = dict(self._rules[matched_key])  # shallow copy
            # Inject related-rules graph
            if "related" not in rule or not rule["related"]:
                rule["related"] = self._rule_related.get(matched_key, [])
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
        resolved = self._resolve_faction_key(faction_query)
        if resolved:
            self._ensure_faction_loaded(resolved)

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

    # ─── Query: detachments ───────────────────────────────────────────────────

    def get_detachments(self, faction: str) -> list | None:
        """Return the detachment list for a faction by fuzzy-matching the faction name.

        Returns None if the faction is not found in the loaded index.
        """
        resolved = self._resolve_faction_key(faction)
        if resolved:
            self._ensure_faction_loaded(resolved)

        query = _normalise(faction)

        # Exact key match first
        for key in self._detachments:
            if _normalise(key) == query:
                return self._detachments[key]

        # Substring match
        for key in self._detachments:
            if query in _normalise(key):
                return self._detachments[key]

        return None

    def get_army_rules(self, faction: str) -> list | None:
        """Return the army rules list for a faction by fuzzy-matching the faction name.

        Returns None if the faction is not found in the loaded index.
        """
        resolved = self._resolve_faction_key(faction)
        if resolved:
            self._ensure_faction_loaded(resolved)

        query = _normalise(faction)

        # Exact key match first
        for key in self._army_rules:
            if _normalise(key) == query:
                return self._army_rules[key]

        # Substring match
        for key in self._army_rules:
            if query in _normalise(key):
                return self._army_rules[key]

        return None

    # ─── Query: threats ───────────────────────────────────────────────────────


    # ─── Query: list ──────────────────────────────────────────────────────────

    def get_list(self, list_type: str, filter_text: str = "", faction: str | None = None,
                 keywords: list | None = None, weapon_filter: str | None = None) -> dict:
        """Return a structured list for the given type and optional filter.

        keywords      — list of keyword flag strings extracted from --flags, e.g. ["deepstrike", "blast"].
                        Each flag is checked against the full unit JSON (normalised lowercase) using a
                        built-in alias map so --deepstrike matches "deep strike" in unit keyword arrays.
        weapon_filter — "ranged" or "melee": only include units that have at least one weapon of that type.
        """
        if faction:
            resolved_key = self._resolve_faction_key(faction)
            if resolved_key:
                self._ensure_faction_loaded(resolved_key)
            else:
                self._ensure_all_loaded()
        else:
            self._ensure_all_loaded()

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
                # Unit type keywords
                "character":     "character",
                "battleline":    "battleline",
                "vehicle":       "vehicle",
                "mounted":       "mounted",
                "infantry":      "infantry",
                "monster":       "monster",
                "walker":        "walker",
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
                    # Weapon type filter: only include units with at least one weapon of the requested type
                    if weapon_filter:
                        want_melee = weapon_filter == "melee"
                        has_match = False
                        for w in (unit.get("weapons", []) or []):
                            if isinstance(w, dict):
                                wt = str(w.get("type", "ranged")).lower()
                                wk = str(w.get("keywords", w.get("abilities", ""))).lower()
                                is_melee = "melee" in wt or "melee" in wk
                                if is_melee == want_melee:
                                    has_match = True
                                    break
                        if not has_match:
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
        """Look up a stratagem by name (partial match, accent-insensitive).

        Search order:
          1. Exact normalised key match
          2. Substring match — return the shortest key containing the query

        Returns None if not found (caller decides on stub fallback).
        """
        self._ensure_all_loaded()
        query = _normalise(name)
        if not query:
            return None

        det_q = _normalise(detachment) if detachment else None

        def _det_ok(s: dict) -> bool:
            if not det_q:
                return True
            return det_q in _normalise(s.get("detachment", ""))

        # Exact
        if query in self._stratagems and _det_ok(self._stratagems[query]):
            return self._stratagems[query]

        # Substring — sorted by key length (closest match first)
        candidates = [(k, v) for k, v in self._stratagems.items() if query in k and _det_ok(v)]
        if candidates:
            candidates.sort(key=lambda x: len(x[0]))
            return candidates[0][1]

        # Stub fallback only when nothing is loaded at all
        if not self._stratagems:
            return self._stub_stratagem(name, detachment)
        return None

    # ─── Query: abilities ─────────────────────────────────────────────────────

    def get_ability(self, name: str) -> dict | None:
        """Look up an ability by name (partial match, accent-insensitive).

        Searches the ability index built from all unit abilities.
        Returns the best match or None (never returns a stub — callers decide on fallback).

        Search order:
          1. Exact normalised key match
          2. Substring match (query is a substring of any ability key)
        """
        self._ensure_all_loaded()
        query = _normalise(name)
        if not query:
            return None

        # 1. Exact match
        if query in self._abilities:
            return self._abilities[query]

        # 2. Substring match — find the shortest key that contains the query
        #    (avoids spuriously matching very generic fragments)
        candidates = [(k, v) for k, v in self._abilities.items() if query in k]
        if candidates:
            # Prefer the shortest key (closest match)
            candidates.sort(key=lambda x: len(x[0]))
            return candidates[0][1]

        return None

    # ─── Query: enhancements ──────────────────────────────────────────────────

    def get_enhancement(self, name: str, detachment: str | None = None) -> dict | None:
        """Look up an enhancement by name (partial match, accent-insensitive).

        Returns None if not found (caller decides on stub fallback).
        """
        self._ensure_all_loaded()
        query = _normalise(name)
        if not query:
            return None

        det_q = _normalise(detachment) if detachment else None

        def _det_ok(e: dict) -> bool:
            if not det_q:
                return True
            return det_q in _normalise(e.get("detachment", ""))

        # Exact
        if query in self._enhancements and _det_ok(self._enhancements[query]):
            return self._enhancements[query]

        # Substring
        candidates = [(k, v) for k, v in self._enhancements.items() if query in k and _det_ok(v)]
        if candidates:
            candidates.sort(key=lambda x: len(x[0]))
            return candidates[0][1]

        if not self._enhancements:
            return self._stub_enhancement(name, detachment)
        return None

    # ─── Query: missions ──────────────────────────────────────────────────────

    def get_mission(self, name: str, source: str | None = None) -> dict | None:
        """Look up a mission by name (partial match, accent-insensitive).

        Returns None if not found (caller decides on stub fallback).
        """
        query = _normalise(name)
        if not query:
            return None

        src_q = _normalise(source) if source else None

        def _src_ok(m: dict) -> bool:
            if not src_q:
                return True
            return src_q in _normalise(m.get("source", ""))

        # Exact
        if query in self._missions and _src_ok(self._missions[query]):
            return self._missions[query]

        # Substring
        candidates = [(k, v) for k, v in self._missions.items() if query in k and _src_ok(v)]
        if candidates:
            candidates.sort(key=lambda x: len(x[0]))
            return candidates[0][1]

        if not self._missions:
            return self._stub_mission(name, source)
        return None

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
