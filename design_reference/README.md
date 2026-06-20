# Handoff: Combat Terminal — UI Redesign

## Overview
A full visual + interaction redesign of **Combat Terminal**, a Warhammer 40k probability/combat-math web tool. This bundle upgrades every screen to a cohesive "Cogitator Dashboard" terminal aesthetic: phosphor-green on near-black, monospace data with a squared display face for headings, ASCII/hazard dividers, glowing accents, subtle scanlines, and a docked command bar. It also adds faction theming, motion/loading states, mobile layouts, error states, and an edition (10th/11th) switch.

This is a **redesign of an existing, working program**. The app already has a consolidated SPA shell (`App.jsx` mounts every context, persists nav/theme/profile, swaps via `display:none`). These design files do **not** need their own shell — they exist one-per-screen only so each layout is reviewable in isolation. The duplicated chrome/nav in each file is a mockup artifact.

## About the Design Files
The files in this bundle are **design references created as Design Components (`.dc.html`)** — streaming HTML prototypes showing the intended look and behavior. They are **not production code to copy**. Each is a self-contained doc: read its inline styles and structure, then **recreate the layout inside the existing React codebase** using its established components and patterns. Do not paste the `.dc.html` markup into the app — it runs on a different (DCLogic/`renderVals`) runtime.

`.dc.html` structure, for reading: a `<x-dc>` template (markup with `{{ }}` holes and `<sc-for>`/`<sc-if>` control flow) plus a `class Component extends DCLogic { renderVals() { … } }` logic block. Treat `renderVals()` as the component's derived view-model and the template as JSX-equivalent markup.

## Fidelity
**High-fidelity (hifi).** Final colors (exact hex below), typography, spacing, and interactions. Recreate pixel-faithfully using the codebase's existing libraries/patterns. Where a screen already exists in code (e.g. `CombatBlock.jsx`, `SpecBlock.jsx`, `ThreatCard.jsx`), restyle/restructure it to match; do not rebuild the data layer.

## Design → Code Mapping
| Design file | Target in codebase |
|---|---|
| `Combat Result.dc.html` | `components/CombatBlock.jsx` + `components/combat/*` (BannerCard, WeaponStatsTable, TargetingOutcome, TotalUnitOutputPanel, ModifierToggles, ModifierImpact, AbilitiesBlock, SimulationConfidence) |
| `Combat Home.dc.html` | `App.jsx` main/`Terminal.jsx` landing state + command history panel |
| `Threat Pages.dc.html` | `ThreatCard.jsx`, `threat/ThreatSummary.jsx`, `threat/ThreatCardRow.jsx`, `threat/StrategicNotes.jsx` |
| `List Units.dc.html` | `UnitsContext.jsx` + units list/roster blocks |
| `Spec Unit.dc.html` | `SpecBlock.jsx` + `spec/*` (SpecBannerCard, KeywordsBar, StatLine, WeaponsPanel, CombatRadarChart, SpecAbilitiesBlock) |
| `Rosters.dc.html` | `RostersContext.jsx` (ArmyPanel, SavedRostersSection, CampaignsSection) |
| `Upload Roster.dc.html` | `RostersContext.jsx` → `UploadFlow` (paste→detect→name→review→role) |
| `Crusade.dc.html` | `crusade/*` (OrderOfBattle, CrusadeCard, RPActions, BattleHistory) |
| `Rules.dc.html` | `RulesContext.jsx` + a new rules/keyword browser (uses `rules.json`, `keyword_dictionary.json`) |
| `Settings.dc.html` | `DiagnosticsPage.jsx` + new settings tabs (Command List, Math Mode, Aliases) + theme picker |
| `Login.dc.html` | `ProfileGate.jsx` |
| `Themes.dc.html` | `index.css` `[data-theme]` blocks + `data/themeRegistry.js` |
| `Loading States.dc.html` | shell-level boot/loading/transition motion |
| `Error States.dc.html` | offline/no-result/404/connection-lost states |
| `Mobile.dc.html` | responsive variants of the above |

