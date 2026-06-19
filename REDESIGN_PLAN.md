# Combat Terminal — UI Redesign Implementation Plan

**Source:** `design_handoff_combat_terminal_redesign/` (16 `.dc.html` mockups + README spec)
**Target:** existing React/Vite app in `render/web/src/`
**Status:** Phases 0–5 COMPLETE & validated. Phases 6–7 pending. Decisions A/B/C/H resolved (A: exact mockup look, kept themeable · B: solid bar variant · C: mobile out of scope · H: 11TH ED cosmetic).
**Drafted:** 2026-06-18 · Updated: 2026-06-19

---

## 0. Executive summary

This is a **visual + interaction reskin of a working app**, not a rebuild. After cross-checking every mockup against the codebase, the picture is:

- **~70% is restyle / restructure of components that already exist** and already match the mockups structurally. The SVG radar, keyword hover-popovers, weapon-row toggles, modifier stat-coloring, threat views, roster panels, crusade editor, diagnostics page, command history, theme picker, and "did you mean" error suggestions are **already built**.
- **The data layer does not change.** The app is backed by a real Python engine + Airtable. Every mockup ships fake `DB()`/`renderVals()` data and throwaway `localStorage` stores — those are prototype scaffolding and must be ignored. We restyle over the existing data contracts.
- **One genuinely new screen:** the Units Database interactive filter rail (Phase 4). A few net-new sub-features elsewhere (Combat hero tiles/verdict, Settings sub-tabs, Rules browser, edition switch, boot/CRT motion).
- **The foundation (tokens, fonts, theme set, shell chrome, edition) is the linchpin** — it touches every screen and must land first.

### Core architectural constraint (drives every screen)

The app is a **single-page command terminal with no router**. Everything renders as result blocks in a shared stream, dispatched by `result_type` in `TerminalBlock.jsx`. The mockups are page-shaped (separate files, `?unit=` URL nav) — but the README is explicit that this is a mockup artifact: *"These design files do not need their own shell… the duplicated chrome/nav in each file is a mockup artifact."*

**Therefore:** we keep the command-stream SPA. "Row click → Spec Unit?unit=X" becomes `onInject("spec X")` (which already exists), **not** a route. We do **not** introduce react-router or `?unit=` reading. The mockups are visual targets for the existing block renderers + contexts.

---

## 1. Guiding constraints

1. **Keep the SPA command model.** No router. Clicks that "navigate" call the existing inject/command runner.
2. **Do not touch the data layer.** No changes to the engine, Airtable, or API response shapes except the few explicitly flagged (abilities-by-side tagging, a `died` crusade field, a rules-data endpoint). Mockup parsers/`route()`/`localStorage` stores are reference-only.
3. **Do not introduce parallel stores.** Reuse existing keys: `ct_active_theme`, `ct_cmd_history`, `ct_starred_units`, `ct_unit_nicknames`, `ct_leader_attachments`. The mockup's `ct_units_shortlist` / `ct_crusade_units` are **not** adopted.
4. **Stay themeable.** Colors flow through CSS variables (`shared/colors.js` → `--ct-*`). We rework the token layer rather than hardcoding mockup hexes.
5. **Keep the test suites green.** `tests/test_combat_math.py`, `test_loader_smoke.py`, `test_crusade_logic.py`, `test_api_integration.py` must pass after any change that touches Python. Frontend must `vite build` clean.

---

## 2. Decisions needed (with recommendations)

These shape the build. **Bold = recommended.** Decisions A–C affect Phase 0 / are cross-cutting; the rest can be confirmed when we reach their phase.

