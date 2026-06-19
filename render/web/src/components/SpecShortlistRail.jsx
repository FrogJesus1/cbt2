/**
 * SpecShortlistRail
 *
 * The "★ MY UNITS" quick-jump rail shown on the right of the units context.
 * Lists every starred unit (shared `ct_starred_units` shortlist) as a named
 * row: a colour dot + the unit name (click → jump to its datasheet) and a ✕
 * to un-star. Shows an italic empty-state when nothing is pinned.
 *
 * Replaces the old 44px vertical-abbreviation sidebar with the 190px named
 * rail from the redesign. Purely presentational — persistence + jump logic
 * stay in UnitsContext.
 *
 * Props:
 *   starredUnits — string[]            (unit names)
 *   dotColor     — (name) => string    (optional — colour the row dot; default green)
 *   onJump       — (name) => void      (row click → scroll to / inject spec)
 *   onRemove     — (name) => void      (✕ → un-star)
 */

import { C } from "./shared/colors";

function RailRow({ name, color, onJump, onRemove }) {
  return (
    <div
      style={{
        display:      "flex",
        alignItems:   "center",
        gap:          "4px",
        padding:      "6px 7px",
        borderRadius: "4px",
        border:       `1px solid ${C.hairline}`,
        transition:   "border-color 0.12s, background 0.12s",
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = "rgba(255,255,255,0.02)"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = C.hairline; e.currentTarget.style.background = "transparent"; }}
    >
      <span
        onClick={() => onJump?.(name)}
        title={`Jump to: spec ${name}`}
        style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "flex-start", gap: "7px", cursor: "pointer" }}
      >
        <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: color, flexShrink: 0, marginTop: "4px" }} />
        <span
          style={{ fontSize: "11px", color: C.bodyDim, lineHeight: 1.3, whiteSpace: "normal" }}
          onMouseEnter={e => { e.currentTarget.style.color = C.text; }}
          onMouseLeave={e => { e.currentTarget.style.color = C.bodyDim; }}
        >
          {name}
        </span>
      </span>
      <span
        onClick={() => onRemove?.(name)}
        title="Remove"
        style={{ color: C.dim, fontSize: "11px", cursor: "pointer", flexShrink: 0, padding: "0 2px" }}
        onMouseEnter={e => { e.currentTarget.style.color = C.danger; }}
        onMouseLeave={e => { e.currentTarget.style.color = C.dim; }}
      >
        ✕
      </span>
    </div>
  );
}

export function SpecShortlistRail({ starredUnits = [], dotColor, onJump, onRemove }) {
  return (
    <div
      style={{
        width:          "190px",
        flexShrink:     0,
        borderLeft:     `1px solid ${C.hairline}`,
        background:     "var(--ct-bg-dark)",
        padding:        "14px 12px",
        display:        "flex",
        flexDirection:  "column",
        gap:            "7px",
        overflowY:      "auto",
        scrollbarWidth: "none",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "2px" }}>
        <span style={{ color: C.accent, fontSize: "12px" }}>★</span>
        <span className="ct-display" style={{ color: C.accent, fontSize: "10px", letterSpacing: "0.12em" }}>
          My Units
        </span>
        <span style={{ marginLeft: "auto", fontSize: "9px", color: C.dim }}>{starredUnits.length}</span>
      </div>

      {/* Rows */}
      {starredUnits.map((name) => (
        <RailRow
          key={name}
          name={name}
          color={dotColor ? dotColor(name) : C.green}
          onJump={onJump}
          onRemove={onRemove}
        />
      ))}

      {/* Empty state */}
      {starredUnits.length === 0 && (
        <div style={{ fontSize: "10px", color: C.ghost, lineHeight: 1.6, fontStyle: "italic", marginTop: "4px" }}>
          Star a unit to pin it here — jump between your army quickly during play.
        </div>
      )}
    </div>
  );
}
