/**
 * combat/shared.js
 *
 * Colour palette, card shell constants, formatting helpers,
 * and low-level primitives (Bar, SectionTitle) shared by all
 * combat panel components.
 *
 * Primary colours reference CSS variables so they respond to data-theme changes.
 * Semantic colours (amber, red) are hardcoded — they never theme-shift.
 */

// ─── Colour constants ──────────────────────────────────────────────────────

export const C = {
  green:     "var(--ct-primary)",
  mid:       "var(--ct-primary-mid)",
  label:     "var(--ct-primary-label)",
  dim:       "var(--ct-primary-dim)",
  ghost:     "var(--ct-ghost)",          // unfilled bar-segment background
  amber:     "#ffa328",
  cyan:      "var(--ct-bar-alt)",        // themes: cyan (default) → orange-red (red)
  red:       "#ff3b3b",
  border:    "var(--ct-border)",
  bordermid: "var(--ct-border-bright)",
  panel:     "var(--ct-bg-panel)",
  bg:        "var(--ct-bg)",
};

// ─── Shared card shell ─────────────────────────────────────────────────────

export const CARD_STYLE = {
  background:   C.panel,
  border:       `1px solid ${C.border}`,
  borderRadius: "0",
};

export const CARD_PAD = { padding: "14px 16px" };

// ─── Formatters ────────────────────────────────────────────────────────────

export const fmt    = (v, dec = 2) => v === null || v === undefined ? "—" : Number(v).toFixed(dec);
export const fmtPct = (v)          => v === null || v === undefined ? "—" : `${Number(v).toFixed(0)}%`;

// Rounds kills to nearest 0.5; shows "<1 kill" for fractional values below 1
export const fmtKills = (v) => {
  if (v === null || v === undefined) return "—";
  if (v < 1) return "<1 kill";
  const rounded = Math.round(v * 2) / 2;
  const label   = rounded === 1 ? "kill" : "kills";
  return `${rounded % 1 === 0 ? String(rounded) : rounded.toFixed(1)} ${label}`;
};

// ─── Bar ───────────────────────────────────────────────────────────────────
// Note: boxShadow glow uses the shared glow-rgb variable so it always matches
// the active theme, regardless of which colour is passed as `color`.

export function Bar({ value, max, width, color = C.green, dimColor = C.ghost, segments = 12 }) {
  const pct = (value !== null && value !== undefined && max > 0)
    ? Math.min(100, Math.max(0, (value / max) * 100))
    : 0;
  // Always show at least 1 filled segment when there is a nonzero value,
  // so no bar ever appears completely empty.
  const rawFilled = Math.round((pct / 100) * segments);
  const filled    = (value > 0 && rawFilled === 0) ? 1 : rawFilled;

  return (
    <div
      style={{
        display:    "flex",
        gap:        "2px",
        flexShrink: 0,
        flexGrow:   width ? 0 : 1,
        ...(width ? { width: typeof width === "number" ? `${width}px` : width } : {}),
      }}
    >
      {Array.from({ length: segments }, (_, i) => (
        <div key={i} style={{
          flex:       1,
          height:     "14px",
          background: i < filled ? color : dimColor,
          boxShadow:  i < filled && value ? `0 0 3px rgba(var(--ct-glow-rgb), 0.4)` : "none",
        }} />
      ))}
    </div>
  );
}

// ─── SectionTitle ──────────────────────────────────────────────────────────

export function SectionTitle({ children }) {
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
      }}
    >
      {children}
    </div>
  );
}

// ─── SwingScore ────────────────────────────────────────────────────────────
// Swinginess rendered as a compact score strip — visually separate from the
// bar-chart rows above it. Sits below a thin divider inside the output card.

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
