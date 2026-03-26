"""
Session summary block renderer.

Handles result_type == "session_summary".
Full-width two-column display: left = my roster, right = enemy roster.
Session state header at top.
"""

import shutil

RESET   = "\033[0m"
BOLD    = "\033[1m"
DIM     = "\033[2m"
CYAN    = "\033[96m"
GREEN   = "\033[92m"
YELLOW  = "\033[93m"
WHITE   = "\033[97m"


def _tw() -> int:
    try:
        return shutil.get_terminal_size(fallback=(110, 24)).columns
    except Exception:
        return 110


def _parse_unit(unit) -> tuple:
    """Return (name_str, points_str) from a unit dict or string."""
    if isinstance(unit, dict):
        name   = str(unit.get("name", "Unknown"))
        pts    = unit.get("points", "")
        pts_str = f"{pts}pts" if str(pts).isdigit() or isinstance(pts, int) else str(pts)
    elif isinstance(unit, str):
        # Try "Unit Name  90pts" or "Unit Name 90"
        parts = unit.rsplit(None, 1)
        if len(parts) == 2:
            raw_pts = parts[1].rstrip("pts")
            if raw_pts.isdigit():
                name    = parts[0].strip()
                pts_str = parts[1]
            else:
                name    = unit
                pts_str = ""
        else:
            name    = unit
            pts_str = ""
    else:
        name    = str(unit)
        pts_str = ""
    return name, pts_str


def render_session_summary(data: dict, indent: int = 2):
    tw  = _tw()
    pad = " " * indent

    state        = data.get("state", {})
    my_roster    = data.get("my_roster", {})
    enemy_roster = data.get("enemy_roster", {})

    # ── Session state header ────────────────────────────────────────────────────
    header_div = max(0, tw - indent * 2 - 14)
    print()
    print(f"{pad}{BOLD}{CYAN}SESSION STATE{RESET}  {DIM}{'─' * header_div}{RESET}")
    print()

    turn     = state.get("turn", "—")
    mode     = state.get("roster_mode", "—")
    target   = state.get("target") or "—"
    mods     = state.get("mods")    or "—"
    campaign = state.get("campaign")

    mode_color = GREEN if str(mode).upper() == "ON" else DIM
    mode_str   = f"{mode_color}{mode}{RESET}"

    state_parts = [
        f"{WHITE}Turn:{RESET} {BOLD}{turn}{RESET}",
        f"{WHITE}Roster Mode:{RESET} {mode_str}",
        f"{WHITE}Target:{RESET} {DIM}{target}{RESET}",
        f"{WHITE}Mods:{RESET} {DIM}{mods}{RESET}",
    ]
    if campaign:
        state_parts.append(f"{WHITE}Campaign:{RESET} {campaign}")

    print(f"{pad}{'   '.join(state_parts)}")
    print()

    # ── Two-column roster layout ────────────────────────────────────────────────
    avail_w  = tw - indent * 2
    col_w    = max(24, (avail_w - 3) // 2)   # 3 = "│" separators + padding
    pts_col  = 8                               # points column inside each roster pane
    name_col = col_w - pts_col - 3            # "│ " + name + pts + " │"

    my_units    = my_roster.get("units", [])
    en_units    = enemy_roster.get("units", [])
    my_name     = str(my_roster.get("name", "MY ROSTER"))
    en_name     = str(enemy_roster.get("name", "ENEMY"))
    my_count    = my_roster.get("unit_count", len(my_units))
    en_count    = enemy_roster.get("unit_count", len(en_units))
    my_pts      = my_roster.get("total_points", "")
    en_pts      = enemy_roster.get("total_points", "")

    # ── Column headers ──────────────────────────────────────────────────────────
    def _header_str(name, count, pts):
        s = f"{name}  {count}u"
        if pts:
            s += f" · {pts}pts"
        return s

    my_hdr = _header_str(my_name, my_count, my_pts)
    en_hdr = _header_str(en_name, en_count, en_pts)

    # Truncate headers to fit column
    my_hdr_vis = my_hdr[:col_w - 2]
    en_hdr_vis = en_hdr[:col_w - 2]

    # Top border: ┌─ HEADER ─────┬─ HEADER ─────┐
    def _top_segment(hdr, col, left_char="┌"):
        """One column's portion of the top border, without trailing corner."""
        prefix_vis = f"─ {hdr} "
        dashes     = max(0, col - len(prefix_vis))
        return f"{left_char}{BOLD}{prefix_vis}{RESET}{'─' * dashes}"

    top_my = _top_segment(my_hdr_vis, col_w, left_char="┌")
    top_en = _top_segment(en_hdr_vis, col_w, left_char="")  # ┬ already provides junction
    print(f"{pad}{top_my}┬{top_en}┐")

    # ── Unit rows ───────────────────────────────────────────────────────────────
    max_rows = max(len(my_units), len(en_units), 1)

    def _unit_cell(units, idx):
        """Return content-only string (no borders) for one unit row."""
        if idx < len(units):
            n, p = _parse_unit(units[idx])
            n        = n[:name_col]
            n_padded = n.ljust(name_col)
            p_padded = p[:pts_col].rjust(pts_col)
            return f" {n_padded}{p_padded} "
        else:
            return " " * (col_w + 1)

    for i in range(max_rows):
        my_cell = _unit_cell(my_units, i)
        en_cell = _unit_cell(en_units, i)
        print(f"{pad}│{my_cell}│{en_cell}│")

    # ── Empty roster placeholders ──────────────────────────────────────────────
    if not my_units and not en_units:
        empty_msg = "No roster loaded"
        my_cell   = f" {DIM}{empty_msg:<{col_w - 1}}{RESET}"
        en_cell   = f" {DIM}{empty_msg:<{col_w - 1}}{RESET}"
        print(f"{pad}│{my_cell}│{en_cell}│")

    # ── Bottom border ───────────────────────────────────────────────────────────
    print(f"{pad}└{'─' * (col_w + 1)}┴{'─' * (col_w + 1)}┘")
