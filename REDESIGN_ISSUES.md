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
-
-

---

## B. Per-screen audit checklist (seed)

Derived from `design_reference/README.md` "Screens (key details)". Most rows are ❓ until verified against the live build. Known-shipped (per `REDESIGN_PLAN.md`) and known-deferred items are pre-tagged; **verify even the ✅ ones against the mockup** — "shipped" in the plan ≠ "matches the design."

### Combat Result — `Combat Result.dc.html` → `CombatBlock.jsx` + `combat/*`

- ❓ Section order: echo → banner → hero tiles → forces engaged → weapon specs → targeting outcome → total output → modifier impact + sim confidence → abilities → verdict
- ❓ Banner: attacker / +leader (cyan) / target (gold) split; clickable modifier tags strike-through when off
- 🔵 Banner **inline EDIT form** — deferred (Phase 1 note). Confirm still wanted.
- 🔵 In-block **Captain attach/detach** (`⚔ CAPTAIN ATTACHED ✕`, adds cyan weapons, recompute) — deferred (Phase 1 note).
- ❓ Hero tiles (Total Dmg / Slain / Squad Wipe / Swing) + count-up on reveal
- ❓ Weapon row toggle → OFF badge + opacity + **live recompute** of Total/Ranged/Melee
- ⚠️ `kill_chance` / `squad_wipe` **don't** recompute on weapon toggle (engine gap, Phase 1) — hero tiles/verdict go stale after a toggle until re-run
- ❓ Modifier stat-highlight (green improved / red worsened) + hover popover; recolors as tags toggle
- ❓ Abilities split into Attacker / Target boxes (Phase 1 shipped an honest "target not modelled" panel — verify)
- ❓ Verdict summary derives survivors from real defender model count (not a faked /5)

### Spec Unit — `Spec Unit.dc.html` → `SpecBlock.jsx` + `spec/*`

- ❓ Banner faction-tinted name + subtitle (`Faction · pts · Role`) + ★ star
- 🔴? **SpecBanner faction-tint glow is a no-op** — `textShadow` appends alpha-hex to a `var()` → invalid CSS, glow never renders (logged Phase 4). Fix with `color-mix`.
- ❓ Keyword chips with hover popover (game meaning)
- ❓ Stat line + weapons table; **AP green when negative** (mockup: any negative; verify threshold)
- ❓ Combat Ratings bars (Dur cyan / Mob green / Obj gold / Fire red / Melee orange) + **real SVG** radar (axis order DUR→MOB→OBJ→FIRE→MEL)
- ❓ ★ MY UNITS rail (`SpecShortlistRail.jsx`) — click a unit jumps to it; remove; empty state
- ❓ Abilities (faction + signature) + optional cyan note

### Threat — `Threat Pages.dc.html` → `ThreatBlock.jsx`, `ThreatCard.jsx`, `threat/*`

- ❓ Faction view: HIGH/MED/LOW counts, army-composition skew bars, roster-filter state, threat-distribution chart, ranked Threat Index (expandable → metrics + profile + top counter)
- ❓ Strategic Notes: WARNING (red) / FOCUS (gold) / TIP (cyan) left-accent callouts
- ❓ Unit view: level accent bar, HIGH/MED/LOW badge, Threat Metrics (Threat/Dur red, Dmg/Mob/Buff cyan), Counter Picks (green bars + reason), Profile, Keywords, Abilities, Enhancement
- ❓ Threat colors high `#ff5d5d` / med `#d8b25a` / low `#84907f`

### Units Database — `List Units.dc.html` → `UnitsContext.jsx` + `UnitListRich.jsx` + `UnitListFilters.jsx`

- ❓ Filter rail: Faction select · Roster filter · Points min/max sliders · Keyword chips (AND) · Role chips · reset
- ⚠️ Roster filter matches by **normalised exact name** — under-matches if roster names diverge from DB canon (logged Phase 4)
- ❓ Results rows: ★ · name · faction tag · role · key-rule chips · M/T/Sv/W/OC · points; row click → `spec <name>`
- ❓ Search + ★ Shortlist (N) toggle; star persists to `ct_starred_units`; `⊘` empty state

