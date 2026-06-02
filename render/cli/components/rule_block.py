"""
Rule lookup block renderer.

Handles result_type == "rule_block".
Displays: rule name, type/source, full description, related rule links.
"""

import textwrap

from .style import RESET, BOLD, DIM, CYAN, WHITE, terminal_width


def render_rule_block(data: dict, indent: int = 2):
    tw    = terminal_width()
    pad   = " " * indent
    div_w = max(20, tw - indent * 2)

    name    = str(data.get("name", "Unknown")).upper()
    type_   = str(data.get("type", "Keyword"))
    source  = str(data.get("source", ""))
    desc    = str(data.get("description", "—"))
    related = data.get("related", [])
    stub    = data.get("_stub", False)

    wrap_w  = max(40, min(div_w, 100))

    # ── Header ─────────────────────────────────────────────────────────────────
    header      = f"[ {name} ]"
    divider_len = max(0, div_w - len(header) - 2)
    print()
    print(f"{pad}{BOLD}{WHITE}{header}{RESET}  {DIM}{'─' * divider_len}{RESET}")

    # Source / type meta line
    meta_parts = [p for p in [type_, source] if p]
    if meta_parts:
        print(f"{pad}{DIM}{' · '.join(meta_parts)}{RESET}")
    print()

    # ── Description ────────────────────────────────────────────────────────────
    for line in textwrap.wrap(desc, wrap_w):
        print(f"{pad}{line}")

    # ── Related rules ───────────────────────────────────────────────────────────
    if related:
        print()
        related_str = "   ".join(f"{CYAN}→ {r}{RESET}" for r in related)
        print(f"{pad}{DIM}Related:{RESET}  {related_str}")

    if stub:
        print()
        print(f"{pad}{DIM}⚠ Stub data — rule not found in loaded rules file.{RESET}")
