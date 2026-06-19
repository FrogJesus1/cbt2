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

// Hazard-rule section header (redesign foundation): Chakra-Petch gold label +
// optional subtitle hint + a gold hazard rule that fills the row, with optional
// right-aligned actions.
export function SectionHeader({ title, subtitle, right }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
      <span className="ct-display" style={{ color: C.accent, fontSize: "12px", letterSpacing: "0.14em", flexShrink: 0 }}>
        {title}
      </span>
      {subtitle && (
        <span style={{ color: C.dim, fontSize: "9px", letterSpacing: "0.04em", flexShrink: 0, fontFamily: "monospace" }}>
          {subtitle}
        </span>
      )}
      <span className="ct-hazard" />
      {right ? <span style={{ flexShrink: 0 }}>{right}</span> : null}
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

// ─── Rank colour + display label ───────────────────────────────────────────
// Single source of truth for rank tinting (OOB rows, badges). The server stores
// the entry rank as "Fresh"; the redesign shows it as "Battle-ready" (display
// only — the stored value is untouched). Legendary gets the handoff purple.

export const RANK_COLORS = {
  "Fresh":           C.dim,
  "Blooded":         C.mid,
  "Battle-hardened": C.cyan,
  "Heroic":          C.accent,
  "Legendary":       "#a78bdb",
};

export function rankColor(rank) {
  return RANK_COLORS[rank] || C.mid;
}

/** Display label for a stored rank ("Fresh" → "Battle-ready"). */
export function rankLabel(rank) {
  return rank === "Fresh" ? "Battle-ready" : (rank || "Battle-ready");
}

/** Coloured rank badge (◈ glyph + display label). */
export function RankBadge({ rank }) {
  const tier = rankColor(rank);
  return (
    <span style={{
      color: tier, fontSize: "10px", fontFamily: "monospace",
      border: `1px solid ${tier}55`, padding: "1px 6px",
      letterSpacing: "0.06em", whiteSpace: "nowrap",
    }}>
      ◈ {rankLabel(rank)}
    </span>
  );
}
