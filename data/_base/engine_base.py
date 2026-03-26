"""
EngineBase — the contract every data engine must implement.

The rendering layer (web + CLI) calls ONLY these five methods.
Engines never import from render/. Renderers never import from data/.
"""

from abc import ABC, abstractmethod
from typing import Any


class EngineBase(ABC):
    """
    Abstract base class for all data engines.

    Subclass this in data/<engine_name>/engine.py and implement all five methods.
    Register the engine name in config.json under primary_engine or support_engines.
    """

    @abstractmethod
    def name(self) -> str:
        """
        Human-readable name shown in the UI.
        Example: "Combat Terminal"
        """
        ...

    @abstractmethod
    def description(self) -> str:
        """
        One-line summary of what this engine does.
        Example: "Warhammer 40K 10th edition tools — combat math, rules, unit sheets."
        """
        ...

    @abstractmethod
    def schema(self) -> dict:
        """
        Describes what query types and parameters this engine accepts.

        Return format:
        {
            "queries": {
                "<query_type>": {
                    "description": str,
                    "params": {
                        "<param_name>": {
                            "type": str,         # "string" | "number" | "boolean"
                            "required": bool,
                            "description": str,
                            "example": Any
                        }
                    },
                    "example": str               # full example command string
                }
            }
        }
        """
        ...

    @abstractmethod
    def status(self) -> dict:
        """
        Current load state and data summary.

        Return format:
        {
            "engine": str,           # engine name
            "ready": bool,           # is the engine fully loaded?
            "summary": dict,         # engine-specific stats (record counts, etc.)
            "errors": list[str]      # any load errors or warnings
        }
        """
        ...

    @abstractmethod
    def query(self, command: str, params: dict = {}) -> dict:
        """
        Execute a query and return structured results.

        Args:
            command: the query type string (must match a key in schema()["queries"])
            params:  key-value parameters for the query

        Return format:
        {
            "ok": bool,              # did the query succeed?
            "command": str,          # echoed back
            "result_type": str,      # "table" | "card" | "list" | "text" | "error"
            "data": Any,             # the actual results (structure depends on result_type)
            "meta": dict             # optional metadata (total_count, filters_applied, etc.)
        }

        Result type shapes:
          "table"  → data: { "columns": [...], "rows": [[...], ...] }
          "card"   → data: { "title": str, "fields": [{"label": str, "value": Any}, ...] }
          "list"   → data: [str, ...]
          "text"   → data: str
          "error"  → data: str (error message)
        """
        ...
