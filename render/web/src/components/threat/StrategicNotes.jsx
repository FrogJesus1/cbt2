/**
 * StrategicNotes
 *
 * Tips and warnings derived from threat analysis. Each note has a type
 * ("warning" | "focus" | "tip") and a text string, rendered as a left-accent
 * callout row (mockup): coloured left border + faint tinted fill + an icon and
 * an uppercase label.
 *
 *   warning → red   ⚠
 *   focus   → gold  ◉
 *   tip     → cyan  ›
 *
 * The "STRATEGIC NOTES" section header is rendered by the parent (ThreatBlock)
 * as a hazard SectionHeader, so this component emits only the rows.
 *
 * Props:
 *   notes  — array of { type: "warning"|"focus"|"tip", text: string }
 */

import { C } from "./shared";

const NOTE_CONFIG = {
  warning: { icon: "⚠", label: "WARNING", color: C.danger },
  focus:   { icon: "◉", label: "FOCUS",   color: C.accent },
  tip:     { icon: "›", label: "TIP",     color: C.cyan   },
};

function NoteRow({ note }) {
  const cfg = NOTE_CONFIG[note.type] ?? NOTE_CONFIG.tip;

  return (
    <div style={{
      display:      "flex",
      gap:          "11px",
      alignItems:   "flex-start",
      padding:      "9px 13px",
      background:   `color-mix(in srgb, ${cfg.color} 6%, transparent)`,
      border:       `1px solid color-mix(in srgb, ${cfg.color} 20%, transparent)`,
      borderLeft:   `2px solid ${cfg.color}`,
      borderRadius: "3px",
    }}>
      <span style={{ color: cfg.color, fontSize: "12px", flexShrink: 0, marginTop: "1px", lineHeight: "1.4" }}>
        {cfg.icon}
      </span>
      <div>
        <span style={{
          color:         cfg.color,
          fontSize:      "9px",
          fontWeight:    700,
          letterSpacing: "0.16em",
          marginRight:   "8px",
        }}>
          {cfg.label}
        </span>
        <span style={{ color: C.bodyDim, fontSize: "12px", lineHeight: "1.6" }}>
          {note.text}
        </span>
      </div>
    </div>
  );
}

export function StrategicNotes({ notes = [] }) {
  const validNotes = notes.filter(n => n && n.text);

  if (validNotes.length === 0) {
    return (
      <div style={{ color: C.dim, fontSize: "12px" }}>
        No strategic notes available for this faction.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {validNotes.map((note, i) => (
        <NoteRow key={i} note={note} />
      ))}
    </div>
  );
}
