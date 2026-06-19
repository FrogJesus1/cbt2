# Continue Combat Terminal redesign — Phase 2 (Combat Home)

*(Paste everything below the line into a fresh chat. It's written to re-orient a new session.)*

---

I'm continuing a multi-phase UI redesign of **Combat Terminal** (a Warhammer 40k combat-math web app in this folder). Phases 0 and 1 are done, committed, and tested. You're picking up at **Phase 2**.

## Read these first, in order
1. **`REDESIGN_PLAN.md`** (project root) — the authoritative plan. Read sections 0–3 (summary, constraints, decisions) and the **Phase 2** section. Phases 0–1 are marked complete with what shipped.
2. The design handoff in **`/Users/justincooke/Downloads/design_handoff_combat_terminal_redesign/`** — read **`README.md`** (the spec) and **`Combat Home.dc.html`** (the Phase 2 mockup). `.dc.html` files are *reference mockups, not code to copy* — recreate the layout in the existing React components.
3. The code you'll touch (listed under Phase 2 below).

## Resolved decisions — don't re-litigate
- **Look exactly like the mockup, but keep the theme system working.** The default theme already IS the mockup palette, stored as CSS variables.
- Bars use the **solid** variant. **Mobile is OUT of scope.** Edition shows **"11TH ED"** (cosmetic, design-only).

## Hard constraints
- The app is a **single-page command-stream terminal with NO router.** Clicks that "navigate" call the existing command runner (`handleAnimatedInject(cmd)` / `cmdBarRef.current.animateAndSubmit(cmd)`), **not** routes. Do not add routing or `?param=` reading.
- **Don't rebuild the data layer.** Reuse existing `localStorage` keys — especially **`ct_cmd_history`** (the Combat Home mockup uses the exact same key, so it's storage-compatible).
- **Foundation primitives already exist — reuse them, don't reinvent:**
  - `SectionHeader` (Chakra label + gold hazard rule) and `Bar` with a `solid` prop — in `render/web/src/components/shared/constants.jsx` (re-exported from `combat/shared.jsx`).
  - Theme-shifting tokens `C.*` in `render/web/src/components/shared/colors.js` (`C.green/accent/danger/cyan/text/textMid/dim/panel/border/track/...`).
  - CSS utilities `.ct-display` (Chakra uppercase), `.ct-hazard`, `.ct-card`.
  - `useEdition()` hook in `render/web/src/hooks/useEdition.js`.

## Verification (the build sandbox CANNOT run `vite build`)
The mounted filesystem throws `-35` / EDEADLK reading parts of `node_modules`, and there's no browser. So:
- Validate JS/JSX/CSS with the **local esbuild**: copy `render/web/src` to a tmp dir, then `node_modules/.bin/esbuild` to (a) parse each changed file (`--loader:.js=jsx --bundle=false`) and (b) bundle from an entry with `--bundle --packages=external --alias:@=src --jsx=automatic` to confirm the whole import graph resolves. (This is how Phases 0–1 were verified.)
- If you touch Python: `python3 -m pytest tests/test_loader_smoke.py tests/test_combat_math.py -q` (may need `pip install pytest --break-system-packages`). Keep it green.
- Show the result with a `show_widget` HTML preview built at the exact token values. The user runs the real build on their machine (`cd render/web && npm run dev`).

## Phase 2 — Combat Home
**Target:** the `main` context landing. Today `main` boots into an empty terminal stream (`render/web/src/App.jsx` ~line 1274). Build the Home view from `Combat Home.dc.html`:
- **Hero header** — ⚡ COMBAT TERMINAL + tagline + right-aligned readouts (e.g. `● MC ACTIVE`, faction count).
- **Quick Start grid** — cards (Run Combat / Unit Datasheet / Threat / Units DB / Rosters / Rules). Each card runs an example command via `handleAnimatedInject(cmd)` (e.g. `intercessors vs plague marines`, `spec broadside`, `threat t'au empire`, `list units`, `rosters`, `rules`). Do NOT import the mockup's `route()`/`run()` — the app's command routing is authoritative.
- **Command History panel** — hydrate from `ct_cmd_history`. The data + handlers already exist in `App.jsx` (`cmdHistory` state + `handleHistoryStar`/`handleHistoryDelete`/`handleEditCommand`, ~line 581–606), currently surfaced only as a nav dropdown (~line 1118). Promote that data to a Home panel (star/pin, delete, click-to-edit; add a `▸ run` affordance). Entry shape `{ key, input, starred }`; type badge colors: COMBAT `var(--ct-primary)`, THREAT `var(--ct-danger)`, SPEC `var(--ct-cyan)`, CMD `var(--ct-primary-dim)`.

**Key files:** `render/web/src/App.jsx` (the `main` panel; `cmdHistory` state/handlers; `handleAnimatedInject`), `render/web/src/components/Terminal.jsx`. **New:** `render/web/src/components/CombatHome.jsx`.

**Decision to make early (ask the user):** does Home *replace* the empty `main` terminal, or sit above the stream and swap to the stream on the first command? (See the Phase 2 note in REDESIGN_PLAN.md.)

## Workflow
- Use the task list (TaskCreate/TaskUpdate) and AskUserQuestion for any genuine scope fork.
- When done: commit per the **juzzie-deploy** skill — `git add` the redesign files → `git commit` → `git push origin production`; verify with `curl -s https://war.juzzie.xyz/api/version`. Then offer Phase 3 (Spec + Threat).
