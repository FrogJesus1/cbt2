# Combat Terminal — Redesign Fix-Pass Punch List

**Purpose:** the single tracked list of gaps between the design spec and the built app, for the post-redesign fix pass. Phases 0–7 of `REDESIGN_PLAN.md` are built; this file catches what's **missing, broken, or diverged** from the mockups.

**Design source of truth (now in-repo):** `design_reference/` — the `.dc.html` mockups + `README.md` spec. Read these directly; don't audit from memory or plan summaries (that's how features got missed).

**Design → code map:** see `design_reference/README.md` "Design → Code Mapping" table.

---

## How to use this file

Each item gets a **status tag**:

- ✅ **built** — matches the mockup, verified against code + design file
- ⚠️ **partial** — exists but diverges from the mockup (wrong layout/behaviour/data)
- ❌ **missing** — in the mockup, never built
- 🔴 **regression** — worked before the redesign, broke during it
- 🔵 **deferred** — intentionally out of scope, already logged (don't "fix" without deciding)
- ❓ **audit** — not yet verified against code + mockup (the default for un-checked items)

For each item, note: **screen · design file · component(s) · what's wrong · tag**. When fixed, mark ✅ FIXED YYYY-MM-DD with what changed (mirror `BACKLOG.md` style).

**Workflow:** the fix-pass chat works screen-by-screen — open the `.dc.html`, open the mapped component(s), turn every ❓ into ✅/⚠️/❌, fix the ⚠️/❌/🔴 (confirm 🔵 deferrals are still wanted), validate (esbuild + pytest per `REDESIGN_PLAN.md` §verification), commit per screen.

---

## A. User-reported issues (paste here)

> Justin's observed "missing functions" — drop them here in any form; the fix-pass chat will triage, tag, and map each to its design file + component.

- _(add yours — e.g. "Spec page: the ★ MY UNITS rail doesn't jump when I click a unit")_

---

### ⟫ Fix-pass 2026-06-19 — full §B sweep complete

§A was empty, so all 12 screens in §B were swept (mockup ↔ code). **The build is high-fidelity** — most screens were already faithful. Three real fixes landed:

1. **🔴→✅ HEADLINE: theme-token glows/tints were silently dead app-wide.** The redesign's signature glow/tint aesthetic used `\`${token}${alphaHex}\`` (e.g. `${C.green}55`) — which produces `var(--ct-primary)55`, **invalid CSS that browsers drop entirely**. BACKLOG had flagged the **one** SpecBanner instance; it was actually **120 sites across 33 files** (every glow, tinted border, tinted panel). Fixed all via `color-mix(in srgb, <token> N%, transparent)` — the valid pattern `UnitListRich` already used. *This is almost certainly why the app read flatter/duller than the mockups.*
2. **⚠️→✅ Roster upload rejected real files.** The file-drop `accept` filter **and the real validator** used typo'd extensions (`.roz`/`.rozs`) → a genuine `.ros`/`.rosz` BattleScribe export was rejected as "Unsupported file type." Corrected to `.ros`/`.rosz` everywhere (validator + 2 accept attrs + all copy).
3. **⚠️→✅ Threat distribution column** widened `48px → 70px` so "6 (43%)" can't clip (mockup parity).

Everything else verified ✅ (see per-screen sections). Deferrals re-confirmed still-deferred: Combat inline-EDIT + Captain attach (net-new), `⇄ swap`, manual-leader persistence, Math-Mode display-only, alias profile-sync, Rules source-filter substitution. Verified: 36 changed files esbuild-parse clean + full App.jsx import-graph bundles clean; no `.py` touched.

---

### ⟫ Fix-pass 2026-06-19 ROUND 2 — user-reported functional gaps (nav/settings/data wiring)

The round-1 sweep was a static mockup↔component audit; it missed **integration/runtime** bugs in nav wiring and data-loading. Justin reported 7; all fixed:

1. **❌→✅ DATASHEET nav tab missing.** `spec [unit]` was merged into the units context. Split into the mockup's two tabs: **UNITS** (filterable database) + **DATASHEET** (spec sheet + ★ MY UNITS rail). `UnitsContext` gained a `variant` prop (`database` | `datasheet`); mounted twice; `spec`/`unit`/`datasheet <unit>` now route to the datasheet context (App `handleGlobalCommand` early block + Terminal fallback); stars sync across both faces via a `ct-state-changed` listener. (`App.jsx`, `UnitsContext.jsx`, `Terminal.jsx`)
2. **⚠️→✅ UNITS tab was a static boot screen.** Clicking UNITS was pure-nav (no query) so it showed boot text, not the DB. The tab now runs `list units` → the interactive `UnitListRich` + filter rail. (`App.jsx` `SIMPLE_TABS`)
3. **⚠️→✅ Rules "Command Points" duplicated across every filter.** The keyword↔rule merge adopted the *referenced* rule's name + consumed it on every `defined_by_rule` cross-ref, so every CP/stratagem keyword became a "Command Points" entry scattered across categories. Now only an **identity** match (keyword key == rule name) adopts the name/consumes; cross-refs keep their own name + borrow effect text. CP badge also gated to `cp_cost > 0`. (`RulesContext.jsx`)
4. **⚠️→✅ Diagnostics page wouldn't scroll.** Inner container used `minHeight:100%` (grows past the viewport, parent clips). Changed to bounded `height:100% + minHeight:0` so its own `overflowY:auto` engages; hardened the SettingsPage wrapper. (`DiagnosticsPage.jsx`, `SettingsPage.jsx`)
5. **❌→✅ Command List missing modifiers.** Modifiers aren't query commands (they live in `flags.FLAG_SPECS`), so they never appeared. The Command List now also fetches the engine `legend` and renders a **Combat Modifiers** section (31 offensive + 11 defensive + 2 faction = 44, verified against the live engine). (`SettingsPage.jsx`)
6. **⚠️→✅ Aliases not pulling.** The new tab read only client `ct_aliases` (empty); the user's real aliases (`deepstrike`, `fireknife`) live in the engine's `term_aliases`. The tab now imports the engine's aliases on load (verified: both show) and syncs add/remove via `learn`/`unlearn`. (`SettingsPage.jsx`)
7. **⚠️→✅ "Settings" page / 11th-ED placement.** The edition toggle was buried under "Math Mode." Renamed the sub-tab to **General** (placed first), holding Rules Edition + **Theme picker** (new) + Monte Carlo / iterations / confidence / toggles. `math`/`mathmode` (the ledger-replay command) left untouched. (`SettingsPage.jsx`, `App.jsx`)

**Verified:** 39 changed files esbuild-parse clean + App.jsx import-graph bundles clean; engine smoke-test confirms `aliases` + `legend` shapes; **159 Python tests pass** (no `.py` changed). Round-2 needs a visual QA pass on the dev machine (nav split + settings can't be browser-tested in-sandbox).

-
-

---

## B. Per-screen audit checklist (seed)

Derived from `design_reference/README.md` "Screens (key details)". Most rows are ❓ until verified against the live build. Known-shipped (per `REDESIGN_PLAN.md`) and known-deferred items are pre-tagged; **verify even the ✅ ones against the mockup** — "shipped" in the plan ≠ "matches the design."

### Combat Result — `Combat Result.dc.html` → `CombatBlock.jsx` + `combat/*`

- ✅ Section order: echo → banner → (warning) → hero tiles → forces engaged → weapon specs → targeting outcome → total output → modifier impact + sim confidence → abilities → verdict — `CombatBlock.jsx` matches exactly (verified 2026-06-19)
- ✅ Banner: attacker (green) / +leader (cyan) / target (gold) split; clickable modifier tags (`ModifierToggles`) strike-through when off — `combat/BannerCard.jsx`
- 🔵 Banner **inline EDIT form** — **confirmed still deferred.** Net-new stateful feature; command bar + modifier tags + roster flow already cover editing the matchup (Phase 1 reasoning holds).
- 🔵 In-block **Captain attach/detach** (`⚔ CAPTAIN ATTACHED ✕`) — **confirmed still deferred.** Net-new stateful feature (client toggle vs `rerun` semantics undefined). The mockup's leader-attach button is absent from `WeaponStatsTable` header by design.
- ✅ Hero tiles (Total Dmg / Slain / Squad Wipe / Swing) + `<CountUp>` on reveal — `combat/HeroTiles.jsx`
- ✅ Weapon row toggle → OFF badge + opacity + strike-through + **live recompute** of Total/Ranged/Melee (`disabledWeapons`/`adjustedData`) — `combat/WeaponStatsTable.jsx` + `CombatBlock.jsx`
- ⚠️ `kill_chance` / `squad_wipe` **don't** recompute on weapon toggle (engine gap, Phase 1) — documented in `adjustedData()`; hero tiles/verdict stale after a toggle until re-run. **Not a visual fix — engine-side; left as-is.**
- ✅ Modifier stat-highlight (green improved / red worsened) + `ReasonPopover` hover — `combat/WeaponStatsTable.jsx` (`StatCell`/`resolveApDelta`)
- ✅ Abilities split into Attacker (real accordion) / Target (honest "abilities aren't modelled" note) boxes — `combat/AbilitiesBlock.jsx`
- ✅ Verdict summary derives survivors from real `def_models` (never a faked /5) — `combat/VerdictSummary.jsx` (better than mockup, intentional)

**Combat Result audit: CLEAN — all built items match the mockup; the 2 deferrals remain intentionally out of scope (net-new features, not layout-recreation).**

### Spec Unit — `Spec Unit.dc.html` → `SpecBlock.jsx` + `spec/*`

- ✅ Banner faction-tinted name + subtitle (`Faction · <green>pts</green> · Role`) + ★ star — `spec/SpecBannerCard.jsx`
- 🔴 **SpecBanner faction-tint glow no-op** — **✅ FIXED 2026-06-19.** Was `textShadow: \`…${nameColor}55\`` → `var(--ct-faction-x)55` (invalid, dropped). Now `color-mix(in srgb, ${nameColor} 33%, transparent)`. **Found systemic:** the same invalid `${token}HH` / `token + "HH"` pattern was used **120× across 33 files** (glows, tinted borders, tinted backgrounds) — every theme-token glow/tint was silently dead. Fixed **all** via the `color-mix` pattern (the one `UnitListRich` already used). See new BACKLOG entry + the "glow/tint" commit.
- ✅ Keyword chips with hover popover (game meaning) — `spec/KeywordsBar.jsx` (`onMouseEnter`/`hovered` + `KEYWORD_DESCRIPTIONS`)
- ✅ Stat line + weapons table; **AP green for any negative**, AP 0 dim — `spec/WeaponsPanel.jsx` `apColor()` matches the mockup's `parseInt(ap)<0 ? green : (ap==="0"?dim:body)` rule exactly
- ✅ Combat Ratings bars (Dur cyan / Mob green / Obj gold / Fire red / Melee orange) — `spec/StatLine.jsx` `RATING_META`; + **real SVG** radar, axis order DUR→MOB→OBJ→FIRE→MEL — `spec/CombatRadarChart.jsx` `AXES`
- ✅ ★ MY UNITS rail (`SpecShortlistRail.jsx`) — 190px named rail, dot+name click→`onJump`, ✕ remove, italic empty state; binds real `ct_starred_units`
- ✅ Abilities (faction + signature) + optional cyan `◈` note — `SpecBlock.jsx` `drone_notes`

**Spec Unit audit: CLEAN after the glow fix. The 🔴 is resolved (and was the tip of an app-wide glow/tint bug — now fully fixed).**

### Threat — `Threat Pages.dc.html` → `ThreatBlock.jsx`, `ThreatCard.jsx`, `threat/*`

- ✅ Faction view: HIGH/MED/LOW counts, army-composition skew bars (per-type colors), roster-filter state (`⊘` / loaded), threat-distribution chart, ranked Threat Index (expandable → metrics + profile + top counter + "run threat X" hint) — `ThreatSummary.jsx` + `ThreatBlock.jsx` + `ThreatCardRow.jsx`
- ✅ Strategic Notes: ⚠ WARNING (red) / ◉ FOCUS (gold) / › TIP (cyan) left-accent callouts — `threat/StrategicNotes.jsx`
- ✅ Unit view: 4px level accent bar, HIGH/MED/LOW badge, Threat Metrics (Threat/Dur red, Dmg/Mob/Buff cyan), Counter Picks (green bars + reason), Profile, Keywords, Abilities, Enhancement(name+effect) — `ThreatBanner.jsx` + `MetricBars.jsx` + `CounterBlock.jsx` + `ThreatCard.jsx`
- ✅ Threat colors high `#ff5d5d`(C.red) / med `#d8b25a`(C.amber) / low `#84907f`(C.label) — `threat/shared.jsx THREAT_COLORS` (themeable)
- ✅ FIXED 2026-06-19: threat-distribution value column `60px 1fr 48px` → `64px 1fr 70px` (mockup parity; 48px clipped "6 (43%)") — `threat/ThreatSummary.jsx`

**Threat audit: CLEAN. (Ability-category badge + richer ability text deferred — engine doesn't emit `category`; logged, out of scope.)**

### Units Database — `List Units.dc.html` → `UnitsContext.jsx` + `UnitListRich.jsx` + `UnitListFilters.jsx`

- ✅ Filter rail: Faction select · Roster filter (loading/✓ hint) · Points min/max sliders (range label) · Keyword chips (cyan, AND) · Role chips (green, OR) · ⟲ reset — `UnitListFilters.jsx`
- ⚠️ Roster filter matches by **normalised exact name** — under-matches if roster names diverge from DB canon (logged Phase 4). **Confirmed still a known data-layer limitation — out of scope.**
- ✅ Results rows: ★ · name · faction-tinted tag · role · key-rule chips · M/T/Sv/W/OC · Chakra points; row click → `onInject('spec <name>')` (no router) — `UnitListRich.jsx`
- ✅ Search + ★ Shortlist (N) toggle + SORT (pts↓/↑/name/W↓); star binds real `ct_starred_units`; `⊘` empty state — `UnitListRich.jsx`

**Units DB audit: CLEAN.**

### Rosters — `Rosters.dc.html` → `RostersContext.jsx`

- ✅ PLAYER (cyan) + ENEMY (gold) panels: name, count, pts, unit list with ★ leader, `→ attached`, nickname, pts; accent-on-load border — `RostersContext.jsx ArmyPanel`
- ✅ **`✕ clear`** present (red chip, gated on `hasUnits` → `clear roster <side>`). **`⇄ swap`** confirmed still deferred (not in core mockup intent).
- ✅ Shared Rosters grouped by faction (expand → set player / enemy / delete + confirm) + count pills + `factionColor()` dots — `RostersContext.jsx`
- ✅ Campaigns list (idx/name/Turn/W–L) + inline upload entry (panel `upload new`/`upload <side>` → full `UploadFlow`)

### Upload — `Upload Roster.dc.html` → `RostersContext.jsx` → `UploadFlow`

- ✅ Step rail PASTE → DETAILS → LOAD → DONE (active/✓-done states)
- ✅ **File drop present** (drop zone + "— OR PASTE BELOW —" textarea). ✅ FIXED 2026-06-19: the `accept` filter **and the real validator** (`Terminal.jsx` `["roz","rozs"]`) used **typo'd extensions** → real `.ros`/`.rosz` files were rejected ("Unsupported file type"). Corrected to `.ros`/`.rosz` across the validator, both accept attrs, and all display copy (`Terminal.jsx`, `RostersContext.jsx`, `roster/UploadBlock.jsx`, `ui/file-upload.jsx`).
- ✅ Details: auto-detect faction + unit count; **unit review** editor (nickname input · ★ leader [parsed] · attach-to dropdown); persists via `/api/rosters/save-metadata`
- ⚠️ Leader status is **parser-derived**; manual leader toggle **can't persist** (no metadata key — logged Phase 5). **Confirmed out of scope (data-layer).**
- ✅ Load = player / enemy / just-save; Done confirmation step

**Rosters + Upload audit: CLEAN after the extension fix (`.roz/.rozs` → `.ros/.rosz`, which was a real upload-rejection bug, not cosmetic).**

### Crusade — `Crusade.dc.html` → `crusade/*` (`OrderOfBattle`, `CrusadeCard`, ...)

- ✅ Header: Crusade Pts + RP + W/L/Draw + faction dot + Chakra title + `◉ IN BATTLE` pill (Chakra hero numbers) — `CrusadeContext.jsx`. ⚠️ "Battle Round N" label not surfaced (no `battle_round` field on the campaign model — data-gated, not built; logged).
- ✅ Order of Battle + **supply gauge present** (`SupplyGauge`: used/limit + over-by, red when over) + rank-colored rows (left accent + tinted border) — `crusade/OrderOfBattle.jsx`
- ✅ Edit mode (✎ Edit → ✓ Save): XP/Kills/CP/Battles steppers (D2 full manual override), add/remove Honours & Scars, mark-for-greatness, ✝ mark died (SLAIN badge + strikethrough/dim); rank stays derived from XP — `crusade/CrusadeCard.jsx`
- 🔵 `Died` column: wired to documented `Died` checkbox + defensive retry. **Confirmed: still needs live-Airtable confirmation on the dev machine** (sandbox MCP can't see this base) — unchanged from Phase 5.
- ✅ Requisitions panel (spend RP, disabled when unaffordable + hint) + Battle History — `crusade/RPActions.jsx` + `BattleHistory.jsx`

**Crusade audit: CLEAN (supply gauge confirmed present). Optional non-blockers: "Battle Round" label (data-gated), read-view rank-progress bar (enhancement) — logged, not built.**

### Settings — `Settings.dc.html` → `SettingsPage.jsx` + `DiagnosticsPage.jsx`

- ✅ Sub-tabs in order: Diagnostics · Command List · Math Mode · Aliases (Chakra bar, green active underline) — `SettingsPage.jsx`
- ✅ Math Mode: **Edition segmented FIRST** (`:198`), then Engine Mode (`:210`), iterations slider, confidence chips, show-working/variance toggles, live config preview + sample ledger — order matches mockup exactly
- 🔵 Math Mode is **display-only** (E2) — seeds from live engine status, persists to `ct_math_prefs`, does **not** mutate the engine. **Confirmed intentional.**
- ✅ Aliases (F1): `ct_aliases` table + add/remove (Enter-to-add, empty state) — `lib/aliases.js`
- 🔵 Alias **profile-sync** deferred (local-only). **Confirmed.**
- ✅ Command List LIVE from `/api/engines/{id}/schema`; theme picker = the always-present App nav dropdown (mockup's swatch); footer strip in App shell (`COMBAT TERMINAL · v2.0` + `● 11TH EDITION · 40K RULES ENGINE`)

**Settings audit: CLEAN.**

### Rules — `Rules.dc.html` → `RulesContext.jsx`

- ✅ Search + category rail (live counts, 8 categories incl. Mission) + sim-relevant-only toggle + expandable cards; ✓ SIM / ~ SIM badge maps `math_relevant: true|conditional` (keyword inherits its defining rule's effect text) — verified against live merged `/api/rules`+`/api/keywords`
- 🔵 Mockup's **faction filter** replaced by a dynamic **Source filter** (shown when ≥2 sources present) — real dataset is core-rules-centric, a faction dropdown would be empty (G1). **Confirmed acceptable.**

**Rules audit: CLEAN.**

### Login — `Login.dc.html` → `ProfileGate.jsx`

- ✅ Boot console + picker/PIN/create/skip + CRT + caret (Phase 7) — **verify visually**
- ✅ Profile-store outage now shows an honest error + retry/skip (post-Phase-7 fix; **commit not yet pushed** — see BACKLOG)

### Loading / Error states — `Loading States.dc.html`, `Error States.dc.html` → `App.jsx`, `TerminalBlock.jsx`, `index.css`

- ✅ Boot, simulating bar, result reveal, context flicker, connection-lost, degraded banner, did-you-mean (Phase 7) — **verify visually + reduced-motion**
- 🔵 Count-up wired only into combat HeroTiles — other hero numbers still snap (Phase 7)

### Themes — `Themes.dc.html` → `index.css` `[data-theme]` + `data/themeRegistry.js`

- ✅ All 6 handoff themes (+ bonus Console) define the complete token set; **no hardcoded default-palette leaks in components** (only 2 hits, both comments). White Scars **light** theme correctly inverted (light bg/panel, dark text, light borders/track + light-mode overrides for text-mid/body-dim/hairline/cyan/improved/warn) — `index.css [data-theme="light"]`
- ✅ The systemic **glow/tint color-mix fix** (this pass) is the key themeability win — glows/tints now ride the active theme's tokens instead of being dropped, so they re-hue per theme. Visual theme sweep (default + faction + light) deferred to the dev machine (sandbox can't browser-render).

### Mobile — `Mobile.dc.html`

- 🔵 **OUT OF SCOPE** (Decision C, Phase 8 dropped). Don't build now.

---

## C. Known deferrals & open items (compiled from REDESIGN_PLAN + BACKLOG)

These are already-decided/logged — listed so they aren't re-discovered as "bugs." Re-confirm before changing.

1. 🔵 Combat banner inline EDIT form + in-block Captain attach/detach (Phase 1).
2. ⚠️ `kill_chance`/`squad_wipe` don't recompute on weapon toggle (engine gap, Phase 1).
3. 🔴 SpecBanner faction-tint glow no-op — invalid CSS (`var()` + alpha-hex) (Phase 4). **Real bug, fix it.**
4. ⚠️ Units DB / Rosters roster-membership matching by normalised exact name — under-matches (Phase 4).
5. ⚠️ Manual leader override not persistable in upload review (no metadata key) (Phase 5).
6. 🔵 Crusade `⇄ swap` deferred; `Died` column needs live-Airtable confirmation (Phase 5).
7. 🔵 Rules faction filter → Source filter substitution (Phase 6).
8. 🔵 Math Mode display-only (E2); alias profile-sync deferred (Phase 6).
9. 🔵 Count-up only on combat HeroTiles; boot-log counts are flavour text (Phase 7).
10. 🟠 Profile-store resilience code fix (login timeout + `profiles.py` Airtable timeout) — **written, not pushed** (see BACKLOG "Login shows no profiles" row). The prod root cause (missing `env_file` for `warterminal`) is **fixed on Phil-2**.
11. ⚠️ `/api/version` reports `commit:"unknown"` — the `deploy/deploy-war.sh` `GIT_COMMIT` build-arg work is uncommitted in the laptop tree; verify deploys visually, not via `/api/version`, until that lands.

---

## D. Instructions for the fix-pass chat

1. Read `REDESIGN_PLAN.md` §0–3, then this file.
2. For each screen in §B: open `design_reference/<Screen>.dc.html` **and** the mapped component(s); turn every ❓ into ✅/⚠️/❌; fix ⚠️/❌/🔴; confirm 🔵 deferrals are still wanted before touching them.
3. Honour the hard constraints (no router, no new stores, reuse the Phase-0 foundation, keep the data layer) — see `REDESIGN_PLAN.md` §1 + `CLAUDE.md`.
4. Validate per `REDESIGN_PLAN.md` §5 (esbuild parse + import-graph bundle; `pytest` if any `.py`); commit per screen; mark items ✅ FIXED here.
5. Log anything new you discover to this file (and `BACKLOG.md` for engine/data issues).