### Rosters — `Rosters.dc.html` → `RostersContext.jsx`

- ❓ PLAYER (cyan) + ENEMY (gold) panels: name, count, pts, unit list with ★ leader, `→ attached`, nickname, pts
- ❌? **`⇄ swap` / `✕ clear`** per-roster affordances — `⇄ swap` deferred (Phase 5). `✕ clear`? verify.
- ❓ Shared Rosters grouped by faction (expand → set player / enemy / delete) + count pills + faction dots
- ❓ Campaigns list + inline upload entry

### Upload — `Upload Roster.dc.html` → `RostersContext.jsx` → `UploadFlow`

- ❓ Step rail Paste → Details → Load → Done
- ❌? **File drop (.rosz/.ros)** on the Paste step — verify it exists (mockup has drop + textarea)
- ❓ Details: auto-detect faction + unit counts; **unit review** (nickname · ★ leader toggle · attach-to dropdown)
- ⚠️ Leader status is **parser-derived**; manual leader toggle **can't persist** (no metadata key — logged Phase 5)
- ❓ Load = player / enemy / just-save; Done confirmation

### Crusade — `Crusade.dc.html` → `crusade/*` (`OrderOfBattle`, `CrusadeCard`, ...)

- ❓ Header: round, W-L, Crusade Pts, RP
- ❓ Order of Battle + **supply gauge** + rank-colored rows (Battle-ready→Blooded→Battle-hardened→Heroic→Legendary)
- ❓ Edit mode (✎ Edit → ✓ Save): XP / Kills / CP steppers, add/remove Honours & Scars, mark-for-greatness, ✝ mark died (SLAIN badge + dim)
- 🔵 `Died` column needs **live-Airtable confirmation** (the field name/type couldn't be verified from the sandbox — Phase 5)
- ❓ Requisitions panel (spend RP, disabled when unaffordable) + Battle History

### Settings — `Settings.dc.html` → `SettingsPage.jsx` + `DiagnosticsPage.jsx`

- ❓ Sub-tabs: Diagnostics · Command List · Math Mode · Aliases
- ❓ Math Mode: Edition segmented **first**, then MC/Deterministic, iterations slider, confidence chips, show-working/variance toggles, live config + sample ledger
- 🔵 Math Mode is **display-only** (E2) — seeds from live engine status, persists to `ct_math_prefs`, does **not** mutate the engine. Intentional.
- ❓ Aliases (F1): `ct_aliases` table + add/remove
- 🔵 Alias **profile-sync** deferred (local-only for now)
- ❓ Theme picker swatch in the sub-nav; footer strip

### Rules — `Rules.dc.html` → `RulesContext.jsx`

- ❓ Search + category rail + sim-relevant-only toggle + expandable cards; ✓ SIM / ~ SIM badge
- 🔵 Mockup's **faction filter** replaced by a **Source filter** — the real rules dataset isn't faction-scoped (G1 substitution, Phase 6). Confirm acceptable.

### Login — `Login.dc.html` → `ProfileGate.jsx`

- ✅ Boot console + picker/PIN/create/skip + CRT + caret (Phase 7) — **verify visually**
- ✅ Profile-store outage now shows an honest error + retry/skip (post-Phase-7 fix; **commit not yet pushed** — see BACKLOG)

### Loading / Error states — `Loading States.dc.html`, `Error States.dc.html` → `App.jsx`, `TerminalBlock.jsx`, `index.css`

- ✅ Boot, simulating bar, result reveal, context flicker, connection-lost, degraded banner, did-you-mean (Phase 7) — **verify visually + reduced-motion**
- 🔵 Count-up wired only into combat HeroTiles — other hero numbers still snap (Phase 7)

### Themes — `Themes.dc.html` → `index.css` `[data-theme]` + `data/themeRegistry.js`

- ❓ All 6 faction themes render without hardcoded-color leaks; White Scars **light/inverted** theme correct
- ❓ Theme sweep: every screen in default + ≥1 faction + the light theme

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
