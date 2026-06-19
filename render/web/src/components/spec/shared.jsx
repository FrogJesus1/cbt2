/**
 * spec/shared.jsx
 *
 * Design tokens and primitives for spec block components.
 * Re-exports shared constants; wraps Bar with spec defaults (5px height).
 */

import { Card, CardContent } from "@/components/ui/card";
import { C } from "../shared/colors";
import { CARD_STYLE, CARD_PAD, SectionHeader, Bar as SharedBar } from "../shared/constants";

export { C, CARD_STYLE, CARD_PAD, SectionHeader };

// ─── Helpers ───────────────────────────────────────────────────────────────

export function fmt(v, dec = 2) {
  if (v === null || v === undefined) return "—";
  return Number(v).toFixed(dec);
}

// ─── SectionTitle (redesign: Chakra-Petch gold in-card label) ──────────────
// Small uppercase squared-face label used as the heading inside spec cards
// (Stat Line, Combat Ratings, Abilities, ▸ Ranged / ▸ Melee). Accepts an
// optional `style` override so individual labels can re-colour (e.g. green).

export function SectionTitle({ children, style }) {
  return (
    <div
      className="ct-display"
      style={{
        color:         C.accent,
        fontSize:      "10px",
        letterSpacing: "0.12em",
        marginBottom:  "10px",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ─── Bar (spec default: 5px height, solid mockup fill) ────────────────────

export function Bar({ height = 5, solid = true, ...rest }) {
  return <SharedBar height={height} solid={solid} {...rest} />;
}

// Thin re-export so spec components can use the same Card shell
export { Card, CardContent };
