# Engine Backlog

A running log of bugs, data gaps, and improvements across all engines in this system.
The organizing principle is **determinism**: every item notes what it would unlock in terms
of the engine being able to answer a question with a computed result instead of a stub.

**Determinism levels (for tracking progress):**
- `D0` — command exists, returns stub or None for the core value
- `D1` — command returns real data from loaded files, no computation
- `D2` — command returns computed results (probability, score, ranking)
- `D3` — command can answer follow-up/compound questions without extra prompting

---

## How to Use This File

- Read this file at the start of any dev session involving this project
- When you discover a bug, gap, or improvement during a session → add it here immediately
- When you fix something → mark it `[FIXED YYYY-MM-DD]` and note what changed
- When adding a new engine → create a matching section for it
- The goal is not a perfect backlog — it's a honest snapshot of where each engine stands

---

## Engine: `combat_terminal`

### Bugs

| Status | Priority | Description | Component | Fixed In |
|--------|----------|-------------|-----------|----------|
| ✅ FIXED | HIGH | Unit stats stored as nested `unit["stats"]` dict but engine reads top-level keys — all spec/threat/math returned `None` for M/T/Sv/W/Ld/OC | `loader.py` `_load_units` | 2026-03-22 |
| ✅ FIXED | HIGH | Weapon profiles in `_query_combat` used wrong key names (`"attacks"`, `"shots"`) — dossiers store attacks as `"a"`, BS as `"bs_ws"`, etc. Result: all weapons showed `? shots` and no profile data in UI | `engine.py` `_query_combat` | 2026-03-22 |
| ✅ FIXED | HIGH | **AP math sign error** — `compute_save_target` used `- effective_ap` in the armor formula, causing more AP to reduce damage instead of increase it (AP-2 vs 3+ showed 17% unsaved instead of 67%). Fixed to `+ effective_ap`: AP now correctly makes saves harder (AP-2 vs 3+ → need 5+ to save = 67% fail). Also affects sensitivity sweep: "AP −1" now shows positive damage gain. | `combat_math_engine.py` `compute_save_target` | 2026-03-24 |
| ✅ FIXED | MED | **Markerlights flag note showed only Ignores Cover** — note text didn't mention the +1 to Hit rolls (which was already correctly wired in the math). Flag note now reads "+1 to Hit rolls, Ignores Cover". | `engine.py` `FLAG_NOTE_MAP` | 2026-03-24 |
| ✅ FIXED | MED | **Drones absent from unit weapon profiles** — spec and combat views for units like Breacher Team, Broadside Battlesuits, Pathfinder Team, etc. showed no drone weapons or stat notes. Added `_DRONE_CATALOG` (gun drone, missile drone, shield drone, guardian drone, marker drone, pulse accelerator, grav-inhibitor, recon, hover drones) and `_UNIT_WEAPON_SUPPLEMENTS` (Breacher Team support turret). `_augment_unit_with_supplements()` runs at spec and combat time, injecting drone weapons (tagged `_drone=True`) and cyan stat notes into the result. Drone weapons display with cyan name tint in both spec WeaponsPanel and combat WeaponStatsTable. | `engine.py` | 2026-03-24 |
| ✅ FIXED | LOW | **Range column missing from combat WeaponStatsTable** — spec view already showed Range; combat view only showed A/BS/S/WR/AP/D. Added "Rng" column and `rangeDisplay` cell to `WeaponStatsTable.jsx`. colSpan for section dividers updated from 7 to 8. | `WeaponStatsTable.jsx` | 2026-03-24 |
| OPEN | MED | Faction folder names use spaces (`"adeptus custodes"`) but dossier filenames use underscores (`adeptus_custodes_parsed_dossier.json`) — fuzzy match works but normalisation is inconsistent | `loader.py` `_load_units` | — |
| ✅ FIXED | HIGH | `spec ranger` (and any ambiguous query) returned no result or wrong unit — engine had no disambiguation logic | `loader.py` + `engine.py` | 2026-03-22 |

---

### Determinism Gaps — `D0` items (stubs blocking real answers)

These are the gaps between what a command _accepts_ and what it actually _computes_.
Each row describes what full D2/D3 would look like.

