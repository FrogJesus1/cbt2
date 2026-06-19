/**
 * CombatBlock
 *
 * Composer for combat results — "Cogitator Dashboard" redesign layout:
 *
 *   echo line  › attacker vs target
 *   BannerCard                         — attacker [+leader] vs target + modifier tags
 *   WarningBlock                       — rule/flag callouts
 *   HeroTiles                          — Total Dmg · Slain · Squad Wipe · Swing
 *   ForcesEngaged                      — attacker(+leader) | target stat line
 *   WeaponStatsTable                   — ▸ Ranged / ▸ Melee, clickable rows
 *   TargetingOutcome                   — per-weapon HIT/WOUND/UNSAVED cards
 *   Total Output                       — Ranged + Melee hero-number panels
 *   Modifier Impact | Sim Confidence   — 2-col
 *   AbilitiesBlock                     — Attacker | Target
 *   VerdictSummary                     — slain · verdict · survivors
 *
 * Weapon-toggle live recompute (disabledWeapons + adjustedData) is preserved.
 */

// ─── Re-exports (other modules import these from here) ──────────────────────

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
export { HeroTiles }               from "./combat/HeroTiles";
export { ForcesEngaged }           from "./combat/ForcesEngaged";
export { VerdictSummary }          from "./combat/VerdictSummary";

// ─── Imports for the composer ──────────────────────────────────────────────

import { useState, useCallback }   from "react";
import { BannerCard }              from "./combat/BannerCard";
import { WarningBlock }            from "./combat/WarningBlock";
import { HeroTiles }               from "./combat/HeroTiles";
import { ForcesEngaged }           from "./combat/ForcesEngaged";
import { WeaponStatsTable }        from "./combat/WeaponStatsTable";
import { TargetingOutcome }        from "./combat/TargetingOutcome";
import { TotalUnitOutputPanel }    from "./combat/TotalUnitOutputPanel";
import { ModifierImpact }          from "./combat/ModifierImpact";
import { SimulationConfidence }    from "./combat/SimulationConfidence";
import { AbilitiesBlock }          from "./combat/AbilitiesBlock";
import { VerdictSummary }          from "./combat/VerdictSummary";
import { C, SectionHeader }        from "./combat/shared";

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
    target_profile,
    att_models, def_models,
    modifier_impact,
    simulation,
    flag_notes         = [],
    abilities          = [],
    footer,
  } = data;

  // ── Weapon toggle state ────────────────────────────────────────────────
  const [disabledWeapons, setDisabledWeapons] = useState(() => new Set());

  const handleToggleWeapon = useCallback((name) => {
    setDisabledWeapons(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }, []);

  // ── Conditional keyword chips (Heavy / Rapid Fire / Melta / Lance) ──────
  // Applying one changes the math, so re-run the engine (same path as the bar).
  const handleToggleFlag = useCallback((flag, nowActive) => {
    onSubmit?.(nowActive ? `rerun --${flag}` : `rerun --${flag} null`);
  }, [onSubmit]);

  // ── Adjusted aggregates when weapons are disabled ──────────────────────
  // Recomputes the values that are simple functions of the per-weapon numbers
  // we already hold client-side. kill_chance_pct / squad_wipe_pct need the joint
  // MC distribution and can't be faithfully recombined here (documented gap).
  const enabledWeapons = weapons.filter(w => !disabledWeapons.has(w.name));
  const enabledRanged  = enabledWeapons.filter(w => w.type !== "melee");
  const enabledMelee   = enabledWeapons.filter(w => w.type === "melee");

  function adjustedData(serverData, enabledSet) {
    if (!serverData || !disabledWeapons.size) return serverData;
    if (!enabledSet.length) {
      return {
        ...serverData,
        expected_dmg: 0, expected_kills: 0, kill_chance_pct: 0,
        avg_dmg_per_attack: 0, overkill_waste_pct: 0, squad_wipe_pct: 0,
      };
    }
    const adjustedDmg   = enabledSet.reduce((sum, w) => sum + (w.dmg ?? 0), 0);
    const adjustedKills = enabledSet.reduce((sum, w) => sum + (w.kills ?? 0), 0);
    const adjustedOverkill = adjustedDmg > 0
      ? enabledSet.reduce((sum, w) => sum + (w.overkill_pct ?? 0) * (w.dmg ?? 0), 0) / adjustedDmg
      : 0;
    return {
      ...serverData,
      expected_dmg:       adjustedDmg,
      expected_kills:     adjustedKills,
      overkill_waste_pct: Math.round(adjustedOverkill * 10) / 10,
      avg_dmg_per_attack: Math.round((adjustedDmg / enabledSet.length) * 100) / 100,
    };
  }

  const rangedAdj = adjustedData(ranged, enabledRanged);
  const meleeAdj  = adjustedData(melee,  enabledMelee);

  const maxDmg = Math.max(
    10,
    rangedAdj?.expected_dmg ?? 0,
    meleeAdj?.expected_dmg  ?? 0,
    ...weapons.map(w => w.dmg ?? 0),
  );

  const echo = `${attacker_name || "—"} vs ${defender_name || "—"}`;

  return (
    <div className="font-mono" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>

      {/* Echo command line */}
      <div style={{ color: C.dim, fontSize: "11px", letterSpacing: "0.02em" }}>
        › {echo}
      </div>

      {/* Banner — attacker [+leader] vs target + clickable modifier tags */}
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

      {/* Rule / flag callouts */}
      <WarningBlock flag_notes={flag_notes} />

      {/* Hero tiles */}
      <HeroTiles ranged={rangedAdj} melee={meleeAdj} def_models={def_models} />

      {/* Forces Engaged */}
      <ForcesEngaged
        attacker_name={attacker_name}
        defender_name={defender_name}
        weapons={enabledWeapons}
        target_profile={target_profile}
        att_models={att_models}
        def_models={def_models}
        footer={footer}
      />

      {/* Weapon spec table — clickable rows toggle weapons in/out of the sim */}
      <div>
        <WeaponStatsTable
          weapons={weapons}
          disabledWeapons={disabledWeapons}
          onToggleWeapon={handleToggleWeapon}
          activeFlags={attacker_flags}
          onToggleFlag={handleToggleFlag}
        />
      </div>

      {/* Targeting Outcome — per-weapon HIT/WOUND/UNSAVED cards */}
      <TargetingOutcome weapons={enabledWeapons} />

      {/* Total Output — Ranged + Melee hero panels */}
      <div>
        <SectionHeader>Total Output</SectionHeader>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "stretch" }}>
          <TotalUnitOutputPanel data={rangedAdj} maxDmg={maxDmg} phase="ranged" />
          <TotalUnitOutputPanel data={meleeAdj}  maxDmg={maxDmg} phase="melee" />
        </div>
      </div>

      {/* Modifier Impact + Simulation Confidence */}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ flex: "1 1 280px", minWidth: 0 }}>
          <ModifierImpact modifiers={modifier_impact} />
        </div>
        {simulation && (
          <div style={{ flex: "1 1 280px", minWidth: 0 }}>
            <SimulationConfidence sim={simulation} />
          </div>
        )}
      </div>

      {/* Abilities — Attacker | Target */}
      <AbilitiesBlock abilities={abilities} />

      {/* Verdict */}
      <VerdictSummary ranged={rangedAdj} melee={meleeAdj} def_models={def_models} />

    </div>
  );
}
