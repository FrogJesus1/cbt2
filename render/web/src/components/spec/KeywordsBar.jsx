/**
 * KeywordsBar
 *
 * Full-width keyword chip row, shown directly below the spec banner.
 * Each chip has a hover popover showing the keyword's game meaning.
 * Clicking a chip submits a search command (if onSubmit provided).
 *
 * Props:
 *   keywords  — string[]
 *   onSubmit  — (cmd: string) => void  (optional)
 */

import { useState } from "react";
import { Card, CardContent, C, CARD_STYLE, CARD_PAD } from "./shared";

// ─── Keyword description lookup ────────────────────────────────────────────
// Common Warhammer 40K 10th edition keyword descriptions.
// Falls back to a generic message for unknown keywords.

const KEYWORD_DESCRIPTIONS = {
  "Infantry":            "Can move through infantry-passable terrain. Eligible for cover saves in certain terrain features.",
  "Battlesuit":          "T'au armoured exo-suit. Can equip Support Systems and benefits from Battlesuit-specific stratagems.",
  "T'au Empire":         "Faction keyword. Operates alongside other T'au Empire units and benefits from Sept Tenets.",
  "Sept":                "Belongs to a T'au Sept, gaining its associated Sept Tenet ability in matched play.",
  "Character":           "A named leader. Can be attached to eligible Bodyguard units to grant special abilities.",
  "Monster":             "A large creature. Cannot enter Infantry-only terrain. Subject to Monster-specific rules.",
  "Vehicle":             "A mechanical unit. Blocked from some terrain features. May have embarkation rules.",
  "Fly":                 "Can move over other models and terrain without impediment during the Movement phase.",
  "Core":                "Eligible to benefit from abilities that specifically target Core units.",
  "Grenades":            "Can throw grenades in the Shooting phase instead of firing other weapons.",
  "Transport":           "Can carry eligible units. See unit's transport capacity for details.",
  "Chaos":               "Aligned with the Chaos Gods. Cannot join non-Chaos detachments in matched play.",
  "Daemon":              "A warp entity. Has a daemonic invulnerable save and other supernatural traits.",
  "Psyker":              "Can manifest and attempt to deny psychic powers each Psychic phase.",
  "Leader":              "Can be attached to an eligible Bodyguard unit as an embedded character.",
  "Lone Operative":      "Cannot be targeted by ranged attacks if more than 12\" from an enemy unit.",
  "Scouts":              "Can make a pre-game Scouts move before the first battle round begins.",
  "Stealth":             "Enemies subtract 1 from Hit rolls when targeting this unit from over 12\" away.",
  "Smoke":               "Can fire smoke launchers once per game, gaining a cover save until your next turn.",
  "Walker":              "A bipedal or multi-legged mechanical unit with specific terrain interaction rules.",
  "Titanic":             "An immense unit. Can move over other models and ignores some terrain rules.",
  "Aircraft":            "A flying unit. Can only be targeted by units with Fly or anti-aircraft weapons.",
  "Mounted":             "A cavalry or mounted unit. Has specific movement and charge interaction rules.",
  "Primaris":            "Next-generation Space Marine. Eligible for Primaris-specific stratagems.",
  "Adeptus Astartes":    "Space Marine faction keyword. Enables Chapter Tactics and related abilities.",
  "Space Marines":       "Faction keyword for Adeptus Astartes forces.",
  "Astra Militarum":     "Faction keyword for Imperial Guard forces.",
  "Tyranids":            "Faction keyword for the Tyranid swarm.",
  "Necrons":             "Faction keyword for the Necron dynasties.",
  "Orks":                "Faction keyword for Ork Waaagh forces.",
  "Aeldari":             "Faction keyword for all Aeldari (Eldar) forces.",
  "Drukhari":            "Faction keyword for Dark Eldar forces.",
  "T'au":                "Faction keyword for T'au Empire forces.",
  "Towering":            "This model can be seen and can see over all terrain features that are not also Towering.",
  "Deep Strike":         "Can be set up in Reserves and arrive via Deep Strike during the Reinforcements step.",
  "Deadly Demise":       "When this model is destroyed, roll D6. On a 6, one nearby enemy unit takes mortal wounds.",
  "Feel No Pain":        "When this model would lose a wound, roll a die — on the specified result, that wound is ignored.",
};

// ─── Keyword chip with hover tooltip ──────────────────────────────────────
//
// Clicking a chip fires:  list units <keyword> --faction <faction>
// This always routes to the UNITS context (App.jsx routes list-units there).
// If no faction is available, falls back to a faction-less keyword search.

