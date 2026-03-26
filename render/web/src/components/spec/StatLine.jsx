/**
 * StatLine
 *
 * 10th edition stat block (M / T / Sv / W / Ld / OC) + optional weapons table,
 * all in the left card. Combat ratings panel on the right.
 *
 * Props:
 *   stats   — { M, T, Sv, W, Ld, OC }
 *   ratings — { durability, mobility, obj_control, firepower, melee_threat }
 *             each: { score: 0–1, label: string }
 *   weapons — optional raw weapon array — rendered below stat boxes in same card
 */

import { Card, CardContent, C, CARD_STYLE, CARD_PAD, Bar, SectionTitle } from "./shared";
import { WeaponsPanelContent } from "./WeaponsPanel";
import { CombatRadarChart }    from "./CombatRadarChart";

// ─── Stat display ─────────────────────────────────────────────────────────

const STAT_ORDER = ["M", "T", "Sv", "W", "Ld", "OC"];

function StatBox({ statKey, value, isLast }) {
  return (
    <div style={{
      flex:        "1",
      textAlign:   "center",
      padding:     "16px 10px",
      borderRight: isLast ? "none" : `1px solid ${C.border}`,
    }}>
      <div style={{
        color:         C.label,
        fontSize:      "13px",
        fontWeight:    700,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        marginBottom:  "8px",
      }}>
        {statKey}
      </div>
      <div style={{
        color:      C.green,
        fontSize:   "34px",
        fontWeight: 700,
        fontFamily: "monospace",
        lineHeight: 1,
        textShadow: `0 0 10px ${C.green}60`,
      }}>
        {value !== undefined && value !== null ? String(value) : "—"}
      </div>
    </div>
  );
}

// ─── Rating display ───────────────────────────────────────────────────────

const RATING_ORDER = ["durability", "mobility", "obj_control", "firepower", "melee_threat"];
const RATING_META  = {
  durability:   { label: "Durability",  color: "var(--ct-bar-alt)" },
  mobility:     { label: "Mobility",    color: "var(--ct-primary)" },
  obj_control:  { label: "Obj Control", color: "#ffa328" },
  firepower:    { label: "Firepower",   color: "#ff3b3b" },
  melee_threat: { label: "Melee",       color: "#ff6b2b" },
};

function RatingRow({ ratingKey, data }) {
  const meta  = RATING_META[ratingKey];
  const score = data?.score ?? 0;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
        <span style={{ color: C.label, fontSize: "13px", fontWeight: 600, letterSpacing: "0.06em" }}>
          {meta.label}
        </span>
        <span style={{ color: meta.color, fontSize: "13px", fontWeight: 700 }}>
          {data?.label || `${Math.round(score * 100)}%`}
        </span>
      </div>
      <Bar value={score} max={1} color={meta.color} height={6} />
    </div>
  );
}

// ─── StatLine ─────────────────────────────────────────────────────────────

export function StatLine({ stats = {}, ratings = {}, weapons = [] }) {
  const statKeys   = STAT_ORDER.filter(k => k in stats);
  const ratingKeys = RATING_ORDER.filter(k => k in ratings);
  const hasRatings = ratingKeys.length > 0;
  const hasWeapons = weapons.length > 0;

  return (
    <div style={{ display: "flex", gap: "6px", alignItems: "flex-start" }}>

      {/* Left card: stat boxes + weapons table */}
      <Card style={{ ...CARD_STYLE, flex: "1 1 auto", minWidth: 0 }}>
        <CardContent style={{ ...CARD_PAD }}>

          {/* Stat boxes */}
          <SectionTitle>Stat Line</SectionTitle>
          {statKeys.length > 0 ? (
            <div style={{
              display:     "flex",
              borderTop:   `1px solid ${C.border}`,
              borderLeft:  `1px solid ${C.border}`,
              marginBottom: hasWeapons ? "16px" : 0,
            }}>
              {statKeys.map((k, i) => (
                <StatBox key={k} statKey={k} value={stats[k]} isLast={i === statKeys.length - 1} />
              ))}
            </div>
          ) : (
            <div style={{ color: C.dim, fontSize: "13px", marginBottom: hasWeapons ? "12px" : 0 }}>
              No stat data available.
            </div>
          )}

          {/* Weapons table — nested directly below stat boxes */}
          {hasWeapons && (
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: "16px" }}>
              <WeaponsPanelContent weapons={weapons} />
            </div>
          )}

        </CardContent>
      </Card>

      {/* Right column: combat ratings + spider chart stacked */}
      {hasRatings && (
        <div style={{ flex: "0 0 275px", display: "flex", flexDirection: "column", gap: "6px" }}>

          {/* Ratings bar card */}
          <Card style={{ ...CARD_STYLE }}>
            <CardContent style={{ ...CARD_PAD }}>
              <SectionTitle>Combat Ratings</SectionTitle>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {ratingKeys.map(k => (
                  <RatingRow key={k} ratingKey={k} data={ratings[k]} />
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Spider chart card — directly below */}
          <Card style={{ ...CARD_STYLE }}>
            <CardContent style={{ ...CARD_PAD }}>
              <CombatRadarChart ratings={ratings} />
            </CardContent>
          </Card>

        </div>
      )}

    </div>
  );
}
