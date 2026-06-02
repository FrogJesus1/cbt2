"""
Shared ANSI escape codes and terminal helpers for CLI components.
"""

import shutil

# ── ANSI escape codes ────────────────────────────────────────────────────────

RESET   = "\033[0m"
BOLD    = "\033[1m"
DIM     = "\033[2m"
RED     = "\033[91m"
GREEN   = "\033[92m"
YELLOW  = "\033[93m"
MAGENTA = "\033[95m"
CYAN    = "\033[96m"
WHITE   = "\033[97m"


def terminal_width(fallback: int = 110) -> int:
    """Return current terminal width in columns."""
    try:
        return shutil.get_terminal_size(fallback=(fallback, 24)).columns
    except Exception:
        return fallback
