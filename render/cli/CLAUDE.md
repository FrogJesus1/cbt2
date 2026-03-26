# render/cli — CLI Rendering Layer

## Purpose

Interactive terminal renderer. Loads an engine from config.json and runs a REPL loop.
Calls engine.query(), engine.schema(), engine.status() — nothing else.

## Files

| File | Purpose |
|---|---|
| `terminal.py` | Main REPL — prompt, command dispatch, result rendering |
| `components/table.py` | Renders `result_type: "table"` as a terminal grid |
| `components/card.py` | Renders `result_type: "card"` as a labeled field block |

## Running

```bash
python main.py --cli
```

## Features

- Tab autocomplete for command names (uses readline)
- Param parsing: positional (`unit Crisis Suits`) or key=value (`unit name=Crisis Suits faction=tau`)
- Handles all engine result types: table, card, list, text, error
- `help` command prints all available commands from engine schema
- Results scroll in terminal — most recent at the bottom

## Adding a Result Type

Add a branch in `terminal.py`'s `_render_result()` method.
Create a new component in `components/` if the rendering logic is complex.
