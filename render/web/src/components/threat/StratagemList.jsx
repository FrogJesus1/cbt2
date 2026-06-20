/**
 * StratagemList
 *
 * Accordion list of stratagems for the active faction/detachment.
 * Each row shows: stratagem name + CP cost collapsed.
 * Expanded: When / Target / Effect sections — matches the visual language
 * of the CLI stratagem_block renderer.
 *
 * Props:
 *   stratagems        — array of { name, cost, when, target, effect, phase?, detachment? }
 *   activeDetachment  — string | null  (highlights stratagems matching this detachment)
 */

import { useState } from "react";
import { C, CARD_STYLE, CARD_PAD, SectionTitle, Card, CardContent } from "./shared";

// ─── Section row within an expanded stratagem ─────────────────────────────

function StratagemSection({ label, text }) {
  if (!text) return null;
  return (
    <div style={{ marginBottom: "8px" }}>
      <span style={{
        color:         C.cyan,
        fontWeight:    700,
        fontSize:      "10px",
        letterSpacing: "0.14em",
        textTransform: "uppercase",
      }}>
        {label}:
      </span>
      <span style={{ color: C.label, fontSize: "12px", marginLeft: "8px", lineHeight: "1.6" }}>
        {text}
      </span>
    </div>
  );
}

// ─── Single stratagem accordion row ──────────────────────────────────────

function StratagemRow({ strat, isActive, isLast }) {
  const [open, setOpen] = useState(false);

  const cpCost = strat.cost ?? strat.cp_cost ?? "?CP";
  const isStub = strat._stub;

  return (
    <div style={{ borderBottom: isLast ? "none" : `1px solid ${C.border}` }}>

      {/* Header */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display:    "flex",
          alignItems: "center",
          gap:        "10px",
          padding:    "8px 0",
          cursor:     "pointer",
          userSelect: "none",
        }}
        onMouseEnter={e => e.currentTarget.style.background = `color-mix(in srgb, ${C.green} 2%, transparent)`}
        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
      >

        {/* CP cost badge */}
        <span style={{
          color:         C.amber,
          fontSize:      "10px",
          fontWeight:    700,
          border:        `1px solid color-mix(in srgb, ${C.amber} 31%, transparent)`,
          padding:       "1px 5px",
          background:    `color-mix(in srgb, ${C.amber} 6%, transparent)`,
          flexShrink:    0,
          fontFamily:    "monospace",
          letterSpacing: "0.06em",
        }}>
          {cpCost}
        </span>

        {/* Name */}
        <span style={{
          color:      isActive ? C.amber : C.mid,
          fontWeight: 600,
          fontSize:   "12px",
          flex:       1,
        }}>
          {strat.name || "—"}
        </span>

        {/* Detachment tag (if set and not active) */}
        {strat.detachment && !isActive && (
          <span style={{ color: C.dim, fontSize: "10px", flexShrink: 0 }}>
            {strat.detachment}
          </span>
        )}

        {/* Phase tag */}
        {strat.phase && (
          <span style={{
            color:         C.label,
            fontSize:      "9px",
            letterSpacing: "0.1em",
            border:        `1px solid ${C.border}`,
            padding:       "1px 4px",
            flexShrink:    0,
          }}>
            {strat.phase.toUpperCase()}
          </span>
        )}

        <span style={{ color: C.dim, fontSize: "9px", flexShrink: 0, width: "10px" }}>
          {open ? "▲" : "▼"}
        </span>
      </div>

      {/* Expanded body */}
      {open && (
        <div style={{ paddingBottom: "12px", paddingLeft: "4px" }}>
          {isStub && (
            <div style={{ color: C.dim, fontSize: "11px", marginBottom: "8px" }}>
              ⚠ Stub — full stratagem data not yet loaded.
            </div>
          )}
          <StratagemSection label="When"   text={strat.when}   />
          <StratagemSection label="Target" text={strat.target} />
          <StratagemSection label="Effect" text={strat.effect} />
        </div>
      )}

    </div>
  );
}

// ─── StratagemList ────────────────────────────────────────────────────────

export function StratagemList({ stratagems = [], activeDetachment = null }) {
  // Sort: active detachment first, then by name
  const sorted = [...stratagems].sort((a, b) => {
    const aActive = activeDetachment && a.detachment === activeDetachment;
    const bActive = activeDetachment && b.detachment === activeDetachment;
    if (aActive && !bActive) return -1;
    if (!aActive && bActive) return 1;
    return (a.name ?? "").localeCompare(b.name ?? "");
  });

  return (
    <Card style={CARD_STYLE}>
      <CardContent style={CARD_PAD}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
          <SectionTitle>Stratagems</SectionTitle>
          {activeDetachment ? (
            <span style={{ color: C.dim, fontSize: "10px", letterSpacing: "0.08em" }}>
              Filtered: <span style={{ color: C.amber }}>{activeDetachment}</span>
            </span>
          ) : (
            <span style={{ color: C.dim, fontSize: "10px" }}>
              {sorted.length} total
            </span>
          )}
        </div>

        {sorted.length === 0 ? (
          <div style={{ color: C.dim, fontSize: "12px" }}>
            No stratagem data loaded for this faction.
          </div>
        ) : (
          <div>
            {sorted.map((strat, i) => (
              <StratagemRow
                key={i}
                strat={strat}
                isActive={Boolean(activeDetachment && strat.detachment === activeDetachment)}
                isLast={i === sorted.length - 1}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
