/**
 * threat/shared.jsx
 *
 * Design tokens and primitives for threat card components.
 * Re-exports shared constants; adds threat-specific config (THREAT_COLORS, METRICS).
 */

import { Card, CardContent } from "@/components/ui/card";
import { C } from "../shared/colors";
import { CARD_STYLE, CARD_PAD, SectionTitle, Bar } from "../shared/constants";

export { C, CARD_STYLE, CARD_PAD, SectionTitle, Bar };

// ─── Threat-level meta ──────────────────────────────────────────────────────

export const THREAT_COLORS = {
  high:   C.red,
  medium: C.amber,
  low:    C.dim,
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
