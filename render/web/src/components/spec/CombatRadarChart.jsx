/**
 * CombatRadarChart
 *
 * Pure-SVG spider / radar chart for the 5 combat rating axes.
 * No recharts — direct SVG for full terminal aesthetic control.
 *
 * Axis order (clockwise from top):
 *   DURABILITY → FIREPOWER → MELEE → OBJ CTRL → MOBILITY
 *
 * Props:
 *   ratings   — { durability, mobility, obj_control, firepower, melee_threat }
 *               each: { score: 0–1, label: string }
 *   compareTo — optional same-shaped object for a ghosted reference polygon
 *               (faction average, enemy unit comparison, etc.)
 *   title     — section title override (default "Tactical Profile")
 */

import { C, SectionTitle } from "./shared";

// ─── Axis definitions ────────────────────────────────────────────────────────
// Ordered clockwise from 12-o'clock for best visual separation of role types:
//   Top    = Durability   (defensive bulk)
//   UR     = Firepower    (ranged offence)
//   LR     = Melee        (close-combat offence)
//   LL     = Obj Control  (board presence)
//   UL     = Mobility     (speed)

const AXES = [
  { key: "durability",   label: "DURABILITY",  color: "var(--ct-bar-alt)",  shortLabel: "DUR" },
  { key: "firepower",    label: "FIREPOWER",   color: "#ff3b3b",             shortLabel: "FP"  },
  { key: "melee_threat", label: "MELEE",       color: "#ff6b2b",             shortLabel: "ML"  },
  { key: "obj_control",  label: "OBJ CTRL",    color: "#ffa328",             shortLabel: "OC"  },
  { key: "mobility",     label: "MOBILITY",    color: "var(--ct-primary)",   shortLabel: "MOB" },
];

const N_AXES = AXES.length;
const RINGS  = [0.25, 0.5, 0.75, 1.0];
const RING_LABELS = [0.25, 0.5, 0.75]; // only label inner three

// ─── SVG geometry ────────────────────────────────────────────────────────────

const SVG_W    = 320;
const SVG_H    = 260;
const CX       = SVG_W / 2;          // 160
const CY       = SVG_H / 2 + 8;      // 138  — shift down a touch for top-label clearance
const RADIUS   = 90;                  // outer ring radius
const LBL_PAD  = 22;                  // gap from ring edge → label centre
const LBL_R    = RADIUS + LBL_PAD;   // 112

// ─── Math helpers ────────────────────────────────────────────────────────────

/** Angle in radians for axis i, starting at top (−π/2), going clockwise. */
function axisAngle(i) {
  return -Math.PI / 2 + (2 * Math.PI / N_AXES) * i;
}

/** Cartesian point from polar coords. */
function polar(r, angle) {
  return { x: CX + r * Math.cos(angle), y: CY + r * Math.sin(angle) };
}

