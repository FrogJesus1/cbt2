/**
 * CombatBlock
 *
 * Composer for combat results. Layout:
 *
 *   BannerCard                    — full width
 *   WarningBlock                  — full width
 *   ┌─ Left 60% ──────────────────┬─ Right 40% ──────────────┐
 *   │  [Total Unit Output header] │  WeaponPlatformTotals    │
 *   │  TotalUnitOutputRanged      │  ModifierImpact          │
 *   │  TotalUnitOutputMelee       │  SimulationConfidence    │
 *   │  CalcList                   │                          │
 *   └─────────────────────────────┴──────────────────────────┘
 *   AbilitiesBlock                — full width
 *
 * Individual panel files live in combat/:
 *   BannerCard, WarningBlock, TotalUnitOutputRanged, TotalUnitOutputMelee,
 *   WeaponPlatformTotals, ModifierImpact, SimulationConfidence, AbilitiesBlock,
 *   GraphListBlock, shared.jsx
 */

// ─── Re-exports ────────────────────────────────────────────────────────────

export { BannerCard }              from "./combat/BannerCard";
export { WarningBlock }            from "./combat/WarningBlock";
export { TotalUnitOutputRanged }   from "./combat/TotalUnitOutputRanged";
export { TotalUnitOutputMelee }    from "./combat/TotalUnitOutputMelee";

export { ModifierImpact }          from "./combat/ModifierImpact";
export { SimulationConfidence }    from "./combat/SimulationConfidence";
export { AbilitiesBlock }          from "./combat/AbilitiesBlock";
export { GraphListBlock }          from "./combat/GraphListBlock";
export { WeaponStatsTable }        from "./combat/WeaponStatsTable";
export { TargetingOutcome }        from "./combat/TargetingOutcome";

// ─── Imports for the composer ──────────────────────────────────────────────

import { useState, useCallback }   from "react";
import { BannerCard }              from "./combat/BannerCard";
import { WarningBlock }            from "./combat/WarningBlock";
import { TotalUnitOutputRanged }   from "./combat/TotalUnitOutputRanged";
import { TotalUnitOutputMelee }    from "./combat/TotalUnitOutputMelee";
import { WeaponStatsTable }        from "./combat/WeaponStatsTable";
import { TargetingOutcome }        from "./combat/TargetingOutcome";
import { ModifierImpact }          from "./combat/ModifierImpact";
import { SimulationConfidence }    from "./combat/SimulationConfidence";
import { AbilitiesBlock }          from "./combat/AbilitiesBlock";
import { C }                       from "./combat/shared";

// ─── CalcList ──────────────────────────────────────────────────────────────
// Subtle breakdown of exactly what was computed — attacker, models, weapons.

