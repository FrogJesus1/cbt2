"""
math_ledger.py

Execution-scoped mathematical event ledger for the Python simulation layer.

Mirrors the JavaScript mathLedger.js API so the data contract is identical
on both sides of the server boundary.

Usage (inside any query handler):
    ledger = MathLedger()
    ledger.start_group("targeting")
    ledger.log(system="targeting", label="distance",
               formula="sqrt((x2-x1)^2 + (y2-y1)^2)",
               inputs={"x2": 24, "x1": 0, "y2": 0, "y1": 0}, result=24.0)
    ledger.end_group()
    meta["math_ledger"] = ledger.get_ledger()

Alternatively, use build_combat_ledger() to reconstruct a narrative from
already-computed combat results — no instrumentation of the math engine needed.
"""
from __future__ import annotations

import time
from typing import Any


# ─── Core ledger ───────────────────────────────────────────────────────────────

class MathLedger:
    """Single-execution math event recorder.

    Create one per command execution. Call log() during computation.
    Call get_ledger() to retrieve the finalized snapshot for serialisation.
    """

    def __init__(self):
        self._events: list = []
        self._current_group: dict | None = None

    def clear(self) -> None:
        """Reset to empty state."""
        self._events = []
        self._current_group = None

    def log(
        self,
        system: str,
        label: str,
        formula: str,
        inputs: dict | None = None,
        result: Any = None,
        importance: str = "normal",
    ) -> None:
        """Record a single math event.

        Args:
            system:     Computation domain — "targeting" | "ballistics" | "simulation" | etc.
            label:      Machine-readable identifier (snake_case), e.g. "p_hit"
            formula:    Human-readable formula string, e.g. "(7 - hit_target) / 6"
            inputs:     Named inputs map, e.g. {"hit_target": 3}
            result:     The computed result (number, string, or formatted value)
            importance: "high" | "normal" | "low"
        """
        event = {
            "type":       "event",
            "system":     system,
            "label":      label,
            "formula":    formula,
            "inputs":     inputs or {},
            "result":     result,
            "importance": importance,
            "timestamp":  time.time() * 1000,  # ms — consistent with JS Date.now()
        }
        if self._current_group is not None:
            self._current_group["events"].append(event)
        else:
            self._events.append(event)

    def start_group(self, label: str) -> None:
        """Begin a named event group. Groups cannot be nested."""
        group: dict = {"type": "group", "label": label, "events": []}
        self._events.append(group)
        self._current_group = group

    def end_group(self) -> None:
        """Close the current group; subsequent log() calls return to root."""
        self._current_group = None

    def get_ledger(self) -> list:
        """Return a shallow copy of all recorded events."""
        return list(self._events)

    def is_empty(self) -> bool:
        return len(self._events) == 0


# ─── Combat narrative builder ──────────────────────────────────────────────────

def _fmt_pct(v: float | None) -> str:
    """Format a probability value as a percentage string.

    The combat math engine stores hit/wound/save probabilities on a 0–100 scale
    (e.g. 50.0, 66.7), not 0–1.  Format them as-is.
    """
    if v is None:
        return "?"
    try:
        return f"{float(v):.1f}%"
    except (TypeError, ValueError):
        return str(v)


def _fmt_num(v: Any, decimals: int = 2) -> str:
    if v is None:
        return "?"
    try:
        return f"{float(v):.{decimals}f}"
    except (TypeError, ValueError):
        return str(v)


def _bs_to_target(bs_raw: Any) -> int | None:
    """Parse a BS/WS value like '3+' or 3 → integer target (e.g. 3)."""
    if bs_raw is None:
        return None
    try:
        return int(str(bs_raw).replace("+", "").strip())
    except (ValueError, TypeError):
        return None


def _s_vs_t_target(strength: Any, toughness: int | None) -> int | None:
    """Return the to-wound target using the standard S-vs-T chart."""
    if toughness is None:
        return None
    try:
        s = int(str(strength).strip())
    except (TypeError, ValueError):
        return None
    t = toughness
    if s >= t * 2:
        return 2
    elif s > t:
        return 3
    elif s == t:
        return 4
    elif s * 2 <= t:
        return 6
    else:
        return 5


