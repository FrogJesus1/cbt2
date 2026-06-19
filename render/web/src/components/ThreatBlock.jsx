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
import { C, SectionHeader } from "./threat/shared";

// ─── Faction title ────────────────────────────────────────────────────────
// Mockup: Chakra near-white faction name + gold "THREAT ASSESSMENT" tag +
// right-aligned "N units catalogued".

function FactionHeader({ factionLabel, unitCount, stub }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: "12px", marginBottom: "16px", flexWrap: "wrap" }}>
      <span className="ct-display" style={{ color: C.text, fontSize: "21px", fontWeight: 700, letterSpacing: "0.02em" }}>
        {(factionLabel || "Unknown Faction").toUpperCase()}
      </span>
      <span style={{ color: C.accent, fontSize: "11px", letterSpacing: "0.16em", textTransform: "uppercase" }}>
        Threat Assessment
      </span>
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
      <span style={{ marginLeft: "auto", color: C.dim, fontSize: "10px", letterSpacing: "0.08em" }}>
        {unitCount} unit{unitCount !== 1 ? "s" : ""} catalogued
      </span>
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

      {/* ── Threat index ── */}
      {units.length > 0 && (
        <div style={{ marginTop: "12px" }}>
          <SectionHeader accent={C.text} hint="click a unit to expand">Threat Index</SectionHeader>
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
        </div>
      )}

      {/* ── Intel: detachment rules + stratagems ── */}
      {(detachments.length > 0 || stratagems.length > 0) && (
        <div style={{ marginTop: "18px" }}>
          <SectionHeader accent={C.text}>Intel</SectionHeader>
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
          </div>
        </div>
      )}

      {/* ── Strategic notes ── */}
      {strategic_notes.length > 0 && (
        <div style={{ marginTop: "18px" }}>
          <SectionHeader accent={C.text}>Strategic Notes</SectionHeader>
          <StrategicNotes notes={strategic_notes} />
        </div>
      )}

    </div>
  );
}