| Priority | Command | Current state | What D2 looks like | Unlocks |
|----------|---------|---------------|---------------------|---------|
| ~~**HIGH**~~ ✅ FIXED | `<unit> vs <unit>` (combat) | ~~All math fields return `None`~~ → `combat_math_engine.py` copied in, `math_adapter.py` written to translate dossier format → full dice math: hit%, wound%, save%, expected_dmg, kill%, per-weapon breakdown. 2026-03-22 | — | — |
| ~~**HIGH**~~ ✅ FIXED | `<unit> vs <unit>` weapon table UI | ~~No weapon spec table in combat render~~ → Added `WeaponStatsTable` (A/BS/S/WR/AP/D) and `TargetingOutcome` (Hit%/Wound%/Kill%/Dmg bars) components. A column shows "2 (4)" squad-total format. BS and WR colour-coded green/red when modifier shifts them from baseline. 2026-03-22 | `WeaponStatsTable.jsx`, `TargetingOutcome.jsx`, `CombatBlock.jsx` | 2026-03-22 |
| ~~**HIGH**~~ ✅ FIXED | `rerun` command + live modifier toggles | ~~No way to toggle flags after a combat run~~ → Added `rerun` command (engine + registry), `ModifierToggles.jsx` inline toggle UI, `lastCombatIdRef` in-place result replacement in Terminal.jsx. Clicking `[ml]` / `[cover]` / `[lethal]` etc. fires `rerun --flag null` or `rerun --flag` and replaces the combat block in-place without appending a new entry. All-flags-off, unknown-flag, and rapid-toggle edge cases tested. 2026-03-22 | `engine.py`, `commands.py`, `ModifierToggles.jsx`, `CombatBlock.jsx`, `TerminalBlock.jsx`, `Terminal.jsx` | 2026-03-22 |
| ~~**HIGH**~~ ✅ FIXED | Monte Carlo loop never triggered | ~~`math_adapter.py` called only `compute_attack_result` (deterministic EV), never `monte_carlo_attack`~~ → `monte_carlo_attack` now called per-weapon at 5,000 trials (seed=42) after every combat query. `simulation_status: "ACTIVE"` when MC succeeds; `"OFFLINE"` if it errors. 2026-03-23 | `math_adapter.py`, `combat_math_engine.py` | 2026-03-23 |
| ~~**HIGH**~~ ✅ FIXED | Simulation Confidence always `null` / never shown | ~~`engine._query_combat` returned `"simulation": None`~~ → `math_adapter.compute_combat` now returns `simulation` block with `status`, `mode`, `iterations`, `error_margin`, `confidence`, `covers`. Engine passes it through. 2026-03-23 | `engine.py`, `math_adapter.py` | 2026-03-23 |
| ~~**HIGH**~~ ✅ FIXED | `SimulationConfidence.jsx` blank when MC offline | ~~Component returned `null` when `sim` was falsy — no fallback~~ → Component now renders an explicit `OFFLINE` banner ("Simulation Engine Offline: Showing Deterministic Averages") when `sim.status === "OFFLINE"` or `sim.mode === "deterministic"`. Interactive tooltip row explains Deterministic vs Monte Carlo math. 2026-03-23 | `SimulationConfidence.jsx` | 2026-03-23 |
| **HIGH** | `threat <faction>` | Threat level assigned by keyword heuristic only; no stat-based scoring | Score each unit on: damage output (avg attacks × hit × wound × AP), durability (T × W × save), mobility (M in inches), OC weight | "What are Tyranids' five most dangerous units vs my list?" answered by rank |
| **MED** | `strat <name>` | Always returns stub — no stratagem data loaded | Load stratagems from old CT dossiers (they're in `*_parsed_dossier.json` under `stratagems[]` for most factions) | "What stratagems does this detachment give me?" |
| **MED** | `detachment <faction>` | Always returns stub | Load detachment rules from old CT dossiers (`detachments[]` in parsed dossiers) | "What abilities does Kauyon unlock?" |
| **MED** | `ability <name>` | Stub unless the ability name happens to be in a unit's abilities list | Build a flat ability index at load time from all units' `abilities[]` arrays | "What does Markerlight do?" answered from loaded data |
| **MED** | `enhancement <name>` | Always returns stub | Index enhancements from parsed dossiers (they exist in old CT data for many factions) | "What does the Mont'ka enhancement give?" |
| **MED** | `mission <name>` | Always returns stub — no mission data loaded | Load mission JSON from old CT `05_rules_and_missions/` | "What are the scoring rules for Priority Targets?" |
| **LOW** | `analyze <unit>` | Threat/efficiency metrics computed but counters list is empty `[]` | For each enemy unit, find player units with stat advantages (high AP vs low save, high S vs low T, etc.) | "What in my list best counters a Carnifex?" answered with ranked options |

---

### Data Gaps

Data that exists somewhere (old CT project or external sources) but isn't wired into the engine yet.

| Priority | Gap | Where the data lives | Notes |
|----------|-----|---------------------|-------|
| HIGH | Combat math engine | `combat_terminal/14_cli/combat_math_engine.py` | Full dice probability engine already built — needs to be adapted as a module and imported by loader |
| HIGH | Stratagems | `12_factions/<faction>/*_parsed_dossier.json` → `stratagems[]` array | Present for ~20 of 29 factions; need to index them at load time |
| HIGH | Detachment rules | `12_factions/<faction>/*_parsed_dossier.json` → `detachments[]` array | Already in dossiers; loader just needs to index them separately |
| MED | Enhancements | Same parsed dossiers → `enhancements[]` | Exists for most codex factions |
| MED | Army rules | Same parsed dossiers → `army_rules` field | Partially populated; many factions missing |
| MED | Mission data | `combat_terminal/05_rules_and_missions/` | Full mission JSON and scoring rules exist |
| MED | Points values | Dossiers have `points` per unit but many are `null` | MFM v4.0 is the source; not yet extracted |
| LOW | Active faction orchestrator files | `data/combat_terminal/data/main_faction/tau/` | Copied over but loader doesn't read them yet; needed for strategy pipeline |
| MED | Wire VFS rosters → engine session | Currently `set roster player/enemy` only stores in `activeRostersRef` (frontend). Need to POST roster data to engine so `_session["roster_my"]` / `_session["roster_enemy"]` are populated and combat math can use squad size from roster. | `engine.py`, `Terminal.jsx` |
| LOW | Roster loading from disk | `data/combat_terminal/data/rosters/` | Pre-existing roster .txt files on disk are not yet imported into the VFS on first boot — could auto-import on startup |

---

### Architecture Improvements — Math Mode

| Priority | Improvement | Why it matters |
|----------|-------------|----------------|
| ✅ DONE 2026-03-25 | **Math Mode — post-execution math ledger** — `math on` / `math off` toggle (Priority 7.2 in `Terminal.jsx`) activates post-execution math replay. After any command that returns `meta.math_ledger`, a `math_replay` stream entry is auto-injected. The replay is rendered by `MathModeBlock.jsx` with sequential playback controls (play/pause, step forward/back, jump to end, speed: 0.5×/1×/2×/4×). The ledger is built by `build_combat_ledger()` in `data/combat_terminal/math_ledger.py` — reconstructs the math narrative from already-computed combat results without touching `combat_math_engine.py`. Events are grouped by phase (DEFENDER PROFILE, WEAPON — <name>, MONTE CARLO SIMULATION). High-importance events highlighted in amber. `mathLedger.js` provides the same API for any future client-side simulation code. `mathmode` command registered in `commands.py` (aliases: `math`). | `math_ledger.py`, `mathLedger.js`, `MathModeBlock.jsx`, `Terminal.jsx`, `TerminalBlock.jsx`, `engine.py`, `commands.py` | 2026-03-25 |

### Architecture Improvements

| Priority | Improvement | Why it matters |
|----------|-------------|----------------|
| ✅ DONE 2026-03-24 | **Terminal-integrated file upload system** — `upload roster`, `upload enemy roster`, `upload campaign` commands. Each emits an inline `upload_block` result rendered by `UploadBlock.jsx` wrapping the `Pattern` component. File handler calls `processUpload(content, filename)`. Paste fallback at Priority 8.55 in submit(). Pipeline: validate ext → `upload_roster` flow at faction step → name step → save. Enemy flag auto-assigns enemy roster. Campaign tries JSON name auto-detect then prompts. New files: `use-file-upload.js`, `UploadBlock.jsx`. Updated: `file-upload.jsx`, `TerminalBlock.jsx`, `Terminal.jsx`. | `src/hooks/use-file-upload.js`, `UploadBlock.jsx`, `file-upload.jsx`, `TerminalBlock.jsx`, `Terminal.jsx` | 2026-03-24 |
| ✅ DONE 2026-03-24 | **Theme Directory + Interactive Selection** — `themes` / `theme list` command (Priority 7.1) renders a full numbered directory: `[✓]` for unlocked, `[ ]` for locked, with activation hints and attempt prompts. Arms a `themes_select` client flow — typing a number (1–3) or a theme name targets the exact challenge; already-unlocked entries report status instead of re-challenging. `theme <locked-id>` now returns `[ ERROR ] : Visual override not authorized. Solve the challenge first.` Unlock success message updated to `[ SUCCESS ] : <ID> is now available. Type 'theme <id>' to activate.` All wired via `THEME_REGISTRY`, `getChallengeForTheme`, and the existing `unlock_theme` flow. `themes` registered in `commands.py`. | `Terminal.jsx`, `commands.py` | 2026-03-24 |
| ✅ DONE 2026-03-24 | **Unlock Theme system** — Scalable logic-gate system for hidden UI themes. `src/data/themeRegistry.js` maps theme IDs to metadata; `src/data/challengeRegistry.js` holds riddle objects (text, answer, rewardThemeId). `Terminal.jsx` Priority 7 `theme` command updated to read base + unlocked themes via localStorage (`ct_unlocked_themes`). Priority 7.5 `unlock theme` initiates a challenge flow; `handleFlowStep` type `unlock_theme` validates the answer, persists the unlock, and applies the theme instantly via `onTheme`. App.jsx initialises from `ct_active_theme` localStorage key on mount and persists on every theme change. CSS: `[data-theme="mainframe"]` block in `index.css` — pure black, #33ff33, forced monospace 14px, no bold, no box-shadows, no gradients, no border-radius. Adding a new unlockable theme requires: 1 entry in themeRegistry.js + 1 entry in challengeRegistry.js + 1 CSS block in index.css. | `src/data/themeRegistry.js`, `src/data/challengeRegistry.js`, `Terminal.jsx`, `App.jsx`, `index.css`, `commands.py` | 2026-03-24 |
| ✅ DONE 2026-03-23 | **VFS + Roster/Campaign persistence system** — `vfs.js` (localStorage VFS), `RosterListBlock.jsx`, `RosterActionBlock.jsx`, `RoleAssignBlock.jsx`, `CampaignListBlock.jsx`, `RosterUploadBlock.jsx`. Commands: `rosters`, `load roster`, `set roster player/enemy`, `upload roster`, `rename roster`, `edit roster`, `delete roster`, `campaigns`, `load campaign`, `new campaign`. Multi-step client flow handler in `Terminal.jsx` (Priority 8.6–8.8). Drag-and-drop .txt file to upload roster. All operations are localStorage-only; engine session not wired yet (see Data Gaps). | `lib/vfs.js`, `components/roster/*`, `Terminal.jsx`, `commands.py` |
| ✅ DONE 2026-03-23 | **Engine Status Dashboard (DIAG page)** — New `DiagnosticsPage.jsx` (accessible via `diag` command or DIAG nav tab). Contains: System Health Header (MC/Deterministic badges + animated SVG heartbeat monitor), Animated Data Flow Pipeline diagram (5 nodes with CSS stroke-dash flow animation, node turns red on failure), Data Integrity Grid (per-faction completion bars with traffic-light colours — green ≥90%, amber 70–89%, red <70%, plus Missing Data Table for critical-gap factions), Engine Docs (interactive accordion explaining Deterministic, Monte Carlo, AP, Swinginess, Confidence, Pipeline). Polls `/api/engines/{id}/status` every 4s. `engine.status()` now returns `simulation_mode`, `simulation_config`, `pipeline`, and `per_faction` (from enhanced `loader.status()`). | App.jsx, DiagnosticsPage.jsx, engine.py, loader.py, Terminal.jsx |
| ✅ DONE | Terminal-first architecture — all clicks anywhere in the UI (UnitsView rows, RulesView lookups, TerminalBlock links, disambiguation numbers) resolve to a visible terminal command via animated inject into the CommandBar (`onInject` / `animateAndSubmit`) rather than rendering directly | 2026-03-22 |
| ✅ DONE | Disambiguation flow — ambiguous `spec`/`combat`/`analyze` queries return `result_type: "disambiguation"` with a numbered match list; bare integer input (`"2"`) resolves the pending context via `_select` handler; frontend renders `DisambiguationBlock` | 2026-03-22 |
| ✅ DONE | **Navigation command system** — full priority-ordered submit() in `Terminal.jsx`: `!!` repeat, `clear`, `delete` (output stack undo), `back`/`forward` (nav history stack via `navStackRef`), page nav tokens (`home`/`units`/`rules`/`campaign`/`demo` + single-letter aliases). Nav bar clicks now animate-inject the command instead of directly switching views. `onNavigate` prop wired from App → Terminal → `setActiveView`. All nav commands registered in `commands.py` with `supports_cli=False` and `group="navigation"` for tab completion + help. `result_type: "system_msg"` added to `TerminalBlock` for dim italic feedback lines. | 2026-03-22 |
| OPEN | Thread `onInject` deeper into `SpecBlock`, `ThreatCard`, `ThreatBlock`, `CounterBlock` — currently those components receive the prop but don't use it for their own clickable items (faction names, counter unit names, ability tags) | — |
| LOW | CLI terminal (`render/cli/terminal.py`) should filter navigation commands from tab completion and help using the `supports_cli: false` flag now in the schema | Prevents nav tokens appearing in pure CLI context |
| MED | Lazy faction loading — only load a faction's dossier when it's first queried | Currently all 29 factions load on startup; for larger engines (e.g. medical, legal) this would be slow |
| MED | Ability index built at load time from all `unit.abilities[]` arrays | Enables `ability <name>` to return real data without a separate abilities file |
| MED | Stratagem + detachment index built at load time from dossier `stratagems[]` / `detachments[]` | Same data already in memory — just needs indexing |
| MED | Add `models` field to `roster_session.json` unit entries so squad size is roster-driven, not dossier-parsed | `_parse_min_models()` gives the squad floor from unit_composition text; accurate squad size requires roster data. When roster loading is wired, override `att_models` in `_query_combat` from roster entry. |
| LOW | Normalise faction key at load time (lowercase, underscores) so lookup never depends on filesystem naming | Prevents silent mismatches when faction folder name ≠ dossier filename prefix |
| LOW | `status()` should report per-command determinism level, not just loaded/not loaded | Makes it easy to see at a glance which commands are D1 vs D0 in any engine |

---

## Engine: _(next engine)_

> Copy this section template when adding a new engine.
> Fill in the determinism gaps immediately after building the stub commands.

### Bugs
_None yet_

### Determinism Gaps
_Document when commands are stubbed_

### Data Gaps
_Document when data exists but isn't wired_

### Architecture Improvements
_Document patterns that could be generalised_

---

## Cross-Engine / Framework Items

Things that would improve the engine framework itself, not any individual engine.

| Priority | Improvement | Notes |
|----------|-------------|-------|
| MED | `EngineBase` should include a `backlog()` method that returns this file's contents as structured data | Lets the renderer surface "what's a stub" to the user in the UI |
| MED | Standard `_stub` flag convention — every stub response should set `"_stub": true` so the renderer can display a visual indicator | Already done in combat_terminal; make it part of the contract |
| LOW | Engine hot-reload — detect file changes in `data/<engine>/data/` and call `loader.load()` without restarting server | Useful during data development |
| LOW | `query("backlog")` as a built-in EngineBase command | Any engine can report its own gaps to the caller |