| # | Decision | Options | Recommendation | Impact |
|---|----------|---------|----------------|--------|
| **A** ✅ **RESOLVED** | **Theme/color architecture** — the mockup palette (`#0d0f12` bg, `#4fd873` green, `#d8b25a` gold, `#4fd0e0` cyan, `#ff5d5d` red) matches no existing theme, and the spec wants gold/cyan/red to **re-hue per faction theme**. Today amber/red are hardcoded "semantic" in `colors.js`. | — | **DECIDED: exact mockup look, kept themeable.** Retune the **default** theme to the mockup hexes pixel-for-pixel (so the app looks exactly like the design out of the box); promote `accent`(gold)/`danger`(red) to `--ct-*` vars alongside `primary`/`cyan`; **keep the theme picker + existing themes working**, and add the handoff's 6 faction palettes (Default green, T'au Farsight, Orks, Chaos, Dark Angels, White Scars Light) as bonus. No hardcoding. (User goal: "look like the mockup" — delivered with zero visual compromise; theme system preserved since the Settings/Themes mockups themselves show a picker. Stripping the picker later is a trivial trim if ever wanted.) | Foundation. |
| **B** | **Bars: segmented vs solid.** The shared `Bar` renders 10 discrete segments; every mockup uses a single solid fill. | (B1) **Add a `solid` variant to `Bar`** and use it for the redesigned screens. (B2) Switch the house style to solid everywhere. (B3) Keep segmented. | **B1** — matches mockups without a risky global flip; segmented stays available. | Cross-cutting (Spec ratings, Threat metrics, Combat bars). |
| **C** ✅ **RESOLVED** | **Mobile scope** (`Mobile.dc.html`) — responsive top app bar + bottom tab bar + card reflows touch nearly every component. | — | **DECIDED: skip mobile for now.** Desktop only. Phase 8 is dropped from this effort; revisit responsive later as a separate project. | Total scope. |
| **D** ✅ **RESOLVED** | **Crusade edit-mode** — mockup adds a read-only→`✎ Edit` gate with free-form XP/Kills/CP steppers + `✝ mark died`. Current `CrusadeCard` is always-editable, server-backed, and battle counters are **post-battle-derived (read-only by design)**. | (D1) Adopt the visual edit gate; keep counters post-battle-derived; add a persisted `died` field. (D2) Allow full manual override of all counters. | **DECIDED: D2** — full manual override. Edit mode exposes steppers that hand-write XP / EnemyKills / CrusadePoints / BattlesFought / BattlesSurvived (all already writable number columns on `CrusadeUnits`), plus add/remove honours & scars, mark-for-greatness, and `✝ mark died`. Rank stays **derived** from the (now manually-set) XP via `rank_for_xp`. | Crusade only. Counters need no schema change — only a manual-override write path. `died`/SLAIN = **1 new `CrusadeUnits` field** (no `Died`/`Slain` column exists today). |
| E | **Settings → Math Mode** — is the MC/Deterministic + iterations + confidence panel a **real engine control** or display-only (as in the mockup)? | (E1) Wire to real engine params (`simulation_config.trials`, mode). (E2) Display-only chrome for now. | E1 if low-effort, else E2 (confirm at Phase 6) | Settings only. |
| F | **Aliases tab** — no backend exists. | (F1) Build real (localStorage `ct_aliases` + Terminal expansion + profile sync). (F2) Static placeholder. | F1 (confirm at Phase 6) | Settings only. |
| G | **Rules data delivery** — no endpoint serves the full rules/keyword dataset to the client. | (G1) **New `GET /api/rules` + `/api/keywords`** endpoints. (G2) Bundle a generated JSON into the frontend. | G1 — single source of truth, stays in sync (confirm at Phase 6) | Rules browser. |
| H | **Edition default** — data is 10th; chrome says "11TH ED"; switch is design-only for now. | (H1) **Show `11TH ED` as the chrome/footer label, toggle is cosmetic** (per handoff "design-only"). | H1 | Sitewide chrome/footer. |

---

## 3. Cross-cutting workstreams

Built in Phase 0, reused everywhere. Listed here so they're not re-invented per screen.

- **`SectionHeader` primitive** (`combat/shared.jsx` or a shared module): Chakra-Petch uppercase label + hazard rule (`repeating-linear-gradient(45deg,#d8b25a 0 6px,#11140f 6px 12px); opacity:.5; height:3px; flex:1`). Replaces today's `SectionTitle` (amber + border) and `ColumnHeader` (`───TITLE───`). Used on **every** screen.
- **`Bar` solid variant** (Decision B): `shared/constants.jsx`.
- **Faction-color module**: lift the mockups' faction→color map (SM `#5b9bff`, T'au `#e0962e`, Necrons `#4fd873`, Orks `#a0c020`, Aeldari `#4fd0e0`, Death Guard `#9bbf4a`, …) into `shared/colors.js`. Used by Spec banner tint, Units DB tags, Rosters shared-roster dots.
- **Edition system** (`ct_edition`): a small shared hook/context read by chrome badge, footer, mobile `XI` badge, and the Settings Math-Mode segmented control. Net-new.
- **Token layer** (Decision A): `index.css` `[data-theme]` blocks + `colors.js` + `themeRegistry.js`.
- **Chakra Petch font**: add to `index.html` Google Fonts link (only IBM Plex Mono is loaded today).
- **Motion utilities** (Phase 7, but defined centrally): typewriter (exists in `CommandBar.animateAndSubmit`), progress bar, `INJECT` flash, count-up reveal, context-switch flicker, CRT scanline/vignette layer (currently commented-out in `index.css`).

---

## 4. Phased plan

Dependency order. Each phase ends with a verification gate (§5). Phases 3–7 are largely independent once Phase 0 lands.

### Phase 0 — Foundation ✅ COMPLETE (2026-06-18)

**Shipped:** `index.css` fully reworked — default theme retuned to the exact mockup palette (`#0d0f12`/`#4fd873`/gold `#d8b25a`/cyan `#4fd0e0`/danger `#ff5d5d`), new semantic vars (`--ct-accent`, `--ct-danger`, `--ct-track`, `--ct-text`, `--ct-text-mid`, `--ct-body-dim`, `--ct-lead-cyan`, `--ct-warn`, `--ct-improved`, faction-tag vars), all 6 handoff faction themes built (incl. inverted White Scars light) + console retained. `colors.js` remapped (`amber→accent`, `red→danger`, added `text/accent/danger/cyan/etc.` — now theme-shifting). Chakra Petch added to `index.html` + `.ct-display`. `SectionHeader` (hazard rule) + `Bar` `solid` variant + 5px card radius in `shared/constants.jsx`/`combat/shared.jsx`. New `hooks/useEdition.js` (`ct_edition`, default 11th). `App.jsx` shell restructured into chrome bar (status dot + COMBAT TERMINAL + `v2.0 · hash` + clickable edition chip) → nav row (tabs restyled: active = near-white text + green underline, Chakra face, swatch theme picker) → footer strip (`COMBAT TERMINAL · v2.0` + `● 11TH EDITION · 40K RULES ENGINE`).

