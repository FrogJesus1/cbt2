# Project — CLAUDE.md

## What This Is

A modular data engine + rendering system. You build self-contained **data engines** and plug them into a shared **rendering layer** that produces a React web UI and a Python CLI.

The rendering layer knows nothing about the data. The engines know nothing about rendering. They communicate through a standard contract defined in `data/_base/engine_base.py`.

---

## Structure

```
data/                  ← all data engines (isolated, self-contained)
  _base/               ← abstract engine contract — read this before building any engine
  combat_terminal/     ← example engine

render/                ← shared rendering layer (never touches data directly)
  web/                 ← FastAPI backend + React/Vite/Tailwind/shadcn frontend
  cli/                 ← Python terminal renderer

config.json            ← active engines, ports, settings
main.py                ← entry point
requirements.txt
```

---

## Engine Contract

Every engine in `data/` must implement `EngineBase` from `data/_base/engine_base.py`:

```python
class EngineBase:
    def name(self) -> str              # human-readable name
    def description(self) -> str       # one-line summary
    def schema(self) -> dict           # available query types and fields
    def status(self) -> dict           # current load state, data summary
    def query(self, command: str, params: dict = {}) -> dict  # execute a query
```

The web server and CLI call these five methods plus two optional helpers (`aliases()`, `help_groups()`). Swap the engine in `config.json` — everything else works identically.

---

## config.json

```json
{
  "primary_engine": "combat_terminal",
  "support_engines": [],
  "web": { "port": 8000, "host": "127.0.0.1" },
  "cli": { "default_engine": "combat_terminal" }
}
```

- `primary_engine`: the engine loaded in the main panel
- `support_engines`: list of additional engine names loaded alongside it

---

## Running

```bash
# Start web server (serves React app + API)
python main.py

# Start CLI
python main.py --cli

# Build React app for production
python main.py --build
```

Web app runs at `http://localhost:8000` by default.
During development, Vite dev server runs on port 5173 with API proxy to 8000.

---

## Adding a New Engine

1. Create `data/<engine_name>/`
2. Write `engine.py` that subclasses `EngineBase`
3. Drop your data in `data/<engine_name>/data/`
4. Write `data/<engine_name>/CLAUDE.md`
5. Add the engine name to `config.json` (primary or support)
6. Restart `main.py`

That's it. The renderer picks it up automatically.

---

## Build Principles

- **Minimal first** — no feature until it's needed
- **Isolated** — each engine has its own CLAUDE.md and is independently buildable
- **No cross-engine dependencies** — engines never import each other
- **Document after build** — update CLAUDE.md once code exists
- **One renderer** — never duplicate rendering logic per engine

---

## Backlog Protocol

Every dev session involving this project should follow this pattern:

1. **Read `BACKLOG.md`** at the start of the session — understand the current state of each engine
2. **Log immediately** when you discover a bug, gap, or improvement — add it to the relevant engine section before moving on
3. **Mark fixed** when you resolve something — change status to `✅ FIXED YYYY-MM-DD` and note what changed
4. **Use determinism levels** to prioritize: D0 items (stubs blocking real answers) before architecture

`BACKLOG.md` is the single honest record of where each engine stands. It tracks:
- **Bugs** — broken things (with history of fixes)
- **Determinism Gaps** — commands that accept input but return stubs instead of computed answers (D0)
- **Data Gaps** — data that exists but isn't wired into the engine
- **Architecture** — structural improvements

The goal is not a perfect backlog — it's a snapshot accurate enough to know what to build next.
