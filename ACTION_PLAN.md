# Combat Terminal 2 — Action Plan

Work through this list top to bottom. Each item is a discrete task.
Mark `[x]` when done. Generated from full code review 2026-06-02.

---

## P0 — Math & Logic Bugs

These affect correctness of output shown to users.

- [ ] **Fix Melta damage unconditional application**
  `math_adapter.py:169` — MELTA N adds `flat_damage_bonus` unconditionally. Should only apply within half range (like Rapid Fire uses `rf_value` + `use_rapid_fire` flag). Add `melta_value` field to `AttackModifiers`, store MELTA N there, only apply when `use_melta=True` (flag `--melta`). Add `melta` to `FLAG_NOTE_MAP` and `_apply_flags()`.

- [ ] **Fix Lance keyword description**
  `render/web/src/components/spec/keywords.js:21` — says "Unmodified wound rolls of 6 improve the AP characteristic by 1." Correct 10th edition rule: "+1 to Wound rolls if the bearer made a Charge move this turn." Fix the `desc` string.

- [ ] **Fix rapid fire test assertion**
  `tests/test_combat_math.py:432` — `test_rapid_fire_adds_attacks` asserts `mods.extra_attacks >= 2.0` but RF stores to `mods.rf_value`. Change to `assert mods.rf_value >= 2.0`.

- [ ] **Fix math ledger save calculation**
  `math_ledger.py:345-361` — reconstructs save target ignoring invulnerable saves, save bonuses/penalties, and AP modifiers from flags. Either align with `compute_save_target()` logic or add a note in the ledger output that invuln/modifiers are not reflected in the step-by-step.

- [ ] **Fix math ledger confidence formula display**
  `math_ledger.py:419-430` — shows formula `confidence = 1 − ε / μ` but actual confidence is a categorical string from threshold checks. Either show the real thresholds or remove the misleading formula.

- [ ] **Fix buggy variable reference in engine.py**
  `engine.py:929` — `raw if 'raw' in dir()` doesn't work as intended in `_query_combat` scope. Replace with `attacker_raw` directly (the `raw` variable only exists in `parse_command`).

- [ ] **Fix FLAG_NOTE_MAP missing entries**
  `engine.py:1072` — add entries for `torrent`, `lance`, `fnp`, `dmgplus` flags so users see callout notes when these modifiers are active.

- [ ] **Fix mutable default arguments**
  `engine_base.py:77` and `engine.py:557` — change `params: dict = {}` to `params: dict | None = None` with `params = params or {}` inside.

- [ ] **Consider modeling damage spillover**
  `combat_math_engine.py:468` and `:325` — `kills = total_damage / wounds` overestimates against multi-wound models because 40K damage doesn't spill between models. This is a known approximation. If fixing: track per-attack damage allocation in MC, and use a geometric/binomial model in EV. If not fixing: add a note to the math ledger output acknowledging the approximation.

---

## P1 — Kill Dead Features

Pure deletion. No behavior change to anything users actually use.

### Kill: AddCardDialog (Airtable / Bass Guitar cards)

- [ ] **Delete AddCardDialog.jsx**
  `render/web/src/components/AddCardDialog.jsx` — stubbed Airtable integration for Bass Guitar practice cards. Unrelated to combat terminal.

- [ ] **Remove AddCardDialog references from Terminal.jsx**
  Find and remove the `add card` command handling (~line 1407) and the AddCardDialog import.

### Kill: Campaign System

- [ ] **Delete campaign VFS functions**
  `render/web/src/lib/vfs.js` — remove `createCampaign()`, `listCampaigns()`, `loadCampaign()`, `updateCampaignState()`, `saveCampaignMission()`, `deleteCampaign()` and all campaign-related localStorage keys.

- [ ] **Delete CampaignListBlock.jsx**
  `render/web/src/components/roster/CampaignListBlock.jsx`

- [ ] **Remove campaign commands from Terminal.jsx**
  Remove `campaigns`, `new campaign`, `load campaign`, `upload campaign` command handling and flow types from the submit() function.

- [ ] **Remove campaign references from RostersContext.jsx**
  Remove the campaigns section from the Rosters panel.

