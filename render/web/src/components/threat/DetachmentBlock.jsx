/**
 * DetachmentBlock
 *
 * Accordion list of detachment rules for the active faction.
 * If a detachment is assigned via roster, that entry is highlighted
 * and expanded by default; all others start collapsed.
 * If no detachment is assigned, all entries start collapsed.
 *
 * Props:
 *   detachments       — array of { name, rules: [{ name, description }], description? }
 *   activeDetachment  — string | null  (name of the roster's detachment, if set)
 */

import { useState } from "react";
import { C, CARD_STYLE, CARD_PAD, SectionTitle, Card, CardContent } from "./shared";

// ─── Single rule row ──────────────────────────────────────────────────────

function RuleRow({ rule, isLast }) {
  const [open, setOpen] = useState(false);
  const hasDesc = Boolean(rule.description);

  return (
    <div style={{ borderBottom: isLast ? "none" : `1px solid ${C.border}` }}>
      <div
        onClick={() => hasDesc && setOpen(o => !o)}
        style={{
          display:    "flex",
          alignItems: "baseline",
          gap:        "8px",
          padding:    "6px 0",
          cursor:     hasDesc ? "pointer" : "default",
          userSelect: "none",
        }}
      >
        <span style={{ color: C.amber, fontSize: "11px", flexShrink: 0 }}>◆</span>
        <span style={{ color: C.mid, fontWeight: 600, fontSize: "12px", flex: 1 }}>
          {rule.name || "—"}
        </span>
        {hasDesc && (
          <span style={{ color: C.dim, fontSize: "10px", flexShrink: 0 }}>{open ? "▲" : "▼"}</span>
        )}
      </div>
      {hasDesc && open && (
        <div style={{ color: C.label, fontSize: "12px", lineHeight: "1.65", padding: "0 0 8px 20px" }}>
          {rule.description}
        </div>
      )}
    </div>
  );
}

// ─── Single detachment accordion row ─────────────────────────────────────

function DetachmentRow({ detachment, isActive, startOpen }) {
  const [open, setOpen] = useState(startOpen);
  const rules = detachment.rules ?? [];

  return (
    <div style={{
      border:       `1px solid ${isActive ? C.bordermid : C.border}`,
      background:   isActive ? `color-mix(in srgb, ${C.amber} 3%, transparent)` : C.panel,
      marginBottom: "4px",
    }}>

      {/* Header */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display:    "flex",
          alignItems: "center",
          gap:        "10px",
          padding:    "9px 14px",
          cursor:     "pointer",
          userSelect: "none",
        }}
        onMouseEnter={e => e.currentTarget.style.background = isActive ? `color-mix(in srgb, ${C.amber} 7%, transparent)` : `color-mix(in srgb, ${C.green} 2%, transparent)`}
        onMouseLeave={e => e.currentTarget.style.background = isActive ? `color-mix(in srgb, ${C.amber} 3%, transparent)` : "transparent"}
      >
        {isActive && (
          <span style={{
            color:         C.amber,
            fontSize:      "9px",
            fontWeight:    700,
            letterSpacing: "0.14em",
            border:        `1px solid color-mix(in srgb, ${C.amber} 31%, transparent)`,
            padding:       "1px 5px",
            background:    `color-mix(in srgb, ${C.amber} 7%, transparent)`,
            flexShrink:    0,
          }}>
            ACTIVE
          </span>
        )}
        <span style={{
          color:      isActive ? C.amber : C.mid,
          fontWeight: 700,
          fontSize:   "12px",
          flex:       1,
          letterSpacing: "0.04em",
        }}>
          {(detachment.name || "Unknown Detachment").toUpperCase()}
        </span>
        <span style={{ color: C.dim, fontSize: "10px", flexShrink: 0 }}>
          {rules.length} rule{rules.length !== 1 ? "s" : ""}
        </span>
        <span style={{ color: C.dim, fontSize: "9px", flexShrink: 0, width: "10px" }}>
          {open ? "▲" : "▼"}
        </span>
      </div>

      {/* Expanded: rule list */}
      {open && (
        <div style={{
          padding:     "6px 14px 12px",
          borderTop:   `1px solid ${isActive ? C.bordermid : C.border}`,
        }}>
          {detachment.description && (
            <p style={{ color: C.label, fontSize: "12px", lineHeight: "1.6", marginBottom: "10px" }}>
              {detachment.description}
            </p>
          )}
          {rules.length > 0 ? (
            rules.map((rule, i) => (
              <RuleRow key={i} rule={rule} isLast={i === rules.length - 1} />
            ))
          ) : (
            <div style={{ color: C.dim, fontSize: "12px" }}>No rules loaded for this detachment.</div>
          )}
        </div>
      )}

    </div>
  );
}

// ─── DetachmentBlock ──────────────────────────────────────────────────────

export function DetachmentBlock({ detachments = [], activeDetachment = null }) {
  if (!detachments.length) {
    return (
      <Card style={CARD_STYLE}>
        <CardContent style={CARD_PAD}>
          <SectionTitle>Detachment Rules</SectionTitle>
          <div style={{ color: C.dim, fontSize: "12px" }}>
            No detachment data loaded for this faction.
          </div>
        </CardContent>
      </Card>
    );
  }

  // Sort: active detachment first, then alphabetical
  const sorted = [...detachments].sort((a, b) => {
    const aActive = a.name === activeDetachment;
    const bActive = b.name === activeDetachment;
    if (aActive && !bActive) return -1;
    if (!aActive && bActive) return 1;
    return (a.name ?? "").localeCompare(b.name ?? "");
  });

  return (
    <Card style={CARD_STYLE}>
      <CardContent style={CARD_PAD}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
          <SectionTitle>Detachment Rules</SectionTitle>
          {activeDetachment && (
            <span style={{ color: C.dim, fontSize: "10px", letterSpacing: "0.08em" }}>
              Filtered: <span style={{ color: C.amber }}>{activeDetachment}</span>
            </span>
          )}
        </div>

        <div>
          {sorted.map((det, i) => (
            <DetachmentRow
              key={i}
              detachment={det}
              isActive={det.name === activeDetachment}
              startOpen={det.name === activeDetachment}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
