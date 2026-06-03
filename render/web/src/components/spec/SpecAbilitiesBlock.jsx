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

// Ability category keywords — when name is one of these, the actual ability
// name lives in description (e.g. name="CORE", description="Deadly Demise D3").
const CATEGORY_TAGS = new Set(["FACTION", "CORE", "CHARACTER"]);

// ─── Ability row ──────────────────────────────────────────────────────────

function AbilityRow({ ab, onSubmit, isLast }) {
  const isStub       = typeof ab !== "string" && ab._stub === true;
  const rawName      = typeof ab === "string" ? ab : (ab.name || String(ab));
  const rawSummary   = typeof ab === "string" ? null
    : (ab.description || ab.summary || ab.desc || ab.text || null);

  // For CORE / FACTION / CHARACTER: combine the tag + summary into a single label.
  //   name="CORE"    summary="Deadly Demise D3"  →  displayName = "CORE Deadly Demise D3"
  //   name="FACTION" summary="For the Greater Good" → "FACTION For the Greater Good"
  const isCategoryTag = !isStub && CATEGORY_TAGS.has((rawName || "").toUpperCase());
  const displayName   = isCategoryTag && rawSummary
    ? `${rawName} ${rawSummary}`
    : rawName;

  // Body text: for regular abilities use description; for category-tag abilities
  // use rule_text (looked up from the faction ability descriptions table).
  const ruleText = typeof ab === "string" ? null : (ab.rule_text || null);
  const bodyText = isStub ? null
    : isCategoryTag ? ruleText
    : rawSummary;

  // All abilities start collapsed; click to expand.
  const [open, setOpen] = useState(false);
  const hasBody = !!bodyText;

  if (isStub) {
    return (
      <div style={{ borderBottom: isLast ? "none" : `1px solid ${C.border}` }}>
        <div
          onClick={() => onSubmit?.(`ability ${displayName}`)}
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
            {displayName}
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
      {/* Header row — clickable to toggle expand/collapse */}
      <div
        onClick={hasBody ? () => setOpen(o => !o) : undefined}
        style={{
          display:    "flex",
          alignItems: "flex-start",
          gap:        "8px",
          padding:    "9px 0 6px",
          cursor:     hasBody ? "pointer" : "default",
          userSelect: "none",
        }}
      >
        {/* Toggle arrow for abilities with body text; diamond for name-only */}
        <span style={{ color: C.amber, fontSize: "12px", flexShrink: 0, marginTop: "2px", width: "12px", textAlign: "center" }}>
          {hasBody ? (open ? "▼" : "▶") : "◆"}
        </span>
        <span style={{
          color:      isCategoryTag ? C.label : C.mid,
          fontWeight: 600,
          fontSize:   "13px",
          flex:       1,
          lineHeight: "1.4",
          whiteSpace: "normal",
        }}>
          {displayName}
        </span>
      </div>

      {/* Description — shown only when expanded */}
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