- [ ] **Remove campaign command registrations**
  `data/combat_terminal/commands.py` — remove campaign command entries.

### Kill: DemoView

- [ ] **Delete DemoView.jsx**
  `render/web/src/components/DemoView.jsx` — 882 lines of hardcoded sample data.

- [ ] **Remove DemoView from App.jsx**
  Remove the `demo` view case, DemoView import, and any related routing.

- [ ] **Remove demo command from commands.py**
  Remove `demo` command registration if it exists.

### Kill: Dead React Components (different project remnants)

- [ ] **Delete HabitTracker.jsx** — unrelated to combat terminal
- [ ] **Delete ActionCard.jsx** — orphaned, different color scheme
- [ ] **Delete StatCard.jsx** — orphaned, different color scheme
- [ ] **Delete QueryPanel.jsx** — superseded by Terminal architecture
- [ ] **Delete EngineStatus.jsx** — superseded by DiagnosticsPage
- [ ] **Delete ResultView.jsx** — superseded by TerminalBlock

### Kill: Theme/Unlock System — Replace with 3 Simple Themes

Current system has 5 themes (default, red, mainframe, void-zen, warp-stained) with a challenge/riddle unlock system. Replace with 3 straightforward themes: dark, light, console.

- [ ] **Rewrite themeRegistry.js** — replace 5-theme registry with 3 entries: `dark` (default, current green-on-black), `light` (light background variant), `console` (pure monospace retro terminal look — adapt from current `mainframe` CSS). Remove `unlockable` field entirely.
- [ ] **Delete challengeRegistry.js** — `render/web/src/data/challengeRegistry.js` — entire unlock/riddle system
- [ ] **Simplify theme CSS in index.css** — remove `[data-theme="red"]`, `[data-theme="mainframe"]`, `[data-theme="void-zen"]`, `[data-theme="warp-stained"]` blocks. Add `[data-theme="dark"]` (rename from default), `[data-theme="light"]`, `[data-theme="console"]` (adapt from mainframe).
- [ ] **Simplify theme commands in Terminal.jsx** — remove `unlock theme` flow (~lines 1056-1084), remove `unlock_theme` flow handler (~lines 783-804), remove `getNextChallenge` import, remove `CT_UNLOCKED_KEY` localStorage, remove `addUnlockedTheme()`/`getUnlockedThemes()` helpers. The `theme` command becomes a simple 3-way switch with no lock/unlock logic. The `themes` command becomes a simple list of 3 options.
- [ ] **Remove getRandomChallenge export** — already dead code, but will be deleted with the file
- [ ] **Update commands.py** — remove `unlock` command registration if it exists

### Kill: Dead Combat Components

- [ ] **Delete TotalUnitOutput.jsx** — marked `// legacy`, replaced by Ranged/Melee variants
- [ ] **Delete WeaponPlatformTotals.jsx** — marked `// kept for compat`, only used in DemoView (also being deleted)
- [ ] **Remove legacy re-exports from CombatBlock.jsx** — lines 28-29

### Kill: Dead Chart/Recharts Chain

- [ ] **Delete recharts-mock.js** — `render/web/src/recharts-mock.js`
- [ ] **Delete chart-radar-default.jsx** — `render/web/src/components/chart-radar-default.jsx`
- [ ] **Delete dead chart UI components** — `chart-bar-horizontal.jsx`, `area-chart-axis.jsx`, `chart-pie-separator-none.jsx`, `chart-bar-label-custom.jsx`, `chart.jsx` from `src/components/ui/`
- [ ] **Remove recharts alias from vite.config.js** — line 9
- [ ] **Remove recharts alias from main.py esbuild build** — if present
- [ ] **Remove recharts from package.json** — `"recharts": "^3.8.0"`

### Kill: Dead UI Scaffold Components

- [ ] **Delete unused ui/ wrappers** — `file-upload.jsx`, `aspect-ratio.jsx`, `hover-card.jsx`, `navigation-menu.jsx`
- [ ] **Remove corresponding Radix packages from package.json** — `@radix-ui/react-aspect-ratio`, `@radix-ui/react-hover-card`, `@radix-ui/react-navigation-menu`

### Kill: Dead Python Code

