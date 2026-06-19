/**
 * threat/shared.jsx
 *
 * Design tokens and primitives for threat card components.
 * Re-exports shared constants; adds threat-specific config (THREAT_COLORS, METRICS).
 */

import { Card, CardContent } from "@/components/ui/card";
import { C } from "../shared/colors";
import { CARD_STYLE, CARD_PAD, SectionHeader, Bar as SharedBar } from "../shared/constants";

export { C, CARD_STYLE, CARD_PAD, SectionHeader };

// ─── SectionTitle (redesign: Chakra-Petch gold in-card label) ──────────────
// Matches the spec cards' squared-face heading. Accepts a `style` override so
// labels can re-colour (e.g. Counter Picks renders green).

export function SectionTitle({ children, style }) {
  return (
    <div
      className="ct-display"
      style={{
        color:         C.accent,
        fontSize:      "10px",
        letterSpacing: "0.12em",
        marginBottom:  "12px",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ─── Bar (threat default: solid mockup fill) ──────────────────────────────

export function Bar({ solid = true, ...rest }) {
  return <SharedBar solid={solid} {...rest} />;
}

// ─── Threat-level meta ──────────────────────────────────────────────────────

export const THREAT_COLORS = {
  high:   C.red,     // → --ct-danger  (#ff5d5d default)
  medium: C.amber,   // → --ct-accent  (#d8b25a default)
  low:    C.label,   // → --ct-primary-label (#84907f default)
};

export const THREAT_LABELS = {
  high:   "HIGH",
  medium: "MED",
  low:    "LOW",
};

// ─── Metric config: (key, label, bar color) ────────────────────────────────

export const METRICS = [
  { key: "threat", label: "Threat", color: C.red  },
  { key: "dur",    label: "Dur",    color: C.red  },
  { key: "dmg",    label: "Dmg",    color: C.cyan },
  { key: "mob",    label: "Mob",    color: C.cyan },
  { key: "buff",   label: "Buff",   color: C.cyan },
];

// Thin re-export so threat components can use the same Card shell
export { Card, CardContent };