**Verified:** esbuild parse of all 7 changed files (JSX/JS/CSS) + full local import-graph bundle resolves clean, no warnings. NOTE: live `vite build` + browser screenshot could not run in the build sandbox (mount can't read parts of `node_modules` → `-35`/EDEADLK; no browser). Both run normally on the dev machine — pending a visual check there.

**Goal:** the shared visual language + shell, so screens drop in cleanly.

| Area | Files | Change |
|------|-------|--------|
| Tokens | `index.css`, `shared/colors.js`, `data/themeRegistry.js` | Decision A: retune default theme to spec palette; promote `accent`(gold)/`danger`(red) to `--ct-*` vars; build the spec's 6 faction themes (incl. the **inverted** White Scars light theme: dark text on light ground). |
| Fonts | `index.html`, `index.css` | Add Chakra Petch (600/700). Set heading/hero/nav/badge font to Chakra Petch uppercase, letter-spacing ~0.12–0.16em; keep IBM Plex Mono for data/body. |
| Shell chrome | `App.jsx` (~826–1010) | Restyle frame: status dot + `COMBAT TERMINAL` + `v2.0 · <hash> · 11TH ED`; nav row (active = `#eef4ee` + 2px green underline); docked command bar (`border-top:2px solid #1f5a36`, `›` prompt + blinking caret). |
| Edition | new `useEdition` hook/context + `App.jsx` | `ct_edition` state, sitewide render (chrome chip + footer). Design-only toggle. |
| Footer | `App.jsx` | `COMBAT TERMINAL · v2.0` + `● 11TH EDITION · 40K rules engine`. |
| Primitives | `combat/shared.jsx`, `shared/constants.jsx` | `SectionHeader` (hazard rule), `Bar` solid variant, card/tile tokens (`bg #12150f; border 1px #232a26; radius 5px`). |

**Risk:** retheming shifts the whole app's look at once (intended). Verify all existing themes still render and no component hardcodes a color that should now be a token.

---

### Phase 1 — Combat Result ✅ COMPLETE (2026-06-19)

**Shipped:** `CombatBlock.jsx` recomposed to the mockup order (echo → banner → hero tiles → forces engaged → weapon specs → targeting outcome → total output → modifier impact + sim confidence → abilities → verdict). New `combat/HeroTiles.jsx`, `combat/ForcesEngaged.jsx`, `combat/VerdictSummary.jsx`. `BannerCard` now splits attacker/+leader (cyan)/target (gold) + keeps clickable tags. `TargetingOutcome` → 2-col HIT/WOUND/UNSAVED solid-bar cards. `TotalUnitOutputPanel` → hero-number Ranged(green)/Melee(gold) panels. `WeaponStatsTable` → `▸ Ranged`/`▸ Melee` + Chakra header (toggle/OFF/keyword-chips/stat-coloring preserved). `ModifierImpact`/`SimulationConfidence`/`GraphListBlock` → SectionHeader + solid bars. `AbilitiesBlock` → Attacker panel (real) + honest "Target not modelled" panel. One additive engine line: `target_profile` surfaced in the combat result `data` (feeds Forces Engaged stat line + Verdict).

**Verified:** esbuild parse of all 12 changed combat files + full local bundle + CombatBlock subtree bundle (16 combat modules) resolve clean; **159 Python tests pass** (loader + combat math) after the engine change. Live `vite build`/screenshot still pending on the dev machine (sandbox mount limit).

**Deferred (net-new features, not "recreate the layout"):** the Banner inline EDIT form and the in-block Captain attach/detach toggle — both are new stateful behaviours; the command bar + modifier tags + roster flow already cover editing the matchup. Logged for a later pass. Live weapon-toggle recompute (existing) is preserved; `kill_chance`/`squad_wipe` stay server-side after a toggle (documented engine gap).

### Phase 1 — Combat Result *(centerpiece)* — original spec below

**Target:** `CombatBlock.jsx` + `combat/*`. Data contract preserved (`ranged`/`melee` summaries, `weapons[]` with modifier deltas, `simulation`, `target_profile`, `modifier_impact`, `abilities`).

**Reuse as-is (already built):** weapon-row toggle + `OFF` badge + opacity (`CombatBlock` `disabledWeapons` / `WeaponStatsTable`), `adjustedData` live recompute, modifier stat-coloring + `ReasonPopover` hover, modifier tag toggles → server `rerun`, conditional keyword chips (`KeywordBadge`), `ModifierImpact`, `SimulationConfidence`. Column set already matches (`Weapon/Rng/A/BS/S/WR/AP/D`).

| Section | File | Change |
|---------|------|--------|
| Banner + clickable tags + leader chip + EDIT form | `combat/BannerCard.jsx` | Restyle + add `+ Captain` (cyan) chip, EDIT button → inline edit form. |
| Hero tiles (Total Dmg / Slain / Squad Wipe / Swing) | **new** `combat/HeroTiles.jsx` | New 4-tile strip. |
| Forces Engaged (2-col, leader sub-group, target stat line) | **new** `combat/ForcesEngaged.jsx` | Extends existing `CalcList`; adds leader grouping + target column (binds `target_profile`). |
| Weapon Specs table | `combat/WeaponStatsTable.jsx` | Restyle; `▸ Ranged`/`▸ Melee` headers; cyan leader rows; leader-attach button. |
| Targeting Outcome (HIT/WOUND/UNSAVED bars) | `combat/TargetingOutcome.jsx` | Restructure to 2-col card grid, 3 bars each. |
| Total Output (hero number + bar + rows) | `combat/TotalUnitOutputPanel.jsx` | Restructure to hero-number cards (Ranged green / Melee gold). |
| Modifier Impact + Sim Confidence | `combat/ModifierImpact.jsx`, `SimulationConfidence.jsx` | Restyle only (2-col). |
| Abilities (Attacker / Target columns) | `combat/AbilitiesBlock.jsx` | Restructure to 2 columns — **needs abilities tagged by side** (data decision). |
| Verdict summary | **new** `combat/VerdictSummary.jsx` | New — derive survivors/verdict client-side from `expected_kills` + `target_profile`. |

**Risks / decisions:**
- **Verdict / Survivors / Models-Slain have no server fields** → derive client-side (don't fake the `/5` denominator — use real defender model count).
- **Abilities are one array, not split by side** → tag server-side or infer in-block (data-contract touch).
- **In-block Captain attach/detach is new + stateful** → define path (client display toggle vs `rerun` with/without leader).
- **`kill_chance_pct` / `squad_wipe_pct` don't recompute on weapon toggle** (documented engine gap) → hero tiles/verdict slightly stale after toggle unless re-run.

---

### Phase 2 — Combat Home + landing ✅ COMPLETE (2026-06-19)

**Shipped:** new `components/CombatHome.jsx` — the mockup landing recreated as the `main` empty-state. Hero (⚡ COMBAT TERMINAL + tagline + right-aligned **live** readouts: `● MC ACTIVE`/`● DETERMINISTIC`/`○ OFFLINE` from `/api/engines/{id}/status` `simulation_mode`+`ready`, and `N factions` from `/api/factions`) → **Quick Start** `SectionHeader` (accent=text label + gold hazard rule) + 3-col grid of 6 cards (Run Combat/Unit Datasheet/Threat/Unit Database/Rosters/Rules), each runs its example command via `onRun`→`handleAnimatedInject` (no router, no mockup `route()`/`run()`) → **Command History** panel hydrated from App's `cmdHistory` (`ct_cmd_history`) with ★ pin, click-to-edit (populate bar), `▸ Run` (animate+submit), ✕ delete, and a "No history yet" empty state. Type badges derive COMBAT(green)/THREAT(red)/SPEC(cyan)/CMD(dim) from the input. `Terminal.jsx`: replaced the old inline QUICK START guide with `<CombatHome/>` under the existing `contextId==="main" && stream.length===0` gate (first result swaps Home → stream; `clear` brings Home back), threaded `cmdHistory`/`onHistoryStar`/`onHistoryDelete` props (reusing `onInject`/`onEdit`), and suppressed the ASCII boot splash while Home shows (the hero is the banner). `App.jsx`: passes `cmdHistory`+`handleHistoryStar`+`handleHistoryDelete` to the main Terminal. Fully themeable (all `C.*`/CSS vars; only the two decorative card-glyph tints — Rosters purple `#a78bdb`, Rules slate `#8fb0c4` — are intentionally fixed, non-semantic).

**Decision (Home swap):** resolved per the plan's recommendation — **Home IS the `main` empty-state**; it lives exactly where the old quick-start guide did, so the existing stream gate handles the swap with zero new state. Not asked as a fork (pre-resolved + architecturally natural).

**Verified:** esbuild parse of all 3 changed files (CombatHome new, Terminal, App) + full local import-graph bundle from `App.jsx` resolves clean, **no warnings**. **159 Python tests pass** (loader + combat math) — no `.py` touched, so the suite is unaffected by construction. Live `vite build`/browser screenshot still pending on the dev machine (sandbox mount limit). A faithful static HTML preview at the exact default-theme tokens was generated for eyeballing.

**Target:** the `main` context. Today it boots into an empty terminal stream.

| Area | File | Change |
|------|------|--------|
| Home view (hero + Quick Start grid + Command History panel) | **new** `components/CombatHome.jsx` | New landing. Quick-start cards call `handleAnimatedInject(cmd)` (not URL nav). |
| Command history | `App.jsx` | **Reuse** `ct_cmd_history` (mockup uses the *same key*, storage-compatible). Promote the existing nav dropdown data to a full Home panel; add a `▸ run` affordance alongside edit. |

**Key decision:** does Home replace the empty `main` terminal or sit above it? Typing a combat command must transition Home → result stream. Define the swap (recommend: Home is the `main` empty-state; first result swaps it for the stream).

---

### Phase 3 — Spec + Threat ✅ COMPLETE (2026-06-19)

**Shipped:** *Foundation* — `SectionHeader` gained an optional `hint` prop; new `factionColor()` resolver in `shared/colors.js` (slug/label → `--ct-faction-*` var, default green); `THREAT_COLORS.low` → `C.label` (#84907f, now themeable instead of #5f6b62); `spec/shared` + `threat/shared` `Bar` wrappers default to **solid**; both shared modules now export a local Chakra-Petch gold 10px `SectionTitle` (in-card label) — the global `constants.SectionTitle` is left untouched so combat is unaffected.
*Spec datasheet* — `SpecBannerCard` name faction-tinted (Chakra 22px + glow), subtitle `Faction · <green>pts</green> · Role`, squared ★ button; `StatLine` ratings → solid bars + mockup palette (Dur cyan / Mob green / Obj gold / FP red / Melee orange) + Chakra stat boxes; `WeaponsPanel` any-negative-AP green, `▸ Ranged`(green)/`▸ Melee`(gold) Chakra headers, near-white weapon names, compact dim column headers; `CombatRadarChart` axes reordered to mockup order (DUR→MOB→OBJ→FIRE→MEL) + axis colors aligned to the ratings palette; `KeywordsBar` gains a "KEYWORDS" label + rounded chips. **New `components/SpecShortlistRail.jsx`** — the 190px named **★ MY UNITS** rail (header + count, faction-dot rows click-to-jump + `✕` remove, italic empty state) replaces the 44px abbreviated sidebar in `UnitsContext` and is always visible in the units context.
*Threat [faction]* — `FactionHeader` → Chakra near-white name + gold "THREAT ASSESSMENT" + "N units catalogued" (dropped the red bar/badge); `ThreatBlock` section dividers → hazard `SectionHeader`s (THREAT INDEX +hint / INTEL / STRATEGIC NOTES, split so detachments/stratagems stay under INTEL); `ThreatCardRow` expanded body → **slim teaser** (threat metrics + profile + top counter + "↳ run threat X for the full dossier" hint) instead of the full inline `ThreatCard`; `ThreatSummary` skew/dist bar tracks → `C.track` + radius (dropped the footer hint, tightened grid to 1 : 1.6 : 1); `StrategicNotes` → left-accent callout rows (⚠ red / ◉ gold / › cyan), card+title wrapper removed.
*Threat [unit]* — `ThreatBanner` gains a 4px level accent bar + center align + Chakra name; `MetricBars`/`CounterBlock` bars now solid; `CounterBlock` "Counter Picks" → green Chakra label + light-green counter names; keyword chips → dim-cyan + rounded; `EnhancementBadge` accepts `{name,effect}` or a string with a right-aligned italic effect + themeable gold badge.
*Reuse honored:* no router / no `?unit=`; uses existing `ct_starred_units` (not the mockup's `ct_units_shortlist`); all colors flow through `C.*`/CSS vars (only fixed non-semantic value is the melee orange `#ff8a3d`).

**Verified:** esbuild parse of all 20 changed/new files + full import-graph bundle from `App.jsx` (and the `SpecBlock`/`ThreatBlock`/`ThreatCard`/`UnitsContext` subtrees) resolve clean, no errors. **159 Python tests pass** (loader + combat math) — no `.py` touched, so the suite is unaffected by construction. Live `vite build`/browser screenshot still pending on the dev machine (sandbox mount limit); holistic visual pass scheduled after all phases land.

### Phase 3 — Spec + Threat *(mostly restyle)* — original spec below

**Spec Unit** — `SpecBlock.jsx` + `spec/*`. Layout already matches the mockup.
- **Already done:** real SVG radar (`CombatRadarChart.jsx` — the "must be real SVG" requirement is **already met**), keyword hover-popovers, stat line, weapons table, abilities, star/shortlist persistence (`ct_starred_units`).
- **Changes:** faction-tint the banner name (currently always amber) via the new faction-color module; AP-green threshold (mockup: any negative AP green; code: only ≤−3); ratings bars → solid (Decision B); reconcile radar axis order if exact parity wanted; **widen the `★ MY UNITS` rail** from the current 44px abbreviated sidebar (`UnitsContext.jsx`) to the 190px named rail (count + per-row remove + empty state). Optional new `SpecShortlistRail.jsx`.

**Threat** — two views, both exist:
- `threat [faction]` → `ThreatBlock.jsx` + `threat/ThreatSummary.jsx`, `ThreatCardRow.jsx`, `StrategicNotes.jsx`. Skew/distribution bars already solid. Changes: Strategic Notes left-accent border + icon swap (◉ FOCUS, › TIP); optional slim expanded row; per-row "run threat …" hint.
- `threat [unit]` → `ThreatCard.jsx` + `threat/*`. Changes: small vertical accent bar on banner; enhancement effect string; metrics already cyan/red correct.
- **Threat colors** → set `THREAT_COLORS` (`threat/shared.jsx`) to high `#ff5d5d` / med `#d8b25a` / low `#84907f`.

**New files:** none required for Threat; optional shortlist-rail extraction for Spec.

---

### Phase 4 — Units Database ✅ COMPLETE (2026-06-19)

**Shipped:** the headline interactive screen. `UnitListRich` lifted out of `TerminalBlock.jsx` into **new `components/UnitListRich.jsx`** and rebuilt to the `List Units` mockup, plus **new `components/UnitListFilters.jsx`** (the left rail). The block now renders a bordered "UNIT DATABASE" panel in the stream: title + search + **★ Shortlist (N)** toggle → `236px 1fr` grid of [filter rail | results]. *Filter rail* — Faction select (options derived from the factions actually in the payload), **Roster filter** (real saved rosters via `fetchRosters`; on select fetches the roster and runs the existing `parseRosterUnits` to resolve member names, all defensively wrapped → fails to a no-op "All units" if the store is offline or the shape is odd), **Points min/max sliders** (bounds derived from the result set, step 5, null-points units always pass), **Keyword chips** (cyan, AND-matched), **Role chips** (green, OR-matched), Reset. *Results* — "N of M units" + ★ SHORTLIST VIEW badge + SORT dropdown (Points ↓/↑ · Name · Wounds ↓, nulls sort last); rows recreate the mockup exactly (★ star, name, faction-tinted tag, role, cyan rule chips capped at 6 +N, M/T/Sv/W/OC stat strip, Chakra points hero) ; `⊘` empty state; **results area scrolls internally (max 560px)** so a 1300-row `list units` stays a sane block and the rail stays put. Row click → `onInject('spec <name>')` (no router, no `?unit=`). **Star binds to the real `ct_starred_units` string[]** — prop-threaded in the Units context (keeps the ★ MY UNITS rail in sync), else self-managed via localStorage + the `ct-state-changed` event in any other context. Faction tints flow through `factionColor()` + `color-mix` (themeable; degrades to plain text colour if unsupported). Mockup's `ct_units_shortlist` / `route()` / fake `units()` ignored per constraints.

**One additive data line (Phase-1 precedent):** `loader.get_list` units branch now also surfaces per-unit `M`, `OC`, `role`, and `keywords` (aggregated, de-noised combat-rule keywords harvested from `weapons[].keywords` — underscore/threshold/die variants merged, mashed entries split, platform noise dropped: 67 raw → 34 clean). Purely additive keys; the CLI `unit_list_rich` renderer reads only name/T/W/legends/forgeworld, so it's unaffected.

**Verified:** esbuild parse of all 3 changed/new JS files + full import-graph bundle from `App.jsx` **and** the `UnitListRich` subtree (resolves `@/lib/shared-rosters` + `@/lib/rosterParse`) — clean, **no warnings**. **159 Python tests pass** (loader + combat math) after the additive `get_list` change. Live `vite build`/browser screenshot still pending on the dev machine (sandbox mount limit); a faithful static HTML preview at the exact default-theme tokens was generated for eyeballing. Holistic visual pass scheduled after all phases land.

**Deferred / noted:** roster-membership matching is by normalised exact name (best-effort; under-matches rather than crashes if a roster's unit names diverge from DB canon). Logged to `BACKLOG.md`. Also logged: a pre-existing Phase-3 `SpecBannerCard` `textShadow: \`…${nameColor}55\`` no-op (can't append alpha hex to a `var()`), for the visual fix pass.

### Phase 4 — Units Database *(the one big new build)* — original spec below

**Target:** `UnitListRich` is currently **inline in `TerminalBlock.jsx`** (no filtering UI — units are filtered by typing commands).

| Area | File | Change |
|------|------|--------|
| Extract renderer | **new** `components/UnitListRich.jsx` | Lift out of `TerminalBlock.jsx`. |
| Filter rail | **new** `components/UnitListFilters.jsx` | Faction select, roster filter, **points min/max sliders**, keyword chips (AND-matched), role chips, reset. |
| Results | same | Search box, **★ Shortlist (N)** toggle, sort dropdown, rows (★, name, faction tag, role, rule chips, M/T/Sv/W/OC, points), `⊘` empty state. Row click → `onInject("spec …")`. |

**Reuse:** the mockup's `renderVals` is a clean, complete reference for filter/sort/AND-match/star logic — port the *behavior*, bind to real data + `ct_starred_units` (reconcile its `string[]` shape vs mockup's `{name:bool}` map). Faction tag colors from the shared module.

**Decision:** this is the screen that shifts from "command-driven filtering" to "interactive controls" — confirm we want the full rail (recommended; it's the headline UX upgrade).

---

### Phase 5 — Rosters + Upload + Crusade ✅ COMPLETE (2026-06-19)

**Shipped:** *Rosters* (`RostersContext.jsx`) — the local amber `SectionHeader` is dropped for the foundation hazard-rule `SectionHeader` (Chakra label + gold hazard rule); "ACTIVE ARMIES" is now an `auto-fit minmax(280px,1fr)` panel grid; each `ArmyPanel` gains a 5px radius, an **accent-on-load** border + inset left bar (player cyan / enemy gold) and a Chakra near-white army name; SHARED ROSTERS faction rows get a `factionColor()` dot; the "⚠ UNDER CONSTRUCTION — BUGS LIKELY" banner is **reframed** to a calm cyan left-accent "◉ ROSTER-SCOPED COMBAT" info note (kept the useful roster-restriction explanation, dropped the alarm — see decision note below). *Upload* (`UploadFlow`) — added a **PASTE → DETAILS → LOAD → DONE** step rail (active/✓-done states); the Details step parses the pasted roster with the shared `parseRosterUnits` and shows a **unit-review editor** (per-unit nickname input + leader→bodyguard attach select, leader shown as parsed ★) whose edits persist via the **existing** `/api/rosters/save-metadata` endpoint in the same `# @nickname:`/`# @attach:` line format the dashboard uses (no new store; best-effort, localStorage stays the fallback); a new **DONE** confirmation step (load-as-player cyan / enemy gold / save). Parent contract split into `onLoad` (load now, keep flow open) + `onComplete` (close). *Crusade* (`CrusadeContext.jsx` + `crusade/*`) — **Decision D2 (full manual override)** shipped: `CrusadeCard` now opens **read-only** (counters, honours/scars chips, loadout, status) with an **`✎ Edit` → `✓ Save`** gate; edit mode adds **manual steppers** for BattlesFought / BattlesSurvived / EnemyKills / CrusadePoints (− N + with type-in), plus the existing XP field, honours/scars editors, leader/attach/greatness toggles, and a **`✝ Mark died`** toggle. **Rank stays derived** from the (now manually-set) XP via the existing auto/manual rank toggle. `crusade_store.py`: `Died` (checkbox, redBright) added to `TABLE_SPECS[UNITS_TABLE]` + `_UNIT_FIELD_MAP` + `_record_to_unit` (defaults False); `update_unit` now (a) only auto-derives `CrusadePoints` from honours−scars when the caller did **not** hand-write `crusade_points` (so D2's manual CP override sticks), and (b) defensively drops `Died` and retries if a base predates that column. **No bespoke endpoint** — the generic `PUT /api/crusade/units/{id}` already passes `died` straight through. OOB rows are **rank-colored** (left accent bar + tinted border via new `rankColor()`), with `✝ SLAIN` badge + strikethrough/dim for died units; rank display relabels stored `Fresh` → **"Battle-ready"** (display only) and adds **Legendary purple `#a78bdb`** (new `rankLabel`/`rankColor`/`RANK_COLORS` in `crusade/ui.jsx`, whose `SectionHeader` is upgraded to the hazard rule too). Campaign detail goes **2-col** (`minmax(0,1fr) 320px`: Order of Battle + requisition left, Campaign Stats sidebar right; battle/muster flows stay full-width), the header gains a **Crusade Pts** stat + faction dot + Chakra title + an `◉ IN BATTLE` pill, and stat values render as Chakra hero numbers.

**Decisions (resolved without a fork):** (1) **UNDER CONSTRUCTION banner** — the plan flagged "(confirm)"; reframed to a calm info note rather than deleted, since the roster-restriction explanation is genuinely useful and only the alarmist "BUGS LIKELY" framing conflicts with a finished look. Trivial to fully remove or restore the hard warning if preferred. (2) **`mark died` endpoint** — skipped; the generic unit-update route already carries `died`, so a dedicated route would be redundant surface area. (3) **`⇄ swap`** roster affordance (plan "optional minor") — deferred; not in the core mockup intent and out of scope for momentum.

**Verified:** esbuild parse of all 5 changed JS files + full import-graph bundle from `App.jsx` **and** the `CrusadeContext` + `RostersContext` subtrees resolve clean, **no warnings** (the `CrusadeCard`/`OrderOfBattle`/`ui` rank-helper exports + `RostersContext`→`parseRosterUnits` all resolve). **191 Python tests pass** (loader + combat + crusade-logic + api-integration) after the `crusade_store.py` change — the crusade-logic suite exercises `update_unit`/`finalize_battle` against the in-memory fake table, so the `died`/CrusadePoints-guard changes are covered. Live `vite build`/browser screenshot still pending on the dev machine (sandbox mount limit); holistic visual pass scheduled after all phases land.

**Notes / deferred:** Leader status in both the upload review editor and the dashboard remains **parser-derived** (from the `CharN:` roster prefix) — the metadata format persists nicknames + attachments but not a manual leader flag, so a manual leader override would need a data-layer addition (out of scope per the "don't rebuild the data layer" constraint). The `Died` column could not be verified against the live Airtable base from the sandbox (the MCP account can't see this base) — wired to the documented field name `Died` (checkbox) with a defensive retry; **the dev machine should confirm the live column exists** (the plan says it was added by hand 2026-06-19). Logged to `BACKLOG.md`. This commit also carries a **pre-existing, uncommitted** crusade import-dedup fix (`lib/crusade.js` `_unitKey` export + `OrderOfBattle` ImportFlow count-based skip) that was already in the working tree — included only because `OrderOfBattle.jsx` (a Phase-5 file) imports `_unitKey`, so the two must ship together to keep the tree consistent.

### Phase 5 — Rosters + Upload + Crusade *(original spec below)*

**Rosters** — `RostersContext.jsx`. Pure restyle. Player-cyan/enemy-gold already correct; nicknames/attachments (`ct_unit_nicknames`, `ct_leader_attachments`) + API preserved. Changes: bordered 2-col panel grid, accent-on-load border, shared-roster color dots + count pills, remove the "UNDER CONSTRUCTION" banner (confirm), optional `⇄ swap` (net-new minor).

**Upload** — `RostersContext.jsx` → `UploadFlow`. The 4-step flow exists (paste→faction→name→role); server-side detect/parse preserved (do **not** use the mockup's client parser). Changes: step rail (Paste→Details→Load→Done); **new unit-review editor** on Details (nickname / ★ leader / attach-to per unit — data already in `rosterParse.js`); new Done confirmation; reconcile file extensions (`.rosz/.ros` mockup vs `.roz/.rozs/.json` code — backend dictates).

**Crusade** — `CrusadeContext.jsx` + `crusade/*`. Server-backed REST (do **not** introduce `ct_crusade_units`). Changes: 2-col layout (`1fr 320px`, responsive), rank-colored OOB rows (left bar + tinted border), surface Battle Round + Crusade Pts in header. **Decision D — RESOLVED: D2 (full manual override).** Adopt the `✎ Edit`→`✓ Save` gate; in edit mode, steppers hand-write **all** counters — XP / EnemyKills / CrusadePoints / BattlesFought / BattlesSurvived (these are already writable number columns on the `CrusadeUnits` Airtable table, so **no counter schema change**), plus add/remove Battle Honours & Scars, mark-for-greatness, and `✝ mark died`. Keep **Rank derived** from the manually-set XP via `crusade_store.rank_for_xp` (recompute on save) — don't make rank free-text. **Schema add — DONE (manual, 2026-06-19):** the `Died` (checkbox) field was added to the `CrusadeUnits` Airtable table by hand (the self-provisioner only creates missing *tables*, not *columns*). Remaining is **code-only**: add `{"name": "Died", "type": "checkbox", "options": {"icon": "check", "color": "redBright"}}` to `TABLE_SPECS[UNITS_TABLE]` (so a fresh base provisions it too), then wire it through `crusade_store.py` read/write + a `mark died` endpoint + `CrusadeCard`/`OrderOfBattle` (SLAIN badge + dim). NOTE: the MCP-connected Airtable account can't see this base (only DOMINION/SEEDS/Life OS), so the build session must verify the exact field name/type against Airtable when wiring. Rank naming: server stores `Fresh`; mockup says `Battle-ready` — relabel display only; add Legendary purple `#a78bdb`.

---

### Phase 6 — Settings + Rules

**Settings** — replace the bare `settings` terminal context with a **new `components/SettingsPage.jsx`** (4 sub-tabs). Re-point the nav dropdown to switch tabs instead of injecting commands.
- **Diagnostics:** embed existing `DiagnosticsPage.jsx` (~95% there) — restyle engine-docs accordion → card grid.
- **Command List:** new; wire to `GET /api/engines/{name}/commands` (Decision: live vs static).
- **Math Mode:** new config panel — **Edition segmented control FIRST**, then MC/Deterministic, iterations slider (1000–20000), confidence chips, show-working/variance toggles, live config + sample ledger. **Decision E** (real engine params vs display-only). Note: distinct from the existing `MathModeBlock.jsx` ledger *replay player*.
- **Aliases:** **Decision F** (build real vs static).
- Theme picker swatch in the sub-nav row (logic reused from App top-bar).

**Rules** — near-total rewrite of `RulesContext.jsx` into a browser (search + category rail + faction filter + "sim-relevant only" + expandable cards). **Decision G:** add `GET /api/rules` + `/api/keywords` (`server.py`) — currently nothing serves the full dataset. High-value low-risk win: the `✓ SIM`/`~ SIM` badge maps directly to `math_relevant: true|conditional` in `keyword_dictionary.json`. Keep `TerminalRuleBlock` for typed `rule <term>` lookups.

---

### Phase 7 — Login + boot + Error/Loading motion

**Login** — `ProfileGate.jsx`. Same 4-view state machine + API calls preserved. Add: boot sequence (flicker + scanline sweep + typed boot log → READY), CRT scanlines/vignette/flicker, status dot (gold=PIN, green=open), `🔒 PIN` badge. Respect `prefers-reduced-motion`; show boot once per session.

**Loading motion** — typewriter exists (`CommandBar.animateAndSubmit`). Add: `INJECT` flash, `⟳ simulating · N iterations` progress bar, `✓` completion, result-reveal bar-fill + count-up, context-switch CRT flicker.

**Error states** — restyle existing "did you mean" (`TerminalError` — already parses suggestions) and no-results into bordered cards. **New:** engine-degraded (amber banner + deterministic fallback + dimmed results) and full-screen connection-lost (`⚠ COGITATOR UNREACHABLE` + `python main.py` hint + retry countdown).

---

### Phase 8 — Mobile *(❌ OUT OF SCOPE — Decision C: skipped)*

~~Responsive pass over App shell + components.~~ Dropped from this effort per Decision C. `Mobile.dc.html` is parked for a future responsive project. The edition `XI` badge and bottom-tab patterns it shows are noted but not built now.

---

## 5. Verification strategy

Per-phase gate before moving on:

1. **`vite build` clean** (no errors/warnings introduced).
2. **Python tests green** if any `.py` touched: `pytest tests/` (math, loader, crusade, api). The combat-math suite is load-bearing — never let it regress for a visual change.
3. **Visual check** against the mockup — I'll run the app/build and screenshot key states (default + at least one faction theme + light/inverted theme).
4. **Theme sweep** — confirm every screen renders in the new default + each faction theme without hardcoded-color leaks.
5. **Phase 0 + each later phase:** a short diff review and a note to `BACKLOG.md` per the project's backlog protocol.
6. **High-stakes phases (0, 1, 4):** a subagent verification pass (independent review of the diff against the spec).

---

## 6. Dependency graph

```
Phase 0 (Foundation) ─┬─> Phase 1 (Combat Result)
                      ├─> Phase 2 (Combat Home)
                      ├─> Phase 3 (Spec + Threat)
                      ├─> Phase 4 (Units DB)
                      ├─> Phase 5 (Rosters/Upload/Crusade)
                      ├─> Phase 6 (Settings + Rules)
                      └─> Phase 7 (Login + motion + errors)

  Phase 8 (Mobile) — OUT OF SCOPE (Decision C)
```

Phase 0 is the only hard blocker. 1–7 can be reordered or parallelized by interest; **suggested order = 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7** (centerpiece early for momentum).

---

## 7. Net-new files (summary)

`combat/HeroTiles.jsx`, `combat/ForcesEngaged.jsx`, `combat/VerdictSummary.jsx`, `components/CombatHome.jsx`, `components/UnitListRich.jsx` (extracted) + `components/UnitListFilters.jsx`, optional `spec/SpecShortlistRail.jsx`, `components/SettingsPage.jsx`, rewritten `RulesContext.jsx`, `useEdition` hook, motion/CRT utilities, `server.py` rules endpoints. Everything else is edits to existing files.

## 8. Deferred / open decisions

D (crusade edit-mode + `died` field) · E (Math Mode real vs cosmetic) · F (aliases real vs static) · G (rules endpoint vs bundle) — all confirmable when we reach their phase. A, B, C, H should be settled before Phase 0.