- [ ] **Delete dead methods from engine.py**
  Remove `_compute_counters()` (~line 2728), `_counter_score_vs()` (~line 2807), `_counter_reason_str()` (~line 2814), `_unit_to_fields()` (~line 3024). All replaced by `_compute_counters_math()`.

- [ ] **Delete dead methods from loader.py**
  Remove `get_combat_math()` (~line 735), `get_threats()` (~line 888), `_stub_ability()` (~line 1210). All are stubs for features that are fully implemented elsewhere.

- [ ] **Delete dead functions from combat_math_engine.py**
  Remove `sweep_weapon_vs_toughness()` (~line 527), `compare_weapon_into_target()` (~line 513), `railgun_vs_terminator_example()` (~line 604). Remove unused `instance_count` field from `WeaponProfile`. Remove unused `crit_on` parameter from `success_probability()`.

### Kill: Dead Files

- [ ] **Delete ct_config.json** — `data/combat_terminal/data/ct_config.json` — orphaned, nothing reads it
- [ ] **Delete test roster files** — `mine_delete_2026-03-19.txt` and `mine_delet2_2026-03-19.txt`

### Kill: Dead Dependencies

- [ ] **Remove python-dotenv from requirements.txt** — never imported
- [ ] **Remove @types/react and @types/react-dom from package.json devDependencies** — no TypeScript in project

### Kill: Dead Variables and Imports

- [ ] **engine.py** — remove `import re as _re` from inside `_compute_ratings` and `_compute_metrics` (module-level `re` already imported). Remove unused `oc` variable in `_compute_metrics`. Remove `from typing import Any` from `engine_base.py`.
- [ ] **React components** — remove: `attacker`/`defender` destructuring from `MathModeBlock.jsx`, `PENALTY_FLAGS` from `ModifierToggles.jsx`, `STAT_LABELS` from `ThreatCard.jsx`, `isNegative()` from `WeaponsPanel.jsx`, `flatRosters` from `RosterListBlock.jsx`, `listAllRosters`/`findRosterByName` imports from `RostersContext.jsx`, `isRanged` from `TerminalBlock.jsx`, unused `message` destructuring from `SimulationConfidence.jsx`
- [ ] **CLI components** — remove: `units_line` from `ability_block.py`, `CYAN` from `ability_block.py`, `YELLOW` from `session_summary.py`, `_box_line()` from `stratagem_block.py`, `inner_w` from `stratagem_block.py`
- [ ] **main.py** — remove unused `BUILD_SCRIPT` variable
- [ ] **Terminal.jsx** — remove debug `console.log("[MathMode] ...")` statements (~lines 1029, 1032, 1520-1522)
- [ ] **mathLedger.js** — delete `render/web/src/lib/mathLedger.js` (client-side ledger builder never imported; data comes from backend)

---

## P2 — Consolidate Duplicates

Refactoring. Test after each change.

- [x] **Merge _compute_ratings and _compute_metrics**
  Consolidated into `_compute_unit_scores()` returning both `ratings` (0–1 floats) and `metrics` (0–100 ints). Shared `_stat_num()` and `_weapon_score()` extracted as static methods. Old methods kept as thin wrappers for backward compat.

- [x] **Unify shared.jsx into one module**
  Created `src/components/shared/colors.js` (single C palette) and `src/components/shared/constants.jsx` (CARD_STYLE, CARD_PAD, SectionTitle, Bar). combat/spec/threat shared.jsx now re-export from these. Bar unified to accept `value`+`max` or `pct` with optional `height`, `segments`, `glow`. Each panel wrapper sets its own defaults (combat: 12 segments, 14px, glow; spec: 5px; threat: 6px).

- [x] **Parameterize TotalUnitOutputRanged/Melee**
  Created `TotalUnitOutputPanel` with `phase` prop. Old files are thin wrappers.

- [x] **Extract CLI ANSI constants and _tw()**
  Created `render/cli/components/style.py`. All 8 component files now import from it. `_tw()` replaced by `terminal_width()`.

- [x] **Extract React color palette C**
  Created `src/components/shared/colors.js`. Replaced 15 duplicate C definitions across TerminalBlock, DiagnosticsPage, RostersContext, RulesContext, UnitsContext, MathModeBlock, and all roster components. MathModeBlock extends with math-specific keys via spread.

