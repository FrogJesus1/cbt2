"""
Term Alias Store — user-defined shorthand → full term mappings.

Persisted to term_aliases.json alongside this module.
Used by the engine to expand user input before command parsing,
so e.g. "rule deepstrike" resolves to "rule deep strike".

Expansion is whole-word, case-insensitive, applied once per input.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Optional

_ALIAS_FILE = Path(__file__).parent / "term_aliases.json"

# In-memory cache — loaded once, written on every mutation
_aliases: dict[str, str] = {}


def _load() -> None:
    """Load aliases from disk into memory."""
    global _aliases
    if _ALIAS_FILE.exists():
        try:
            _aliases = json.loads(_ALIAS_FILE.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            _aliases = {}
    else:
        _aliases = {}


def _save() -> None:
    """Persist current aliases to disk."""
    _ALIAS_FILE.write_text(
        json.dumps(_aliases, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


# ── Public API ────────────────────────────────────────────────────────────────

def get_all() -> dict[str, str]:
    """Return a copy of all aliases {shorthand: full_term}."""
    return dict(_aliases)


def add(shorthand: str, full_term: str) -> dict[str, str]:
    """Add or update an alias.  Returns the full alias map."""
    _aliases[shorthand.lower().strip()] = full_term.strip()
    _save()
    return get_all()


def remove(shorthand: str) -> bool:
    """Remove an alias.  Returns True if it existed."""
    key = shorthand.lower().strip()
    if key in _aliases:
        del _aliases[key]
        _save()
        return True
    return False


def _collapse_adjacent_dupes(text: str) -> str:
    """Collapse consecutive duplicate words (case-insensitive).

    Expanding a shorthand whose full term overlaps words the user already
    typed produces doubled tokens — e.g. typing "crisis fireknife" with the
    alias fireknife→"crisis fireknife battlesuits" yields
    "crisis crisis fireknife battlesuits". Removing adjacent repeats restores
    the intended "crisis fireknife battlesuits".
    """
    out: list[str] = []
    for tok in text.split():
        if out and out[-1].lower() == tok.lower():
            continue
        out.append(tok)
    return " ".join(out)


def expand(text: str) -> tuple[str, Optional[str]]:
    """Expand aliases in text.  Returns (expanded_text, matched_alias_or_None).

    Replaces the first matching alias found (whole-word, case-insensitive).
    Only one expansion per call to avoid chaining surprises. Adjacent
    duplicate words created by the substitution are collapsed so an alias
    that overlaps already-typed words doesn't double them.
    """
    lower = text.lower()
    for shorthand, full_term in _aliases.items():
        # Whole-word boundary match, case-insensitive
        pattern = re.compile(r'\b' + re.escape(shorthand) + r'\b', re.IGNORECASE)
        if pattern.search(lower):
            expanded = pattern.sub(full_term, text, count=1)
            expanded = _collapse_adjacent_dupes(expanded)
            return expanded, shorthand
    return text, None


# ── Init ──────────────────────────────────────────────────────────────────────
_load()
