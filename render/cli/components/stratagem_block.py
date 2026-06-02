"""
Stratagem lookup block renderer.

Handles result_type == "stratagem_block".
Displays: name, cost, detachment, when / target / effect sections.
"""

import textwrap

from .style import RESET, BOLD, DIM, CYAN, YELLOW, WHITE, terminal_width


def _box_top(title: str, box_w: int, title_color: str = "") -> str:
    """Top border with inline title. box_w = total chars including corners."""
    # "┌─ TITLE ─────┐"
    inner = box_w - 2           # subtract ┌ and ┐
    prefix = f"─ {title} "     # visible: "─ TITLE "
    vis_prefix_len = 3 + len(title) + 1
    dashes = max(0, inner - vis_prefix_len)
    return f"┌{title_color}{prefix}{RESET}{'─' * dashes}┐"


def _box_line(content: str, box_w: int, content_is_ansi: bool = False) -> str:
    """A content row. box_w = total box width including │ borders."""
    inner_w = box_w - 4         # "│ " on left, " │" on right
    if not content_is_ansi:
        content = content[:inner_w]
        return f"│ {content:<{inner_w}} │"
    # For ANSI content we can't measure visible length accurately — just pad loosely
    return f"│ {content}"


def _box_bottom(box_w: int) -> str:
    return f"└{'─' * (box_w - 2)}┘"


def _wrapped_section(label: str, text: str, box_w: int, pad: str) -> None:
    """Print a labeled section (When/Target/Effect) with wrapped text inside the box."""
    inner_w   = box_w - 4
    label_pad = len(label) + 2  # "Label:  " width

    lines = textwrap.wrap(text, inner_w - label_pad - 1) if text else ["—"]

    first_line = lines[0] if lines else ""
    rest_lines = lines[1:]

    # First line: "│ Label:   text text text │"
    first_str = f"{BOLD}{CYAN}{label}:{RESET}   {first_line}"
    print(f"{pad}│ {first_str}")

    # Continuation lines: indented to align with text start
    continuation_pad = " " * (label_pad + 1)
    for line in rest_lines:
        print(f"{pad}│ {continuation_pad}{line}")


def render_stratagem_block(data: dict, indent: int = 2):
    tw     = terminal_width()
    pad    = " " * indent
    box_w  = max(40, tw - indent * 2)

    name       = str(data.get("name", "Unknown")).upper()
    cost       = str(data.get("cost", "?CP"))
    detachment = str(data.get("detachment", "")).upper()
    faction    = str(data.get("faction", ""))
    when       = str(data.get("when", ""))
    target     = str(data.get("target", ""))
    effect     = str(data.get("effect", ""))
    source     = str(data.get("source", ""))
    phase      = str(data.get("phase", ""))
    stub       = data.get("_stub", False)

    inner_w    = box_w - 4

    print()
    # ── Top border with name ───────────────────────────────────────────────────
    print(f"{pad}{_box_top(name, box_w, BOLD + YELLOW)}")

    # ── Cost ──────────────────────────────────────────────────────────────────
    print(f"{pad}│ {CYAN}{cost}{RESET}")

    # ── Detachment / faction ───────────────────────────────────────────────────
    if detachment:
        faction_str = f"  ({faction})" if faction else ""
        det_line = f"{DIM}Detachment:{RESET}  {BOLD}{detachment}{RESET}{DIM}{faction_str}{RESET}"
        print(f"{pad}│ {det_line}")

    # ── Phase / source ─────────────────────────────────────────────────────────
    meta_parts = [p for p in [phase, source] if p]
    if meta_parts:
        print(f"{pad}│ {DIM}{' · '.join(meta_parts)}{RESET}")

    print(f"{pad}│")

    # ── When / Target / Effect ─────────────────────────────────────────────────
    sections = [("When", when), ("Target", target), ("Effect", effect)]
    for label, text in sections:
        if text:
            _wrapped_section(label, text, box_w, pad)

    # ── Bottom border ──────────────────────────────────────────────────────────
    print(f"{pad}{_box_bottom(box_w)}")

    if stub:
        print()
        print(f"{pad}{DIM}⚠ Stub data — stratagem not found in loaded data.{RESET}")
