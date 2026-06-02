# CT2 Implementation Session Prompts — P1 through P3

Generated: 2026-04-02. Feed each section as a standalone chat to continue from the P0 fixes already shipped.

---

## Context block (paste at the top of EVERY session below)

```
You are working on Combat Terminal 2 (CT2), a Warhammer 40K 10th edition combat probability engine.

Project root: /mnt/combat_terminal_2/
Key files:
  data/combat_terminal/engine.py          ← main query dispatcher
  data/combat_terminal/commands.py        ← command registry (single source of truth)
  data/combat_terminal/loader.py          ← data loader / index builder
  data/combat_terminal/math_adapter.py    ← math bridge (compute_combat, compute_sensitivity)
  data/combat_terminal/combat_math_engine.py ← probability engine (AttackModifiers, WeaponProfile, etc.)
  render/web/src/components/TerminalBlock.jsx ← frontend result renderer (switch on result_type)
  render/web/src/components/Terminal.jsx  ← main terminal shell
  render/web/src/App.jsx                  ← app root
  BACKLOG.md                              ← canonical bug/gap tracker
  CLAUDE.md                               ← project architecture guide

Engine contract (EngineBase): name(), description(), schema(), status(), query()
All commands are registered in commands.py with: group, aliases, params, examples, stub flag, supports_cli.
result_type drives frontend rendering in TerminalBlock.jsx.
Read BACKLOG.md and CLAUDE.md before starting any work.
```

---

## Session A — Detachment & Army Rules commands

**P1 priority. Estimated scope: medium.**

### Goal
Implement two new commands: `detachment` (show full detachment rules for a faction) and `army_rules` (show faction-level special rules). Both are currently stubs that return stub_log. The dossier data already has `detachments[]` and `army_rules[]` arrays on faction files — the work is wiring them into the engine and rendering them.

### Steps

**1. Read these files first:**
- `BACKLOG.md` — find the detachment/army_rules gap entry
- `CLAUDE.md` — architecture overview
- `data/combat_terminal/loader.py` — understand current index-building pattern
- `data/combat_terminal/commands.py` — find `detachment` and `army_rules` command definitions
- `data/combat_terminal/engine.py` — find `_query_detachment` and `_query_army_rules` stub methods
- Pick one faction dossier file (e.g. `data/combat_terminal/data/tau/tau.json`) and read 30–40 lines around the `detachments` and `army_rules` keys to understand the exact data shape.

**2. In `loader.py`:** Add `_build_detachment_index()` method following the same pattern as `_build_stratagem_index()`. Index should map `faction_key → list[detachment_dict]` where each detachment dict has at minimum: `name`, `description`, `abilities`, `stratagems`. Call it from `load_all()` and expose result as `self.detachment_index`.

**3. In `loader.py`:** Add `_build_army_rules_index()` mapping `faction_key → list[rule_dict]`. Same pattern. Expose as `self.army_rules_index`.

**4. In `engine.py`:** Replace the `_query_detachment` stub with a real implementation:
- Parse faction from params (use the session faction if not specified, same pattern as other commands)
- Look up `self.loader.detachment_index[faction_key]`
- If disambiguation needed (multiple detachments), return `result_type: "disambiguation"`
- Return `result_type: "detachment_block"` with shape: `{ faction, detachments: [{name, description, abilities, stratagems}] }`

**5. In `engine.py`:** Replace `_query_army_rules` stub similarly. Return `result_type: "army_rules_block"` with shape: `{ faction, rules: [{name, description}] }`.

**6. In `TerminalBlock.jsx`:** Add two new components `TerminalDetachmentBlock` and `TerminalArmyRulesBlock`. Wire them into the switch: `case "detachment_block":` and `case "army_rules_block":`. Style consistent with existing `TerminalStratagemBlock` (same C palette, font-mono, paddingLeft 18px).

**7. In `commands.py`:** Set `stub: False` on both `detachment` and `army_rules` command entries.

**8. Update `BACKLOG.md`:** Mark the detachment/army_rules gap as FIXED with date.

---

## Session B — Roster → Engine session sync

**P1 priority. Estimated scope: medium-large.**

### Goal
When the user loads a roster in the web UI (via VFS/localStorage), that roster data should be available to the Python engine so that `att_models` and future roster-aware features use the actual list size rather than the dossier minimum. Currently the two sides are completely disconnected.

