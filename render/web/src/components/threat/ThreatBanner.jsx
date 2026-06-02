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
      border:    `1px solid ${lvlColor}40`,
      boxShadow: `inset 0 0 0 1px ${C.border}, 0 0 12px ${lvlColor}10`,
    }}>
      <CardContent style={{
        ...CARD_PAD,
        display:    "flex",
        alignItems: "baseline",
        gap:        "14px",
        fontSize:   "20px",
        lineHeight: "1.3",
      }}>

        {/* Unit name — clickable to run spec lookup */}
        <span
          onClick={() => onInject?.(`spec ${name}`)}
          style={{
            color:      lvlColor,
            fontWeight: 700,
            textShadow: `0 0 10px ${lvlColor}50`,
            flex:       1,
            cursor:     onInject ? "pointer" : "default",
            userSelect: "none",
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
          padding:       "2px 8px",
          background:    `${lvlColor}12`,
          alignSelf:     "center",
          flexShrink:    0,
        }}>
          {lvlLabel} THREAT
        </span>

      </CardContent>
    </Card>
  );
}
