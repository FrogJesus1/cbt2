"""
Enhancement lookup block renderer.

Handles result_type == "enhancement_block".
Displays: name, points cost, detachment, faction, description, auto-links.
"""

import shutil
import textwrap

RESET   = "\033[0m"
BOLD    = "\033[1m"
DIM     = "\033[2m"
CYAN    = "\033[96m"
MAGENTA = "\033[95m"
WHITE   = "\033[97m"


def _tw() -> int:
    try:
        return shutil.get_terminal_size(fallback=(110, 24)).columns
    except Exception:
        return 110


def render_enhancement_block(data: dict, indent: int = 2):
    tw     = _tw()
    pad    = " " * indent
    box_w  = max(40, tw - indent * 2)
    inner_w = box_w - 4   # "│ " left, " │" right — but we won't enforce right │ strictly

    name       = str(data.get("name", "Unknown")).upper()
    points     = str(data.get("points", ""))
    detachment = str(data.get("detachment", "")).upper()
    faction    = str(data.get("faction", ""))
    text       = str(data.get("text", data.get("description", "—")))
    links      = data.get("links", [])
    stub       = data.get("_stub", False)

    wrap_w = max(30, inner_w - 2)

    print()
    # ── Top border with name ───────────────────────────────────────────────────
    title_vis  = f"─ {name} "
    dashes     = max(0, box_w - 2 - len(title_vis))
    print(f"{pad}┌{BOLD}{MAGENTA}{title_vis}{RESET}{'─' * dashes}┐")

    # ── Points ────────────────────────────────────────────────────────────────
    if points:
        print(f"{pad}│ {BOLD}{WHITE}{points}{RESET}")

    # ── Detachment / faction ───────────────────────────────────────────────────
    if detachment:
        faction_str = f"  ({faction})" if faction else ""
        print(f"{pad}│ {DIM}Detachment:{RESET}  {BOLD}{detachment}{RESET}{DIM}{faction_str}{RESET}")

    print(f"{pad}│")

    # ── Description ────────────────────────────────────────────────────────────
    lines = textwrap.wrap(text, wrap_w)
    for line in lines:
        print(f"{pad}│ {line}")

    # ── Links ──────────────────────────────────────────────────────────────────
    if links:
        print(f"{pad}│")
        links_str = "  ".join(f"{CYAN}→ {l}{RESET}" for l in links)
        print(f"{pad}│ {DIM}Links:{RESET}  {links_str}")

    # ── Bottom ─────────────────────────────────────────────────────────────────
    print(f"{pad}└{'─' * (box_w - 2)}┘")

    if stub:
        print()
        print(f"{pad}{DIM}⚠ Stub data — enhancement not found in loaded data.{RESET}")
