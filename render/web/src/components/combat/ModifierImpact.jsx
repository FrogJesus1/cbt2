/**
 * ModifierImpact
 *
 * Stat sensitivity bars — % damage gain from +1 to each stat.
 * Half-width — pairs with SimulationConfidence.
 *
 * Props:
 *   modifiers — array of { label: string, value: number }
 */

import { Card, CardContent } from "@/components/ui/card";
import { C, CARD_STYLE, CARD_PAD, SectionHeader } from "./shared";
import { GraphListBlock } from "./GraphListBlock";

export function ModifierImpact({ modifiers }) {
  const maxVal = modifiers?.length ? Math.max(1, ...modifiers.map(m => m.value)) : 1;

  const items = modifiers?.map(m => ({
    label: m.label, value: m.value, max: maxVal, color: C.amber, displayValue: `+${m.value}%`,
  })) ?? [];

  return (
    <Card style={CARD_STYLE}>
      <CardContent style={CARD_PAD}>
        <SectionHeader>Modifier Impact</SectionHeader>
        {items.length > 0 ? (
          <>
            <GraphListBlock items={items} />
            <div style={{ color: C.label, fontSize: "11px", marginTop: "4px", fontStyle: "italic" }}>
              % damage gain from +1 to each stat (across all weapons)
            </div>
          </>
        ) : (
          <div style={{ color: C.label, fontSize: "12px", fontStyle: "italic" }}>
            No modifier impact data available for this matchup.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
