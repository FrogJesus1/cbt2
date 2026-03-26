# data/combat_terminal — Engine

## Purpose

Warhammer 40K 10th edition data engine. Provides unit sheets, combat math, rules lookup, and threat analysis through the standard `EngineBase` contract.

## Files

| File | Purpose |
|---|---|
| `engine.py` | Implements `EngineBase` — the only file the rendering layer touches |
| `loader.py` | Loads and indexes data files. Engine.py calls this; renderer never does |
| `data/` | Raw JSON data files (factions, rules, etc.) |
| `__init__.py` | Re-exports `CombatTerminalEngine` |

## Data Structure

```
data/
  factions/
    tau/
      tau_parsed_dossier.json     ← unit list for Tau
    tyranids/
      tyranids_parsed_dossier.json
    ...
  rules/
    rules.json                    ← flat list of rule definitions
```

## Wiring In Real Data

1. Drop faction dossier JSONs into `data/factions/<faction>/<faction>_parsed_dossier.json`
2. Drop rules JSON into `data/rules/rules.json`
3. Restart `main.py` — loader picks them up automatically

The stubs in `loader.py` (marked `_stub`) will stop activating once real data is present.

## Supported Query Commands

| Command | Required Params | Description |
|---|---|---|
| `unit` | `name` | Full stat sheet for a unit |
| `combat` | `attacker`, `defender` | Hit/wound/kill probability |
| `rule` | `term` | Rule or keyword lookup |
| `threats` | `enemy_faction` | Most dangerous enemy units |
| `status` | — | Engine load state and stats |

## Current Status

- `engine.py`: complete stub, wired to loader
- `loader.py`: complete stub, real data loading logic in place — just needs files
- `data/`: empty — drop in faction dossiers and rules to activate

## Isolated Build Rule

Work only in this folder. Never import from `render/`.
If you need a new query type: add to `engine.py` dispatch table, implement in `loader.py`.
