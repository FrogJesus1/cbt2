# Build Plan — UI Polish & UX Fixes

**Created:** 2026-06-02  
**Status:** ✅ Phases 1-3 Complete · Phase 4 In Progress  

---

## 1. Rosters Page Overhaul

### 1.1 Remove "Roster Mode" display ✅ DONE 2026-06-02
- **File:** `RostersContext.jsx` (~line 380)
- **What:** Delete the "ROSTER MODE ON/OFF" row from the session state grid
- **Why:** Redundant — roster state is obvious from whether armies are loaded

### 1.2 Remove "Next Turn" logic from Rosters page ✅ DONE 2026-06-02
- **File:** `RostersContext.jsx` (~line 407)
- **What:** Remove the "NEXT TURN" action chip and the entire session state header (TURN counter, PLAYER FACTION, ENEMY FACTION rows). The rosters page should focus solely on roster management
- **Also:** Review if `nextturn` command/engine logic should remain accessible from the main terminal (it should — just not on this page)

### 1.3 Fix "Load Player" / "Load Enemy" flow ✅ DONE 2026-06-02
- **Files:** `RostersContext.jsx`, `Terminal.jsx`, roster block components
- **Current:** Clicking "LOAD PLAYER" / "LOAD ENEMY" says "wait" and does nothing
- **Target flow:**
  1. Click "LOAD PLAYER" → injects the command into command bar (visible to user)
  2. Prompt: numbered list — `1. Load saved roster` / `2. Upload new roster`
  3. If **saved**: show numbered list of all saved rosters. User clicks one or types the number
  4. If **upload**: prompt user to paste army text from New Recruit
  5. Same flow for "LOAD ENEMY" but auto-assigns enemy role
- **Key principle:** Every action should visibly inject a command first, then respond — maintain terminal-first architecture

### 1.4 Condense "Saved Rosters" section ✅ DONE 2026-06-02
- **File:** `RostersContext.jsx`
- **Current:** Full section with "SAVED ROSTERS · 0 saved" header, separator, empty state, and two upload buttons
- **Target:** A simple list showing each army that has rosters, with `(#)` count badge. Example:
  ```
  SAVED ROSTERS
  Tau Empire (3)
  Space Marines (1)
  Tyranids (2)
  ```
- **Click behavior:** Click an army → shows all rosters for that army → click a roster → numbered prompt: `1. Load roster` / `2. Edit roster` / `3. Delete roster`
- **VFS functions needed:** `listRosters()` in `vfs.js` already groups by faction — use this

### 1.5 Add "Clear Roster" buttons ✅ DONE 2026-06-02
- **File:** `RostersContext.jsx`
- **What:** Add a "CLEAR" action next to both the Player army panel and Enemy army panel
- **Behavior:** Clicking injects a command like `clear roster player` / `clear roster enemy`, which unloads the active roster from session
- **Engine side:** May need a new `clear_roster` command in `commands.py` + handler in `engine.py` that resets `_session["roster_my"]` / `_session["roster_enemy"]` and the corresponding faction

### 1.6 Remove unit count from top nav ✅ DONE 2026-06-02
- **File:** `App.jsx` (~line 648-652)
- **What:** Remove the `· 1,298 units` display from the ONLINE status pill in the nav bar
- **Why:** Available in diagnostic dashboard; clutters the nav

### 1.7 "Unknown" in menu bar ✅ DONE 2026-06-02
- **File:** `App.jsx` (~line 592-604), `server.py` (~line 224)
- **What:** The `buildHash` displays "unknown" when git info isn't available (the `/api/version` endpoint falls back to `"unknown"` when not in a git repo)
- **Fix:** Either hide the build hash entirely when it's "unknown", or ensure the git repo is initialised so a real hash shows. Simplest: `{buildHash && buildHash !== "unknown" && ( ... )}`

---

## 2. Main Page Improvements

### 2.1 Output separators between entries ✅ DONE 2026-06-02
- **File:** `Terminal.jsx` or `TerminalBlock.jsx`
- **What:** Add a visual separator between each command output block. Use a terminal-style divider (e.g. `───────────────` in dim border color, or a thin `1px solid var(--ct-border)` line)
- **Currently:** Outputs stack in a continuous feed with no visual break between them
- **Keep it subtle** — shouldn't feel heavy, just enough to scan where one output ends and the next begins