def build_combat_ledger(
    att_unit: dict,
    def_unit: dict,
    flags: list,
    math_result: dict,
    weapons: list,
) -> list:
    """Build a deterministic math narrative from computed combat results.

    This function reconstructs the math story *after* computation, reading
    the per-weapon results to produce a structured ledger. This avoids
    instrumenting the inner combat math engine while still producing an
    accurate, readable narrative.

    Returns a list of ledger events/groups — the same schema as MathLedger.get_ledger().
    """
    ledger = MathLedger()

    att_name = att_unit.get("name", "attacker") if att_unit else "attacker"
    def_name = def_unit.get("name", "defender") if def_unit else "defender"

    # Defender stats
    def_stats = def_unit.get("stats", def_unit) if def_unit else {}
    def_T_raw = def_stats.get("T") or def_unit.get("T") if def_unit else None
    def_W_raw = def_stats.get("W") or def_unit.get("W") if def_unit else None
    def_Sv_raw = def_stats.get("Sv") or def_unit.get("Sv") if def_unit else None
    try:
        def_T = int(str(def_T_raw).replace('"', "").strip())
    except (TypeError, ValueError):
        def_T = None
    try:
        def_W = int(str(def_W_raw).replace('"', "").strip())
    except (TypeError, ValueError):
        def_W = None
    try:
        def_Sv = int(str(def_Sv_raw).replace("+", "").strip())
    except (TypeError, ValueError):
        def_Sv = None

    # ── Group 1: DEFENDER PROFILE ────────────────────────────────────────────
    ledger.start_group("DEFENDER PROFILE")
    if def_T is not None:
        ledger.log(
            system="profile",
            label="toughness",
            formula="T (from unit datasheet)",
            inputs={"unit": def_name},
            result=def_T,
            importance="high",
        )
    if def_Sv is not None:
        ledger.log(
            system="profile",
            label="armour_save",
            formula="Sv (from unit datasheet)",
            inputs={"unit": def_name},
            result=f"{def_Sv}+",
        )
    if def_W is not None:
        ledger.log(
            system="profile",
            label="wounds",
            formula="W (from unit datasheet)",
            inputs={"unit": def_name},
            result=def_W,
        )

    # Active modifier notes
    active_flags = [f.split(":")[0] for f in flags]
    if "cover" in active_flags and def_Sv is not None:
        cover_save = def_Sv - 1  # cover improves save by 1
        ledger.log(
            system="profile",
            label="cover_modifier",
            formula="Sv_effective = Sv - 1 (cover bonus)",
            inputs={"Sv_base": f"{def_Sv}+", "cover": True},
            result=f"{cover_save}+ (effective)",
            importance="high",
        )
    ledger.end_group()

    # ── Per-weapon groups ────────────────────────────────────────────────────
    per_weapon_dmg = math_result.get("per_weapon_dmg", {})
    shown_weapons = [w for w in weapons if w.get("hit_pct") is not None]

    for w in shown_weapons[:6]:  # cap at 6 weapons to keep ledger readable
        w_name = w.get("name", "weapon")
        pw = per_weapon_dmg.get(w_name, {})

        bs_raw     = w.get("bs_ws")
        bs_target  = _bs_to_target(bs_raw)
        shots_raw  = w.get("shots")
        shots_tot  = w.get("shots_total") or shots_raw
        strength   = w.get("strength")
        ap_raw     = w.get("ap", "0")
        dmg_raw    = w.get("damage") or w.get("d")

        hit_t      = pw.get("hit_target")
        wound_t    = pw.get("wound_target")
        p_hit      = pw.get("hit_pct")
        p_wound    = pw.get("wound_pct")
        fail_save  = pw.get("fail_save_pct")
        dmg        = pw.get("dmg")
        kills      = pw.get("kills")

        # Parse AP
        try:
            ap_int = int(str(ap_raw).replace("-", "").replace("−", "").strip())
        except (TypeError, ValueError):
            ap_int = 0

        # Parse damage
        try:
            dmg_val = float(str(dmg_raw).strip())
        except (TypeError, ValueError):
            dmg_val = None

        ledger.start_group(f"WEAPON — {w_name.upper()}")

        # Shots
        if shots_tot is not None:
            try:
                shots_n = int(str(shots_tot).strip())
                ledger.log(
                    system="ballistics",
                    label="shots_total",
                    formula="shots_per_model × models",
                    inputs={"shots_per_model": shots_raw, "models": w.get("models", 1)},
                    result=shots_n,
                )
            except (TypeError, ValueError):
                pass

        # Hit roll
        if hit_t is not None and p_hit is not None:
            ml_active = "ml" in active_flags
            if ml_active and bs_target is not None:
                ledger.log(
                    system="ballistics",
                    label="hit_target",
                    formula="hit_target = BS + ml_bonus  (Markerlights: −1 to target)",
                    inputs={"BS": f"{bs_target}+", "ml_bonus": -1},
                    result=f"{hit_t}+",
                    importance="high",
                )
            else:
                ledger.log(
                    system="ballistics",
                    label="hit_target",
                    formula="hit_target = BS (no hit modifiers)",
                    inputs={"BS": f"{bs_raw}"},
                    result=f"{hit_t}+",
                )
            ledger.log(
                system="ballistics",
                label="p_hit",
                formula="p_hit = (7 − hit_target) / 6",
                inputs={"hit_target": hit_t},
                result=_fmt_pct(p_hit),
                importance="high",
            )

        # Wound roll
        std_wound_t = _s_vs_t_target(strength, def_T)
        if wound_t is not None and p_wound is not None:
            ledger.log(
                system="ballistics",
                label="wound_target",
                formula="wound_target = S_vs_T_chart(S, T)",
                inputs={"S": strength, "T": def_T},
                result=f"{wound_t}+",
                importance="high",
            )
            if std_wound_t is not None and wound_t != std_wound_t:
                ledger.log(
                    system="ballistics",
                    label="wound_modifier_note",
                    formula="wound_target modified by ability or rule",
                    inputs={"baseline": f"{std_wound_t}+", "effective": f"{wound_t}+"},
                    result=f"effective: {wound_t}+",
                )
            ledger.log(
                system="ballistics",
                label="p_wound",
                formula="p_wound = (7 − wound_target) / 6",
                inputs={"wound_target": wound_t},
                result=_fmt_pct(p_wound),
                importance="high",
            )

        # Save roll
        # Note: this reconstruction is an approximation of the full
        # compute_save_target() logic.  Invulnerable saves, save bonuses/
        # penalties, and AP modifiers from flags may change the effective
        # target used in the actual probability chain.
        if fail_save is not None and def_Sv is not None:
            effective_sv = def_Sv + ap_int
            if "cover" in active_flags:
                effective_sv = max(2, effective_sv - 1)
            # Check for invuln override (from combat result if available)
            invuln_note = ""
            invuln_val = None
            for flg in active_flags:
                if flg.startswith("invuln"):
                    parts = flg.split(":")
                    if len(parts) > 1:
                        try:
                            invuln_val = int(parts[1])
                        except ValueError:
                            pass
            if invuln_val is not None and invuln_val < effective_sv:
                invuln_note = f" (invuln {invuln_val}+ used instead)"
                effective_sv = invuln_val
            effective_sv = max(2, min(7, effective_sv))
            ledger.log(
                system="ballistics",
                label="save_target",
                formula="save_target = min(Sv + AP − cover, invuln)",
                inputs={"Sv": f"{def_Sv}+", "AP": f"−{ap_int}" if ap_int else "0"},
                result=f"{effective_sv}+{invuln_note}",
            )
            ledger.log(
                system="ballistics",
                label="p_fail_save",
                formula="p_fail_save = (7 − save_target) / 6",
                inputs={"save_target": effective_sv},
                result=_fmt_pct(fail_save),
                importance="high",
            )

        # Expected damage
        if dmg is not None:
            try:
                shots_n_f = float(str(shots_tot or shots_raw or 1))
            except (TypeError, ValueError):
                shots_n_f = 1.0
            d_val = dmg_val if dmg_val is not None else 1.0
            ledger.log(
                system="ballistics",
                label="expected_damage",
                formula="E[dmg] = shots × p_hit × p_wound × p_fail_save × D",
                inputs={
                    "shots": shots_tot or shots_raw,
                    "p_hit": _fmt_pct(p_hit) if p_hit else "?",
                    "p_wound": _fmt_pct(p_wound) if p_wound else "?",
                    "p_fail_save": _fmt_pct(fail_save) if fail_save else "?",
                    "D": dmg_raw,
                },
                result=_fmt_num(dmg),
                importance="high",
            )

        if kills is not None:
            ledger.log(
                system="ballistics",
                label="expected_kills",
                formula="E[kills] = E[dmg] / W  (approximation — damage does not spill between models in 40K; actual kills may be lower vs multi-wound targets)",
                inputs={"E[dmg]": _fmt_num(dmg), "W": def_W},
                result=_fmt_num(kills),
                importance="high",
            )

        ledger.end_group()

    # ── Group: SIMULATION ────────────────────────────────────────────────────
    sim = math_result.get("simulation")
    if sim and sim.get("status") == "ACTIVE":
        ledger.start_group("MONTE CARLO SIMULATION")
        ledger.log(
            system="simulation",
            label="mc_iterations",
            formula="N trials (seed=42 for reproducibility)",
            inputs={"seed": 42},
            result=sim.get("iterations", 5000),
        )
        if sim.get("error_margin") is not None:
            ledger.log(
                system="simulation",
                label="error_margin",
                formula="ε = 1.96 × σ / √N   (95% CI half-width)",
                inputs={"confidence": "95%", "N": sim.get("iterations", 5000)},
                result=f"±{_fmt_num(sim.get('error_margin'), 3)}",
            )
        raw_conf = sim.get("confidence")
        if raw_conf is not None:
            try:
                conf_str = _fmt_pct(float(raw_conf))
            except (TypeError, ValueError):
                conf_str = str(raw_conf)
            ledger.log(
                system="simulation",
                label="simulation_confidence",
                formula="ε% ≤1→Very High, ≤3→High, ≤7→Medium, else→Low",
                inputs={"error_margin_pct": sim.get("error_margin")},
                result=conf_str,
                importance="high",
            )
        ledger.end_group()

    return ledger.get_ledger()
