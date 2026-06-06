"""
CLI Terminal Renderer

Interactive terminal that loads an engine and runs queries.
Calls engine.query(), engine.status(), engine.schema() — nothing else.

Usage:
  python main.py --cli
"""

from __future__ import annotations

import importlib
import json
try:
    import readline
except ImportError:
    readline = None
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from data._base import EngineBase
from render.cli.components.table import render_table
from render.cli.components.card import render_card
from render.cli.components.spec_sheet import render_spec_sheet
from render.cli.components.rule_block import render_rule_block
from render.cli.components.stratagem_block import render_stratagem_block
from render.cli.components.ability_block import render_ability_block
from render.cli.components.enhancement_block import render_enhancement_block
from render.cli.components.mission_block import render_mission_block
from render.cli.components.session_summary import render_session_summary
from render.cli.components.threat_card import render_threat_card


class Terminal:

    def __init__(self, config: dict):
        self._config = config
        self._engine: EngineBase | None = None
        self._engine_name: str = config.get("cli", {}).get("default_engine", "")

    def run(self):
        self._engine = self._load_engine(self._engine_name)
        if not self._engine:
            print(f"[error] Could not load engine: '{self._engine_name}'")
            sys.exit(1)

        self._print_header()
        self._repl()

    # ─── Engine loading ────────────────────────────────────────────────────────

    def _load_engine(self, name: str) -> EngineBase | None:
        try:
            module = importlib.import_module(f"data.{name}")
            for attr_name in dir(module):
                attr = getattr(module, attr_name)
                if (
                    isinstance(attr, type)
                    and issubclass(attr, EngineBase)
                    and attr is not EngineBase
                ):
                    print(f"Loading {name}...")
                    return attr()
        except Exception as e:
            print(f"[error] {e}")
        return None

    # ─── REPL ──────────────────────────────────────────────────────────────────

    def _repl(self):
        schema = self._engine.schema()

        # Cache alias map and help group info from the engine contract
        self._aliases = self._engine.aliases()
        self._help_groups = self._engine.help_groups()

        # Only expose CLI-compatible commands for tab completion
        queries = schema.get("queries") or {}
        cli_commands = [
            name for name, defn in queries.items()
            if defn.get("supports_cli", True)
        ]

        # Autocomplete — only CLI-visible commands (requires readline)
        if readline:
            def completer(text, state):
                matches = [c for c in cli_commands if c.startswith(text)]
                return matches[state] if state < len(matches) else None
            readline.set_completer(completer)
            readline.parse_and_bind("tab: complete")

        print("\nType a command, 'help' for commands, or 'quit' to exit.\n")
        print("  Tip: prefix any command with  math   to see the full math ledger.\n")

        # Per-session command history (for the 'history' command)
        self._history: list[str] = []
        math_mode = False

        while True:
            try:
                raw = input(f"  {self._engine.name()} › ").strip()
            except (EOFError, KeyboardInterrupt):
                print("\nBye.")
                break

            if not raw:
                continue
            if raw in ("quit", "exit", "q"):
                print("Bye.")
                break
            if raw == "help":
                self._print_help(schema)
                continue

            # ── Math mode prefix ─────────────────────────────────────────────
            # `math <command>` or `math on/off` as a standalone toggle
            lower = raw.lower()
            if lower in ("math on", "mathmode on"):
                math_mode = True
                print("\n  [ MATH MODE ON ]  Post-execution math ledger active.\n")
                self._history.append(raw)
                continue
            if lower in ("math off", "mathmode off"):
                math_mode = False
                print("\n  [ MATH MODE OFF ]\n")
                self._history.append(raw)
                continue

            # Strip `math ` prefix from the command if present, set math mode
            # for this single query without permanently toggling the flag
            one_shot_math = False
            if lower.startswith("math ") and not lower.startswith("mathmode"):
                raw = raw[5:].strip()
                one_shot_math = True

            self._history.append(raw)

            parts = raw.split(None, 1)
            command = parts[0]
            param_str = parts[1] if len(parts) > 1 else ""

            # Resolve aliases → canonical command name so `roll`, `vs`, etc. work
            canonical = self._aliases.get(command.lower(), command)

            params = self._parse_params(canonical, param_str, schema)
            result = self._engine.query(canonical, params)

            # Intercept 'history' result_type — render from CLI history list
            if result.get("result_type") == "history":
                self._render_history()
            else:
                self._render_result(result)

            # ── Math ledger replay ───────────────────────────────────────────
            if (math_mode or one_shot_math) and result.get("meta", {}).get("math_ledger"):
                self._render_math_ledger(result["meta"]["math_ledger"])

            print()

    # ─── Param parsing ─────────────────────────────────────────────────────────

    def _parse_params(self, command: str, param_str: str, schema: dict) -> dict:
        """
        Simple param parsing. Supports:
          - Key=value pairs:  unit name=Crisis Suits faction=tau
          - Positional first param if only one required param:  unit Crisis Suits
        """
        if not param_str:
            return {}

        # Try key=value pairs
        if "=" in param_str:
            params = {}
            for part in param_str.split():
                if "=" in part:
                    k, _, v = part.partition("=")
                    params[k] = v
            return params

        # Positional: map to first required param
        queries = schema.get("queries", {})
        query_def = queries.get(command, {})
        param_defs = query_def.get("params", {})
        required = [k for k, v in param_defs.items() if v.get("required")]

        if required:
            return {required[0]: param_str}

        return {"input": param_str}

    # ─── Rendering ─────────────────────────────────────────────────────────────

    def _render_result(self, result: dict):
        if not result:
            return

        ok = result.get("ok", True)
        result_type = result.get("result_type", "text")
        data = result.get("data")
        meta = result.get("meta", {})

        print()

        if not ok or result_type == "error":
            print(f"  ✗ {data}")
            return

        if result_type == "spec_sheet":
            render_spec_sheet(data)
        elif result_type == "rule_block":
            render_rule_block(data)
        elif result_type == "stratagem_block":
            render_stratagem_block(data)
        elif result_type == "ability_block":
            render_ability_block(data)
        elif result_type == "enhancement_block":
            render_enhancement_block(data)
        elif result_type == "mission_block":
            render_mission_block(data)
        elif result_type == "session_summary":
            render_session_summary(data)
        elif result_type == "threat_card":
            render_threat_card(data)
        elif result_type == "table":
            render_table(data)
        elif result_type == "card":
            render_card(data)
        elif result_type == "list":
            for item in (data or []):
                print(f"  • {item}")
        elif result_type == "unit_list_rich":
            units = data or []
            width = max((len(u.get("name", "")) for u in units), default=4)
            for i, u in enumerate(units, 1):
                name = u.get("name", "?")
                tag = ""
                if u.get("legends"):
                    tag = "  [LEGENDS]"
                elif u.get("forgeworld"):
                    tag = "  [FORGE WORLD]"
                t = u.get("T", "—"); w = u.get("W", "—")
                print(f"  {i:>3}.  {name:<{width}}  T {t:<3}  W {w:<3}{tag}")
        elif result_type == "text":
            for line in str(data).splitlines():
                print(f"  {line}")
        else:
            print(f"  {json.dumps(data, indent=2)}")

        if meta:
            extras = {k: v for k, v in meta.items() if v and not isinstance(v, list)}
            if extras:
                print()
                print("  " + "  ".join(f"{k}: {v}" for k, v in extras.items()))

    # ─── Help / header ─────────────────────────────────────────────────────────

    def _print_header(self):
        status = self._engine.status()
        width = min(shutil.get_terminal_size().columns, 80)
        print("─" * width)
        print(f"  {self._engine.name()}")
        print(f"  {self._engine.description()}")
        print()

        summary = status.get("summary", {})
        if summary:
            parts = [f"{k}: {v}" for k, v in summary.items()]
            print("  " + "  |  ".join(parts))

        errors = status.get("errors", [])
        if errors:
            print()
            for err in errors:
                print(f"  ⚠ {err}")

        print("─" * width)

    def _render_history(self):
        """Print the CLI session command history."""
        print()
        if not self._history:
            print("  (no commands yet this session)")
            return
        print("  Command history:")
        print()
        for i, cmd in enumerate(self._history, 1):
            print(f"    {i:>3}.  {cmd}")

    def _render_math_ledger(self, ledger: list):
        """Print the math ledger in readable plain-text format.

        The ledger is a list of either:
          {"type": "group",  "label": ..., "events": [...]}
          {"type": "event",  "label": ..., "formula": ..., "result": ..., "importance": ...}
        """
        if not ledger:
            return
        width = min(shutil.get_terminal_size().columns, 80)
        print()
        print("  " + "─" * (width - 2))
        print("  MATH MODE — execution ledger")
        print("  " + "─" * (width - 2))

        def render_event(ev: dict, indent: str = "  "):
            label   = ev.get("label", "")
            formula = ev.get("formula", "")
            result  = ev.get("result", "")
            imp     = ev.get("importance", 0)
            marker  = "▶ " if imp and imp >= 3 else "  "
            if formula:
                line = f"{indent}{marker}{label:<28} {formula}"
                if result not in ("", None):
                    line += f"  =  {result}"
            else:
                line = f"{indent}{marker}{label:<28} {result}"
            print(line)

        for item in ledger:
            item_type = item.get("type", "event")
            if item_type == "group":
                print(f"\n  ── {item.get('label', '')} ──")
                for ev in item.get("events", []):
                    render_event(ev, indent="    ")
            else:
                render_event(item)
        print()

    def _print_help(self, schema: dict):
        queries = schema.get("queries", {})
        # Filter to CLI-visible commands only
        cli_queries = {
            name: defn for name, defn in queries.items()
            if defn.get("supports_cli", True)
        }

        # Organise by group using the engine's help_groups()
        group_order  = self._help_groups.get("order", ["commands"])
        group_labels = self._help_groups.get("labels", {})

        grouped: dict[str, list] = {g: [] for g in group_order}
        for name, defn in cli_queries.items():
            g = defn.get("group", "meta")
            grouped.setdefault(g, []).append((name, defn))

        print()
        print("  Available commands:")
        for g in group_order:
            entries = grouped.get(g, [])
            if not entries:
                continue
            label = group_labels.get(g, g.title())
            # Skip the navigation group entirely — those are web-only
            if g == "navigation":
                continue
            print()
            print(f"  ── {label} ──")
            for name, defn in entries:
                print(f"    {name:<16} {defn.get('description', '')}")
                example = defn.get("example")
                if example:
                    print(f"    {'':16} e.g.  {example}")
        print()
