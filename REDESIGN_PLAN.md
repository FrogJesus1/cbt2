# Combat Terminal — UI Redesign Implementation Plan

**Source:** `design_handoff_combat_terminal_redesign/` (16 `.dc.html` mockups + README spec)
**Target:** existing React/Vite app in `render/web/src/`
**Status:** Phases 0–1 COMPLETE & validated. Phases 2–7 pending. Decisions A/B/C/H resolved (A: exact mockup look, kept themeable · B: solid bar variant · C: mobile out of scope · H: 11TH ED cosmetic).
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
| D | **Crusade edit-mode** — mockup adds a read-only→`✎ Edit` gate with free-form XP/Kills/CP steppers + `✝ mark died`. Current `CrusadeCard` is always-editable, server-backed, and battle counters are **post-battle-derived (read-only by design)**. | (D1) Adopt the visual edit gate; keep counters post-battle-derived; add a persisted `died` field (steppers for XP/honours/scars only). (D2) Allow full manual override of all counters. | D1 (confirm at Phase 5) | Crusade only. `died` needs a server/Airtable field. |
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

### Phase 2 — Combat Home + landing

**Target:** the `main` context. Today it boots into an empty terminal stream.

| Area | File | Change |
|------|------|--------|
| Home view (hero + Quick Start grid + Command History panel) | **new** `components/CombatHome.jsx` | New landing. Quick-start cards call `handleAnimatedInject(cmd)` (not URL nav). |
| Command history | `App.jsx` | **Reuse** `ct_cmd_history` (mockup uses the *same key*, storage-compatible). Promote the existing nav dropdown data to a full Home panel; add a `▸ run` affordance alongside edit. |

**Key decision:** does Home replace the empty `main` terminal or sit above it? Typing a combat command must transition Home → result stream. Define the swap (recommend: Home is the `main` empty-state; first result swaps it for the stream).

---

### Phase 3 — Spec + Threat *(mostly restyle)*

**Spec Unit** — `SpecBlock.jsx` + `spec/*`. Layout already matches the mockup.
- **Already done:** real SVG radar (`CombatRadarChart.jsx` — the "must be real SVG" requirement is **already met**), keyword hover-popovers, stat line, weapons table, abilities, star/shortlist persistence (`ct_starred_units`).
- **Changes:** faction-tint the banner name (currently always amber) via the new faction-color module; AP-green threshold (mockup: any negative AP green; code: only ≤−3); ratings bars → solid (Decision B); reconcile radar axis order if exact parity wanted; **widen the `★ MY UNITS` rail** from the current 44px abbreviated sidebar (`UnitsContext.jsx`) to the 190px named rail (count + per-row remove + empty state). Optional new `SpecShortlistRail.jsx`.

**Threat** — two views, both exist:
- `threat [faction]` → `ThreatBlock.jsx` + `threat/ThreatSummary.jsx`, `ThreatCardRow.jsx`, `StrategicNotes.jsx`. Skew/distribution bars already solid. Changes: Strategic Notes left-accent border + icon swap (◉ FOCUS, › TIP); optional slim expanded row; per-row "run threat …" hint.
- `threat [unit]` → `ThreatCard.jsx` + `threat/*`. Changes: small vertical accent bar on banner; enhancement effect string; metrics already cyan/red correct.
- **Threat colors** → set `THREAT_COLORS` (`threat/shared.jsx`) to high `#ff5d5d` / med `#d8b25a` / low `#84907f`.

**New files:** none required for Threat; optional shortlist-rail extraction for Spec.

---

### Phase 4 — Units Database *(the one big new build)*

**Target:** `UnitListRich` is currently **inline in `TerminalBlock.jsx`** (no filtering UI — units are filtered by typing commands).

| Area | File | Change |
|------|------|--------|
| Extract renderer | **new** `components/UnitListRich.jsx` | Lift out of `TerminalBlock.jsx`. |
| Filter rail | **new** `components/UnitListFilters.jsx` | Faction select, roster filter, **points min/max sliders**, keyword chips (AND-matched), role chips, reset. |
| Results | same | Search box, **★ Shortlist (N)** toggle, sort dropdown, rows (★, name, faction tag, role, rule chips, M/T/Sv/W/OC, points), `⊘` empty state. Row click → `onInject("spec …")`. |

**Reuse:** the mockup's `renderVals` is a clean, complete reference for filter/sort/AND-match/star logic — port the *behavior*, bind to real data + `ct_starred_units` (reconcile its `string[]` shape vs mockup's `{name:bool}` map). Faction tag colors from the shared module.

**Decision:** this is the screen that shifts from "command-driven filtering" to "interactive controls" — confirm we want the full rail (recommended; it's the headline UX upgrade).

---

### Phase 5 — Rosters + Upload + Crusade

**Rosters** — `RostersContext.jsx`. Pure restyle. Player-cyan/enemy-gold already correct; nicknames/attachments (`ct_unit_nicknames`, `ct_leader_attachments`) + API preserved. Changes: bordered 2-col panel grid, accent-on-load border, shared-roster color dots + count pills, remove the "UNDER CONSTRUCTION" banner (confirm), optional `⇄ swap` (net-new minor).

**Upload** — `RostersContext.jsx` → `UploadFlow`. The 4-step flow exists (paste→faction→name→role); server-side detect/parse preserved (do **not** use the mockup's client parser). Changes: step rail (Paste→Details→Load→Done); **new unit-review editor** on Details (nickname / ★ leader / attach-to per unit — data already in `rosterParse.js`); new Done confirmation; reconcile file extensions (`.rosz/.ros` mockup vs `.roz/.rozs/.json` code — backend dictates).

**Crusade** — `CrusadeContext.jsx` + `crusade/*`. Server-backed REST (do **not** introduce `ct_crusade_units`). Changes: 2-col layout (`1fr 320px`, responsive), rank-colored OOB rows (left bar + tinted border), surface Battle Round + Crusade Pts in header. **Decision D:** adopt the `✎ Edit`→`✓ Save` visual gate, add `✝ mark died`/`SLAIN` (new persisted `died` field — verify Airtable schema), keep battle counters post-battle-derived. Rank naming: server stores `Fresh`; mockup says `Battle-ready` — relabel display only; add Legendary purple `#a78bdb`.

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