/** Build an SVG <polygon> points string from an array of scores (0–1). */
function buildPolygon(scores) {
  return scores
    .map((s, i) => {
      const { x, y } = polar(s * RADIUS, axisAngle(i));
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

/** Build a concentric ring polygon at fraction `frac`. */
function buildRing(frac) {
  return Array.from({ length: N_AXES }, (_, i) => {
    const { x, y } = polar(frac * RADIUS, axisAngle(i));
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
}

/** Text-anchor and baseline dy for a label positioned at a given angle. */
function labelAlign(angle) {
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);

  // text-anchor
  let anchor;
  if (cosA >  0.25) anchor = "start";
  else if (cosA < -0.25) anchor = "end";
  else anchor = "middle";

  // Vertical nudge: push up/down so label doesn't overlap the ring edge
  let yOffset = 0;
  if (sinA < -0.5) yOffset = -3;   // near top  → nudge up a bit more
  if (sinA >  0.5) yOffset =  3;   // near bottom → nudge down

  return { anchor, yOffset };
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function LegendItem({ color, dashed = false, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
      <svg width={20} height={10} style={{ overflow: "visible" }}>
        <line
          x1={0} y1={5} x2={20} y2={5}
          stroke={color}
          strokeWidth={dashed ? 1 : 1.75}
          strokeOpacity={dashed ? 0.45 : 0.9}
          strokeDasharray={dashed ? "4 3" : undefined}
        />
        {!dashed && (
          <circle cx={10} cy={5} r={2.5} fill={color} fillOpacity={0.9} />
        )}
      </svg>
      <span style={{
        color:         C.dim,
        fontSize:      "10px",
        letterSpacing: "0.09em",
        fontFamily:    "monospace",
        textTransform: "uppercase",
      }}>
        {label}
      </span>
    </div>
  );
}

// ─── CombatRadarChart ────────────────────────────────────────────────────────

export function CombatRadarChart({ ratings = {}, compareTo = null, title = "Tactical Profile" }) {
  // Extract scores
  const unitScores = AXES.map(a => {
    const s = ratings[a.key]?.score;
    return typeof s === "number" ? Math.max(0, Math.min(1, s)) : 0;
  });

  const cmpScores = compareTo
    ? AXES.map(a => {
        const s = compareTo[a.key]?.score;
        return typeof s === "number" ? Math.max(0, Math.min(1, s)) : 0;
      })
    : null;

  const hasData = unitScores.some(s => s > 0);

  return (
    <div>

        {/* Header row: title + axis legend */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "4px" }}>
          <SectionTitle style={{ marginBottom: 0 }}>{title}</SectionTitle>
          {cmpScores && (
            <div style={{ display: "flex", gap: "16px" }}>
              <LegendItem color="var(--ct-primary)" label="Unit" />
              <LegendItem color="var(--ct-primary)" dashed label="Faction Avg" />
            </div>
          )}
        </div>

        {/* SVG chart — width 100% so it scales to any column width */}
        <div style={{ padding: "4px 0 8px" }}>
          <svg
            width="100%"
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
            preserveAspectRatio="xMidYMid meet"
            style={{ display: "block" }}
            aria-label="Combat rating spider chart"
          >

            {/* ── Concentric rings ─────────────────────────────── */}
            {RINGS.map(frac => (
              <polygon
                key={`ring-${frac}`}
                points={buildRing(frac)}
                fill="none"
                stroke={frac === 1.0 ? C.bordermid : C.border}
                strokeWidth={frac === 1.0 ? 0.9 : 0.65}
                strokeOpacity={frac === 1.0 ? 0.45 : 0.28}
              />
            ))}

            {/* ── Axis spokes ───────────────────────────────────── */}
            {AXES.map((axis, i) => {
              const angle = axisAngle(i);
              const outer = polar(RADIUS, angle);
              return (
                <line
                  key={`spoke-${axis.key}`}
                  x1={CX} y1={CY}
                  x2={outer.x.toFixed(2)} y2={outer.y.toFixed(2)}
                  stroke={C.border}
                  strokeWidth={0.65}
                  strokeOpacity={0.3}
                />
              );
            })}

            {/* ── Ring tick labels (25 / 50 / 75) ──────────────── */}
            {RING_LABELS.map(frac => {
              // Place along the gap between axis 0 and axis 4 (top-left sector)
              const tickAngle = axisAngle(0) - 0.18;
              const { x, y } = polar(frac * RADIUS, tickAngle);
              return (
                <text
                  key={`tick-${frac}`}
                  x={x.toFixed(2)} y={y.toFixed(2)}
                  fontSize={7}
                  fill={C.dim}
                  fillOpacity={0.4}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fontFamily="monospace"
                >
                  {Math.round(frac * 100)}
                </text>
              );
            })}

            {/* ── Comparison polygon (ghosted) ──────────────────── */}
            {cmpScores && (
              <polygon
                points={buildPolygon(cmpScores)}
                fill="var(--ct-primary)"
                fillOpacity={0.05}
                stroke="var(--ct-primary)"
                strokeOpacity={0.3}
                strokeWidth={1}
                strokeDasharray="4 3"
              />
            )}

            {/* ── Unit polygon (filled) ─────────────────────────── */}
            {hasData ? (
              <polygon
                points={buildPolygon(unitScores)}
                fill="var(--ct-primary)"
                fillOpacity={0.15}
                stroke="var(--ct-primary)"
                strokeOpacity={0.9}
                strokeWidth={1.5}
                strokeLinejoin="round"
              />
            ) : (
              /* Empty state ring */
              <polygon
                points={buildRing(0.02)}
                fill="none"
                stroke={C.dim}
                strokeWidth={1}
                strokeOpacity={0.3}
              />
            )}

            {/* ── Score dots on unit polygon ────────────────────── */}
            {hasData && unitScores.map((s, i) => {
              if (s === 0) return null;
              const angle = axisAngle(i);
              const { x, y } = polar(s * RADIUS, angle);
              return (
                <circle
                  key={`dot-${i}`}
                  cx={x.toFixed(2)} cy={y.toFixed(2)}
                  r={3.2}
                  fill="var(--ct-primary)"
                  fillOpacity={0.95}
                  stroke="var(--ct-bg-panel)"
                  strokeWidth={1.5}
                />
              );
            })}

            {/* ── Axis labels (name + score%) ───────────────────── */}
            {AXES.map((axis, i) => {
              const angle          = axisAngle(i);
              const { x, y }       = polar(LBL_R, angle);
              const { anchor, yOffset } = labelAlign(angle);
              const scorePct       = Math.round(unitScores[i] * 100);
              const lineH          = 11; // px between label lines in SVG

              return (
                <g key={`lbl-${axis.key}`}>
                  {/* Axis name */}
                  <text
                    x={x.toFixed(2)}
                    y={(y + yOffset - lineH * 0.5).toFixed(2)}
                    textAnchor={anchor}
                    dominantBaseline="middle"
                    fontSize={9}
                    fontWeight={700}
                    fontFamily="monospace"
                    letterSpacing="0.10em"
                    fill={axis.color}
                    fillOpacity={0.9}
                  >
                    {axis.label}
                  </text>
                  {/* Score % */}
                  <text
                    x={x.toFixed(2)}
                    y={(y + yOffset + lineH * 0.5).toFixed(2)}
                    textAnchor={anchor}
                    dominantBaseline="middle"
                    fontSize={8.5}
                    fontWeight={600}
                    fontFamily="monospace"
                    fill={axis.color}
                    fillOpacity={0.5}
                  >
                    {scorePct}%
                  </text>
                </g>
              );
            })}

          </svg>
        </div>

        {/* ── No-data warning ──────────────────────────────────── */}
        {!hasData && (
          <div style={{
            textAlign:  "center",
            color:      C.dim,
            fontSize:   "11px",
            marginTop:  "4px",
            letterSpacing: "0.08em",
          }}>
            NO RATING DATA
          </div>
        )}

    </div>
  );
}
