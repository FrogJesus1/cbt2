/**
 * AbilitiesBlock
 *
 * Two-column abilities panel. The combat engine only sends ATTACKER-side
 * abilities (unit = cyan, leader = gold, scars = red), so the left panel is the
 * real accordion and the right "Target" panel is an honest muted note —
 * defender abilities are not modelled by the simulator.
 *
 * Props:
 *   abilities — array of { name, color?: "amber"|"cyan"|"red", description?, text? }
 */

import { useState } from "react";
import { C, SectionHeader } from "./shared";

const CATEGORY_TAGS = new Set(["FACTION", "CORE", "CHARACTER"]);

function AbilityRow({ ab, i, expanded, toggle }) {
  const isCategoryTag = CATEGORY_TAGS.has((ab.name || "").toUpperCase());
  const displayName = isCategoryTag ? (ab.description || ab.name) : ab.name;
  const rawBody = ab.description || ab.summary || ab.text || null;
  const bodyText = (rawBody && rawBody !== displayName) ? rawBody : null;

  let nameColor;
  if (isCategoryTag && (ab.name || "").toUpperCase() === "FACTION") nameColor = C.accent;
  else if (isCategoryTag) nameColor = C.label;
  else if (ab.color === "amber") nameColor = C.accent;
  else if (ab.color === "red") nameColor = C.danger;
  else nameColor = C.cyan;

  const isExpanded = !!expanded[i];
  const hasText = !!bodyText;

  return (
    <div style={{ borderBottom: `1px solid ${C.border}` }}>
      <button
        onClick={() => hasText && toggle(i)}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          width: "100%", background: isExpanded ? C.bgDark : "transparent",
          border: "none", padding: "6px 4px", cursor: hasText ? "pointer" : "default",
          fontFamily: "inherit", textAlign: "left",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0 }}>
          <span style={{ color: nameColor, flexShrink: 0 }}>◆</span>
          <span style={{ color: nameColor, fontSize: "12px" }}>{displayName}</span>
        </div>
        {hasText && (
          <span style={{ color: C.dim, fontSize: "11px", flexShrink: 0, marginLeft: "8px", display: "inline-block", transform: isExpanded ? "rotate(180deg)" : "none" }}>▾</span>
        )}
      </button>
      {isExpanded && bodyText && (
        <div style={{ color: C.textMid, fontSize: "12px", lineHeight: 1.7, padding: "6px 8px 10px 18px", borderTop: `1px solid ${C.border}`, whiteSpace: "pre-wrap", wordBreak: "break-word", maxWidth: "100%" }}>
          {bodyText}
        </div>
      )}
    </div>
  );
}

function Panel({ label, accent, children }) {
  return (
    <div style={{ flex: "1 1 240px", minWidth: 0, background: C.panel, border: `1px solid ${C.border}`, borderTop: `2px solid ${accent}`, borderRadius: "5px", padding: "10px 12px" }}>
      <div className="ct-display" style={{ color: accent, fontSize: "9px", letterSpacing: "0.12em", marginBottom: "6px" }}>{label}</div>
      {children}
    </div>
  );
}

export function AbilitiesBlock({ abilities = [] }) {
  const [expanded, setExpanded] = useState({});
  const toggle = (i) => setExpanded(prev => ({ ...prev, [i]: !prev[i] }));

  return (
    <div>
      <SectionHeader>Abilities</SectionHeader>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "flex-start" }}>
        <Panel label="Attacker" accent={C.green}>
          {abilities.length
            ? abilities.map((ab, i) => <AbilityRow key={i} ab={ab} i={i} expanded={expanded} toggle={toggle} />)
            : <span style={{ color: C.dim, fontSize: "11px", fontStyle: "italic" }}>No special abilities.</span>}
        </Panel>
        <Panel label="Target" accent={C.accent}>
          <span style={{ color: C.dim, fontSize: "11px", fontStyle: "italic", lineHeight: 1.6 }}>
            Target abilities aren’t modelled in this simulation — only its defensive profile (T / Sv / W / invuln) feeds the math.
          </span>
        </Panel>
      </div>
    </div>
  );
}
