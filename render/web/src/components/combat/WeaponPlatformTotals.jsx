/**
 * WeaponPlatformTotals
 *
 * Per-weapon damage and kill bars, split into ranged and melee groups.
 * Half-width — pairs with TotalUnitOutput.
 *
 * Props:
 *   weapons — array of { name, type, shots?, dmg, kills }
 *             type "melee" goes in the melee group; everything else is ranged
 *   footer  — optional string shown beneath the weapon list
 */

import { Card, CardContent } from "@/components/ui/card";
import { C, CARD_STYLE, CARD_PAD, fmt, SectionTitle } from "./shared";
import { GraphListBlock } from "./GraphListBlock";

export function WeaponPlatformTotals({ weapons, footer }) {
  const ranged = weapons?.filter(w => w.type !== "melee") ?? [];
  const melee  = weapons?.filter(w => w.type === "melee") ?? [];
  const maxDmg = Math.max(1, ...(weapons ?? []).map(w => w.dmg ?? 0));

  const toItems = (wList) => wList.map(w => ({
    label:        w.name + (w.shots != null ? ` (${w.shots} shots)` : ""),
    value:        w.dmg,
    max:          maxDmg,
    color:        C.green,
    displayValue: `${fmt(w.dmg)} dmg`,
    secondary:    { value: w.kills, max: 0.5, color: C.cyan, displayValue: `${fmt(w.kills)} kills` },
  }));

  return (
    <Card style={CARD_STYLE}>
      <CardContent style={CARD_PAD}>
        <SectionTitle>Weapon Platform Totals</SectionTitle>
        {ranged.length > 0 && <GraphListBlock title="Ranged" items={toItems(ranged)} />}
        {melee.length  > 0 && <GraphListBlock title="Melee"  items={toItems(melee)}  />}
        {!weapons?.length && (
          <div style={{ color: C.dim, fontSize: "12px" }}>No weapon data available.</div>
        )}
        {footer && (
          <div style={{ color: C.dim, fontSize: "11px", marginTop: "10px", borderTop: `1px solid ${C.border}`, paddingTop: "8px" }}>
            {footer}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
