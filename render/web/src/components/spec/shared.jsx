/**
 * spec/shared.jsx
 *
 * Design tokens and primitives for spec block components.
 * Mirrors combat/shared.jsx — same colour palette, same Card shell.
 */

import { Card, CardContent } from "@/components/ui/card";

// ─── Colour palette ────────────────────────────────────────────────────────

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

// ─── Helpers ───────────────────────────────────────────────────────────────

export function fmt(v, dec = 2) {
  if (v === null || v === undefined) return "—";
  return Number(v).toFixed(dec);
}

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

export function Bar({ value, max, color = C.green, dimColor, segments = 10, height = 5 }) {
  const pct    = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const filled = Math.round((pct / 100) * segments);
  return (
    <div style={{ display: "flex", gap: "2px", width: "100%" }}>
      {Array.from({ length: segments }, (_, i) => (
        <div key={i} style={{
          flex:       1,
          height:     `${height}px`,
          background: i < filled ? color : (dimColor || C.ghost),
        }} />
      ))}
    </div>
  );
}

// Thin re-export so spec components can use the same Card shell
export { Card, CardContent };
