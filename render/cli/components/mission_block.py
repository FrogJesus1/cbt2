"""
Mission lookup block renderer.

Handles result_type == "mission_block".
Displays: name, type, source, size, deployment, description,
          primary scoring, mission rules, tip.
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


def _divider(div_w: int, pad: str) -> None:
    print(f"{pad}{DIM}{'─' * min(div_w, 62)}{RESET}")


def render_mission_block(data: dict, indent: int = 2):
    tw    = _tw()
    pad   = " " * indent
    div_w = max(20, tw - indent * 2)

    name       = str(data.get("name", "Unknown")).upper()
    m_type     = str(data.get("type", ""))
    source     = str(data.get("source", ""))
    size       = str(data.get("size", ""))
    deployment = str(data.get("deployment", ""))
    description= str(data.get("description", ""))
    scoring    = data.get("scoring", [])
    rules      = data.get("mission_rules", data.get("rules", []))
    tip        = str(data.get("tip", ""))
    stub       = data.get("_stub", False)

    wrap_w = max(40, min(div_w, 100))

    # ── Header ─────────────────────────────────────────────────────────────────
    print()
    header      = f"[ {name} ]"
    divider_len = max(0, div_w - len(header) - 2)
    print(f"{pad}{BOLD}{WHITE}{header}{RESET}  {DIM}{'─' * divider_len}{RESET}")

    # Meta: type · source · size
    meta_parts = [p for p in [m_type, source, size] if p]
    if meta_parts:
        print(f"{pad}{DIM}{' · '.join(meta_parts)}{RESET}")

    if deployment:
        print(f"{pad}Deployment:  {BOLD}{deployment}{RESET}")

    print()

    # ── Description ────────────────────────────────────────────────────────────
    if description:
        for line in textwrap.wrap(description, wrap_w):
            print(f"{pad}{line}")

    # ── Scoring sections ────────────────────────────────────────────────────────
    for section in (scoring or []):
        print()
        _divider(div_w, pad)
        print()
        header_text = str(section.get("header", "SCORING")).upper()
        print(f"{pad}{BOLD}{header_text}{RESET}")
        print()
        sec_text = str(section.get("text", ""))
        for line in textwrap.wrap(sec_text, wrap_w):
            print(f"{pad}{line}")

    # ── Mission rules ───────────────────────────────────────────────────────────
    if rules:
        print()
        _divider(div_w, pad)
        print()
        plural = "S" if len(rules) > 1 else ""
        print(f"{pad}{BOLD}MISSION RULE{plural}{RESET}")
        print()
        for rule in rules:
            r_name = str(rule.get("name", "")).upper()
            r_text = str(rule.get("text", ""))
            if r_name:
                print(f"{pad}{BOLD}{CYAN}{r_name}{RESET}")
            if r_text:
                for line in textwrap.wrap(r_text, wrap_w):
                    print(f"{pad}{line}")

    # ── Tip ─────────────────────────────────────────────────────────────────────
    if tip:
        print()
        _divider(div_w, pad)
        print()
        for line in textwrap.wrap(f"Tip: {tip}", wrap_w):
            print(f"{pad}{DIM}{line}{RESET}")

    if stub:
        print()
        print(f"{pad}{DIM}⚠ Stub data — mission not found in loaded data.{RESET}")
