/**
 * BannerCard
 *
 * Attacker vs defender header — full-width, top of every combat result.
 * Modifier flags are rendered as interactive toggle tokens inline with the names.
 * Clicking a token fires onSubmit("rerun --<flag> null" | "rerun --<flag>").
 *
 * Props:
 *   attacker_name      string
 *   defender_name      string
 *   flags              string[]  — merged active flags (fallback when no per-side data)
 *   attacker_flags     string[]  — active attacker-side flags
 *   defender_flags     string[]  — active defender-side flags
 *   all_attacker_flags string[]  — full attacker flag universe (incl. inactive)
 *   all_defender_flags string[]  — full defender flag universe (incl. inactive)
 *   onSubmit           (cmd: string) => void
 */

import { Card, CardContent } from "@/components/ui/card";
import { ModifierToggles }   from "./ModifierToggles";
import { C, CARD_STYLE, CARD_PAD } from "./shared";

export function BannerCard({
  attacker_name,
  defender_name,
  flags              = [],
  attacker_flags     = [],
  defender_flags     = [],
  all_attacker_flags = [],
  all_defender_flags = [],
  onSubmit,
}) {
  // When per-side arrays are available, use them directly.
  // Otherwise fall back to the merged flags array treated as unified attacker-side
  // (no vs separator) so that flags from older/pre-restart results are still clickable.
  const hasSideSplit =
    all_attacker_flags.length > 0 || all_defender_flags.length > 0 ||
    attacker_flags.length > 0     || defender_flags.length > 0;

  const effectiveAllAtt = hasSideSplit ? all_attacker_flags : flags;
  const effectiveAllDef = hasSideSplit ? all_defender_flags : [];
  const effectiveAtt    = hasSideSplit ? attacker_flags     : flags;
  const effectiveDef    = hasSideSplit ? defender_flags     : [];

  const hasToggles = effectiveAllAtt.length > 0 || effectiveAllDef.length > 0 ||
                     effectiveAtt.length > 0     || effectiveDef.length > 0;

  return (
    <Card style={{ ...CARD_STYLE, border: `1px solid ${C.bordermid}`, boxShadow: `inset 0 0 0 1px ${C.border}` }}>
      <CardContent style={{ ...CARD_PAD, display: "flex", flexDirection: "column", gap: "0" }}>
        {/* Title row — attacker vs defender */}
        <div style={{ display: "flex", alignItems: "center", fontSize: "20px", lineHeight: "1.2", marginBottom: "10px" }}>
          <span style={{ color: C.green, textShadow: `0 0 10px ${C.green}70`, fontWeight: 600 }}>
            {attacker_name || "—"}
          </span>
          <span style={{ color: C.dim, fontSize: "15px", margin: "0 10px" }}>vs</span>
          <span style={{ color: C.cyan, textShadow: `0 0 10px ${C.cyan}50`, fontWeight: 600 }}>
            {defender_name || "—"}
          </span>
        </div>

        {/* Modifier token row — "Tags: ml // ea1 — cover" */}
        {hasToggles && (
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{
              color:       C.label,
              fontSize:    "11px",
              fontStyle:   "italic",
              letterSpacing: "0.04em",
              flexShrink:  0,
              userSelect:  "none",
            }}>
              Tags:
            </span>
            <ModifierToggles
              attacker_flags={effectiveAtt}
              defender_flags={effectiveDef}
              all_attacker_flags={effectiveAllAtt}
              all_defender_flags={effectiveAllDef}
              onSubmit={onSubmit}
              inline
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
