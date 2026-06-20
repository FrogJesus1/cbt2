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

export function ModifierImpact({ modifiers, stale = false }) {
  const maxVal = modifiers?.length ? Math.max(1, ...modifiers.map(m => m.value)) : 1;

  const items = modifiers?.map(m => ({
    label: m.label, value: m.value, max: maxVal, color: C.amber, displayValue: `+${m.value}%`,
  })) ?? [];

  return (
    <Card style={CARD_STYLE}>
      <CardContent style={CARD_PAD}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <SectionHeader style={{ marginBottom: 0, flex: 1 }}>Modifier Impact</SectionHeader>
          {stale && (
            <span style={{
              fontSize: "8px", letterSpacing: "0.1em", color: C.warn, flexShrink: 0,
              border: `1px solid color-mix(in srgb, ${C.warn} 40%, transparent)`,
              borderRadius: "2px", padding: "1px 5px", lineHeight: "14px",
            }}>STALE</span>
          )}
        </div>
        <div style={{ marginTop: "12px" }}>
        {items.length > 0 ? (
          <>
            <div style={{ opacity: stale ? 0.45 : 1, transition: "opacity .15s" }}>
              <GraphListBlock items={items} />
            </div>
            <div style={{ color: stale ? C.warn : C.label, fontSize: "11px", marginTop: "4px", fontStyle: "italic", lineHeight: 1.5 }}>
              {stale
                ? "Computed for the full weapon set — re-run the matchup to recompute sensitivity for the current selection."
                : "% damage gain from +1 to each stat (across all weapons)"}
            </div>
          </>
        ) : (
          <div style={{ color: C.label, fontSize: "12px", fontStyle: "italic" }}>
            No modifier impact data available for this matchup.
          </div>
        )}
        </div>
      </CardContent>
    </Card>
  );
}
