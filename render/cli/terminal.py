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
import readline
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
        commands = list((schema.get("queries") or {}).keys())

        # Autocomplete
        def completer(text, state):
            matches = [c for c in commands if c.startswith(text)]
            return matches[state] if state < len(matches) else None
        readline.set_completer(completer)
        readline.parse_and_bind("tab: complete")

        print("\nType a command, 'help' for commands, or 'quit' to exit.\n")

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

            parts = raw.split(None, 1)
            command = parts[0]
            param_str = parts[1] if len(parts) > 1 else ""

            params = self._parse_params(command, param_str, schema)
            result = self._engine.query(command, params)
            self._render_result(result)
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

    def _print_help(self, schema: dict):
        queries = schema.get("queries", {})
        print()
        print("  Available commands:")
        print()
        for name, defn in queries.items():
            print(f"    {name:<16} {defn.get('description', '')}")
            example = defn.get("example")
            if example:
                print(f"    {'':16} example: {example}")
        print()
