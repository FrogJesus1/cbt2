"""
Threat card renderer.

Handles result_type == "threat_card".
Left column:  unit name centred between dashes, 5 metric bars
              (Threat + Dur = RED, Dmg / Mob / Buff = CYAN),
              unit profile, [Keyword] brackets, abilities with — prefix,
              optional ⚡ enhancement badge.
Right column: top-3 counter units with solid GREEN bars.

Wide (≥110 cols): side-by-side with │ separator.
Narrow: threat block stacked above counter block.
Counter block is hidden when show_counters == False.
"""

import re

from .style import RESET, BOLD, DIM, RED, CYAN, GREEN, YELLOW, WHITE, terminal_width

# 5 threat metrics in display order: (data key, display label, bar color)
METRICS = [
    ("threat", "Threat", RED),
    ("dur",    "Dur",    RED),
    ("dmg",    "Dmg",    CYAN),
    ("mob",    "Mob",    CYAN),
    ("buff",   "Buff",   CYAN),
]

THREAT_LEVEL_COLORS = {
    "high":   RED,
    "medium": YELLOW,
    "low":    DIM,
}

_LABEL_W = 7   # fixed width for metric label column (fits "Threat ")


def _vis_len(s: str) -> int:
    """Visible length of a string after stripping ANSI escape codes."""
    return len(re.sub(r'\x1b\[[0-9;]*m', '', s))


def _vis_rpad(s: str, width: int) -> str:
    """Right-pad s to visible width, accounting for ANSI escape codes."""
    return s + " " * max(0, width - _vis_len(s))


# ─── Row builders ─────────────────────────────────────────────────────────────

def _metric_row(label: str, score: int, bar_w: int, color: str) -> str:
    """'Label  ███████████  77'  (solid blocks, no empty fill)"""
    filled  = max(0, min(bar_w, round(score * bar_w / 100)))
    bar     = f"{color}{'█' * filled}{RESET}"
    score_s = str(score).rjust(3)
    return f"{label:<{_LABEL_W}} {bar}{' ' * (bar_w - filled)} {score_s}"


def _counter_bar_row(name: str, score: int, name_w: int, bar_w: int) -> str:
    """'Unit Name  ████████  82'  (solid GREEN blocks)"""
    filled  = max(0, min(bar_w, round(score * bar_w / 100)))
    bar     = f"{GREEN}{'█' * filled}{RESET}"
    score_s = str(score).rjust(3)
    name_s  = name[:name_w].ljust(name_w)
    return f"{name_s}  {bar}{' ' * (bar_w - filled)} {score_s}"


# ─── Column builders ──────────────────────────────────────────────────────────

