/**
 * ThreatBlock
 *
 * Main composer for threat_view results — the "threat <faction>" command output.
 * Assembles all Group Block 1 and Group Block 2 sub-components.
 *
 * Sub-components used:
 *   threat/ThreatSummary.jsx   — faction banner + stats + distribution chart
 *   threat/ThreatCardRow.jsx   — collapsible per-unit threat card
 *   threat/DetachmentBlock.jsx — detachment rules accordion
 *   threat/StratagemList.jsx   — stratagems accordion
 *   threat/StrategicNotes.jsx  — tips/warnings panel
 *
 * Layout:
 *   Faction header bar              ← full width
 *   ThreatSummary                   ← group block 1 overview
 *   ── THREAT LIST ──────────────
 *   ThreatCardRow × N (HIGH first)  ← repeating unit rows
 *   ── INTEL ────────────────────
 *   DetachmentBlock                 ← group block 2 intel
 *   StratagemList
 *   StrategicNotes
 *
 * Props:
 *   data     — threat_view result.data from engine
 *   meta     — result.meta (optional)
 *   onSubmit — (cmd: string) => void  (optional)
 */

import { ThreatSummary }    from "./threat/ThreatSummary";
import { ThreatCardRow }    from "./threat/ThreatCardRow";
import { DetachmentBlock }  from "./threat/DetachmentBlock";
import { StratagemList }    from "./threat/StratagemList";
import { StrategicNotes }   from "./threat/StrategicNotes";
import { C }                from "./threat/shared";

// ─── Faction header bar ───────────────────────────────────────────────────

function FactionHeader({ factionLabel, unitCount, stub }) {
  return (
    <div style={{
      display:       "flex",
      alignItems:    "center",
      justifyContent:"space-between",
      padding:       "10px 14px",
      background:    C.panel,
      border:        `1px solid ${C.bordermid}`,
      borderBottom:  `2px solid ${C.red}`,
      marginBottom:  "6px",
    }}>

      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        {/* Faction label */}
        <span style={{
          color:         C.red,
          fontSize:      "15px",
          fontWeight:    700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          textShadow:    `0 0 8px ${C.red}50`,
        }}>
          {factionLabel || "Unknown Faction"}
        </span>

        {/* Threat report badge */}
        <span style={{
          color:         C.dim,
          fontSize:      "9px",
          fontWeight:    700,
          letterSpacing: "0.16em",
          border:        `1px solid ${C.border}`,
          padding:       "1px 6px",
        }}>
          THREAT REPORT
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        {stub && (
          <span style={{
            color:         C.amber,
            fontSize:      "9px",
            fontWeight:    700,
            letterSpacing: "0.12em",
            border:        `1px solid ${C.amber}50`,
            padding:       "1px 6px",
            background:    `${C.amber}0c`,
          }}>
            ⚠ STUB
          </span>
        )}
        <span style={{ color: C.dim, fontSize: "11px", fontFamily: "monospace" }}>
          {unitCount} unit{unitCount !== 1 ? "s" : ""}
        </span>
      </div>

    </div>
  );
}

// ─── Section divider ──────────────────────────────────────────────────────

function SectionDivider({ label }) {
  return (
    <div style={{
      display:    "flex",
      alignItems: "center",
      gap:        "10px",
      margin:     "10px 0 6px",
    }}>
      <div style={{ height: "1px", background: C.border, flex: 1 }} />
      <span style={{
        color:         C.dim,
        fontSize:      "9px",
        fontWeight:    700,
        letterSpacing: "0.2em",
        flexShrink:    0,
      }}>
        {label}
      </span>
      <div style={{ height: "1px", background: C.border, flex: 1 }} />
    </div>
  );
}

// ─── ThreatBlock ──────────────────────────────────────────────────────────

export function ThreatBlock({ data, meta, onSubmit, onInject }) {
  if (!data) return null;

  const {
    faction           = "",
    faction_label     = "",
    units             = [],
    stats             = {},
    detachments       = [],
    stratagems        = [],
    strategic_notes   = [],
    roster_loaded     = false,
    active_detachment = null,
    _stub             = false,
  } = data;

  const unitCount = units.length;

  return (
    <div
      className="font-mono"
      style={{
        fontSize:      "13px",
        display:       "flex",
        flexDirection: "column",
        gap:           "4px",
      }}
    >

      {/* ── Faction header ── */}
      <FactionHeader
        factionLabel={faction_label || faction}
        unitCount={unitCount}
        stub={_stub}
      />

      {/* ── Group Block 1: Overview ── */}
      <ThreatSummary
        faction={faction}
        factionLabel={faction_label || faction}
        stats={stats}
        rosterLoaded={roster_loaded}
        detachment={active_detachment}
      />

      {/* ── Threat list ── */}
      {units.length > 0 && (
        <>
          <SectionDivider label="UNIT THREAT LIST" />
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            {units.map((unit, i) => (
              <ThreatCardRow
                key={unit.name ?? i}
                unitData={unit}
                index={i + 1}
                onSubmit={onSubmit}
                onInject={onInject}
              />
            ))}
          </div>
        </>
      )}

      {/* ── Group Block 2: Intel ── */}
      {(detachments.length > 0 || stratagems.length > 0 || strategic_notes.length > 0) && (
        <>
          <SectionDivider label="INTEL" />
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>

            {(detachments.length > 0) && (
              <DetachmentBlock
                detachments={detachments}
                activeDetachment={active_detachment}
              />
            )}

            {(stratagems.length > 0) && (
              <StratagemList
                stratagems={stratagems}
                activeDetachment={active_detachment}
              />
            )}

            {(strategic_notes.length > 0) && (
              <StrategicNotes notes={strategic_notes} />
            )}

          </div>
        </>
      )}

    </div>
  );
}
