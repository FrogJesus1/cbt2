/**
 * UnitListFilters
 *
 * The left filter rail for the Units Database (Phase 4 redesign).
 * Purely presentational — every piece of state and every handler is passed
 * down from UnitListRich, which owns the filter logic. Recreates the
 * `List Units.dc.html` rail (Faction select, Roster filter, Points min/max
 * sliders, Keyword chips [AND-matched], Role chips, Reset) using the shared
 * C.* theme tokens so it re-hues with every faction theme.
 *
 * Props:
 *   factionSel, onFaction, factionOptions:[{value,label}]
 *   rosterSel, onRoster, rosterOptions:[{value,label}], rosterHint, rosterBusy
 *   costMin, costMax, costLo, costHi, costStep, onCostMin, onCostMax
 *   keywords:[{label,active,onToggle}]   (cyan, AND-matched)
 *   roles:[{label,active,onToggle}]      (green, OR-matched)
 *   onReset
 */

import { C } from "./shared/colors";

// ── Small primitives ─────────────────────────────────────────────────────────

function RailLabel({ children, right }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "8px" }}>
      <span style={{
        fontSize: "9px", letterSpacing: "0.14em", color: C.dim,
        textTransform: "uppercase", fontWeight: 700,
      }}>
        {children}
      </span>
      {right != null && <span style={{ fontSize: "11px", color: C.green }}>{right}</span>}
    </div>
  );
}

function Select({ value, onChange, children }) {
  return (
    <div style={{ position: "relative" }}>
      <select
        value={value}
        onChange={onChange}
        style={{
          width: "100%", background: C.panel, border: `1px solid ${C.border}`,
          color: C.textMid, fontFamily: "inherit", fontSize: "12px",
          padding: "8px 26px 8px 10px", borderRadius: "4px", outline: "none",
          cursor: "pointer", appearance: "none", WebkitAppearance: "none", MozAppearance: "none",
        }}
      >
        {children}
      </select>
      <span style={{ position: "absolute", right: "10px", top: "9px", color: C.dim, fontSize: "9px", pointerEvents: "none" }}>▼</span>
    </div>
  );
}

function chipStyle(active, color) {
  return {
    fontSize: "9px", letterSpacing: "0.03em", cursor: "pointer", userSelect: "none",
    padding: "3px 7px", borderRadius: "3px",
    color: active ? C.bg : (color || C.bodyDim),
    background: active ? (color || C.green) : "transparent",
    border: `1px solid ${active ? (color || C.green) : C.border}`,
    fontWeight: active ? 700 : 400,
    whiteSpace: "nowrap",
  };
}

function Slider({ min, max, step, value, onChange }) {
  return (
    <input
      type="range"
      min={min} max={max} step={step} value={value}
      onChange={onChange}
      style={{ width: "100%", height: "4px", accentColor: C.green, cursor: "pointer" }}
    />
  );
}

// ── Rail ──────────────────────────────────────────────────────────────────────

export function UnitListFilters({
  factionSel, onFaction, factionOptions = [],
  rosterSel, onRoster, rosterOptions = [], rosterHint, rosterBusy,
  costMin, costMax, costLo, costHi, costStep = 5, onCostMin, onCostMax,
  keywords = [], roles = [],
  onReset,
}) {
  return (
    <div style={{
      borderRight: `1px solid ${C.hairline}`,
      padding: "16px",
      display: "flex", flexDirection: "column", gap: "18px",
    }}>
      {/* Faction */}
      <div>
        <RailLabel>Faction</RailLabel>
        <Select value={factionSel} onChange={onFaction}>
          {factionOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      </div>

      {/* Roster filter */}
      <div>
        <RailLabel>Roster Filter</RailLabel>
        <Select value={rosterSel} onChange={onRoster}>
          {rosterOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
        {rosterBusy && (
          <div style={{ fontSize: "9px", color: C.dim, marginTop: "5px", letterSpacing: "0.04em", fontStyle: "italic" }}>
            loading roster…
          </div>
        )}
        {!rosterBusy && rosterHint && (
          <div style={{ fontSize: "9px", color: C.green, marginTop: "5px", letterSpacing: "0.04em" }}>
            ✓ {rosterHint}
          </div>
        )}
      </div>

      {/* Points */}
      <div>
        <RailLabel right={`${costMin}–${costMax}`}>Points</RailLabel>
        <div style={{ marginBottom: "6px" }}>
          <div style={{ fontSize: "9px", color: C.label, marginBottom: "2px" }}>Min</div>
          <Slider min={costLo} max={costHi} step={costStep} value={costMin} onChange={onCostMin} />
        </div>
        <div>
          <div style={{ fontSize: "9px", color: C.label, marginBottom: "2px" }}>Max</div>
          <Slider min={costLo} max={costHi} step={costStep} value={costMax} onChange={onCostMax} />
        </div>
      </div>

      {/* Keywords (AND) */}
      {keywords.length > 0 && (
        <div>
          <RailLabel>Keywords</RailLabel>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "5px", maxHeight: "168px", overflowY: "auto", scrollbarWidth: "thin" }}>
            {keywords.map(k => (
              <span key={k.label} onClick={k.onToggle} style={chipStyle(k.active, C.cyan)}>{k.label}</span>
            ))}
          </div>
        </div>
      )}

      {/* Role (OR) */}
      {roles.length > 0 && (
        <div>
          <RailLabel>Role</RailLabel>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
            {roles.map(r => (
              <span key={r.label} onClick={r.onToggle} style={chipStyle(r.active, C.green)}>{r.label}</span>
            ))}
          </div>
        </div>
      )}

      {/* Reset */}
      <button
        onClick={onReset}
        style={{
          fontFamily: "inherit", fontSize: "10px", letterSpacing: "0.1em", color: C.label,
          background: "transparent", border: `1px solid ${C.border}`, borderRadius: "4px",
          padding: "8px", cursor: "pointer", textTransform: "uppercase",
        }}
        onMouseEnter={e => { e.currentTarget.style.color = C.text; e.currentTarget.style.borderColor = C.bordermid; }}
        onMouseLeave={e => { e.currentTarget.style.color = C.label; e.currentTarget.style.borderColor = C.border; }}
      >
        ⟲ Reset Filters
      </button>
    </div>
  );
}

export default UnitListFilters;