function KeywordChip({ keyword, faction, onSubmit }) {
  const [hovered, setHovered] = useState(false);

  const desc = KEYWORD_DESCRIPTIONS[keyword]
    ?? `Filter units and rules by the ${keyword} keyword.`;

  // Build the command: scoped to faction when available
  const cmd = faction
    ? `list units ${keyword} --faction ${faction}`
    : `list units ${keyword}`;

  // Tooltip hint line (shown below the description)
  const hint = onSubmit
    ? faction
      ? `Click → list ${faction.replace(/_/g, " ")} units with this keyword`
      : `Click → list all units with this keyword`
    : null;

  return (
    <div
      style={{ position: "relative", display: "inline-block" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Chip */}
      <span
        onClick={() => onSubmit?.(cmd)}
        style={{
          display:       "inline-block",
          color:         hovered ? C.amber : (onSubmit ? C.cyan : C.label),
          fontSize:      "11px",
          border:        `1px solid ${hovered ? `color-mix(in srgb, ${C.amber} 44%, transparent)` : (onSubmit ? `color-mix(in srgb, ${C.cyan} 31%, transparent)` : C.border)}`,
          borderRadius:  "3px",
          padding:       "3px 9px",
          cursor:        onSubmit ? "pointer" : "default",
          letterSpacing: "0.04em",
          userSelect:    "none",
          fontFamily:    "monospace",
          transition:    "color 0.1s, border-color 0.1s, background-color 0.1s",
          backgroundColor: hovered && onSubmit ? "#ffa32812" : "transparent",
        }}
      >
        {keyword}
      </span>

      {/* Tooltip — appears below the chip */}
      {hovered && (
        <div style={{
          position:      "absolute",
          top:           "calc(100% + 6px)",
          left:          "0",
          background:    "#0a140a",
          border:        `1px solid ${C.bordermid}`,
          padding:       "8px 11px",
          fontSize:      "11px",
          color:         C.label,
          lineHeight:    "1.55",
          maxWidth:      "280px",
          width:         "max-content",
          zIndex:        200,
          pointerEvents: "none",
          whiteSpace:    "normal",
          boxShadow:     `0 4px 16px #00000080`,
        }}>
          <div style={{ color: C.mid, fontWeight: 700, marginBottom: "4px", fontSize: "11px", letterSpacing: "0.05em" }}>
            {keyword}
          </div>
          {desc}
          {hint && (
            <div style={{
              marginTop:   "6px",
              color:       C.amber,
              fontSize:    "10px",
              letterSpacing: "0.04em",
              opacity:     0.85,
            }}>
              ⚡ {hint}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Keyword sanitiser ─────────────────────────────────────────────────────
// Strips entries that are bare label tokens (e.g. "keyword:", "faction:").
// These appear in some dossier formats where "keyword: Infantry" is stored as
// a single string instead of just "Infantry". We extract the real keyword from
// after the colon, and drop entries that are purely a label with no value.

function sanitizeKeywords(raw) {
  // Guard: accept only real arrays — null/undefined must not reach `for...of`
  if (!Array.isArray(raw)) return [];
  const cleaned = [];
  for (const kw of raw) {
    const s = String(kw).trim();
    if (!s) continue;

    // Strip label prefixes like "KEYWORDS: Infantry" → "Infantry"
    // Only strip when the colon is preceded by all-caps letters (KEYWORDS, FACTION, etc.)
    // This avoids stripping apostrophes in names like "T'au" → but T'au uses ʼ not :
    const colonIdx = s.indexOf(":");
    if (colonIdx !== -1) {
      const prefix  = s.slice(0, colonIdx);
      const after   = s.slice(colonIdx + 1).trim();
      // Only treat as label prefix if the prefix is all uppercase letters (no spaces/digits)
      if (/^[A-Z]+$/.test(prefix) && after) {
        cleaned.push(after);
      } else if (after || !prefix) {
        // If colon is mid-word (e.g. "T:au" — shouldn't happen) keep full string
        cleaned.push(s);
      }
      // If colonIdx found but nothing after → skip (bare label like "KEYWORDS:")
    } else {
      cleaned.push(s);
    }
  }
  // Deduplicate while preserving order
  return [...new Set(cleaned)];
}

// ─── KeywordsBar ───────────────────────────────────────────────────────────
//
// Props:
//   keywords  — string[]
//   onSubmit  — (cmd: string) => void  (optional; enables click interaction)
//   faction   — string | undefined     (faction slug from meta, e.g. "tau", "space_marines")
//               When provided, click commands are scoped to that faction.

export function KeywordsBar({ keywords = [], onSubmit, faction }) {
  const clean = sanitizeKeywords(keywords);
  if (!clean.length) return null;

  return (
    <Card style={{ ...CARD_STYLE, overflow: "visible" }}>
      <CardContent style={{ ...CARD_PAD, paddingTop: "9px", paddingBottom: "9px", overflow: "visible" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center", overflow: "visible" }}>
          <span style={{
            fontSize: "9px", letterSpacing: "0.12em", color: C.dim,
            textTransform: "uppercase", marginRight: "2px",
          }}>
            Keywords
          </span>
          {clean.map((kw, i) => (
            <KeywordChip key={i} keyword={kw} faction={faction} onSubmit={onSubmit} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
