/**
 * threat/shared.jsx
 *
 * Design tokens and primitives for threat card components.
 * Mirrors spec/shared.jsx — same colour palette, same Card shell,
 * same SectionTitle / Bar patterns so threat results feel native.
 */

import { Card, CardContent } from "@/components/ui/card";

// ─── Colour palette (identical to spec/shared) ─────────────────────────────

export const C = {
  green:     "var(--ct-primary)",
  mid:       "var(--ct-primary-mid)",
  label:     "var(--ct-primary-label)",
  dim:       "var(--ct-primary-dim)",
  ghost:     "var(--ct-ghost)",
  amber:     "#ffa328",
  cyan:      "var(--ct-bar-alt)",
  red:       "#ff3b3b",
  orange:    "#ff6b2b",
  border:    "var(--ct-border)",
  bordermid: "var(--ct-border-bright)",
  panel:     "var(--ct-bg-panel)",
  bg:        "var(--ct-bg)",
};

export const CARD_STYLE = {
  background:   C.panel,
  border:       `1px solid ${C.border}`,
  borderRadius: "0",
};

export const CARD_PAD = { padding: "14px 16px" };

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

// ─── Primitives ────────────────────────────────────────────────────────────

export function SectionTitle({ children }) {
  return (
    <div style={{
      color:         C.amber,
      textTransform: "uppercase",
      fontSize:      "12px",
      letterSpacing: "0.15em",
      fontWeight:    700,
      marginBottom:  "10px",
    }}>
      {children}
    </div>
  );
}

/**
 * Segmented progress bar — pct 0–100.
 * height defaults to 6px (slightly taller than spec's 5px for readability).
 */
export function Bar({ pct = 0, color = C.green, height = 6, segments = 10 }) {
  const filled = Math.round((Math.min(100, Math.max(0, pct)) / 100) * segments);
  return (
    <div style={{ display: "flex", gap: "2px", width: "100%" }}>
      {Array.from({ length: segments }, (_, i) => (
        <div key={i} style={{
          flex:       1,
          height:     `${height}px`,
          background: i < filled ? color : C.ghost,
        }} />
      ))}
    </div>
  );
}

// Thin re-export so threat components can use the same Card shell
export { Card, CardContent };
