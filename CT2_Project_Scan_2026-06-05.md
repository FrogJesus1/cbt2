# Combat Terminal 2 — Full Project Scan

**Date:** 2026-06-05
**Scope:** data engine, render layer (web + CLI), tests, build/deploy, repo hygiene
**Method:** full read of core contract files + three parallel deep audits, key claims verified against source

The project is mature and heavily iterated — the BACKLOG shows ~100 closed items and the determinism discipline is real. The findings below are **new** issues not yet in the backlog. The dominant theme across the whole system is **silent degradation**: failed loads, dropped weapons, mis-parsed model counts, and shared-state bleed all fail quietly and surface as confident, Monte-Carlo-backed numbers that are wrong. For a tool whose entire value is numeric correctness, that is the most dangerous failure mode.

---

## P0 — Correctness & integrity (fix first)

### 1. Failed data load fabricates plausible-but-wrong units into the math
`loader.get_unit()` (loader.py:725) returns `_stub_unit(name)` — a hardcoded Space Marine bolter profile — whenever `self._units` is empty. That stub flows straight into `compute_combat` and produces confident, fictional damage numbers. Same pattern for `_stub_rule/_stratagem/_enhancement/_mission`. `status().ready` still reports `True` because `_loaded` is set regardless of whether any faction parsed. **Fix:** combat math should refuse to run on `_stub`-flagged units; `status().ready` should gate on a non-empty unit count; surface a hard error instead of a fake answer.

### 2. Single global engine session shared across all requests
`engine._session` (engine.py:343) is per-instance state, and the server holds exactly one engine instance (`EngineRegistry`, server.py:54–73). Every `/exec` and `/query` mutates the same `faction`, `enemy_faction`, `disambiguation`, `last_combat`, `roster_my/enemy`, `turn`. Two browser tabs — or two users on the same deploy — corrupt each other: User B's `1` resolves User A's disambiguation prompt; an interleaved request overwrites `last_combat` so `rerun` silently applies to the wrong combat. The frontend re-sends `roster_context` per exec but does **not** re-sync faction/disambiguation/last_combat, so the bleed is real. **Fix:** key engine state by a session/client token, or make `exec` stateless (context in, context out). No request locking exists either — concurrent threads tear `_session` reads/writes.

### 3. Bare `except Exception` silently drops weapons across every math pass
`math_adapter._run_ev` (:783), `_run_mc` (:907), `_run_total` (:1023), and `_compute_threat_score` (engine.py:3911–3922) all swallow exceptions and continue with `None`/`0.0`/skip. A malformed weapon, a `KeyError`, or a real logic bug is indistinguishable from "this weapon did 0 damage" — the weapon just vanishes from the table with no warning. **Fix:** narrow the excepts, log the failure to the issue log, and mark the result degraded.

### 4. Monte Carlo variance ignores damage-dice variability
`WeaponProfile` parses `damage_expression`/`attacks_expression` (math_adapter.py:204) but the math engine never reads them — variable damage is collapsed to its EV at parse time. So a `D6`-damage weapon and a flat-3.5-damage weapon produce **identical** MC distributions and confidence bands. The simulation advertises variance it isn't actually modeling. **Fix:** sample the damage/attacks expressions inside `monte_carlo_attack`.

### 5. Three divergent copies of the Strength-vs-Toughness wound table
`combat_math_engine.wound_target` (:79), `engine._baseline_wr` (:52), and `math_ledger._s_vs_t_target` (:132) each reimplement the wound chart with different branch ordering. They agree today, but any edit to one silently desyncs the **displayed** wound target from the **computed** one. Same class of duplication in flag parsing (see P1). **Fix:** one shared function imported everywhere.

---

## P1 — Robustness & security

### Backend / API
- **No authentication on any route.** Verified: zero `Depends`/auth guards across all 33 routes. Anyone reaching the server can read or `DELETE` every profile, shared roster, and crusade campaign. `delete_shared_roster` ignores its `requester` arg entirely (shared_rosters.py:159) — no ownership check. `list_profiles` enumerates all account names. PIN auth is unsalted-stretch sha256 with no rate limiting and is passed as a URL query param on delete (lands in access logs).
- **`finalize_battle` claims atomicity but isn't** (crusade_store.py:516). It runs 30+ sequential blocking Airtable round-trips (per-unit get+find+update, then battle create, then campaign update); a mid-loop failure leaves units partially updated with no rollback. All routes are sync (no `async def`), so this blocks a threadpool worker for seconds.
- **Inconsistent error handling.** Some Airtable routes wrap to 503; many (`api_get_campaign`, all `/api/rosters/*`, all `/api/profiles/*`) don't — a down/misconfigured Airtable surfaces raw 500s with stack traces.
- **SPA fallback has no path-containment check** (server.py:552): `dist_dir / full_path` then `FileResponse` with no `resolve().is_relative_to(dist_dir)` guard. Harden against `../` traversal.
- **Airtable formula injection** via raw f-string interpolation in `delete_campaign`/`list_units`/`create_unit` and name-based lookups. IDs are server slugs (low risk) but name fields take arbitrary user input.

### Engine
- **Unguarded `int(models)` on roster data** (engine.py:1730/1737/1743/1750) — a roster entry with `models: "3+"` or null crashes into the generic handler. `sync_roster_context` doesn't validate types.
- **Global RNG reseed clobbers dice independence.** `monte_carlo_attack` does `random.seed(42)` per weapon (combat_math_engine.py:407); `_query_dice` uses the same global `random` (engine.py:2908). Roll a combat then roll dice and the dice are no longer independent. Use a dedicated `random.Random()` per concern.
- **`_load_faction` marks a faction loaded even on JSON parse failure** (loader.py:266) — the faction is permanently empty and never retried.
- **Brittle squad-size parse.** `_parse_min_models` regex (engine.py:46) falls back to 1 model on any phrasing it doesn't match, which mis-scales **all** squad damage. BLAST's min-3 uses dossier-min `def_models` (often 1), so BLAST never fires against a real 10-model squad. These approximations are presented with MC confidence.
- **Unbounded term-alias store** (term_aliases.py): no cap on count/length, and `expand()` compiles a fresh regex per alias on every command — a large store becomes a per-keystroke DoS. `_save()` also has no error handling.