## Type & layout system (applies to every screen)
- **Fonts:** `IBM Plex Mono` for all data/body; `Chakra Petch` (600/700, letter-spacing ~0.12–0.16em, uppercase) for headings, hero numbers, nav labels, badges.
- **Frame:** dark screen card, `border-radius:3px`, `overflow:hidden`. Chrome bar (status dot + `COMBAT TERMINAL` + `v2.0 · 7a3f1c · 11TH ED`) → nav row (tabs, active = `#eef4ee` text + 2px green underline) → content (`padding:16–22px`) → docked command bar (`border-top:2px solid #1f5a36`, `›` prompt + input + blinking caret).
- **Section header pattern:** Chakra-Petch label + a hazard rule (`repeating-linear-gradient(45deg,#d8b25a 0 6px,#11140f 6px 12px); opacity:.5; height:3px; flex:1`).
- **Cards/tiles:** `background:#12150f; border:1px solid #232a26; border-radius:5px`.
- **Bars:** track `#1c241e; border-radius:3px; height:6px`; fill = solid color (no gradients), `border-radius:3px`.
- **Scanline overlay (optional):** `repeating-linear-gradient(0deg,transparent 0 2px,rgba(0,0,0,.09) 2px 3px)`.

## Design Tokens — default (green) theme
```
bg            #0d0f12     bgDark        #0a0c0e     panel         #12150f
line/border   #232a26     track         #1c241e     hairline      #1a201c
primary       #4fd873     primaryMid    #2a6c44     primaryDim    #5f6b62
text          #eef4ee     textMid       #cdd4cb     bodyDim       #a8b0a4
labelDim      #84907f     faintDim      #5f6b62     ghost         #3f4a40
accent/gold   #d8b25a     cyan          #4fd0e0     leadCyan      #7fe0ec
danger/red    #ff5d5d     amber/warn    #ffb000     improved-grn  #6ee08a
verdict glow border #1f5a36
```
Semantic mapping (keep consistent so themes swap cleanly): **primary** = hit bar / main accent / section underline; **accent (gold)** = section headers + wound bar + points; **cyan** = leader/drone/secondary; **danger (red)** = unsaved/kill/critical. Leader weapons/units render in **cyan** to distinguish from green unit rows + gold wound bars.

## Faction themes (Themes.dc.html)
Each is a full token set; only re-hue, keep the semantic mapping. Wire into `[data-theme="…"]`. `bg · panel · primary · accent · danger`:
- **Default (green):** `#0d0f12 · #12150f · #4fd873 · #d8b25a · #ff5d5d`
- **T'au · Farsight Enclave (crimson/flame on black):** `#0a0706 · #170b08 · #ef4a3a · #f2c25a · #ff8a3d`
- **Orks (acid yellow + rust):** `#100c00 · #1a1402 · #cfe023 · #e0631c · #ff3a1e`
- **Chaos Daemons (blood-red + warp-purple):** `#0a0306 · #16070d · #ff2733 · #bf40ff · #ff6a2a`
- **Dark Angels (bone & forest, monastic):** `#04130c · #0a1a10 · #e6dcc2 · #2faa55 · #c23b3b`
- **White Scars · Light (white ground):** `#ece9e2 · #f6f3ed · #c0392b · #b8893a · #d9622e` — **inverted**: text `#2a2620`, borders `#cfc8b8`, track `#dbd5c7`; flip text/border treatment vs the dark themes.

(Each theme also needs bgDark, line, track, primaryDim, text, dim — see the legend strip + `renderVals().THEMES()` in `Themes.dc.html` for the full sets.)

## Screens (key details)

