/**
 * TotalUnitOutput
 *
 * Ranged + melee aggregate output bars for the whole unit.
 * Half-width — pairs with WeaponPlatformTotals.
 *
 * Props:
 *   ranged — combat stats object (see CombatSubSection)
 *   melee  — combat stats object
 *   maxDmg — scale ceiling for bar charts (default 10)
 */

import { Card, CardContent } from "@/components/ui/card";
import { C, CARD_STYLE, CARD_PAD, fmt, fmtPct, fmtKills, Bar, SectionTitle } from "./shared";
import { GraphListBlock } from "./GraphListBlock";

// ─── Internal adapter ─────────────────────────────────────────────────────
// Converts a ranged/melee stats object into GraphListBlock items.

function CombatSubSection({ label, data, maxDmg = 10 }) {
  if (!data) return null;

  const {
    expected_dmg, expected_kills, kill_chance_pct,
    avg_dmg_per_attack, overkill_waste_pct, swinginess,
    swinginess_label, squad_wipe_pct,
  } = data;

  const items = [
    expected_dmg !== null && expected_dmg !== undefined && {
      label: "Expected Damage", value: expected_dmg, max: maxDmg, color: C.green,
      displayValue: `${fmt(expected_dmg)} dmg`,
      secondary: expected_kills !== null && expected_kills !== undefined
        ? { value: expected_kills, max: 1, color: C.cyan, displayValue: fmtKills(expected_kills) }
        : undefined,
    },
    kill_chance_pct !== null && kill_chance_pct !== undefined && {
      label: "Kill Chance", value: kill_chance_pct, max: 100, color: C.amber,
      displayValue: fmtPct(kill_chance_pct),
    },
    avg_dmg_per_attack !== null && avg_dmg_per_attack !== undefined && {
      label: "Avg Dmg / Attack", value: avg_dmg_per_attack,
      max: Math.max(1, maxDmg / 4), displayValue: fmt(avg_dmg_per_attack),
    },
    overkill_waste_pct !== null && overkill_waste_pct !== undefined && {
      label: "Overkill Waste", value: overkill_waste_pct, max: 100, color: C.red,
      displayValue: fmtPct(overkill_waste_pct),
    },
    swinginess !== null && swinginess !== undefined && {
      label: "Swinginess", value: swinginess, max: 10, color: C.amber,
      displayValue: fmt(swinginess),
      note: `${swinginess_label ? swinginess_label + " — " : ""}+ Overkill & Swinginess via Monte Carlo`,
    },
    squad_wipe_pct !== null && squad_wipe_pct !== undefined && {
      label: "Squad Wipe", value: squad_wipe_pct, max: 100, color: C.green,
      displayValue: fmtPct(squad_wipe_pct),
    },
  ].filter(Boolean);

  return <GraphListBlock title={label} items={items} />;
}

// ─── Export ───────────────────────────────────────────────────────────────

export function TotalUnitOutput({ ranged, melee, maxDmg = 10 }) {
  return (
    <Card style={CARD_STYLE}>
      <CardContent style={CARD_PAD}>
        <SectionTitle>Total Unit Output</SectionTitle>
        <CombatSubSection label="Ranged" data={ranged} maxDmg={maxDmg} />
        <CombatSubSection label="Melee"  data={melee}  maxDmg={maxDmg} />
      </CardContent>
    </Card>
  );
}
