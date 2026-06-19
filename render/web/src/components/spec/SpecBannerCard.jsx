/**
 * SpecBannerCard
 *
 * Unit name header — full-width, displayed at the top of every spec result.
 * Redesign: the unit name is tinted by faction colour (Chakra-Petch squared
 * face), with a subtitle of `Faction · pts · Role` (points in green) and a
 * star toggle on the right.
 *
 * Props:
 *   title    — string  (unit name)
 *   subtitle — string  (e.g. "T'au Empire  ·  125 pts  ·  Battlesuit")
 *   faction  — string  (slug or label, e.g. "tau" — tints the name)
 *   onInject — (cmd: string) => void  (optional — makes title re-runnable)
 */

import { Card, CardContent, C, CARD_STYLE, CARD_PAD } from "./shared";
import { factionColor } from "../shared/colors";

// Highlight a "NNN pts" / "NNNpts" token in the subtitle so points read green,
// matching the mockup (`Faction · <green>125 pts</green> · Role`).
function Subtitle({ text }) {
  if (!text) return null;
  const parts = String(text).split(/(\d+\s*pts?)/i);
  return (
    <div style={{ color: C.label, fontSize: "11px", marginTop: "4px", letterSpacing: "0.04em" }}>
      {parts.map((p, i) =>
        /\d+\s*pts?/i.test(p)
          ? <span key={i} style={{ color: C.green }}>{p}</span>
          : <span key={i}>{p}</span>
      )}
    </div>
  );
}

export function SpecBannerCard({ title = "", subtitle = "", faction, onInject, isStarred, onToggleStar }) {
  const nameColor = factionColor(faction);

  return (
    <Card style={{ ...CARD_STYLE, border: `1px solid ${C.bordermid}`, boxShadow: `inset 0 0 0 1px ${C.border}` }}>
      <CardContent style={{ ...CARD_PAD, padding: "15px 18px", display: "flex", alignItems: "center", gap: "14px", justifyContent: "space-between" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            className="ct-display"
            onClick={() => onInject?.(`spec ${title}`)}
            style={{
              color:         nameColor,
              textShadow:    `0 0 12px ${nameColor}55`,
              fontSize:      "22px",
              fontWeight:    700,
              letterSpacing: "0.03em",
              cursor:        onInject ? "pointer" : "default",
              userSelect:    "none",
              lineHeight:    1.2,
            }}
            title={onInject ? `Re-run: spec ${title}` : undefined}
          >
            {(title || "—").toUpperCase()}
          </div>
          <Subtitle text={subtitle} />
        </div>
        {onToggleStar && (
          <button
            onClick={() => onToggleStar(title)}
            style={{
              background:   "transparent",
              border:       `1px solid ${isStarred ? C.accent + "70" : C.bordermid}`,
              borderRadius: "4px",
              color:        isStarred ? C.accent : C.label,
              fontSize:     "18px",
              cursor:       "pointer",
              userSelect:   "none",
              padding:      "5px 11px",
              flexShrink:   0,
              fontFamily:   "inherit",
              transition:   "color 0.15s, border-color 0.15s, text-shadow 0.15s",
              textShadow:   isStarred ? `0 0 8px ${C.accent}80` : "none",
            }}
            onMouseEnter={e => {
              if (!isStarred) {
                e.currentTarget.style.color = C.accent;
                e.currentTarget.style.borderColor = C.accent + "70";
              }
            }}
            onMouseLeave={e => {
              if (!isStarred) {
                e.currentTarget.style.color = C.label;
                e.currentTarget.style.borderColor = C.bordermid;
              }
            }}
            title={isStarred ? "Remove from starred" : "Star this unit"}
          >
            {isStarred ? "★" : "☆"}
          </button>
        )}
      </CardContent>
    </Card>
  );
}