### Background
- The web frontend stores rosters in browser localStorage via the VFS system (`render/web/src/lib/vfs.js` or similar)
- The FastAPI backend (`render/web/main.py` or equivalent) receives commands via POST
- The engine has a `session_state` dict that tracks turn/faction/mods but not roster units

### Steps

**1. Read these files first:**
- `CLAUDE.md`
- `render/web/src/components/Terminal.jsx` — find where commands are submitted to the backend (the POST call)
- `render/web/src/lib/` or wherever VFS/roster state lives — understand roster data shape in frontend state
- `render/web/main.py` (or `render/web/backend/main.py`) — find the API endpoint that handles commands
- `data/combat_terminal/engine.py` — find `_session_state`, `_query_session`, and any existing roster-sync handlers

**2. Design the sync contract.** The simplest approach: when the frontend submits a command, it already POSTs `{ input: "..." }`. Extend this to `{ input: "...", roster_context: { my_units: [...], opponent_units: [...] } }` where each unit entry is `{ name, faction, models }`. The backend engine receives this and updates its session state.

**3. In the FastAPI handler:** Accept the optional `roster_context` field in the request body. Pass it to `engine.query()` as an extra param or embed it in the command params dict.

**4. In `engine.py` `query()` method:** If `roster_context` is present, update `self._session_state["roster_my"]` and `self._session_state["roster_opp"]` before dispatching the command.

**5. In `engine.py` `_query_combat()`:** After computing `att_models` from `_parse_min_models`, check if the attacker unit name exists in `self._session_state.get("roster_my", [])`. If so, override `att_models` with the roster-specified `models` value. Same for `def_models` from `roster_opp`.

**6. In `Terminal.jsx`:** Before every command POST, gather the current roster state from the VFS/localStorage store and include it in the request body as `roster_context`.

**7. Update `BACKLOG.md`:** Mark the roster-sync architecture item as FIXED.

---

## Session C — Counter picks + threat scoring (D2 upgrades)

**P2 priority. Estimated scope: medium.**

### Goal
The `threat` command currently returns stub or shallow data. Upgrade it to compute real counter-pick recommendations and threat scores based on actual math: which of my units most efficiently kills the threat target, and which enemy units most efficiently threaten my roster.

### Background
- `engine.py` has `_query_threat_card()` and `_query_threat_view()`
- `math_adapter.py` has `compute_combat()` which can be called with any attacker/defender pair
- The dossier has full weapon data for all units

### Steps

**1. Read these files first:**
- `BACKLOG.md` — find threat scoring gap entries
- `data/combat_terminal/engine.py` — read `_query_threat_card()` and `_query_threat_view()` in full
- `render/web/src/components/ThreatCard.jsx` and `ThreatBlock.jsx` — understand expected data shape from frontend perspective

**2. In `engine.py`, add a helper `_compute_threat_score(attacker_unit, defender_unit) -> float`:**
- Calls `compute_combat(attacker_unit, defender_unit, flags=[])`
- Returns `math_result["summary"]["total_expected_damage"]`
- Catches all exceptions and returns 0.0

**3. Upgrade `_query_threat_card()`:**
- Resolve the threat target unit (same as today)
- Get the current session roster (`self._session_state.get("roster_my", [])`) — fall back to a small set of faction units if no roster loaded
- For each of my units, call `_compute_threat_score(my_unit, threat_target)` and `_compute_threat_score(threat_target, my_unit)` (reverse)
- Sort by damage score descending
- Return top-5 counter picks with: unit name, expected damage dealt to threat, expected damage threat deals back, a simple "efficiency" ratio
- Add `counter_picks` list to the result data dict — `ThreatCard.jsx` already expects this field (check it)

**4. Upgrade `_query_threat_view()`:**
- Same pattern but for the full faction threat report — for each threat unit, compute scores against each of my roster units
- Return threat matrix data

**5. Remove `_stub: True` flags from threat_card and threat_view in `commands.py`.**

**6. Update `BACKLOG.md`** with FIXED entries for the threat scoring gaps.

---

## Session D — CLI improvements

**P2 priority. Estimated scope: small-medium.**

### Goal
Four targeted CLI improvements: (1) filter out `supports_cli: false` commands from CLI help, (2) make `history` work in the CLI, (3) add math mode to CLI (`math` prefix), (4) add a dice roller CLI command.

### Steps