### Combat Result (`Combat Result.dc.html`)
- **Layout:** chrome → nav → echo command line → **Banner** (attacker [+leader] vs target, with clickable **modifier Tags** that strike through when off) → **hero tiles** (Total Dmg / Slain / Squad Wipe / Swing) → **Forces Engaged** (per-unit `↳ weapon · shots · ranged/melee` summary, attacker+leader, target stat line) → **Weapon Specs** table (▸ Ranged / ▸ Melee sections; cols Weapon[+kw badges]/Rng/A/BS/S/WR/AP/D) → **Targeting Outcome** (per-weapon HIT/WOUND/UNSAVED bars) → **Total Output** (Ranged + Melee panels w/ Dmg, Slain, Kill%, Overkill, Swinginess) → **Modifier Impact** + **Simulation Confidence** (2-col) → **Abilities** (two separate boxes: Attacker / Target, accordion) → **Verdict** summary → command bar.
- **Interactions:** click a weapon row → toggle it out of the sim (strike-through + `OFF` badge, opacity .45); **Total/Ranged/Melee dmg recompute live**. Attach/detach Captain (`⚔ CAPTAIN ATTACHED ✕`) → adds/removes its (cyan) weapons + recomputes. **Modifier-driven stat highlight:** when an active modifier improves a stat it renders green with a hover popover (`Hit 3+ → 2+ · +1 to Hit`), worsens → red (`AP −1 → 0 · Target in Cover`); recolors as tags toggle.

### Spec Unit / Datasheet (`Spec Unit.dc.html`)
Banner (name tinted by faction color, subtitle `Faction · pts · Role`, ★ star) → **keyword chips** (hover popover w/ game meaning) → **Stat Line** (M/T/Sv/W/Ld/OC boxes) + **Weapons table** (Ranged/Melee, `[KW]` tags, AP green when negative) → **Combat Ratings** bars (Durability cyan, Mobility green, Obj gold, Firepower red, Melee orange) + **radar chart** (SVG pentagon — build as real SVG, not template loop) → **Abilities** (faction + signature) → optional cyan note. **Right rail "★ MY UNITS"**: quick-jump list of starred units (shared `localStorage` shortlist) — clicking jumps to that unit. Reads `?unit=` param.

### Threat (`Threat Pages.dc.html`)
- **threat [faction]:** Units Loaded + HIGH/MED/LOW counts, Army Composition skew bars, Roster Filter state, Threat Distribution chart, ranked **Threat Index** (expandable rows → metrics + profile + top counter), **Strategic Notes** (WARNING red / FOCUS gold / TIP cyan).
- **threat [unit]:** banner + HIGH/MED/LOW badge, Threat Metrics (Threat/Dur red, Dmg/Mob/Buff cyan), Counter Picks (green bars + reason), Profile, Keywords, Abilities, Enhancement.
- Threat colors: high `#ff5d5d`, medium `#d8b25a`, low `#84907f`.

### Units Database (`List Units.dc.html`)
Left filter rail (Faction select, Roster filter, **Points min/max sliders**, Keyword chips [AND-matched], Role chips, reset) + results list (rows: ★, name, faction-colored tag, role, key-rule chips, M/T/Sv/W/OC, points). Top: search + **★ Shortlist (N)** toggle. **Star persists** to `localStorage` (cross-page shortlist). Clicking a row → `Spec Unit?unit=…`. Faction tag colors: SM `#5b9bff`, T'au `#e0962e`, Necrons `#4fd873`, Orks `#a0c020`, Aeldari `#4fd0e0`, Death Guard `#9bbf4a`.

### Rosters (`Rosters.dc.html`) + Upload (`Upload Roster.dc.html`) + Crusade (`Crusade.dc.html`)
- **Rosters:** PLAYER (cyan) + ENEMY (gold) panels (name, count, pts, unit list w/ ★ leader, `→ attached` badge, nickname, pts, **⇄ swap / ✕ clear**), Shared Rosters grouped by faction (expand → set player/enemy/delete), Campaigns list, inline upload.
- **Upload flow:** step rail Paste → Details → Load → Done. Paste step has a **file drop (.rosz/.ros)** + textarea. Details auto-detects faction + counts units and shows a **unit review** (nickname each, ★ leader toggle, attach-to dropdown). Load = player / enemy / just save.
- **Crusade:** campaign header (round, W-L, Crusade Pts, RP), Order of Battle w/ supply gauge + rank-colored unit rows (Battle-ready→Blooded→Battle-hardened→Heroic→Legendary), expandable Crusade Card. **Edit mode**: cards are read-only until **✎ Edit** (→ **✓ Save**), which reveals XP/Kills/Crusade-Pts steppers, add/remove Battle Honours & Scars, mark-for-greatness, and **✝ mark died** (slain = red `✝ SLAIN` badge + dim). Persists to `localStorage`. Requisitions panel (spend RP, disabled when unaffordable), Battle History.