function CalcList({ attacker_name, weapons = [], footer }) {
  if (!attacker_name && !weapons.length) return null;

  // Pull "single model" or "×N models" note from footer if present
  let modelNote = null;
  if (footer) {
    const m = footer.match(/(\d+)\s*×?\s*model/i) || footer.match(/single model/i);
    modelNote = m ? (m[1] ? `${m[1]} model${m[1] !== "1" ? "s" : ""}` : "single model") : null;
  }

  const ranged  = weapons.filter(w => w.type !== "melee");
  const melee   = weapons.filter(w => w.type === "melee");
  const ordered = [...ranged, ...melee];

  if (!ordered.length) return null;

  return (
    <div style={{
      borderTop:   `1px solid ${C.border}`,
      marginTop:   "2px",
      paddingTop:  "9px",
      paddingLeft: "2px",
    }}>
      {/* Attacker + model note */}
      <div style={{
        display:       "flex",
        alignItems:    "baseline",
        gap:           "8px",
        marginBottom:  "6px",
      }}>
        <span style={{ color: C.mid, fontSize: "11px", fontWeight: 600 }}>
          {attacker_name}
        </span>
        {modelNote && (
          <span style={{ color: C.dim, fontSize: "10px" }}>— {modelNote}</span>
        )}
      </div>

      {/* Weapon lines */}
      {ordered.map((w, i) => {
        const isMelee  = w.type === "melee";
        const shotVal  = w.shots != null ? w.shots : "?";
        const unit     = isMelee ? (shotVal === 1 ? "attack" : "attacks") : (shotVal === 1 ? "shot" : "shots");
        return (
          <div key={i} style={{
            display:    "flex",
            alignItems: "baseline",
            gap:        "7px",
            lineHeight: "1.75",
          }}>
            <span style={{ color: C.border, fontSize: "11px", flexShrink: 0 }}>↳</span>
            <span style={{ color: C.label, fontSize: "11px", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {w.name}
            </span>
            <span style={{ color: C.dim, fontSize: "10px", flexShrink: 0, whiteSpace: "nowrap" }}>
              {shotVal} {unit}
            </span>
            <span style={{
              color:      isMelee ? "#ff6b2b" : C.label,
              fontSize:   "9px",
              flexShrink: 0,
              border:     `1px solid ${C.border}`,
              padding:    "0 4px",
              letterSpacing: "0.05em",
            }}>
              {isMelee ? "melee" : "ranged"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Column group header ───────────────────────────────────────────────────

function ColumnHeader({ title }) {
  return (
    <div style={{
      display:       "flex",
      alignItems:    "center",
      gap:           "0",
      marginBottom:  "6px",
      fontFamily:    "monospace",
      fontSize:      "12px",
      color:         C.border,
      letterSpacing: "0.04em",
    }}>
      <span>{"───"} </span>
      <span style={{
        color:         C.amber,
        textShadow:    `0 0 6px ${C.amber}60`,
        fontWeight:    700,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        flexShrink:    0,
        padding:       "0 6px",
        fontSize:      "11px",
      }}>
        {title}
      </span>
      <span style={{ flex: 1, overflow: "hidden", whiteSpace: "nowrap" }}>
        {"─".repeat(60)}
      </span>
    </div>
  );
}

// ─── CombatBlock ───────────────────────────────────────────────────────────

export function CombatBlock({ data, onSubmit }) {
  if (!data) return null;

  const {
    attacker_name, defender_name,
    flags              = [],
    attacker_flags     = [],
    defender_flags     = [],
    all_attacker_flags = [],
    all_defender_flags = [],
    ranged, melee,
    weapons            = [],
    modifier_impact,
    simulation,
    flag_notes         = [],
    abilities          = [],
    footer,
  } = data;

  // ── Weapon toggle state ────────────────────────────────────────────────
  // disabledWeapons: Set of weapon names the user has clicked off.
  // Reset whenever a fresh combat result arrives (key = attacker+defender).
  const [disabledWeapons, setDisabledWeapons] = useState(() => new Set());

  const handleToggleWeapon = useCallback((name) => {
    setDisabledWeapons(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }, []);

  // ── Adjusted aggregates when weapons are disabled ──────────────────────
  // Sum per-weapon dmg for enabled weapons only and override the server total.
  // Kill% and other MC metrics can't easily be recomputed client-side, so we
  // leave them unchanged and only adjust the damage line.
  const enabledWeapons     = weapons.filter(w => !disabledWeapons.has(w.name));
  const enabledRanged      = enabledWeapons.filter(w => w.type !== "melee");
  const enabledMelee       = enabledWeapons.filter(w => w.type === "melee");

  // Build adjusted ranged/melee data objects.  Only touches expected_dmg;
  // all other fields (swinginess, kill_chance_pct, etc.) stay from the server.
  function adjustedData(serverData, enabledSet) {
    if (!serverData || !disabledWeapons.size) return serverData;
    const adjustedDmg = enabledSet.reduce((sum, w) => sum + (w.dmg ?? 0), 0);
    return { ...serverData, expected_dmg: adjustedDmg };
  }

  const rangedAdj = adjustedData(ranged, enabledRanged);
  const meleeAdj  = adjustedData(melee,  enabledMelee);

  const maxDmg = Math.max(
    10,
    rangedAdj?.expected_dmg ?? 0,
    meleeAdj?.expected_dmg  ?? 0,
    ...weapons.map(w => w.dmg ?? 0),
  );

  return (
    <div className="font-mono" style={{ fontSize: "13px", display: "flex", flexDirection: "column", gap: "6px" }}>

      {/* Full width — header with inline modifier toggles */}
      <BannerCard
        attacker_name={attacker_name}
        defender_name={defender_name}
        flags={flags}
        attacker_flags={attacker_flags}
        defender_flags={defender_flags}
        all_attacker_flags={all_attacker_flags}
        all_defender_flags={all_defender_flags}
        onSubmit={onSubmit}
      />

      {/* Full width — warnings */}
      <WarningBlock flag_notes={flag_notes} />

      {/* Full width — weapon spec table (A / BS / S / WR / AP / D, clickable rows) */}
      <WeaponStatsTable
        weapons={weapons}
        disabledWeapons={disabledWeapons}
        onToggleWeapon={handleToggleWeapon}
      />

      {/* Two-column row — equal 50/50 split.
          Left: aggregate output + simulation confidence
          Right: per-weapon probability bars + modifier impact
          flex-wrap kicks in below ~620px so columns stack cleanly on small screens. */}
      <div style={{ display: "flex", gap: "6px", alignItems: "flex-start", flexWrap: "wrap" }}>

        {/* ── Left — Aggregate Output + Simulation Confidence ── */}
        <div style={{ flex: "1 1 300px", display: "flex", flexDirection: "column", gap: "6px", minWidth: 0 }}>
          <ColumnHeader title="Total Unit Output" />
          <TotalUnitOutputRanged data={rangedAdj} maxDmg={maxDmg} />
          <TotalUnitOutputMelee  data={meleeAdj}  maxDmg={maxDmg} />
          {simulation && <SimulationConfidence sim={simulation} />}
          <CalcList attacker_name={attacker_name} weapons={enabledWeapons} footer={footer} />
        </div>

        {/* ── Right — Per-weapon Targeting + Modifier Impact ── */}
        <div style={{ flex: "1 1 300px", display: "flex", flexDirection: "column", gap: "6px", minWidth: 0 }}>
          <ColumnHeader title="Weapon Platforms" />
          <TargetingOutcome weapons={enabledWeapons} />
          <ColumnHeader title="Sensitivity" />
          <ModifierImpact   modifiers={modifier_impact} />
        </div>

      </div>

      {/* Full width — abilities at bottom */}
      <AbilitiesBlock abilities={abilities} />

    </div>
  );
}
