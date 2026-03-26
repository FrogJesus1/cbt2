/**
 * SpecAbilitiesBlock
 *
 * Abilities accordion for spec results.
 * Keywords have been moved to KeywordsBar (shown below the banner).
 *
 * Props:
 *   abilities — array of { name, desc?, text? } or strings
 *   onSubmit  — (cmd: string) => void  (optional — enables click-to-lookup)
 */

import { useState } from "react";
import { Card, CardContent, C, CARD_STYLE, CARD_PAD, SectionTitle } from "./shared";

// Descriptions longer than this character count use a collapse toggle instead
// of always being fully visible.
const LONG_TEXT_THRESHOLD = 180;

// ─── Ability row ──────────────────────────────────────────────────────────

function AbilityRow({ ab, onSubmit, isLast }) {
  const name       = typeof ab === "string" ? ab : (ab.name || String(ab));
  const isStub     = typeof ab !== "string" && ab._stub === true;
  const bodyText   = isStub
    ? null
    : (typeof ab === "string" ? null : (ab.description || ab.summary || ab.desc || ab.text || null));

  // Long descriptions collapse by default; short ones are always open.
  const isLong      = bodyText && bodyText.length > LONG_TEXT_THRESHOLD;
  const [open, setOpen] = useState(!isLong);  // short = open; long = collapsed

  if (isStub) {
    return (
      <div style={{ borderBottom: isLast ? "none" : `1px solid ${C.border}` }}>
        <div
          onClick={() => onSubmit?.(`ability ${name}`)}
          style={{
            display:    "flex",
            alignItems: "flex-start",
            gap:        "8px",
            padding:    "9px 0",
            cursor:     onSubmit ? "pointer" : "default",
            userSelect: "none",
            opacity:    0.6,
          }}
        >
          <span style={{ color: C.amber, fontSize: "12px", flexShrink: 0, marginTop: "1px" }}>⚠</span>
          <span style={{
            color:      C.label,
            fontWeight: 600,
            fontSize:   "13px",
            flex:       1,
            lineHeight: "1.4",
          }}>
            {name}
          </span>
          <span style={{
            color:         C.dim,
            fontSize:      "9px",
            border:        `1px solid ${C.border}`,
            padding:       "1px 4px",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            flexShrink:    0,
            marginTop:     "2px",
          }}>
            stub
          </span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ borderBottom: isLast ? "none" : `1px solid ${C.border}` }}>
      {/* Header row — always visible */}
      <div
        style={{
          display:    "flex",
          alignItems: "flex-start",
          gap:        "8px",
          padding:    "9px 0 6px",
        }}
      >
        <span style={{ color: C.amber, fontSize: "12px", flexShrink: 0, marginTop: "2px" }}>◆</span>
        <span style={{
          color:      C.mid,
          fontWeight: 600,
          fontSize:   "13px",
          flex:       1,
          lineHeight: "1.4",
          // Allow the name to wrap — no truncation
          whiteSpace: "normal",
        }}>
          {name}
        </span>
      </div>

      {/* Description — shown by default for short abilities */}
      {bodyText && open && (
        <div style={{
          color:      C.label,
          fontSize:   "12px",
          lineHeight: "1.7",
          padding:    "0 0 10px 20px",
          whiteSpace: "normal",
        }}>
          {bodyText}
        </div>
      )}

      {/* Expand / collapse toggle — only rendered for long descriptions */}
      {isLong && (
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            display:        "block",
            background:     "none",
            border:         "none",
            padding:        "0 0 9px 20px",
            cursor:         "pointer",
            fontFamily:     "inherit",
            color:          C.dim,
            fontSize:       "11px",
            letterSpacing:  "0.08em",
            textTransform:  "uppercase",
          }}
          onMouseEnter={e => { e.currentTarget.style.color = C.label; }}
          onMouseLeave={e => { e.currentTarget.style.color = C.dim; }}
        >
          {open ? "▲ show less" : "▼ show more"}
        </button>
      )}
    </div>
  );
}

// ─── SpecAbilitiesBlock ───────────────────────────────────────────────────

export function SpecAbilitiesBlock({ abilities = [], onSubmit }) {
  if (!abilities.length) return null;

  return (
    <Card style={CARD_STYLE}>
      <CardContent style={{ ...CARD_PAD, paddingBottom: "6px" }}>
        <SectionTitle>Abilities</SectionTitle>
        <div>
          {abilities.map((ab, i) => (
            <AbilityRow
              key={i}
              ab={ab}
              onSubmit={onSubmit}
              isLast={i === abilities.length - 1}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
