"""
Ability lookup block renderer.

Handles result_type == "ability_block".
Displays: name, ability text, compact list of units that carry it.
"""

import shutil
import textwrap

RESET  = "\033[0m"
BOLD   = "\033[1m"
DIM    = "\033[2m"
CYAN   = "\033[96m"
WHITE  = "\033[97m"


def _tw() -> int:
    try:
        return shutil.get_terminal_size(fallback=(110, 24)).columns
    except Exception:
        return 110


def render_ability_block(data: dict, indent: int = 2):
    tw    = _tw()
    pad   = " " * indent
    div_w = max(20, tw - indent * 2)

    name   = str(data.get("name", "Unknown")).upper()
    text   = str(data.get("text", data.get("description", "—")))
    units  = data.get("units", [])
    phase  = str(data.get("phase", ""))
    source = str(data.get("source", ""))
    stub   = data.get("_stub", False)

    wrap_w = max(40, min(div_w, 100))

    # ── Header ─────────────────────────────────────────────────────────────────
    print()
    header = f"[ {name} ]"
    print(f"{pad}{BOLD}{WHITE}{header}{RESET}")

    meta_parts = [p for p in [phase, source] if p]
    if meta_parts:
        print(f"{pad}{DIM}{' · '.join(meta_parts)}{RESET}")

    print(f"{pad}{DIM}{'─' * min(div_w, 62)}{RESET}")
    print()

    # ── Ability text ───────────────────────────────────────────────────────────
    for line in textwrap.wrap(text, wrap_w):
        print(f"{pad}{line}")

    # ── Units that carry this ability ──────────────────────────────────────────
    if units:
        print()
        MAX_SHOWN = 12
        shown     = [str(u) for u in units[:MAX_SHOWN]]
        remaining = len(units) - MAX_SHOWN

        # Lay out units across lines that fit within wrap_w
        units_line = "  ·  ".join(shown)
        if remaining > 0:
            units_line += f"  {DIM}[+{remaining} more]{RESET}"

        print(f"{pad}{DIM}Units:{RESET}")
        # Wrap the unit list if it's long
        unit_parts = shown[:]
        current_line = ""
        for i, u in enumerate(unit_parts):
            sep       = "  ·  " if current_line else ""
            candidate = current_line + sep + u
            if len(candidate) > wrap_w - 2:
                print(f"{pad}  {current_line}")
                current_line = u
            else:
                current_line = candidate
        if current_line:
            suffix = f"  {DIM}[+{remaining} more]{RESET}" if remaining > 0 else ""
            print(f"{pad}  {current_line}{suffix}")

    if stub:
        print()
        print(f"{pad}{DIM}⚠ Stub data — ability not found in loaded data.{RESET}")