**1. Read these files first:**
- `CLAUDE.md`
- `render/cli/terminal.py` (or wherever the CLI REPL lives) — full read
- `data/combat_terminal/commands.py` — scan for `supports_cli: False` entries and `history`/`dice` command definitions

**2. Fix `supports_cli` filtering in CLI help:**
In the CLI's help renderer, filter `commands.COMMANDS` to exclude any entry where `supports_cli == False` before building the help table. These are web-only commands (roster upload, VFS ops, etc.) that have no meaning in a terminal.

**3. Fix `history` in CLI:**
The `history` command returns `result_type: "history"` which the CLI may not render. Find how the CLI renders results and add a branch for `result_type == "history"` that prints the command history list in plain text.

**4. Add math mode prefix to CLI:**
In the CLI input loop, if the input starts with `math `, strip the prefix and set a `math_mode=True` flag on the request. In the engine, `math_mode=True` triggers `_query_mathmode()` response alongside the combat result. Check how `Terminal.jsx` handles `math_mode` in the web UI and mirror that logic in `terminal.py`.

**5. Add dice roller:**
Check if `dice` or `roll` command exists in `commands.py`. If it exists as a stub, implement `_query_dice()` in engine.py: parse `2d6`, `d6+3`, etc. using a simple regex, roll the dice, return result as `result_type: "text"` with the individual rolls shown. If the command doesn't exist, add it to `commands.py` first.

**6. Update `BACKLOG.md`** with FIXED entries for each CLI gap addressed.

---

## Session E — UX improvements (web frontend)

**P3 priority. Estimated scope: medium.**

### Goal
Three frontend UX improvements: (1) `onInject` threading in SpecBlock/ThreatCard/ThreatBlock so clicking a unit name auto-runs a lookup, (2) weapon toggle state persists across reruns (not reset on each rerun), (3) `nextturn` command shows a richer upgrade summary.

### Steps

**1. Read these files first:**
- `render/web/src/components/SpecBlock.jsx` — find `onInject` usage and weapon toggle state
- `render/web/src/components/ThreatCard.jsx`
- `render/web/src/components/ThreatBlock.jsx`
- `render/web/src/components/CombatBlock.jsx` — see how weapon toggles are stored in local state
- `render/web/src/components/Terminal.jsx` — see how `onInject` is threaded down

**2. onInject threading in SpecBlock:**
In `SpecBlock.jsx`, find any linked unit names, ability names, or keyword chips that are currently rendered as plain text or non-clickable spans. Wrap them in a clickable element that calls `onInject(name)` to push the name into the command input and auto-submit. Pattern: `<span style={{cursor:"pointer", color: C.cyan}} onClick={() => onInject && onInject("spec " + name)}>`. Do the same in `ThreatCard.jsx` and `ThreatBlock.jsx` for the unit name headers and counter-pick unit names.

**3. Weapon toggle persistence:**
In `CombatBlock.jsx`, weapon toggles are stored in `useState([])` or similar. When a `rerun` command fires, the parent re-renders and resets toggle state. Fix: lift weapon toggle state up to `Terminal.jsx` (or use `useRef`) so it survives across reruns. Alternatively, key the toggle state on the session ID / command timestamp so a new combat result initialises toggles from the previous state for the same attacker/defender pair.

**4. nextturn upgrade summary:**
In `engine.py`, find `_query_nextturn()`. Currently it may just increment the turn counter and return plain text. Upgrade it to return a `result_type: "session_summary"` (already rendered) or a dedicated `result_type: "nextturn_block"` that shows: new turn number, any stratagems refreshed, any mission objectives that now score, and a reminder of the active modifiers. Add a `TerminalNextTurnBlock` component in `TerminalBlock.jsx` if using a new result_type.

**5. Update `BACKLOG.md`** with FIXED entries for each UX gap addressed.

---

## P0 work already completed (do not re-implement)

These fixes were shipped before this prompt was written:

- ✅ **Rapid Fire conditional** — `rf_value` field in `AttackModifiers`; RF only applied when `--rf` flag present
- ✅ **Blast minimum-3** — `def_models` threaded through `engine.py` → `compute_combat()` → `_run_ev/_run_mc/_run_total`
- ✅ **Kill% semantic** — `kill_chance_pct = P(≥1 kill)` from MC `kill_bucket_probabilities["0"]`; `w["kill_pct"]` now uses this
- ✅ **Legend renderer** — `TerminalLegendBlock` added to `TerminalBlock.jsx` with tabbed UI; `case "legend":` wired in
