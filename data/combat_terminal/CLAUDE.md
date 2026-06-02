# data/combat_terminal — Engine

## Purpose

Warhammer 40K 10th edition data engine. Provides unit sheets, combat math, rules lookup, threat analysis, and session management through the standard `EngineBase` contract.

## Files

| File | Purpose |
|---|---|
| `engine.py` | Implements `EngineBase` — the only file the rendering layer touches. Dispatches all commands, manages session state, handles disambiguation, drone augmentation, threat/counter math. |
| `loader.py` | Loads and indexes data files at startup. Builds indices for units, abilities (1,563), stratagems (1,046), enhancements (637), detachments, army rules, missions (12), and rules (108). |
| `commands.py` | Command registry — single source of truth for all command definitions, aliases, groups, and schema export. |
| `combat_math_engine.py` | Core dice probability engine — deterministic EV and Monte Carlo (5,000 trials). Hit/wound/save chains, kill buckets, sensitivity sweeps. |
| `math_adapter.py` | Translates dossier weapon/unit data into `combat_math_engine` inputs. Handles all 14+ modifier flags, multi-model scaling, blast/rapid fire conditionals. |
| `math_ledger.py` | Builds a step-by-step math narrative from combat results for the Math Mode replay UI. |
| `data/` | Raw JSON data files — 29 faction dossiers, rules, missions, rule index |
| `__init__.py` | Re-exports `CombatTerminalEngine` |

## Data Structure

```
data/
  factions/
    tau/
      tau_parsed_dossier.json         ← units, detachments, stratagems, enhancements, army rules
    tyranids/
      tyranids_parsed_dossier.json
    ... (29 factions total)
  rules/
    rules.json                        ← 108 rule definitions
    rule_index.json                   ← rule relationship graph (mechanic groups, tag overlaps)
    missions.json                     ← 12 missions (primaries, deployments, annihilation)
  rosters/                            ← pre-existing roster .txt files (not yet auto-imported)
```

## Supported Query Commands

| Command | Aliases | Required Params | Description |
|---|---|---|---|
| `spec` | `unit`, `datasheet` | `name` | Full stat sheet for a unit |
| `list` | `search` | `type` | List/search units, weapons, factions, stratagems |
| `combat` | `vs` | `attacker`, `defender` | Hit/wound/kill probabilities with full math |
| `dice` | `roll` | `expression` | Dice roller (NdN+M, reroll, explode) |
| `rerun` | — | — | Re-run last combat with modifier changes |
| `threat` | `threats` | `faction` (optional) | Faction threat analysis with counter picks |
| `analyze` | `analyse`, `counter` | `name` | Deep unit threat analysis + counter picks |
| `rule` | `rules` | `term` | Rule/keyword lookup with related rules |
| `stratagem` | `strat` | `name` | Stratagem lookup (1,046 indexed) |
| `ability` | `ab`, `abilities` | `name` | Ability lookup (1,563 indexed) |
| `enhancement` | `enhance` | `name` | Enhancement lookup (637 indexed) |
| `detachment` | `detachments` | `faction` (optional) | Faction detachment rules |
| `army_rules` | `army rules`, `faction rules` | `faction` (optional) | Faction-level army rules |
| `mission` | `missions` | `name` | Mission lookup (12 missions) |
| `faction` | — | `name` | Set player faction for session |
| `enemy` | — | `name` | Set enemy faction for session |
| `session` | `state` | — | Show current session state |
| `nextturn` | `next`, `turn` | — | Advance battle round |
| `legend` | `key`, `abbrev`, `glossary` | — | Abbreviation glossary |
| `issues` | `stubs`, `missing` | — | Data gap audit |
| `mathmode` | `math` | `state` (optional) | Toggle math ledger replay |
| `history` | `hist` | — | Command history |
| `status` | — | — | Engine load state |
| `help` | `?` | `topic` (optional) | Command help |

## Isolated Build Rule

Work only in this folder. Never import from `render/`.
If you need a new query type: add to `commands.py` registry, implement handler in `engine.py`, add data loading in `loader.py` if needed.
