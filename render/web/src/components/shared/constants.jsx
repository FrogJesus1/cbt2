/**
 * shared/constants.jsx
 *
 * Unified design tokens and primitives used across combat, spec, and threat panels.
 * Single source of truth for CARD_STYLE, CARD_PAD, SectionTitle, and Bar.
 */

import { C } from "./colors";

// ─── Card shell ───────────────────────────────────────────────────────────

export const CARD_STYLE = {
  background:   C.panel,
  border:       `1px solid ${C.border}`,
  borderRadius: "0",
};

export const CARD_PAD = { padding: "14px 16px" };

// ─── SectionTitle ─────────────────────────────────────────────────────────
// Accepts an optional `style` prop that merges over the defaults.

export function SectionTitle({ children, style }) {
  return (
    <div
      style={{
        color:         C.amber,
        textTransform: "uppercase",
        fontSize:      "12px",
        letterSpacing: "0.15em",
        fontWeight:    700,
        marginBottom:  "10px",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ─── Bar ──────────────────────────────────────────────────────────────────
// Unified segmented progress bar.
//
// Accepts EITHER:
//   value + max  (computes pct internally)
//   pct          (0–100 directly)
//
// Optional: height (px, default 6), segments (default 10), width,
//           color, dimColor, glow (enables box-shadow).

export function Bar({
  value, max,
  pct: pctProp,
  color    = C.green,
  dimColor = C.ghost,
  segments = 10,
  height   = 6,
  width,
  glow     = false,
}) {
  let pct;
  if (pctProp != null) {
    pct = Math.min(100, Math.max(0, pctProp));
  } else {
    pct = (value != null && max > 0)
      ? Math.min(100, Math.max(0, (value / max) * 100))
      : 0;
  }

  const rawFilled = Math.round((pct / 100) * segments);
  // Show at least 1 filled segment when there is any nonzero value
  const hasValue = pctProp > 0 || (value != null && value > 0);
  const filled   = (hasValue && rawFilled === 0) ? 1 : rawFilled;

  return (
    <div
      style={{
        display:    "flex",
        gap:        "2px",
        flexShrink: 0,
        flexGrow:   width ? 0 : 1,
        ...(width ? { width: typeof width === "number" ? `${width}px` : width } : {}),
        ...(!width ? { width: "100%" } : {}),
      }}
    >
      {Array.from({ length: segments }, (_, i) => (
        <div key={i} style={{
          flex:       1,
          height:     `${height}px`,
          background: i < filled ? color : dimColor,
          boxShadow:  glow && i < filled && hasValue
            ? `0 0 3px rgba(var(--ct-glow-rgb), 0.4)`
            : "none",
        }} />
      ))}
    </div>
  );
}
