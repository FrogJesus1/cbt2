# Combat Terminal — redesign fix-pass handoff prompt

*(Paste everything below the line into a fresh chat with this repo connected. Reusable for every fix-pass session — it self-locates the next gap.)*

---

I'm running the **holistic fix pass** on the Combat Terminal UI redesign (a Warhammer 40k combat-math web app in this folder). Phases 0–7 of the redesign are built, committed, and (mostly) live. Now I'm closing the gap between the design mockups and the build — **several functions from the design are missing or diverged**, and this pass finds and fixes them.

**Read these first, in order:**

1. `REDESIGN_PLAN.md` §0–3 (summary, constraints, resolved decisions) — the authoritative plan. Phases 0–7 are ✅ COMPLETE.
2. `REDESIGN_ISSUES.md` — the punch list. This is your worklist. Section A = my reported issues; B = per-screen audit checklist (most rows are ❓ = unverified); C = known deferrals (don't re-litigate); D = your workflow.
3. `design_reference/` — the design mockups (`.dc.html`) + `README.md` spec, **now in the repo** (no folder grant needed). `.dc.html` = reference mockups, NOT code to copy — recreate the layout in the existing React components. The README's "Design → Code Mapping" table maps each mockup to its component(s).
4. `BACKLOG.md` — engine/data issues + redesign history. `CLAUDE.md` — project architecture.

**What to do:**

Work **screen by screen** through `REDESIGN_ISSUES.md` §B. For each screen: open its `design_reference/<Screen>.dc.html` **and** the mapped component(s), turn every ❓ into ✅/⚠️/❌ by comparing mockup↔code, then fix the ⚠️/❌/🔴. Confirm 🔵 deferrals are still intended before touching them. Start with the screens I've flagged in §A, then sweep the rest. Mark items ✅ FIXED in `REDESIGN_ISSUES.md` as you go (and log new finds there + `BACKLOG.md`).

Use the task list (TaskCreate/TaskUpdate) per screen. AskUserQuestion only for a genuine scope fork (e.g. a deferred feature you're unsure I still want).

**Hard constraints (don't break these):**

- **Single-page command-stream terminal, NO router.** "Navigation" clicks call `handleAnimatedInject(cmd)` / `cmdBarRef.current.animateAndSubmit(cmd)`. Don't add routing or `?param=`.
- **Don't rebuild the data layer.** Reuse existing `localStorage` keys (`ct_active_theme`, `ct_cmd_history`, `ct_starred_units`, `ct_unit_nicknames`, `ct_leader_attachments`, `ct_edition`, `ct_aliases`, `ct_math_prefs`). Don't adopt the mockups' throwaway stores (`ct_units_shortlist`, `ct_crusade_units`) or their `route()`/`parseUnits()` logic.
- **Reuse the Phase-0 foundation** — `SectionHeader`, `Bar` `solid` variant + tokens in `shared/constants.jsx`, theme-shifting `C.*` in `shared/colors.js`, `.ct-display`/`.ct-hazard`/`.ct-card` + the Phase-7 `.ct-*` motion utilities in `index.css`, `useEdition()`, `factionColor()`. Default theme already IS the mockup palette as CSS vars — stay themeable, don't hardcode hexes.
- Bars use the **solid** variant. Mobile is **out of scope**. Edition shows **11TH ED** (cosmetic).
- Keep the Python suite green if you touch any `.py`.

**Verification (the sandbox CANNOT run `vite build` or a browser):**

1. `rm -rf /tmp/ct7/src && cp -r "<repo>/render/web/src" /tmp/ct7/src` (own a temp dir you can write — a prior `/tmp/ctweb` may be owned by `nobody`; make your own).
2. Per changed file: `<repo>/render/web/node_modules/.bin/esbuild <file> --loader:.js=jsx --bundle=false` (the repo's own esbuild binary works; redirect stderr to a path you own).
3. Import graph: from `/tmp/ct7`, `<esbuild> src/App.jsx --bundle --packages=external --alias:@=src --loader:.js=jsx --jsx=automatic --outfile=/tmp/ct7/o.js` — must succeed, no errors. (`--packages=external` avoids the `node_modules` `-35`/EDEADLK mount issue.)
4. Python: `python3 -m pytest tests/test_loader_smoke.py tests/test_combat_math.py -q` (install `pytest`/`fastapi`/`httpx`/`pyairtable` with `--break-system-packages` if missing; add `tests/test_api_integration.py` for server changes).
5. Optional: a `show_widget`/standalone-HTML preview at the exact tokens for eyeballing.

**Commit + deploy (juzzie-deploy skill):**

- Commit directly in the mounted repo (`git add` + `git commit`). If a git op fails on `.git/*.lock` (a sync app races the Vault folder), clear it: `find .git -maxdepth 3 -name "*.lock" -delete`, then retry. If it's "Operation not permitted", the sync app is holding it — hand me the commit to run on the laptop.
- You **cannot** `git push` (no creds in-sandbox) — give me: `cd "$HOME/Desktop/Claude/Claude Vault/projects/combat_terminal_2 2" && git push origin production`.
- Commit message: `UI redesign fix: <screen> — <what changed>`.
- **Verify deploys VISUALLY** (open war.juzzie.xyz), not via `/api/version` (still returns `commit:"unknown"` until the `deploy/deploy-war.sh` build-arg fix lands).

**Two uncommitted items already in the laptop tree** (decide whether to fold in): the profile-store resilience fix (`ProfileGate.jsx` timeout + `profiles.py` Airtable timeout — validated, see `BACKLOG.md`), and `deploy/deploy-war.sh` (`GIT_COMMIT` version-hash injection — not mine).
