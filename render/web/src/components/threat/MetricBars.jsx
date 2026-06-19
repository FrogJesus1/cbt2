/**
 * MetricBars
 *
 * 5-metric threat analysis bar chart.
 * Threat + Dur display in RED. Dmg / Mob / Buff display in CYAN.
 * Each row: label | solid bar | score (0–100).
 *
 * Props:
 *   metrics — { threat, dur, dmg, mob, buff }  (0–100 integers each)
 */

import { Card, CardContent, C, CARD_STYLE, CARD_PAD, METRICS, Bar, SectionTitle } from "./shared";

function MetricRow({ label, pct, color, isLast }) {
  return (
    <div style={{
      display:      "grid",
      gridTemplateColumns: "52px 1fr 32px",
      alignItems:   "center",
      gap:          "10px",
      paddingBottom: isLast ? 0 : "9px",
    }}>

      {/* Label */}
      <span style={{
        color:      C.bodyDim,
        fontSize:   "11px",
        fontWeight: 600,
        letterSpacing: "0.06em",
      }}>
        {label}
      </span>

      {/* Bar */}
      <Bar pct={pct} color={color} height={6} />

      {/* Score */}
      <span style={{
        color:      color,
        fontSize:   "12px",
        fontWeight: 700,
        textAlign:  "right",
        fontFamily: "monospace",
      }}>
        {pct}
      </span>

    </div>
  );
}

export function MetricBars({ metrics = {} }) {
  return (
    <Card style={CARD_STYLE}>
      <CardContent style={CARD_PAD}>
        <SectionTitle>Threat Metrics</SectionTitle>
        <div>
          {METRICS.map(({ key, label, color }, i) => {
            const score = Math.min(100, Math.max(0, Number(metrics[key] ?? 0)));
            return (
              <MetricRow
                key={key}
                label={label}
                pct={score}
                color={color}
                isLast={i === METRICS.length - 1}
              />
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