### Frontend
- **localStorage-only persistence + split-brain campaigns.** VFS rosters and the *terminal's* campaigns live only in `localStorage["ct_vfs_v1"]` (vfs.js:30), while *Crusade* campaigns persist to Airtable — two unrelated campaign systems. Quota-exceeded errors are swallowed (vfs.js:53). Profile auto-save is a 5s debounce + best-effort `sendBeacon`, so a crash loses up to 5s of edits; nicknames/attachments aren't in the sync whitelist at all.
- **Unguarded fetches inside multi-step flows** (`uploadRoster`, `findRosterByName`, `deleteSharedRoster` in Terminal.jsx) — an Airtable 503 throws and leaves `clientFlowRef` half-set with no user feedback.

---

## P2 — Architecture & maintainability

- **`engine.py` is a 4,174-line god-object.** `_query_combat` alone is ~815 lines (1425–2240) doing unit resolution, roster disambiguation, leader merging, drone augmentation, weapon-list building, math invocation, and display assembly inline. Natural extractions: `parser.py`, `roster.py`, `scoring.py`, crusade enrichment, modifier-reason attribution, and static catalogs (`_DRONE_CATALOG`, `FLAG_NOTE_MAP`, legend tables) into data files.
- **Flag logic duplicated across 4 divergent sites** — `engine._flag_int`, `math_adapter._suffix_int`, the inline note-building ladder in `_query_combat`, and `math_adapter._apply_flags`. ~40 flags must be kept in lockstep by hand with no test linking the note text to the math effect. A flag-registry (one table: name → parser → math effect → note → legend) would collapse all four.
- **`Terminal.jsx` is a ~1,670-line god-component** with a hand-rolled priority router (`submit()` spanning 818–1482, branches 0–9 plus 7.1/7.2/8.5/8.55/8.6/8.7/8.8) and a 9-type manual flow state machine. Routing is duplicated between `App.handleGlobalCommand` and Terminal's "fallback" — two routers that must agree. Extract a command-registry/dispatch table.
- **Contract leak breaks the swappability promise.** The web layer calls `engine.exec()`, `engine.sync_roster_context()`, and reaches into `engine._loader._units` directly (server.py:363/396) — none are in `EngineBase`. CLAUDE.md's "swap the engine in config.json and everything works" is false while these exist. Route roster context through `query()` params; expose factions via a contract method. (The CLI, by contrast, is contract-clean — a good model.)
- **`schema()` and the dispatcher disagree.** Schema advertises `supports_cli=False` nav/VFS commands (`home`, `save`, `load_roster`…) that `query()` returns "Unknown command" for; the contract says schema keys should be executable.

---

## P3 — Tests, build, hygiene

- **Coverage is pure-function-only.** 85 tests cover `combat_math_engine`/`math_adapter` and crusade helpers — all with hand-built fixtures. **Zero** tests for `engine.py` (4,174 LOC dispatch/parse), `loader.py` (1,317 LOC real-dossier parsing), the 33 API routes, or the frontend. A regression in `loader.py`'s real-data parsing passes all 85 tests but breaks production. Highest-leverage additions: a loader smoke test (load all factions, assert counts/shape) and a handful of API integration tests.
- **22 committed Vite temp files.** `render/web/vite.config.js.timestamp-*.mjs` — gitignored *now* but already tracked, so the ignore is inert. `git rm --cached` them.
- **`Dockerfile.new` is a broken stale duplicate** missing the three `COPY` lines (`profiles.py`, `shared_rosters.py`, `crusade_store.py`) whose absence caused the documented prod 502. It's `.dockerignore`d but anyone running `docker build -f Dockerfile.new` ships a broken image. Delete it (BACKLOG already flags this).
- **Junk committed:** two 0-byte `mine_delete*` rosters and dev/example rosters shipped in `data/.../rosters/`.
- **`requirements.txt` uses `>=` floors only** — not reproducible; a breaking upstream release auto-installs. Pin or add a lockfile.
- **`launch.command`** lacks `set -e` and unconditionally `kill -9`s whatever holds port 8000. Local uses port 8000, prod uses 8001 — a known confusion source. (`deploy/deploy-war.sh` is solid by contrast: `set -euo pipefail`, health check, no secrets.)
- **6 `.DS_Store` files** keep reappearing on disk (ignored/untracked); `.docx` artifacts aren't in `.dockerignore`.

---

## Suggested order of attack

1. **Stop fabricating answers** (P0-1) and **stop silently dropping weapons** (P0-3) — these directly corrupt the tool's core output.
2. **Fix the shared session** (P0-2) if more than one person/tab ever uses a deploy.
3. **Deduplicate the wound table and flag logic** (P0-5, P1-flags) — small change, removes a whole class of future desync bugs.
4. **Add a loader smoke test + a few API tests** (P3) — cheap insurance for the two biggest untested modules.
5. **Model damage-dice variance in MC** (P0-4) so the confidence bands mean what they claim.
6. Repo cleanup (delete `Dockerfile.new`, `git rm --cached` the timestamp files, drop junk rosters) — fast wins.
7. Longer-horizon: break up `engine.py`/`Terminal.jsx`, introduce a flag-registry, restore the `EngineBase` contract boundary, add auth if the deploy is ever exposed.
