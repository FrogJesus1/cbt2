"""
Enhancement lookup block renderer.

Handles result_type == "enhancement_block".
Displays: name, points cost, detachment, faction, description, auto-links.
"""

import textwrap

from .style import RESET, BOLD, DIM, CYAN, MAGENTA, WHITE, terminal_width


def render_enhancement_block(data: dict, indent: int = 2):
    tw     = terminal_width()
    pad    = " " * indent
    box_w  = max(40, tw - indent * 2)
    inner_w = box_w - 4   # "│ " left, " │" right

    name       = str(data.get("name", "Unknown")).upper()
    points     = str(data.get("points", ""))
    detachment = str(data.get("detachment", "")).upper()
    faction    = str(data.get("faction", ""))
    text       = str(data.get("text", data.get("description", "—")))
    links      = data.get("links", [])
    stub       = data.get("_stub", False)

    wrap_w = max(30, inner_w - 2)

    def _row(content: str, visible_len: int | None = None):
        """Print a box row with left and right borders, padding to inner_w."""
        vl = visible_len if visible_len is not None else len(content)
        gap = max(0, inner_w - vl)
        print(f"{pad}│ {content}{' ' * gap} │")

    print()
    # ── Top border with name ───────────────────────────────────────────────────
    title_vis  = f"─ {name} "
    dashes     = max(0, box_w - 2 - len(title_vis))
    print(f"{pad}┌{BOLD}{MAGENTA}{title_vis}{RESET}{'─' * dashes}┐")

    # ── Points ────────────────────────────────────────────────────────────────
    if points:
        _row(f"{BOLD}{WHITE}{points}{RESET}", len(points))

    # ── Detachment / faction ───────────────────────────────────────────────────
    if detachment:
        faction_str = f"  ({faction})" if faction else ""
        vis_text = f"Detachment:  {detachment}{faction_str}"
        _row(f"{DIM}Detachment:{RESET}  {BOLD}{detachment}{RESET}{DIM}{faction_str}{RESET}", len(vis_text))

    _row("", 0)

    # ── Description ────────────────────────────────────────────────────────────
    lines = textwrap.wrap(text, wrap_w)
    for line in lines:
        _row(line)

    # ── Links ──────────────────────────────────────────────────────────────────
    if links:
        _row("", 0)
        links_vis = "  ".join(f"→ {l}" for l in links)
        links_fmt = "  ".join(f"{CYAN}→ {l}{RESET}" for l in links)
        _row(f"{DIM}Links:{RESET}  {links_fmt}", len(f"Links:  {links_vis}"))

    # ── Bottom ─────────────────────────────────────────────────────────────────
    print(f"{pad}└{'─' * (box_w - 2)}┘")

    if stub:
        print()
        print(f"{pad}{DIM}⚠ Stub data — enhancement not found in loaded data.{RESET}")
