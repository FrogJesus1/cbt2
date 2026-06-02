"""
Command Registry — single source of truth for all Combat Terminal commands.

Imported by:
  - data/combat_terminal/engine.py  (schema export + parse_command)
  - render/cli/terminal.py          (tab completion + help display)

The web frontend fetches the schema via GET /api/engines/{name}/schema
and the full token list via GET /api/engines/{name}/commands.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


# ─── Data types ────────────────────────────────────────────────────────────────

@dataclass
class Param:
    type: str           # "string" | "number" | "boolean"
    required: bool
    description: str
    example: str = ""


@dataclass
class Command:
    name: str
    description: str
    usage: str
    group: str          # "data" | "math" | "analysis" | "rules" | "session" | "meta" | "navigation"
    aliases: list[str] = field(default_factory=list)
    params: dict[str, Param] = field(default_factory=dict)
    examples: list[str] = field(default_factory=list)
    stub: bool = False  # True = defined but not yet implemented
    supports_cli: bool = True  # False = web-only (navigation, UI control commands)


# ─── Registry ──────────────────────────────────────────────────────────────────

REGISTRY: dict[str, Command] = {

    # ── Data ──────────────────────────────────────────────────────────────────

    "spec": Command(
        name="spec",
        description="Display the full stat sheet for a unit",
        usage="spec <unit name>",
        group="data",
        aliases=["unit", "datasheet"],
        params={
            "name":    Param("string", True,  "Unit name (partial match supported)", "broadside"),
            "faction": Param("string", False, "Filter by faction", "tau"),
        },
        examples=[
            "spec broadside",
            "spec riptide",
            "spec crisis suits",
            "spec intercessors --faction space_marines",
        ],
    ),

    "list": Command(
        name="list",
        description="List or search units, weapons, factions, or stratagems",
        usage="list <units|weapons|factions|stratagems> [keyword] [--faction <name>] [--blast] [--deepstrike] [--heavy] [--twinlinked]",
        group="data",
        aliases=["search"],
        params={
            "type":     Param("string", True,  "What to list: units | weapons | factions | stratagems", "units"),
            "filter":   Param("string", False, "Keyword to filter by", "fly"),
            "faction":  Param("string", False, "Restrict to one faction", "tau"),
            "keywords": Param("string", False, "Unit keyword filters: --blast --deepstrike --heavy --twinlinked --rapid --fly", "--deepstrike"),
        },
        examples=[
            "list units",
            "list units tau",
            "list units deep strike --faction tau",
            "list units --blast",
            "list units --deepstrike tyranids",
            "list units --heavy dark angels",
            "list weapons blast",
            "list weapons melta --faction space_marines",
            "list factions",
        ],
    ),

    # ── Math ──────────────────────────────────────────────────────────────────

    "combat": Command(
        name="combat",
        description="Calculate hit/wound/kill probabilities between two units",
        usage="<attacker> vs <defender>  |  combat <attacker> vs <defender>",
        group="math",
        aliases=["vs"],
        params={
            "attacker": Param("string", True, "Attacking unit name", "broadside"),
            "defender": Param("string", True, "Defending unit name", "intercessors"),
        },
        examples=[
            "broadside vs intercessors",
            "riptide vs carnifex",
            "crisis suits vs terminators",
            "combat hammerhead vs land raider",
        ],
    ),

    "dice": Command(
        name="dice",
        description="Roll dice — supports NdN, NdN+M, reroll N, explode",
        usage="dice <NdN[+/-M]> [reroll <N>] [explode]",
        group="math",
        aliases=["roll"],
        params={
            "expression": Param("string", True, "Dice expression", "2d6"),
        },
        examples=[
            "dice 2d6",
            "dice 3d6+2",
            "dice 4d6 reroll 1",
            "dice 2d6 explode",
        ],
    ),

    "rerun": Command(
        name="rerun",
        description="Re-run the last combat simulation with modifier changes — toggle flags on or off",
        usage="rerun [--<modifier> [null]]",
        group="math",
        aliases=[],
        params={
            "mods": Param(
                "string", False,
                "Modifier changes: --<flag> to enable, --<flag> null to disable",
                "--lethal null",
            ),
        },
        examples=[
            "rerun --lethal null",
            "rerun --cover",
            "rerun --lethal null --ml",
            "rerun --invuln 4",
        ],
    ),

    # ── Analysis ──────────────────────────────────────────────────────────────

    "threat": Command(
        name="threat",
        description="Analyze threat level of enemy units relative to your faction",
        usage="threat [faction]",
        group="analysis",
        aliases=["threats"],
        params={
            "faction": Param("string", False, "Enemy faction name (optional if already set)", "space_marines"),
        },
        examples=[
            "threat space marines",
            "threat tau",
            "threat tyranids",
            "threat",
        ],
    ),

    "analyze": Command(
        name="analyze",
        description="Deep threat analysis for a unit — 5-metric bar chart + top counter picks",
        usage="analyze <unit name> [--no-counters]",
        group="analysis",
        aliases=["analyse", "counter"],
        params={
            "name":        Param("string", True,  "Unit name (partial match supported)", "hierophant"),
            "no_counters": Param("boolean", False, "Hide the counter block", ""),
        },
        examples=[
            "analyze hierophant",
            "analyze riptide",
            "analyze land raider --no-counters",
            "counter carnifex",
        ],
    ),

    # ── Rules ─────────────────────────────────────────────────────────────────

    "rule": Command(
        name="rule",
        description="Look up a rule or keyword — name, source, description, related rules",
        usage="rule <term>",
        group="rules",
        aliases=["rules"],
        params={
            "term": Param("string", True, "Rule name or keyword", "fly"),
        },
        examples=[
            "rule fly",
            "rule devastating wounds",
            "rule lethal hits",
            "rule feel no pain",
        ],
    ),

    "stratagem": Command(
        name="stratagem",
        description="Look up a stratagem — cost, detachment, when / target / effect",
        usage="stratagem <name>",
        group="rules",
        aliases=["strat"],
        params={
            "name":       Param("string", True,  "Stratagem name (partial match supported)", "photon grenades"),
            "detachment": Param("string", False, "Filter by detachment", "kauyon"),
        },
        examples=[
            "stratagem photon grenades",
            "stratagem strike fast",
            "strat kauyon",
        ],
    ),

    "ability": Command(
        name="ability",
        description="Look up an ability — text and units that carry it",
        usage="ability <name>",
        group="rules",
        aliases=["ab", "abilities"],
        params={
            "name": Param("string", True, "Ability name (partial match supported)", "and they shall know no fear"),
        },
        examples=[
            "ability and they shall know no fear",
            "ability for the greater good",
            "ab objective secured",
            "ab feel no pain",
        ],
    ),

    "enhancement": Command(
        name="enhancement",
        description="Look up an enhancement — points, detachment, rules text",
        usage="enhancement <name>",
        group="rules",
        aliases=["enhance"],
        params={
            "name":       Param("string", True,  "Enhancement name (partial match supported)", "supernova launcher"),
            "detachment": Param("string", False, "Filter by detachment", "experimental prototype cadre"),
        },
        examples=[
            "enhancement supernova launcher",
            "enhancement warlord trait",
            "enhance adaptive",
        ],
    ),

    "detachment": Command(
        name="detachment",
        description="Show all detachment rules for a faction — name, rule text, enhancement and stratagem counts",
        usage="detachment [faction]",
        group="rules",
        aliases=["detachments"],
        params={
            "faction": Param("string", False, "Faction name (uses session faction if omitted)", "tau"),
        },
        examples=[
            "detachment tau",
            "detachment space marines",
            "detachment tyranids",
            "detachment",
        ],
    ),

    "army_rules": Command(
        name="army_rules",
        description="Show faction-level special rules that apply to every model in the army",
        usage="army_rules [faction]",
        group="rules",
        aliases=["army rules", "faction rules"],
        params={
            "faction": Param("string", False, "Faction name (uses session faction if omitted)", "tau"),
        },
        examples=[
            "army_rules tau",
            "army rules space marines",
            "army_rules necrons",
            "army_rules",
        ],
    ),

    "mission": Command(
        name="mission",
        description="Look up a mission — type, deployment, scoring, rules, tip",
        usage="mission <name>",
        group="rules",
        aliases=["missions"],
        params={
            "name":   Param("string", True,  "Mission name (partial match supported)", "purge the foe"),
            "source": Param("string", False, "Filter by source pack", "leviathan"),
        },
        examples=[
            "mission purge the foe",
            "mission scorched earth",
            "mission take and hold",
            "missions leviathan",
        ],
    ),

    # ── Session ───────────────────────────────────────────────────────────────

    "faction": Command(
        name="faction",
        description="Set your own (player) faction for this session — unit lookups will prefer this faction",
        usage="faction <faction name>",
        group="session",
        aliases=[],
        params={
            "name": Param("string", True, "Player faction name", "tau"),
        },
        examples=[
            "faction tau",
            "faction space marines",
            "faction tyranids",
        ],
    ),

    "enemy": Command(
        name="enemy",
        description="Set the active enemy faction for this session",
        usage="enemy <faction name>",
        group="session",
        aliases=[],
        params={
            "name": Param("string", True, "Enemy faction name", "tau"),
        },
        examples=[
            "enemy tau",
            "enemy space marines",
            "enemy tyranids",
        ],
    ),

    "roster": Command(
        name="roster",
        description="Show, load, or manage your army roster",
        usage="roster [my|enemy]",
        group="session",
        params={
            "side": Param("string", False, "Whose roster: my or enemy", "my"),
        },
        examples=["roster", "roster my", "roster enemy"],
    ),

    # ── Virtual filesystem — Rosters ───────────────────────────────────────

    "rosters": Command(
        name="rosters",
        description="List all saved rosters grouped by faction  (virtual filesystem)",
        usage="rosters",
        group="session",
        aliases=["list roster", "list rosters"],
        params={},
        examples=["rosters", "list roster"],
        supports_cli=False,  # localStorage is browser-only
    ),

    "load_roster": Command(
        name="load_roster",
        description="Load a saved roster and assign it as Player or Enemy for this session",
        usage="load roster [name]",
        group="session",
        aliases=[],
        params={
            "name": Param("string", False, "Roster name (partial match supported)", "green-tide"),
        },
        examples=["load roster green-tide", "load roster"],
        supports_cli=False,
    ),

    "upload_roster": Command(
        name="upload_roster",
        description="Paste or drop roster text into the terminal — triggers the save flow (faction → name → save)",
        usage="upload roster",
        group="session",
        aliases=[],
        params={},
        examples=["upload roster"],
        supports_cli=False,
    ),

    "save": Command(
        name="save",
        description="Save pending roster edits to the virtual filesystem",
        usage="save",
        group="session",
        aliases=[],
        params={},
        examples=["save"],
        supports_cli=False,
    ),

    # ── Virtual filesystem — Campaigns ─────────────────────────────────────

    "campaigns": Command(
        name="campaigns",
        description="List all saved campaigns  (virtual filesystem)",
        usage="campaigns",
        group="session",
        aliases=["list campaign", "list campaigns"],
        params={},
        examples=["campaigns"],
        supports_cli=False,
    ),

    "load_campaign": Command(
        name="load_campaign",
        description="Load a saved campaign and view its state",
        usage="load campaign [name]",
        group="session",
        aliases=[],
        params={
            "name": Param("string", False, "Campaign name", "octarius-war"),
        },
        examples=["load campaign octarius-war", "load campaign"],
        supports_cli=False,
    ),

    "new_campaign": Command(
        name="new_campaign",
        description="Create a new campaign folder in the virtual filesystem",
        usage="new campaign",
        group="session",
        aliases=[],
        params={},
        examples=["new campaign"],
        supports_cli=False,
    ),

    "session": Command(
        name="session",
        description="Show current session state — factions, rosters, turn",
        usage="session",
        group="session",
        aliases=["state"],
        params={},
        examples=["session"],
    ),

    "nextturn": Command(
        name="nextturn",
        description="Advance to the next battle round",
        usage="nextturn",
        group="session",
        aliases=["next", "turn"],
        params={},
        examples=["nextturn"],
    ),

    # ── Theme ─────────────────────────────────────────────────────────────────
    # theme and unlock theme are handled client-side in Terminal.jsx.
    # Registered here so they appear in tab completion and help.

    "theme": Command(
        name="theme",
        description="Apply a UI theme (locked themes require solving their challenge first)",
        usage="theme [name|reset]",
        group="meta",
        aliases=[],
        params={
            "name": Param("string", False, "Theme name: default, red, or an unlocked theme", "red"),
        },
        examples=["theme", "theme red", "theme default", "theme reset", "theme mainframe"],
        supports_cli=False,
    ),

    "themes": Command(
        name="themes",
        description="Browse the theme directory — see unlock status and attempt challenges",
        usage="themes",
        group="meta",
        aliases=["theme list", "theme dir"],
        params={},
        examples=["themes", "theme list"],
        supports_cli=False,
    ),

    "unlock_theme": Command(
        name="unlock_theme",
        description="Attempt to unlock a hidden theme by solving a logic challenge",
        usage="unlock theme",
        group="meta",
        aliases=["unlock theme"],
        params={},
        examples=["unlock theme"],
        supports_cli=False,
    ),

    # ── Math Mode ─────────────────────────────────────────────────────────────
    # Handled client-side in Terminal.jsx (Priority 7.2).  Registered here for
    # tab completion and help.  The backend also accepts this command and returns
    # a confirmation text for CLI parity.

    "mathmode": Command(
        name="mathmode",
        description="Toggle Math Mode — replay the full mathematical reasoning after each command",
        usage="math [on|off]",
        group="meta",
        aliases=["math"],
        params={
            "state": Param("string", False, "on | off  (omit to show current status)", "on"),
        },
        examples=[
            "math on",
            "math off",
            "mathmode on",
            "mathmode",
        ],
    ),

    # ── Meta ──────────────────────────────────────────────────────────────────

    "help": Command(
        name="help",
        description="Show help for a command or module",
        usage="help [command]",
        group="meta",
        aliases=["?"],  # "h" removed — now mapped to "home" (navigation)
        params={
            "topic": Param("string", False, "Command or module name", "spec"),
        },
        examples=["help", "help spec", "help threat", "help rules"],
    ),

    "status": Command(
        name="status",
        description="Show engine status and loaded data summary",
        usage="status",
        group="meta",
        aliases=[],
        params={},
        examples=["status"],
    ),

    "issues": Command(
        name="issues",
        description="Report commands that are still returning stubs — shows what data is missing",
        usage="issues",
        group="meta",
        aliases=["stubs", "missing"],
        params={},
        examples=["issues"],
    ),

    "legend": Command(
        name="legend",
        description="Show the abbreviation key for all stat columns, probability chain fields, and modifier flags",
        usage="legend",
        group="meta",
        aliases=["key", "abbrev", "glossary"],
        params={},
        examples=["legend"],
    ),

    "clear": Command(
        name="clear",
        description="Clear the terminal output",
        usage="clear",
        group="meta",
        aliases=["cls"],
        params={},
        examples=["clear"],
    ),

    "history": Command(
        name="history",
        description="Show recent command history (also: arrow keys in terminal)",
        usage="history",
        group="meta",
        aliases=["hist"],
        params={},
        examples=["history"],
    ),

    # ── Navigation (web only — disabled in CLI builds) ─────────────────────────
    # These commands control view routing and terminal output.  They are parsed
    # client-side by Terminal.jsx before reaching the engine, so the engine never
    # sees them.  They are registered here so tab-completion and `help` work.

    "home": Command(
        name="home",
        description="Navigate to the home terminal view",
        usage="home",
        group="navigation",
        aliases=["h"],
        supports_cli=False,
        examples=["home"],
    ),

    "units": Command(
        name="units",
        description="Navigate to the unit database browser",
        usage="units",
        group="navigation",
        aliases=["u"],
        supports_cli=False,
        examples=["units"],
    ),

    "rules": Command(
        name="rules",
        description="Navigate to the rules lookup panel",
        usage="rules",
        group="navigation",
        aliases=["r"],
        supports_cli=False,
        examples=["rules"],
    ),

    "campaign": Command(
        name="campaign",
        description="Navigate to campaign mode",
        usage="campaign",
        group="navigation",
        aliases=["c"],
        supports_cli=False,
        examples=["campaign"],
    ),

    "demo": Command(
        name="demo",
        description="Navigate to the demo / component showcase",
        usage="demo",
        group="navigation",
        aliases=["d"],
        supports_cli=False,
        examples=["demo"],
    ),

    "settings": Command(
        name="settings",
        description="Open the hidden settings terminal (no visible tab — command only)",
        usage="settings",
        group="navigation",
        aliases=[],
        supports_cli=False,
        examples=["settings"],
    ),

    "diag": Command(
        name="diag",
        description="Open the Engine Diagnostics dashboard — simulation status, data integrity grid, pipeline health",
        usage="diag",
        group="navigation",
        aliases=["diagnostics", "status-page"],
        supports_cli=False,
        examples=["diag"],
    ),

    "back": Command(
        name="back",
        description="Go back to the previous view in navigation history",
        usage="back",
        group="navigation",
        aliases=[],
        supports_cli=False,
        examples=["back"],
    ),

    "forward": Command(
        name="forward",
        description="Go forward to the next view in navigation history",
        usage="forward",
        group="navigation",
        aliases=["fwd"],
        supports_cli=False,
        examples=["forward"],
    ),

    "delete": Command(
        name="delete",
        description="Remove the last output block from the terminal (stack-based undo)",
        usage="delete",
        group="navigation",
        aliases=["del"],
        supports_cli=False,
        examples=["delete", "delete", "delete"],
    ),

    # ── Roster edit sub-commands (client-side, web-only) ───────────────────

    "rename_roster": Command(
        name="rename_roster",
        description="Rename a saved roster",
        usage="rename roster <name>",
        group="session",
        aliases=[],
        params={"name": Param("string", True, "Current roster name", "green-tide")},
        examples=["rename roster green-tide"],
        supports_cli=False,
    ),

    "edit_roster": Command(
        name="edit_roster",
        description="Overwrite a roster's content by pasting new text",
        usage="edit roster <name>",
        group="session",
        aliases=[],
        params={"name": Param("string", True, "Roster name", "green-tide")},
        examples=["edit roster green-tide"],
        supports_cli=False,
    ),

    "delete_roster": Command(
        name="delete_roster",
        description="Delete a saved roster from the virtual filesystem",
        usage="delete roster <name>",
        group="session",
        aliases=[],
        params={"name": Param("string", True, "Roster name", "green-tide")},
        examples=["delete roster green-tide"],
        supports_cli=False,
    ),
}

# ── Group display order ────────────────────────────────────────────────────────

GROUP_ORDER = ["data", "math", "analysis", "rules", "session", "meta", "navigation"]

GROUP_LABELS = {
    "data":       "Data",
    "math":       "Combat Math",
    "analysis":   "Analysis",
    "rules":      "Rules",
    "session":    "Session",
    "meta":       "Terminal",
    "navigation": "Navigation (Web UI only)",
}

# ── Alias resolution ──────────────────────────────────────────────────────────

ALIAS_MAP: dict[str, str] = {}

for _name, _cmd in REGISTRY.items():
    ALIAS_MAP[_name] = _name
    for _alias in _cmd.aliases:
        ALIAS_MAP[_alias.lower()] = _name


def resolve(token: str) -> Optional[str]:
    """Resolve a command name or alias → canonical name. None if not found."""
    return ALIAS_MAP.get(token.lower())


def all_tokens() -> list[str]:
    """All command names + aliases sorted — for tab completion."""
    return sorted(ALIAS_MAP.keys())


# ── Schema export ─────────────────────────────────────────────────────────────

def to_schema() -> dict:
    """Convert registry to the EngineBase schema() wire format."""
    queries = {}
    for name, cmd in REGISTRY.items():
        queries[name] = {
            "description":  cmd.description,
            "usage":        cmd.usage,
            "aliases":      cmd.aliases,
            "group":        cmd.group,
            "supports_cli": cmd.supports_cli,
            "params": {
                p: {
                    "type":        pdef.type,
                    "required":    pdef.required,
                    "description": pdef.description,
                    "example":     pdef.example,
                }
                for p, pdef in cmd.params.items()
            },
            "examples": cmd.examples,
            "stub":     cmd.stub,
            # legacy compat field expected by some consumers
            "example": cmd.examples[0] if cmd.examples else name,
        }
    return {"queries": queries}
