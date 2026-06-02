/**
 * combat/shared.jsx
 *
 * Combat-panel design tokens and primitives.
 * Re-exports shared constants; overrides SectionTitle with combat-specific
 * styling (larger text, glow, bottom border) and wraps Bar with combat
 * defaults (12 segments, 14px, glow).
 */

import { C } from "../shared/colors";
import { CARD_STYLE, CARD_PAD, Bar as SharedBar } from "../shared/constants";

export { C, CARD_STYLE, CARD_PAD };

// ─── Formatters ────────────────────────────────────────────────────────────

export const fmt    = (v, dec = 2) => v === null || v === undefined ? "—" : Number(v).toFixed(dec);
export const fmtPct = (v)          => v === null || v === undefined ? "—" : `${Number(v).toFixed(0)}%`;

export const fmtKills = (v) => {
  if (v === null || v === undefined) return "—";
  if (v < 1) return "<1 kill";
  const rounded = Math.round(v * 2) / 2;
  const label   = rounded === 1 ? "kill" : "kills";
  return `${rounded % 1 === 0 ? String(rounded) : rounded.toFixed(1)} ${label}`;
};

// ─── Bar (combat defaults: taller, more segments, glow) ───────────────────

export function Bar({ segments = 12, height = 14, glow = true, ...rest }) {
  return <SharedBar segments={segments} height={height} glow={glow} {...rest} />;
}

// ─── SectionTitle (combat-specific: larger, glow, bottom border) ──────────

export function SectionTitle({ children, style }) {
  return (
    <div
      style={{
        color:         C.amber,
        textShadow:    `0 0 8px ${C.amber}90`,
        fontSize:      "15px",
        letterSpacing: "0.15em",
        textTransform: "uppercase",
        paddingBottom: "8px",
        borderBottom:  `1px solid ${C.border}`,
        marginBottom:  "12px",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ─── SwingScore ────────────────────────────────────────────────────────────

export function SwingScore({ value, label }) {
  if (value === null || value === undefined) return null;
  return (
    <div style={{
      display:     "flex",
      alignItems:  "center",
      gap:         "8px",
      marginTop:   "10px",
      paddingTop:  "9px",
      borderTop:   `1px solid ${C.border}`,
    }}>
      <span style={{
        color:         C.dim,
        fontSize:      "9px",
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        flexShrink:    0,
      }}>
        Swinginess
      </span>
      <span style={{
        color:         C.amber,
        fontSize:      "16px",
        fontWeight:    700,
        letterSpacing: "-0.01em",
        lineHeight:    1,
      }}>
        {Number(value).toFixed(2)}
      </span>
      {label && (
        <span style={{
          color:      C.amber,
          opacity:    0.6,
          fontSize:   "10px",
          fontStyle:  "italic",
        }}>
          — {label}
        </span>
      )}
      <div style={{ flex: 1 }} />
      <span style={{
        color:      C.label,
        fontSize:   "9px",
        fontStyle:  "italic",
      }}>
        Monte Carlo
      </span>
    </div>
  );
}
