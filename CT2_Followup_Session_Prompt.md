# Combat Terminal 2 — Follow-up Session Prompt

Paste this into a new Cowork/Claude session to continue the reliability &
architecture work. It's self-contained: it tells you where to look and what to do.

---

## Context

This is a modular data-engine + rendering system for Warhammer 40K 10th-edition
combat math (Python engine in `data/combat_terminal/`, FastAPI + React web layer
in `render/web/`, CLI in `render/cli/`). Read `CLAUDE.md` first, then `BACKLOG.md`
(the honest record of every engine's state — log fixes there as you go, using the
existing table format and the determinism levels D0–D3).

A full audit was done on 2026-06-05 — read **`CT2_Project_Scan_2026-06-05.md`** for
the complete findings with file:line references and priorities. The items below are
the open ones, in recommended order. Two P0 reliability items (stub-unit fabrication,
silent weapon drops) and a user problem-reporting feature were already shipped — see
the most recent entries in `BACKLOG.md`.

## Working rules

- **Verify everything.** Run `python3 tests/test_combat_math.py` (expect 76 passed)
  and `python3 tests/test_crusade_logic.py` (expect 16; needs `pip install pyairtable
  --break-system-packages`). For frontend changes, bundle-check with
  `cd render/web && ./node_modules/.bin/esbuild src/main.jsx --bundle
  --outfile=/tmp/x.js --format=esm --jsx=automatic --alias:@=./src
  --alias:recharts=./src/recharts-mock.js` (expect exit 0).
- **Log each fix in `BACKLOG.md`** with the date and what changed.
- **Don't commit from the sandbox** — the mounted `.git` can't delete files, so
  commits must run on the laptop. Hand back the commit + push commands at the end
  (see the `juzzie-deploy` skill; branch is `production`, deploy verifies at
  `curl -s https://war.juzzie.xyz/api/version`).

---

## The work, in priority order

### 1. P0-5 — De-duplicate the wound table and flag logic (small, high-value; do first)

There are **three** copies of the Strength-vs-Toughness wound chart that can silently
desync the *displayed* wound target from the *computed* one:
- `combat_math_engine.py` `wound_target` (~line 79)
- `engine.py` `_baseline_wr` (~line 52)
- `math_ledger.py` `_s_vs_t_target` (~line 132)

And flag parsing ("extract int N from `flag` / `flag:N` / `flagN`") is duplicated
across 4 sites that must be hand-kept in lockstep for ~40 flags:
- `engine.py` `_flag_int`, the inline `FLAG_NOTE_MAP` ladder in `_query_combat`
- `math_adapter.py` `_suffix_int`, `_apply_flags`

**Task:** make one shared `wound_target(s, t)` imported everywhere; collapse the flag
logic toward a single registry/table (name → parser → math effect → note → legend).
Add a test asserting the note text and the math effect stay in sync. This kills a
whole class of future desync bugs.

### 2. Damage-dice variance in Monte Carlo

`WeaponProfile` parses `damage_expression`/`attacks_expression` (`math_adapter.py`
~line 204) but the math engine never reads them — variable damage is collapsed to its
EV at parse time, so a `D6`-damage weapon and a flat-3.5 weapon produce identical MC
distributions and confidence bands. **Task:** sample the damage/attacks expressions
inside `monte_carlo_attack` (`combat_math_engine.py`) so the advertised variance is
real. Add tests asserting a D6 weapon shows wider spread than a flat weapon of equal EV.

### 3. Cheap test coverage for the two biggest untested modules

`engine.py` (~4.2k LOC) and `loader.py` (~1.3k LOC) have zero tests; the math tests use
hand-built fixtures, so a real-dossier parsing regression passes all 92 tests but breaks
prod. **Task:** add a loader smoke test (load all factions, assert non-zero counts and
expected shape for a known unit) and a handful of API integration tests via FastAPI
`TestClient` for the engine query/exec routes and the reports routes.

### 4. P0-2 — Shared engine session (bigger; architectural)

`engine._session` (`engine.py` ~line 343) is per-instance state on a single shared
engine held by the server registry, mutated by every `/exec` and `/query`. Two browser
tabs/users collide: faction, `disambiguation`, `last_combat` (rerun target), rosters.
**Task:** key engine state by a client/session token (the frontend already re-sends
`roster_context` per exec — extend that to a session id), or make exec stateless
(context in → context out). This is the right time to also confirm whether two people
actually use a single deploy; if it's always single-user, this can stay LOW.

### 5. Repo hygiene (quick wins, do anytime)

- Delete `Dockerfile.new` (stale broken duplicate — already flagged in BACKLOG).
- `git rm --cached render/web/vite.config.js.timestamp-*.mjs` (22 leaked Vite temp
  files committed before the ignore rule; they're gitignored now but still tracked).
- Remove the 0-byte junk rosters `data/combat_terminal/data/rosters/mine_delete*` and
  the dev/example rosters shipping to prod.
- Pin `requirements.txt` (currently `>=` floors only — not reproducible).

### 6. Longer-horizon (only if asked)

- Break up the `engine.py` god-object (`_query_combat` alone is ~815 lines) and the
  `Terminal.jsx` god-component / dual command routers.
- Restore the `EngineBase` contract boundary: the web layer calls `engine.exec`,
  `engine.sync_roster_context`, and reaches into `engine._loader._units` directly.
- Add auth if the deploy is ever exposed beyond trusted friends (no route has any today).

---

## Suggested first move

Start with **#1 (wound/flag dedup)** — it's contained, fully testable, and removes a
real correctness trap. Then **#2** and **#3**. Save **#4** for when multi-user is
confirmed, and fold **#5** into whichever commit is handy.
