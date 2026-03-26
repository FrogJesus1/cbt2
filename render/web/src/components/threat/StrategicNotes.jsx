/**
 * StrategicNotes
 *
 * Tips and warnings panel derived from threat analysis.
 * Each note has a type ("warning" | "tip" | "focus") and a text string.
 *
 * Visual language:
 *   warning → red   icon ⚠  prefix "WARNING"
 *   tip     → cyan  icon 💡  prefix "TIP"
 *   focus   → amber icon 🎯  prefix "FOCUS"
 *
 * Props:
 *   notes  — array of { type: "warning"|"tip"|"focus", text: string }
 */

import { C, CARD_STYLE, CARD_PAD, SectionTitle, Card, CardContent } from "./shared";

// ─── Note type config ─────────────────────────────────────────────────────

const NOTE_CONFIG = {
  warning: { icon: "⚠",  label: "WARNING", color: C.red,   bg: `${C.red}0c`   },
  tip:     { icon: "💡", label: "TIP",     color: C.cyan,  bg: `${C.cyan}08`  },
  focus:   { icon: "🎯", label: "FOCUS",   color: C.amber, bg: `${C.amber}08` },
};

// ─── Single note row ──────────────────────────────────────────────────────

function NoteRow({ note, isLast }) {
  const cfg = NOTE_CONFIG[note.type] ?? NOTE_CONFIG.tip;

  return (
    <div style={{
      display:      "flex",
      gap:          "10px",
      alignItems:   "flex-start",
      padding:      "8px 10px",
      marginBottom: isLast ? 0 : "4px",
      background:   cfg.bg,
      border:       `1px solid ${cfg.color}20`,
    }}>

      {/* Icon */}
      <span style={{ fontSize: "13px", flexShrink: 0, lineHeight: "1.4", marginTop: "1px" }}>
        {cfg.icon}
      </span>

      <div style={{ flex: 1 }}>
        {/* Type label */}
        <span style={{
          color:         cfg.color,
          fontSize:      "9px",
          fontWeight:    700,
          letterSpacing: "0.16em",
          marginRight:   "6px",
        }}>
          {cfg.label}
        </span>

        {/* Note text */}
        <span style={{
          color:      C.label,
          fontSize:   "12px",
          lineHeight: "1.6",
        }}>
          {note.text}
        </span>
      </div>

    </div>
  );
}

// ─── StrategicNotes ───────────────────────────────────────────────────────

export function StrategicNotes({ notes = [] }) {
  const validNotes = notes.filter(n => n && n.text);

  return (
    <Card style={CARD_STYLE}>
      <CardContent style={CARD_PAD}>
        <SectionTitle>Strategic Notes</SectionTitle>

        {validNotes.length === 0 ? (
          <div style={{ color: C.dim, fontSize: "12px" }}>
            No strategic notes available for this faction.
          </div>
        ) : (
          <div>
            {validNotes.map((note, i) => (
              <NoteRow
                key={i}
                note={note}
                isLast={i === validNotes.length - 1}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
