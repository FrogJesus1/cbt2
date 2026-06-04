/**
 * crusade/ui.jsx — shared presentational bits for the Crusade Tracker.
 *
 * Extracted so CrusadeContext, OrderOfBattle, and CrusadeCard all use the
 * same ActionChip / SectionHeader / input styling and never drift apart.
 */

import { C } from "../shared/colors";

export function ActionChip({ label, onClick, color = C.cyan, hoverColor = C.green, disabled = false }) {
  return (
    <span
      onClick={disabled ? undefined : onClick}
      style={{
        color: disabled ? C.border : color,
        fontSize: "11px",
        border: `1px solid ${C.border}`,
        padding: "3px 10px",
        cursor: disabled ? "default" : "pointer",
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        userSelect: "none",
        fontFamily: "monospace",
        transition: "color 0.1s, border-color 0.1s",
        opacity: disabled ? 0.4 : 1,
      }}
      onMouseEnter={(e) => { if (!disabled) { e.currentTarget.style.color = hoverColor; e.currentTarget.style.borderColor = hoverColor; } }}
      onMouseLeave={(e) => { if (!disabled) { e.currentTarget.style.color = color; e.currentTarget.style.borderColor = C.border; } }}
    >
      {label}
    </span>
  );
}

export function SectionHeader({ title, subtitle, right }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "10px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
        <span style={{
          color: C.amber, fontWeight: 700, fontSize: "13px",
          textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: "monospace",
        }}>
          {title}
        </span>
        {subtitle && <span style={{ color: C.dim, fontSize: "11px", fontFamily: "monospace" }}>{subtitle}</span>}
      </div>
      {right || null}
    </div>
  );
}

export const inputStyle = {
  background: C.bgDark,
  border: `1px solid ${C.border}`,
  color: C.green,
  fontFamily: "monospace",
  fontSize: "13px",
  padding: "6px 10px",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

export const labelStyle = {
  color: C.dim, fontSize: "10px", fontFamily: "monospace",
  letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "4px", display: "block",
};

/** Coloured rank badge (◈ glyph + rank name). */
export function RankBadge({ rank }) {
  const tier = {
    "Fresh": C.dim,
    "Blooded": C.mid,
    "Battle-hardened": C.cyan,
    "Heroic": C.amber,
    "Legendary": C.yellow,
  }[rank] || C.mid;
  return (
    <span style={{
      color: tier, fontSize: "10px", fontFamily: "monospace",
      border: `1px solid ${tier}55`, padding: "1px 6px",
      letterSpacing: "0.06em", whiteSpace: "nowrap",
    }}>
      ◈ {rank}
    </span>
  );
}
