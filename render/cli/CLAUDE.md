# render/cli — CLI Rendering Layer

## Purpose

Interactive terminal renderer. Loads an engine from config.json and runs a REPL loop.
Calls `engine.query()`, `engine.schema()`, `engine.status()`, `engine.aliases()`, `engine.help_groups()` — nothing else.

## Files

| File | Purpose |
|---|---|
| `terminal.py` | Main REPL — prompt, command dispatch, alias resolution, math mode, result rendering |
| `components/style.py` | Shared ANSI color constants + `terminal_width()` helper |
| `components/table.py` | Renders `result_type: "table"` as a terminal grid |
| `components/card.py` | Renders `result_type: "card"` as a labeled field block |
| `components/spec_sheet.py` | Renders `result_type: "spec_sheet"` — full unit stat sheet |
| `components/rule_block.py` | Renders `result_type: "rule_block"` — rule lookup |
| `components/stratagem_block.py` | Renders `result_type: "stratagem_block"` — stratagem display |
| `components/ability_block.py` | Renders `result_type: "ability_block"` — ability lookup |
| `components/enhancement_block.py` | Renders `result_type: "enhancement_block"` — enhancement display |
| `components/mission_block.py` | Renders `result_type: "mission_block"` — mission display |
| `components/session_summary.py` | Renders `result_type: "session_summary"` — session state |
| `components/threat_card.py` | Renders `result_type: "threat_card"` — threat analysis |

## Running

```bash
python main.py --cli
```

## Features

- Tab autocomplete for CLI-visible command names (uses readline; gracefully skipped on Windows)
- Alias resolution via `engine.aliases()` — `roll` → `dice`, `vs` → `combat`, etc.
- Param parsing: positional (`spec Crisis Suits`) or key=value (`spec name=Crisis Suits faction=tau`)
- Math mode: `math on`/`math off` toggle, or `math <command>` one-shot prefix for ledger replay
- Help grouped by engine's `help_groups()` — navigation commands filtered out
- Per-session command history (rendered by `history` command)
- Handles result types: spec_sheet, rule_block, stratagem_block, ability_block, enhancement_block, mission_block, session_summary, threat_card, table, card, list, text, error, history

## Adding a Result Type

1. Create a new component in `components/` (import ANSI constants from `style.py`)
2. Add a branch in `terminal.py`'s `_render_result()` method
3. Import and call the component
