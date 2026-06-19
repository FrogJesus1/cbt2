/**
 * ThreatBanner
 *
 * Full-width header for threat analysis results.
 * Shows unit name + threat level badge — mirrors SpecBannerCard's
 * structure but colours the name by threat level.
 *
 * Props:
 *   name         — string  (unit name)
 *   threatLevel  — "high" | "medium" | "low"
 *   onInject     — (cmd: string) => void  (optional — makes name clickable → spec lookup)
 */

import { Card, CardContent, C, CARD_STYLE, CARD_PAD, THREAT_COLORS, THREAT_LABELS } from "./shared";

export function ThreatBanner({ name = "", threatLevel = "medium", onInject }) {
  const lvlColor = THREAT_COLORS[threatLevel] ?? C.amber;
  const lvlLabel = THREAT_LABELS[threatLevel] ?? threatLevel.toUpperCase();

  return (
    <Card style={{
      ...CARD_STYLE,
      border:    `1px solid ${lvlColor}48`,
      boxShadow: `inset 0 0 0 1px ${C.border}, 0 0 14px ${lvlColor}10`,
    }}>
      <CardContent style={{
        ...CARD_PAD,
        display:    "flex",
        alignItems: "center",
        gap:        "14px",
        lineHeight: "1.3",
      }}>

        {/* Threat-level accent bar */}
        <span style={{ width: "4px", height: "30px", background: lvlColor, borderRadius: "2px", flexShrink: 0 }} />

        {/* Unit name — clickable to run spec lookup */}
        <span
          className="ct-display"
          onClick={() => onInject?.(`spec ${name}`)}
          style={{
            color:         lvlColor,
            fontSize:      "22px",
            fontWeight:    700,
            letterSpacing: "0.03em",
            textShadow:    `0 0 12px ${lvlColor}40`,
            flex:          1,
            minWidth:      0,
            cursor:        onInject ? "pointer" : "default",
            userSelect:    "none",
          }}
          title={onInject ? `Look up: spec ${name}` : undefined}
        >
          {(name || "—").toUpperCase()}
        </span>

        {/* Threat level chip */}
        <span style={{
          color:         lvlColor,
          fontSize:      "11px",
          fontWeight:    700,
          letterSpacing: "0.18em",
          border:        `1px solid ${lvlColor}60`,
          padding:       "3px 9px",
          background:    `${lvlColor}12`,
          borderRadius:  "3px",
          flexShrink:    0,
        }}>
          {lvlLabel} THREAT
        </span>

      </CardContent>
    </Card>
  );
}
