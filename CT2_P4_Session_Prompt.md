# Combat Terminal 2 — P4 Session: Architecture & Build

P0 (math bugs), P1 (dead features), P2 (duplicate consolidation), and P3 (incomplete features) are all done. All 69 tests pass. Work through P4 top to bottom, testing after each change.

Read `BACKLOG.md` and `ACTION_PLAN.md` first. P4 items:

## 1. Fix esbuild platform path

`main.py:51` — `build_frontend()` hardcodes `ESBUILD = web_dir / "node_modules/@esbuild/linux-arm64/bin/esbuild"`. This only works on Linux ARM64 — fails on macOS.

**Fix:** Replace with `npx esbuild` (via `shutil.which("npx")` or `subprocess` with `npx esbuild`) or detect the platform and construct the path dynamically. The simplest approach is running `node_modules/.bin/esbuild` which is a cross-platform symlink npm sets up, or using `npx --no-install esbuild`. The `TAILWIND` path on line 52 (`node_modules/tailwindcss/lib/cli.js`) is fine — it's platform-independent.

## 2. Remove CLI coupling to combat_terminal

`render/cli/terminal.py` directly imports `data.combat_terminal.commands` in two places:

- **Line 141** — alias resolution: `from data.combat_terminal import commands as _cmds_mod` then `_cmds_mod.resolve(command)`. Used to map aliases like `roll` → `dice`, `vs` → `combat`.
- **Line 318** — help display: `from data.combat_terminal import commands as _cmds` then reads `_cmds.GROUP_ORDER`, `_cmds.GROUP_LABELS` to organize the help output by category.

This violates the engine contract — the renderer should never import from `data/`. If someone swaps `config.json` to a different engine, `_print_help` will crash.

**Fix approach:** Add two methods to `EngineBase` (in `data/_base/engine_base.py`):

```python
def aliases(self) -> dict[str, str]:
    """Return a mapping of alias → canonical command name.
    Default: empty dict (no aliases). Override in engine subclass."""
    return {}

def help_groups(self) -> dict:
    """Return command grouping for help display.
    Default: derive from schema() with a single flat group.
    Override for custom grouping.
    Returns: { "order": [group_names], "labels": {group: label} }
    """
    return {"order": ["commands"], "labels": {"commands": "Commands"}}
```

Then in `CombatTerminalEngine` (engine.py), override both by delegating to the existing `commands.py` functions (`resolve()`, `GROUP_ORDER`, `GROUP_LABELS`, `ALIAS_MAP`).

In `terminal.py`:
- Line 141: replace `_cmds_mod.resolve(command)` with `self._engine.aliases().get(command, command)` (cache the aliases dict at REPL start)
- Line 318: replace `_cmds.GROUP_ORDER`/`_cmds.GROUP_LABELS` with `self._engine.help_groups()`

## 3. Add conditional readline import

`render/cli/terminal.py:15` — `import readline` fails on Windows (readline is Unix-only). Wrap it:

```python
try:
    import readline
except ImportError:
    pass
```

readline is only used for arrow-key history and tab completion in the REPL — safe to skip.

## Important context from prior sessions

- P2 created `render/cli/components/style.py` (shared ANSI constants + `terminal_width()`). All 8 CLI component files import from it.
- P2 created `render/web/src/components/shared/colors.js` and `shared/constants.jsx` — unified React design tokens.
- P3 fixed the list command parser to properly handle `--ranged`/`--melee` flags alongside faction names.
- The engine contract is in `data/_base/engine_base.py` — 5 abstract methods: `name()`, `description()`, `schema()`, `status()`, `query()`.
- `data/combat_terminal/commands.py` has `ALIAS_MAP` (dict), `resolve()` (function), `GROUP_ORDER` (list), `GROUP_LABELS` (dict).

## Verification

After each change, run `python tests/test_combat_math.py`. After all P4: test `python main.py --cli` (should start and `help` should work). If possible, test `python main.py --build` on the current platform.

Then move on to P5 (Documentation) — the 6 items are all straightforward updates to CLAUDE.md files and BACKLOG.md. You can do P5 in the same session if time permits.