### 2.2 Modifier toggle scroll-jump fix ✅ DONE 2026-06-02
- **File:** `ModifierToggles.jsx`, `Terminal.jsx`, `CombatBlock.jsx`
- **Current:** Clicking a modifier (e.g. `--ml`) toggles it correctly but scrolls the page to the bottom
- **Root cause:** The `rerun` command fires, which appends/replaces a stream entry, triggering auto-scroll-to-bottom behavior in `Terminal.jsx`
- **Fix:** When a rerun is triggered by modifier toggle (not by user typing a new command), suppress the scroll-to-bottom. Options:
  - Pass a `noScroll` flag through the rerun flow
  - Save `scrollTop` before rerun and restore it after re-render
  - Only auto-scroll when the command came from the CommandBar input, not from inline toggles

### 2.3 Make star icon more prominent ✅ DONE 2026-06-02
- **File:** `TerminalBlock.jsx` (~line 384+), possibly `SpecBannerCard.jsx`
- **What:** The star (★/☆) for favouriting units is too subtle. Make it:
  - Larger (bump from current size)
  - Always visible (not just on hover)
  - Amber/gold color when active, dim but visible when inactive
  - Clickable with a hover glow effect

### 2.4 Make edit button more prominent ✅ DONE 2026-06-02
- **File:** `TerminalBlock.jsx` (~line 384-388)
- **Current:** Small ✎ icon that only shows on hover
- **Target:** Always visible, styled as a clear action button. Consider:
  - Show at all times (not hover-only)
  - Use a label like `[EDIT]` or `[✎ EDIT]` in terminal style
  - Position consistently (top-right of each output block)
  - This is a high-use feature — treat it as primary UI

### 2.5 Unrecognised modifier error + suggestions ✅ DONE 2026-06-02
- **File:** `engine.py` (flag parsing in `_query_combat` or `_apply_flags` in `math_adapter.py`)
- **Current:** Unknown modifiers like `--typo` are silently ignored
- **Target:** Return a clear error block: `[ ERROR ] Unknown modifier: --typo. Did you mean: --twin, --torrent?`
- **Implementation:** Use Levenshtein distance or prefix matching against the known flag list to suggest closest matches (2-3 suggestions max)
- **Known flags:** `ml`, `cover`, `lethal`, `twin`, `sustained`, `blast`, `rf`, `torrent`, `lance`, `invuln`, `ea`, `dev`, `fnp`, `dmgplus`, `melta`

### 2.6 Shrink weapon platform progress bars ✅ DONE 2026-06-02
- **Files:** Combat result components — `TargetingOutcome.jsx`, `CombatBlock.jsx`, `progress.jsx`
- **Current:** Individual progress bars (Hit%, Wound%, etc.) are slightly too large relative to the terminal aesthetic
- **Target:** Reduce bar height to match font size (~12-14px). Make them feel more like inline terminal gauges:
  - Thinner bars (4-6px height instead of current)
  - Monospace percentage labels
  - Tighter vertical spacing
  - Consider using ASCII-style block characters (▓░) as an alternative or supplement

### 2.7 Module separators for output sections ✅ DONE 2026-06-02
- **File:** `CombatBlock.jsx` and sub-components (`TargetingOutcome.jsx`, `SimulationConfidence.jsx`, `CalcList.jsx`, etc.)
- **Current:** Sections like "Total Unit Output", "Simulation Confidence", "Sensitivity" blend together
- **Target:** Add terminal-style separators between each module section:
  ```
  ─── TOTAL UNIT OUTPUT ──────────────────
  [content]
  ─── SIMULATION CONFIDENCE ──────────────
  [content]
  ─── SENSITIVITY SWEEP ──────────────────
  [content]
  ```
- Keep everything compact — the separator replaces whitespace, it doesn't add bulk

### 2.8 Collapse (>), Star, and Delete buttons on each entry ✅ DONE 2026-06-02
- **File:** `TerminalBlock.jsx`
- **Current:** Small `>` exists beside entries but may not be interactive
- **Target:** Three inline controls per output entry, always visible:
  - `>` or `▸`/`▾` — click to collapse/expand the output (just the result, keep the command input line visible)
  - `★` — star/bookmark this output
  - `✕` — delete this output entirely from the stream
- **Layout:** These should be in a consistent position (left gutter or right side of the command input line)

### 2.9 Expand color palette — add red and yellow ✅ DONE 2026-06-02
- **Files:** `shared/colors.js`, components throughout
- **Current:** Primarily green and amber/orange
- **Target:** Incorporate red and yellow semantically:
  - **Red (`#ff3b3b`)** — already defined as `C.red` but underused. Use for: errors, warnings, negative values, damage taken, kill percentages, "OFF" states
  - **Yellow (`#ffd700` or similar)** — add as `C.yellow`. Use for: caution states, medium-priority info, wound percentages, partial completion
  - **Usage examples:**
    - Error messages → red
    - Kill% bars → red gradient
    - Wound% bars → yellow
    - Hit% bars → green
    - Save% bars → cyan (already exists)
    - Modifier penalties → red text
    - Modifier benefits → green text (already done for some)