def _build_threat_lines(data: dict, col_w: int) -> list[str]:
    """Return a list of raw strings (no leading pad, no trailing newline)
    that form the left (threat) column."""
    lines: list[str] = []

    unit_name    = str(data.get("name", "Unknown")).upper()
    metrics      = data.get("metrics", {})
    profile      = data.get("profile", {})
    keywords     = data.get("keywords", [])
    abilities    = data.get("abilities", [])
    enhancement  = str(data.get("enhancement", "") or "")
    threat_level = str(data.get("threat_level", "medium")).lower()
    stub         = data.get("_stub", False)

    inner  = col_w - 2          # usable inner width (1-space margin each side)
    bar_w  = max(8, inner - _LABEL_W - 6)   # label + space + bar + space + score(3)

    # ── Centred unit name ──────────────────────────────────────────────────
    name_vis   = f" {unit_name} "
    dash_total = max(0, inner - len(name_vis))
    left_d     = dash_total // 2
    right_d    = dash_total - left_d
    lvl_color  = THREAT_LEVEL_COLORS.get(threat_level, DIM)

    lines.append("")
    lines.append(
        f"{DIM}{'─' * left_d}{RESET}"
        f"{lvl_color}{BOLD}{name_vis}{RESET}"
        f"{DIM}{'─' * right_d}{RESET}"
    )
    lines.append("")

    # ── 5 metric bars ─────────────────────────────────────────────────────
    for key, label, color in METRICS:
        score = min(100, max(0, int(metrics.get(key, 0))))
        lines.append(_metric_row(label, score, bar_w, color))

    lines.append("")

    # ── Profile row ───────────────────────────────────────────────────────
    prof_parts = []
    for k in ("T", "Sv", "W", "M", "OC"):
        v = profile.get(k)
        if v is not None:
            prof_parts.append(f"{DIM}{k}{RESET} {v}")
    if prof_parts:
        lines.append("  ".join(prof_parts))
        lines.append("")

    # ── Keywords as [Bracket] tokens ──────────────────────────────────────
    if keywords:
        kw_tokens = [f"[{kw}]" for kw in keywords]
        cur = ""
        for tok in kw_tokens:
            candidate = (cur + " " + tok).strip() if cur else tok
            if cur and _vis_len(candidate) > inner:
                lines.append(cur)
                cur = tok
            else:
                cur = candidate
        if cur:
            lines.append(cur)
        lines.append("")

    # ── Abilities: — Name  description… ───────────────────────────────────
    if abilities:
        ab_name_w = min(20, inner // 3)
        ab_desc_w = max(8, inner - ab_name_w - 6)   # "— " + name + "  " + desc

        for ab in abilities:
            if isinstance(ab, dict):
                ab_name = str(ab.get("name", ""))
                ab_desc = str(ab.get("description", ab.get("text", "")))
            else:
                ab_name = str(ab)
                ab_desc = ""

            name_s = ab_name[:ab_name_w].ljust(ab_name_w)
            if ab_desc and len(ab_desc) > ab_desc_w:
                desc_s = ab_desc[:ab_desc_w - 1] + "…"
            else:
                desc_s = ab_desc

            lines.append(
                f"{DIM}—{RESET} {BOLD}{name_s}{RESET}  {DIM}{desc_s}{RESET}"
            )

        lines.append("")

    # ── Enhancement badge ─────────────────────────────────────────────────
    if enhancement:
        enh_s = enhancement[: max(1, inner - 16)]
        lines.append(f"⚡ {BOLD}Enhancement:{RESET} {enh_s}")
        lines.append("")

    # ── Stub notice ───────────────────────────────────────────────────────
    if stub:
        lines.append(f"{DIM}⚠ Stub data — unit not found in loaded data.{RESET}")
        lines.append("")

    return lines


def _build_counter_lines(data: dict, col_w: int) -> list[str]:
    """Return a list of raw strings that form the right (counter) column."""
    lines: list[str] = []
    counters = data.get("counters", [])

    if not counters:
        lines.append("")
        lines.append(f"{DIM}No counters available.{RESET}")
        return lines

    inner  = col_w - 2
    hdr    = "Counters "
    dashes = max(0, inner - len(hdr))

    lines.append("")
    lines.append(f"{BOLD}{WHITE}{hdr}{RESET}{DIM}{'─' * dashes}{RESET}")
    lines.append("")

    # Column widths inside the counter block
    name_w = max(10, inner - 16)   # bar(10) + score(3) + separators(3)
    bar_w  = max(6, inner - name_w - 6)

    for counter in counters[:3]:
        if isinstance(counter, dict):
            c_name   = str(counter.get("name", "Unknown"))
            c_score  = min(100, max(0, int(counter.get("score", 0))))
            c_reason = str(counter.get("reason", ""))
        else:
            c_name   = str(counter)
            c_score  = 50
            c_reason = ""

        lines.append(_counter_bar_row(c_name, c_score, name_w, bar_w))

        if c_reason:
            reason_vis = c_reason[: max(1, inner - 2)]
            lines.append(f"  {DIM}{reason_vis}{RESET}")

    return lines


# ─── Main render ──────────────────────────────────────────────────────────────

def render_threat_card(data: dict, indent: int = 2):
    tw  = terminal_width()
    pad = " " * indent

    show_counters = data.get("show_counters", True)
    has_counters  = bool(data.get("counters"))

    side_by_side = tw >= 110 and show_counters and has_counters

    if side_by_side:
        avail_w = tw - indent * 2 - 3   # -1 for │, -2 for spaces around it
        left_w  = (avail_w * 3) // 5    # threat block: 60%
        right_w = avail_w - left_w      # counter block: 40%

        left_lines  = _build_threat_lines(data, left_w)
        right_lines = _build_counter_lines(data, right_w)

        # Normalise to equal row count
        max_rows = max(len(left_lines), len(right_lines))
        while len(left_lines)  < max_rows:
            left_lines.append("")
        while len(right_lines) < max_rows:
            right_lines.append("")

        for lline, rline in zip(left_lines, right_lines):
            print(f"{pad}{_vis_rpad(lline, left_w)} │ {rline}")

    else:
        # Stacked: threat on top, counters below (if shown)
        for line in _build_threat_lines(data, tw - indent * 2):
            print(f"{pad}{line}")

        if show_counters and has_counters:
            print()
            for line in _build_counter_lines(data, tw - indent * 2):
                print(f"{pad}{line}")
