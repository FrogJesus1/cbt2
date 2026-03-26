/**
 * AbilitiesBlock
 *
 * Expandable accordion list of unit abilities.
 * Full-width — spans the whole result panel.
 *
 * Props:
 *   abilities — array of { name: string, color?: "amber"|"cyan", text?: string }
 *               text is the body shown when expanded; omit for non-expandable entries
 */

import { useState } from "react";
import { C } from "./shared";

// Ability types whose `name` field is a category tag, not the actual ability name.
// For these, use `description` as the display label and apply special coloring.
const CATEGORY_TAGS = new Set(["FACTION", "CORE", "CHARACTER"]);

export function AbilitiesBlock({ abilities = [] }) {
  const [expanded, setExpanded] = useState({});
  if (!abilities.length) return null;

  const toggle = (i) => setExpanded(prev => ({ ...prev, [i]: !prev[i] }));

  return (
    <div style={{ marginTop: "2px", paddingTop: "8px", borderTop: `1px solid ${C.border}` }}>
      <div style={{
        color: C.label, fontSize: "11px", letterSpacing: "0.12em",
        marginBottom: "6px", textTransform: "uppercase", fontWeight: 600,
      }}>
        Abilities
      </div>

      {abilities.map((ab, i) => {
        const isCategoryTag = CATEGORY_TAGS.has((ab.name || "").toUpperCase());

        // For FACTION / CORE / CHARACTER: the dossier stores the ability name in
        // the `description` field (e.g. "For the Greater Good") and the category
        // keyword in `name`.  Use description as the visible label.
        //
        // For body text: show whatever description/text is available, but suppress
        // it when it would simply repeat the display name (avoids circular content).
        const displayName  = isCategoryTag ? (ab.description || ab.name) : ab.name;
        const rawBody      = ab.description || ab.summary || ab.text || null;
        const bodyText     = (rawBody && rawBody !== displayName) ? rawBody : null;

        // Color: faction abilities amber, core abilities dim-cyan, regular cyan
        let nameColor;
        if (isCategoryTag && (ab.name || "").toUpperCase() === "FACTION") {
          nameColor = C.amber;
        } else if (isCategoryTag) {
          nameColor = C.label;
        } else {
          nameColor = ab.color === "amber" ? C.amber : C.cyan;
        }

        const isExpanded = !!expanded[i];
        const hasText    = !!bodyText;

        return (
          <div key={i} style={{ borderBottom: `1px solid ${C.border}`, marginBottom: "2px" }}>
            <button
              onClick={() => hasText && toggle(i)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                width: "100%", background: isExpanded ? "#0a180a" : "transparent",
                border: "none", padding: "6px 4px",
                cursor: hasText ? "pointer" : "default",
                fontFamily: "inherit", textAlign: "left",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0 }}>
                <span style={{ color: nameColor, flexShrink: 0 }}>◆</span>
                <span style={{ color: nameColor, fontSize: "13px" }}>{displayName}</span>
              </div>
              {hasText && (
                <span style={{
                  color: C.label, fontSize: "11px", flexShrink: 0, marginLeft: "8px",
                  transition: "transform 0.2s", display: "inline-block",
                  transform: isExpanded ? "rotate(180deg)" : "none",
                }}>
                  ▾
                </span>
              )}
            </button>

            {isExpanded && bodyText && (
              <div style={{
                color:        C.mid,
                fontSize:     "12px",
                lineHeight:   "1.7",
                padding:      "6px 8px 10px 18px",
                borderTop:    `1px solid ${C.border}`,
                whiteSpace:   "pre-wrap",
                wordBreak:    "break-word",
                overflowWrap: "break-word",
                maxWidth:     "100%",
              }}>
                {bodyText}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