### Settings (`Settings.dc.html`)
Sub-tabs: **Diagnostics** (system health badges, data-flow pipeline, data-integrity traffic-light grid, engine docs), **Command List** (grouped reference), **Math Mode** (**Rules Edition 11th/10th** segmented control first, then Monte Carlo/Deterministic toggle, iterations slider, confidence chips, show-working/variance toggles, live config + sample ledger), **Aliases** (table + add/remove). **Theme picker** = small color-swatch circle in the nav row → dropdown of themes (persists `ct_active_theme`). **Footer** strip shows `COMBAT TERMINAL · v2.0` + `● 11TH EDITION · 40K rules engine`.

### Login (`Login.dc.html`)
Boot sequence (flicker + scanline sweep + typed boot log + banner glow → READY) → profile picker (status dot: gold=PIN, green=open; 🔒 PIN badge) / PIN entry / create (callsign + optional PIN) / skip. CRT scanlines + vignette + flicker; blinking "awaiting authentication" caret.

## Interactions & Behavior (cross-cutting)
- **Command bar routing:** Enter routes by pattern — `X vs Y`→combat, `spec X`→datasheet, `threat X`→threat, `list units`/`units`→DB, `rosters`/`set roster`→rosters, `rule`/`rules`→rules, `theme X`/`diag`/`math`→settings. Clicking an action that has a command equivalent should animate-type it into the bar first (existing `animateAndSubmit`).
- **Motion (`Loading States.dc.html`):** (1) **boot/power-on** — flicker → scanline sweep → boot lines stream → banner glow → READY; (2) **command run** — typewriter inject → `INJECT` → `⟳ simulating · 5,000 iterations` progress → ✓; (3) **result reveal** — bars fill (easeOut ~1.1s) + numbers count up + lines stream, quick; (4) **context switch** — fast CRT flicker + green top-sweep on nav change. Keep it terminal-flavored.
- **Error states (`Error States.dc.html`):** engine-offline (amber banner, deterministic fallback, dimmed results, retry/diagnostics); no-results (`⊘` + reason + clear filters); unknown command / 404 (red `✕ command not recognised` + "did you mean" + help); connection-lost (full-screen `⚠ COGITATOR UNREACHABLE`, `python main.py` hint, reconnect/offline, retry countdown).

## State Management
Reuse existing contexts. New/used `localStorage` keys: `ct_active_theme`, `ct_edition` (`"10th"|"11th"`, design-only for now — not yet wired to a backend engine swap), `ct_units_shortlist` (starred units, shared by Units DB + Datasheet), `ct_cmd_history`, `ct_crusade_units` (crusade edits). The **edition** + **theme** live at shell level and must render sitewide (footer on desktop; minimal `XI` badge top-bar on mobile; `· 11TH ED` next to the version chip on every page).

## Responsive (`Mobile.dc.html`)
Single column; top app bar (≡/back + title + `XI` edition badge + theme dot) + **bottom tab bar** (Combat/Units/Rosters/Rules icons) + docked command bar on terminal screens. Tables → stacked cards; matchup stacks vertically (Attacker → VS → Target); stat line → 3×2 grid; roster panels stack with "+N more"; Datasheet gets a horizontal-scroll **★ MY UNITS** chip strip; lists get search pill + scrollable filter chips. Phone frame ~360px.

## Assets
No raster assets. All visuals are CSS (gradients, glows, scanlines) + Unicode glyphs (⚡ ★ ◆ ↳ ⊘ ⚠ ✝ › ⇄ ✕ etc.). Fonts via Google Fonts: IBM Plex Mono, Chakra Petch. Radar chart is inline SVG. **No raster faction logos** — keep the existing brand/icon system in the codebase if/where logos appear.

## Files
All `*.dc.html` at the project root are the design references (see mapping table). Read them directly for exact inline values; this README is the authoritative spec.