- [x] **Fix SectionTitle to accept style prop**
  Both shared/constants.jsx `SectionTitle` and combat/shared.jsx `SectionTitle` now accept and spread `style`. WeaponStatsTable and CombatRadarChart callers' style props are no longer silently ignored.

---

## P3 — Finish Incomplete Features

- [x] **Wire Unit Type filtering**
  `buildListUnitsCommand()` now includes `unitTypes` as `--character`, `--infantry`, etc. flags. Added unit type entries to `KW_ALIAS` in `loader.py` so the keyword filter matches them against unit keyword arrays. Filter modal → search bar → filter search all thread unit types through.

- [x] **Wire real detachment/stratagem data into threat view**
  `_query_threats` now calls `get_detachments(faction)` and flattens real stratagem data from detachment entries. Falls back to stubs only if no real data found. Tau: 8 detachments, 41 stratagems (was 1 stub each).

- [x] **Wire --ranged/--melee flags for list command**
  `--ranged`/`--melee` now extracted from `_extract_bool_flags`, removed from keyword list, passed as `weapon_filter` through `_query_list` → `get_list`. Loader filters units by checking whether any weapon matches the requested type. Also fixed parse_command to extract all flags before assigning remaining text as faction name.

- [x] **Fix enhancement_block.py right border**
  Added `_row()` helper that pads visible content to `inner_w` and appends ` │`. All content rows now have matching left+right borders.

- [x] **Fix missing React Fragment keys**
  Replaced bare `<>` with `<Fragment key={flag}>` in both attacker and defender `.map()` blocks. Removed redundant `key` props from inner `Pipe`/`Token` elements.

- [x] **Fix roster component theming**
  Already fixed in P2 — all 15 duplicate `C` definitions replaced with imports from `shared/colors.js`. Zero remaining `#00e5ff` hardcoded values.

- [x] **Forward onEdit prop through UnitsContext and RulesContext**
  Added `onEdit` to destructured props in both contexts and forwarded to inner `<Terminal>`. Pencil edit icon now works in Units and Rules views.

- [x] **Fix RostersContext polling**
  Consolidated polling + visibility handling into single `useEffect`. `setInterval` paused on `document.hidden`, resumed on visible with immediate fetch. Removed separate `visibilitychange` effect.

---

## P4 — Architecture & Build

- [x] **Fix esbuild platform path**
  `main.py:51` — replaced hardcoded `@esbuild/linux-arm64` with `node_modules/.bin/esbuild` (cross-platform symlink).

- [x] **Remove CLI coupling to combat_terminal**
  Added `aliases()` and `help_groups()` to `EngineBase` (with defaults). `CombatTerminalEngine` overrides both delegating to `commands.py`. `terminal.py` now uses the engine contract — zero imports from `data/`.

- [x] **Add conditional readline import**
  `render/cli/terminal.py` — wrapped in try/except, tab completion gracefully skipped when unavailable.

---

## P5 — Documentation

- [x] **Update data/combat_terminal/CLAUDE.md**
  Full rewrite — lists all 7 files, 24 commands, current data counts.

- [x] **Update render/cli/CLAUDE.md**
  Lists all 12 component files, all result types, math mode, alias resolution.

- [x] **Update render/web/CLAUDE.md**
  API routes table now includes `/exec`, `/commands`, `/version`, `/health`. Component descriptions updated.

- [x] **Update BACKLOG.md data gaps**
  "Combat math engine" and "Mission data" marked FIXED with dates and details.

- [x] **Archive stale planning docs**
  Moved `CT2_Session_Prompts_P1_P3.md` and `CT2_QA_Checklist.md` to `archive/`.

- [x] **Update CLAUDE.md config.json example**
  Fixed `"host": "localhost"` → `"host": "127.0.0.1"`. Updated engine contract description to mention `aliases()` and `help_groups()`.

---

## Notes

**After completing P1 (kill dead features):** run `npm run build` and `python main.py` to verify nothing broke. Run `python tests/test_combat_math.py` to confirm tests pass.

**After completing P2 (consolidation):** same verification, plus manually test `spec`, `combat`, `threat`, `list` commands in both web and CLI.
