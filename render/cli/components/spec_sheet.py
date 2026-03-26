"""
Spec Sheet renderer — combined stat block + combat ratings block.

Handles result_type == "spec_sheet".
"""

import shutil
import textwrap

# ── ANSI codes ──────────────────────────────────────────────────────────────────
RESET   = "\033[0m"
BOLD    = "\033[1m"
DIM     = "\033[2m"
CYAN    = "\033[96m"
GREEN   = "\033[92m"
YELLOW  = "\033[93m"
RED     = "\033[91m"
MAGENTA = "\033[95m"
WHITE   = "\033[97m"

# ── Rating config ───────────────────────────────────────────────────────────────
RATING_ORDER = ["durability", "mobility", "obj_control", "firepower", "melee_threat"]

RATING_LABELS = {
    "durability":    "Durability  ",
    "mobility":      "Mobility    ",
    "obj_control":   "Obj Control ",
    "firepower":     "Firepower   ",
    "melee_threat":  "Melee Threat",
}

RATING_COLORS = {
    "durability":    GREEN,
    "mobility":      YELLOW,
    "obj_control":   CYAN,
    "firepower":     RED,
    "melee_threat":  MAGENTA,
}


def _tw() -> int:
    try:
        return shutil.get_terminal_size(fallback=(110, 24)).columns
    except Exception:
        return 110


def _bar(score: float, width: int, color: str) -> str:
    """Render a progress bar using Unicode block characters."""
    score   = max(0.0, min(1.0, score))
    filled  = round(score * width)
    empty   = width - filled
    return f"{color}{'█' * filled}{RESET}{DIM}{'░' * empty}{RESET}"


def render_spec_sheet(data: dict, indent: int = 2):
    tw      = _tw()
    pad     = " " * indent
    div_w   = max(20, tw - indent * 2)
    wrap_w  = max(40, min(div_w - 4, 100))

    title    = data.get("title", "Unknown")
    subtitle = data.get("subtitle", "")
    stats    = data.get("stats", {})
    weapons  = data.get("weapons", [])
    abilities= data.get("abilities", [])
    keywords = data.get("keywords", [])
    ratings  = data.get("ratings", {})
    stub     = data.get("_stub", False)

    # ── Title ──────────────────────────────────────────────────────────────────
    title_str = title.upper()
    print(f"{pad}{BOLD}{WHITE}{title_str}{RESET}", end="")
    if subtitle:
        print(f"  {DIM}{subtitle}{RESET}")
    else:
        print()
    print(f"{pad}{DIM}{'─' * min(div_w, 62)}{RESET}")
    print()

    # ── Core stats bar ─────────────────────────────────────────────────────────
    if stats:
        stat_parts = []
        for k, v in stats.items():
            stat_parts.append(f"{DIM}{k}{RESET} {WHITE}{v}{RESET}")
        print(f"{pad}{'   '.join(stat_parts)}")
        print()

    # ── Combat ratings block ───────────────────────────────────────────────────
    if ratings:
        bar_w = max(12, min(24, (tw - 62) // 3 + 16))
        header_pad = max(0, div_w - 16)
        print(f"{pad}{BOLD}COMBAT RATINGS{RESET}  {DIM}{'─' * min(header_pad, 50)}{RESET}")
        print()
        for key in RATING_ORDER:
            if key not in ratings:
                continue
            r      = ratings[key]
            score  = float(r.get("score", 0.0))
            label  = str(r.get("label", "—"))
            color  = RATING_COLORS.get(key, WHITE)
            row_lbl= RATING_LABELS.get(key, key.replace("_", " ").title())
            bar    = _bar(score, bar_w, color)
            print(f"{pad}{WHITE}{row_lbl}{RESET}  {bar}  {color}{label}{RESET}")
        print()

    # ── Weapons ────────────────────────────────────────────────────────────────
    if weapons:
        print(f"{pad}{BOLD}WEAPONS{RESET}")
        for w in weapons:
            if isinstance(w, dict):
                w_name  = w.get("name", "Unknown")
                w_range = w.get("range", "")
                # Build compact stats string
                stat_keys = [
                    ("attacks",  "A"),
                    ("bs_ws",    "BS"),
                    ("strength", "S"),
                    ("ap",       "AP"),
                    ("damage",   "D"),
                    # alternate key names from different data formats
                    ("A",  "A"),
                    ("BS", "BS"),
                    ("WS", "WS"),
                    ("S",  "S"),
                    ("AP", "AP"),
                    ("D",  "D"),
                ]
                seen_shorts = set()
                stats_parts = []
                for key, short in stat_keys:
                    if key in w and short not in seen_shorts:
                        stats_parts.append(f"{short}:{w[key]}")
                        seen_shorts.add(short)
                stats_str   = "  ".join(stats_parts)
                range_str   = f"{w_range}  " if w_range else ""
                keywords_raw = w.get("keywords", w.get("abilities", ""))
                kw_str      = f"  [{keywords_raw}]" if keywords_raw else ""
                print(f"{pad}  {CYAN}{w_name}{RESET}  {DIM}{range_str}{stats_str}{kw_str}{RESET}")
            else:
                w_str = str(w)
                first = True
                for line in textwrap.wrap(w_str, wrap_w - 2):
                    prefix = f"{pad}  " if first else f"{pad}    "
                    print(f"{prefix}{line}")
                    first = False
        print()

    # ── Abilities ──────────────────────────────────────────────────────────────
    if abilities:
        print(f"{pad}{BOLD}ABILITIES{RESET}")
        for ab in abilities:
            if isinstance(ab, dict):
                ab_name = ab.get("name", "Unknown")
                ab_text = ab.get("description", ab.get("text", ""))
                print(f"{pad}  {BOLD}{ab_name}{RESET}")
                if ab_text:
                    for line in textwrap.wrap(ab_text, wrap_w - 4):
                        print(f"{pad}    {DIM}{line}{RESET}")
            else:
                ab_str = str(ab)
                # Try to split "Name: description" format
                if ": " in ab_str:
                    name_part, _, desc_part = ab_str.partition(": ")
                    print(f"{pad}  {BOLD}{name_part}{RESET}")
                    for line in textwrap.wrap(desc_part, wrap_w - 4):
                        print(f"{pad}    {DIM}{line}{RESET}")
                else:
                    for line in textwrap.wrap(ab_str, wrap_w - 2):
                        print(f"{pad}  {line}")
        print()

    # ── Keywords ───────────────────────────────────────────────────────────────
    if keywords:
        kw_str = "  ·  ".join(str(k) for k in keywords)
        lines  = textwrap.wrap(kw_str, wrap_w)
        print(f"{pad}{DIM}Keywords: {lines[0] if lines else ''}{RESET}")
        for line in lines[1:]:
            print(f"{pad}          {DIM}{line}{RESET}")

    if stub:
        print()
        print(f"{pad}{DIM}⚠ Stub data — unit not found in loaded faction files.{RESET}")
