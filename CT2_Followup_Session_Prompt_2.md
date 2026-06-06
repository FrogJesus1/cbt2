# Combat Terminal 2 — Follow-up Session Prompt (Round 2)

Paste this into a new Cowork/Claude session to continue the reliability & architecture work. It's self-contained: it tells you where to look and what to do.

## Context

This is a modular data-engine + rendering system for Warhammer 40K 10th-edition combat math (Python engine in `data/combat_terminal/`, FastAPI + React web layer in `render/web/`, CLI in `render/cli/`). Read `CLAUDE.md` first, then `BACKLOG.md` (the honest record of every engine's state — log fixes there as you go, using the existing table format and the determinism levels D0–D3). The full audit is in `CT2_Project_Scan_2026-06-05.md` (file:line references for every item below).

### What the last two sessions already shipped (do NOT redo — see the newest BACKLOG entries)
- **P0-1** stub-unit fabrication refused; `status().ready` gated on real unit count.
- **P0-3** silent weapon-drop now logged + surfaced as `weapon_errors` / `degraded`.
- **P0-4** Monte Carlo now samples damage/attacks dice (real variance), via `roll_dice_expression` + `attacks_volleys`.
- **P0-5** wound chart de-duplicated to one `wound_target()`; flag parsing/notes/classification collapsed into a single registry at `data/combat_terminal/flags.py`. (This also fixed a silent `--dmgplus2` bug.)
- **P3** added `tests/test_loader_smoke.py` (7) and `tests/test_api_integration.py` (10).
- **P3 hygiene** deleted `Dockerfile.new` + junk rosters; pinned `requirements.txt` with upper-bound caps (pyairtable held `<3.0`).

So the open items are **P0-2 (shared session)**, the **P1 robustness/security** list, and the **P2 architecture** list. They're below in recommended order.

## Working rules
- **Verify everything.** Run `python3 tests/test_combat_math.py` (expect **89** passed), `python3 tests/test_crusade_logic.py` (16; needs `pip install pyairtable --break-system-packages`), `python3 tests/test_loader_smoke.py` (7), `python3 tests/test_api_integration.py` (10; needs `pip install -r requirements.txt --break-system-packages`). For frontend changes, bundle-check with `cd render/web && ./node_modules/.bin/esbuild src/main.jsx --bundle --outfile=/tmp/x.js --format=esm --jsx=automatic --alias:@=./src --alias:recharts=./src/recharts-mock.js` (expect exit 0).
- **Log each fix in `BACKLOG.md`** with the date and what changed.
- **Don't commit from the sandbox** — the mounted `.git` can't delete files, so commits run on the laptop. Hand back the commit + push commands at the end (see the `juzzie-deploy` skill; branch is `production`, deploy verifies at `curl -s https://war.juzzie.xyz/api/version`).
- **There is still an outstanding laptop step from last session:** `git rm --cached render/web/vite.config.js.timestamp-*.mjs` (22 tracked-but-gitignored Vite temp files). If `git status` still shows them tracked, fold this into your commit.

## The work, in priority order

### 0. FIRST — answer the gating question for P0-2
P0-2 (shared session) is only worth the architectural cost **if more than one person/tab ever uses a single deploy**. Before building it, confirm: is `war.juzzie.xyz` ever used by more than one person or more than one browser tab at a time? If it's reliably single-user, P0-2 drops to LOW — skip to #2 and just add a one-line note in `BACKLOG.md` recording the decision. If multi-user is real, do #1.

### 1. P0-2 — Per-client engine session (architectural; only if multi-user is confirmed)
`engine._session` (`engine.py` ~line 343) is per-instance state on a single shared engine held by `EngineRegistry` (`server.py`), mutated by every `/exec` and `/query`. Two tabs/users collide: faction, `disambiguation`, `last_combat` (the `rerun` target), rosters. The frontend already re-sends `roster_context` per exec but does **not** re-sync faction/disambiguation/last_combat. **Task:** key engine session state by a client/session token — extend the existing `roster_context` payload (`ExecBody` in `server.py`, `buildRosterContext`/`handleExec` on the frontend) to carry a session id — OR make `exec` stateless (context in → context out). No request locking exists either; if you keep shared state, guard `_session` reads/writes. Add an API test asserting two different session ids don't see each other's `last_combat`/faction.

### 2. P1 — Robustness & security (highest-value, mostly contained)
Pick these off in roughly this order; each is small and testable.
- **No auth on any of the 33 routes.** Anyone reaching the server can `DELETE` every profile, shared roster, and crusade campaign; `delete_shared_roster` ignores its `requester` arg (`shared_rosters.py` ~159). At minimum add an ownership check on the delete routes and stop passing the PIN as a URL query param. (Full auth only matters if the deploy is exposed beyond trusted friends — confirm exposure first.)
- **`_load_faction` marks a faction loaded even on JSON parse failure** (`loader.py` ~266) — the faction is then permanently empty and never retried. Make a parse failure NOT set the loaded flag, and log it. (Your new loader smoke test is the place to add a regression guard.)
- **Unguarded `int(models)` on roster data** (`engine.py` ~1730–1750) — a roster entry with `models: "3+"` or null crashes. `sync_roster_context` doesn't validate types. Add coercion + a fallback.
- **Brittle squad-size parse** — `_parse_min_models` (`engine.py` ~46) falls back to 1 on any phrasing it doesn't match, mis-scaling all squad damage; BLAST's min-3 uses dossier-min `def_models` (often 1) so BLAST never fires vs a real 10-model squad. These approximations are presented with MC confidence. Tighten the parse and/or surface a "model count assumed" note.
- **Global RNG reseed clobbers dice independence** — `monte_carlo_attack` does `random.seed(42)` per weapon (`combat_math_engine.py` ~434) and `_query_dice` uses the same global `random` (`engine.py` ~2908). Roll a combat then roll dice and they're no longer independent. Use a dedicated `random.Random()` per concern. (Low user-visible impact, but cheap and correct.)
- **SPA fallback has no path-containment check** (`server.py` ~552): `dist_dir / full_path` → `FileResponse` with no `resolve().is_relative_to(dist_dir)` guard. Harden against `../` traversal.
- **Airtable formula injection** via raw f-strings in `delete_campaign`/`list_units`/`create_unit` and name lookups. IDs are server slugs (low risk) but name fields take arbitrary user input — escape them.
- **`finalize_battle` claims atomicity but isn't** (`crusade_store.py` ~516): 30+ sequential blocking Airtable round-trips with no rollback; a mid-loop failure leaves units half-updated. All routes are sync `def` so this blocks a worker for seconds. At least make it idempotent/resumable, or batch the writes.

### 3. Contained follow-on from last session (quick win)
The flag **registry now exists** (`flags.py`) with a `legend` field per flag, but `_query_legend` (`engine.py` ~3620) still hand-maintains a separate copy of every flag's description/effect — a 5th "face" that can drift. Source the modifier-flag sections of the legend from `flags.FLAG_SPECS` so there's truly one list. Add a test that every registry flag appears in the legend output.

### 4. P2 — Architecture & maintainability (longer-horizon; only if asked)
- **`engine.py` is a ~4.2k-line god-object**; `_query_combat` alone is ~815 lines. Natural extractions: `parser.py`, `roster.py`, `scoring.py`, crusade enrichment, modifier-reason attribution, and the static catalogs (`_DRONE_CATALOG`, legend tables) into data files. (Flag logic is already extracted into `flags.py` — use that as the model.)
- **`Terminal.jsx` is a ~1.67k-line god-component** with a hand-rolled priority router and a 9-type flow state machine; routing is duplicated between `App.handleGlobalCommand` and Terminal's fallback. Extract a command-registry/dispatch table.
- **Contract leak** — the web layer calls `engine.exec()`, `engine.sync_roster_context()`, and reaches into `engine._loader._units` directly (`server.py` ~363/396); none are in `EngineBase`, so CLAUDE.md's "swap the engine in config.json" promise is false. Route roster context through `query()` params; expose factions via a contract method. (The CLI is contract-clean — a good model.)
- **`schema()` and the dispatcher disagree** — schema advertises `supports_cli=False` nav/VFS commands that `query()` rejects with "Unknown command".

## Suggested first move
Answer #0. If single-user, record the decision and start at #2 (the P1 list — `_load_faction` parse-failure guard and the `int(models)` crash are the cheapest, highest-value, and your new tests make them safe). Fold #3 (legend → registry) into whichever commit is handy. Save the P2 god-object refactors for a dedicated session.
