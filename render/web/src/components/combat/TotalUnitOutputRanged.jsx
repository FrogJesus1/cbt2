/**
 * TotalUnitOutputRanged
 *
 * Ranged aggregate output card.
 * Layout:
 *   Dmg         [====] 10.95 dmg    ← was "Expected Damage" primary
 *   Kills       [===]  <1 kill       ← was unlabelled secondary row
 *   Kill Chance [===]  4%
 *   Avg / Atk   [===]  1.82
 *   Overkill    [=  ]  1%
 *   Squad Wipe  [   ]  0%
 *   ─────────────────────────────
 *   Swinginess  1.48  — Swingy      Monte Carlo
 */

import { Card, CardContent } from "@/components/ui/card";
import { C, CARD_STYLE, CARD_PAD, fmt, fmtPct, fmtKills, SectionTitle, SwingScore } from "./shared";
import { GraphListBlock } from "./GraphListBlock";

function buildItems(data, maxDmg) {
  if (!data) return [];
  const {
    expected_dmg, expected_kills, kill_chance_pct,
    avg_dmg_per_attack, overkill_waste_pct, squad_wipe_pct,
  } = data;

  const killsMax = expected_kills != null ? Math.max(1, Math.ceil(expected_kills)) : 1;

  return [
    expected_dmg != null && {
      label: "Dmg", value: expected_dmg, max: maxDmg, color: C.green,
      displayValue: `${fmt(expected_dmg)} dmg`,
    },
    expected_kills != null && {
      label: "Kills", value: expected_kills, max: killsMax, color: C.cyan,
      displayValue: fmtKills(expected_kills),
    },
    kill_chance_pct != null && {
      label: "Kill Chance", value: kill_chance_pct, max: 100, color: C.amber,
      displayValue: fmtPct(kill_chance_pct),
    },
    avg_dmg_per_attack != null && {
      label: "Avg / Atk", value: avg_dmg_per_attack,
      max: Math.max(1, maxDmg / 4), displayValue: fmt(avg_dmg_per_attack),
    },
    overkill_waste_pct != null && {
      label: "Overkill", value: overkill_waste_pct, max: 100, color: C.red,
      displayValue: fmtPct(overkill_waste_pct),
    },
    squad_wipe_pct != null && {
      label: "Squad Wipe", value: squad_wipe_pct, max: 100, color: C.green,
      displayValue: fmtPct(squad_wipe_pct),
    },
  ].filter(Boolean);
}

export function TotalUnitOutputRanged({ data, maxDmg = 10 }) {
  const items = buildItems(data, maxDmg);
  const { swinginess, swinginess_label } = data ?? {};

  return (
    <Card style={CARD_STYLE}>
      <CardContent style={CARD_PAD}>
        <SectionTitle>Ranged Output</SectionTitle>
        {items.length > 0
          ? (
            <>
              <GraphListBlock items={items} />
              <SwingScore value={swinginess} label={swinginess_label} />
            </>
          )
          : <div style={{ color: C.label, fontSize: "12px", fontStyle: "italic" }}>No ranged data.</div>
        }
      </CardContent>
    </Card>
  );
}