---

## 3. Theme Switcher

### 3.1 Add theme selector to nav bar ✅ DONE 2026-06-02
- **File:** `App.jsx`
- **What:** Add a button/dropdown in the top-right area of the nav bar (near DIAG / HISTORY) for theme selection
- **Themes available:** Light, Dark, Terminal (console)
- **Current state:** Themes exist in `themeRegistry.js` (dark, light, console — all unlocked). Theme can be set via `theme <name>` command but there's no clickable UI for it
- **Implementation:** Small dropdown or 3-icon toggle. Clicking applies the theme immediately and persists to localStorage (`ct_active_theme`)
- **Style:** Keep it minimal — a small icon (e.g. `◐` or `[THEME]`) that expands to show the three options

---

## 4. History Dropdown Fix

### 4.1 Clean up history list rendering ✅ DONE 2026-06-02
- **File:** `App.jsx` (~line 708-812)
- **Current:** History dropdown is "jumbled" — likely layout issues with long commands, inconsistent spacing, or overflow problems
- **Fix checklist:**
  - Ensure each entry is on its own line with consistent height
  - Truncate long commands with ellipsis (already has `textOverflow: "ellipsis"` but may not be working)
  - Verify `minWidth`/`maxWidth` are appropriate
  - Ensure star (★), command text, and delete (✕) are properly aligned in a clean row
  - Add consistent padding and border-bottom between entries
  - Consider grouping by session or adding timestamps

---

## 5. Tab Autocomplete

### 5.1 Make tab completion functional and visible ✅ DONE 2026-06-02
- **File:** `App.jsx` CommandBar (~line 178-182)
- **Current:** Code exists for tab completion but only works when exactly 1 match is found. Multiple matches → nothing happens. No visual feedback.
- **Target:**
  - **Single match:** Auto-complete (already works)
  - **Multiple matches:** Show a small dropdown/overlay listing all matching commands. User can arrow-key through them or keep typing to narrow
  - **No match:** Brief flash or dim text indicating no matches
  - **Visual hint:** Keep "tab for autocomplete" text in the placeholder or as a subtle label near the input, but only if it actually works well
- **Stretch:** Also autocomplete unit names and faction names (not just commands) — pull from engine's loaded data

---

## Priority Order

**Phase 1 — Quick wins (< 1 hour each): ✅ ALL DONE 2026-06-02**
1. ✅ Remove "Roster Mode" display (1.1)
2. ✅ Remove "Next Turn" from rosters page (1.2)
3. ✅ Remove unit count from nav (1.6)
4. ✅ Fix "unknown" build hash (1.7)
5. ✅ Add output separators (2.1)
6. ✅ Theme selector button (3.1)
7. ✅ Clean up history dropdown (4.1)

**Phase 2 — Medium effort (1-3 hours each): ✅ ALL DONE 2026-06-02**
8. ✅ Condense saved rosters list (1.4)
9. ✅ Add clear roster buttons (1.5)
10. ✅ Make star more prominent (2.3)
11. ✅ Make edit button more prominent (2.4)
12. ✅ Shrink progress bars (2.6)
13. ✅ Module separators (2.7)
14. ✅ Collapse/star/delete buttons (2.8)
15. ✅ Expand color palette usage (2.9)

**Phase 3 — Larger features (3+ hours each): ✅ ALL DONE 2026-06-02**
16. ✅ Fix load player/enemy flow (1.3)
17. ✅ Modifier toggle scroll-jump fix (2.2)
18. ✅ Unrecognised modifier suggestions (2.5)
19. ✅ Tab autocomplete improvements (5.1)

---

## Phase 4 — Polish + Architecture (2026-06-02)

| # | Task | Priority | Status |
|---|------|----------|--------|
| 4.1 | Smoke test all Phase 1-3 UI changes | HIGH | ✅ DONE — all 14 items verified in code, server boots, 69 tests pass, combat math correct |
| 4.2 | Fix auto-deploy CI/CD — launchd agents exist on Phil-2, added `.dockerignore` | MED | ✅ DONE — infra exists, `.dockerignore` added, delete `Dockerfile.new` |
| 4.3 | Lazy faction loading — load dossiers on first query instead of all 29 at startup | MED | ✅ DONE — boot 380ms→17ms (22x), single-pass dossier parsing |
| 4.4 | Add `models` field to roster session | MED | ✅ DONE — already implemented end-to-end |
| 4.5 | Update BUILD_PLAN.md — mark Phase 1-3 done, add Phase 4 | — | ✅ DONE |
| 4.6 | Update BACKLOG.md — mark resolved items, add new findings | — | ✅ DONE |
