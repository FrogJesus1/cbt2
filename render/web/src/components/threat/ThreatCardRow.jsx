/**
 * ThreatCardRow
 *
 * One collapsible row in the threat card list.
 * Collapsed:  unit name + threat badge + 3 micro metric bars (Threat/Dur/Dmg)
 * Expanded:   full ThreatCard + CounterBlock side-by-side (reuses ThreatCard.jsx)
 *
 * HIGH threat units start expanded. MEDIUM and LOW start collapsed.
 *
 * Props:
 *   unitData  — threat_card data shape (same as ThreatCard expects)
 *   index     — number (for numbered label)
 *   onSubmit  — (cmd: string) => void  (optional)
 */

import { useState } from "react";
import { ThreatCard } from "../ThreatCard";
import { C, THREAT_COLORS, THREAT_LABELS, METRICS } from "./shared";

// ─── Micro bar — compact 3px bar for collapsed header ─────────────────────

function MicroBar({ pct, color }) {
  return (
    <div style={{ position: "relative", width: "48px", height: "3px", background: C.ghost, flexShrink: 0 }}>
      <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${Math.min(100, pct)}%`, background: color }} />
    </div>
  );
}

// ─── Collapsed header ─────────────────────────────────────────────────────

function CollapsedHeader({ unitData, index, open, onToggle }) {
  const { name = "", threat_level = "low", metrics = {} } = unitData;
  const lvlColor = THREAT_COLORS[threat_level] ?? C.dim;
  const lvlLabel = THREAT_LABELS[threat_level] ?? threat_level.toUpperCase();

  // Show top 3 metrics inline
  const topMetrics = METRICS.slice(0, 3);

  return (
    <div
      onClick={onToggle}
      style={{
        display:    "flex",
        alignItems: "center",
        gap:        "12px",
        padding:    "9px 14px",
        cursor:     "pointer",
        userSelect: "none",
        background: open ? `${lvlColor}08` : "transparent",
        borderBottom: open ? `1px solid ${lvlColor}30` : "none",
        transition: "background 0.15s",
      }}
      onMouseEnter={e => { if (!open) e.currentTarget.style.background = `${lvlColor}06`; }}
      onMouseLeave={e => { if (!open) e.currentTarget.style.background = "transparent"; }}
    >

      {/* Index number */}
      <span style={{ color: C.dim, fontSize: "10px", fontFamily: "monospace", minWidth: "18px", flexShrink: 0 }}>
        {String(index).padStart(2, "0")}
      </span>

      {/* Threat level colour tab */}
      <div style={{ width: "3px", height: "22px", background: lvlColor, flexShrink: 0, borderRadius: "1px" }} />

      {/* Unit name */}
      <span style={{
        color:      lvlColor,
        fontWeight: 700,
        fontSize:   "13px",
        flex:       1,
        letterSpacing: "0.04em",
        overflow:   "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}>
        {(name || "—").toUpperCase()}
      </span>

      {/* Micro metric bars */}
      <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
        {topMetrics.map(({ key, label, color }) => (
          <div key={key} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
            <span style={{ color: C.dim, fontSize: "9px", letterSpacing: "0.06em" }}>{label}</span>
            <MicroBar pct={metrics[key] ?? 0} color={color} />
          </div>
        ))}
      </div>

      {/* Threat badge */}
      <span style={{
        color:         lvlColor,
        fontSize:      "9px",
        fontWeight:    700,
        letterSpacing: "0.14em",
        border:        `1px solid ${lvlColor}50`,
        padding:       "1px 6px",
        background:    `${lvlColor}0e`,
        flexShrink:    0,
      }}>
        {lvlLabel}
      </span>

      {/* Toggle arrow */}
      <span style={{ color: C.dim, fontSize: "9px", flexShrink: 0, width: "10px" }}>
        {open ? "▲" : "▼"}
      </span>

    </div>
  );
}

// ─── ThreatCardRow ────────────────────────────────────────────────────────

export function ThreatCardRow({ unitData, index, onSubmit }) {
  // HIGH threat starts open; MEDIUM and LOW start collapsed
  const defaultOpen = unitData?.threat_level === "high";
  const [open, setOpen] = useState(defaultOpen);

  const lvlColor = THREAT_COLORS[unitData?.threat_level ?? "low"] ?? C.dim;

  return (
    <div style={{
      border:       `1px solid ${open ? lvlColor + "40" : C.border}`,
      background:   C.panel,
      marginBottom: "4px",
      transition:   "border-color 0.15s",
    }}>

      {/* Collapsed header — always visible */}
      <CollapsedHeader
        unitData={unitData}
        index={index}
        open={open}
        onToggle={() => setOpen(o => !o)}
      />

      {/* Expanded body */}
      {open && (
        <div style={{ padding: "12px 14px", borderTop: `1px solid ${lvlColor}20` }}>
          <ThreatCard data={unitData} onSubmit={onSubmit} />
        </div>
      )}

    </div>
  );
}
