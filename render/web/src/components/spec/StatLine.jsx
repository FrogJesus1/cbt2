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
      padding:     "13px 4px",
      borderRight: isLast ? "none" : `1px solid ${C.border}`,
    }}>
      <div style={{
        color:         C.label,
        fontSize:      "10px",
        fontWeight:    700,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
      }}>
        {statKey}
      </div>
      <div style={{
        color:      C.green,
        fontSize:   "28px",
        fontWeight: 700,
        fontFamily: "'Chakra Petch', 'IBM Plex Mono', monospace",
        lineHeight: 1,
        marginTop:  "6px",
        textShadow: `0 0 8px color-mix(in srgb, ${C.green} 31%, transparent)`,
      }}>
        {value !== undefined && value !== null ? String(value) : "—"}
      </div>
    </div>
  );
}

// ─── Rating display ───────────────────────────────────────────────────────

// Mockup palette: Durability cyan · Mobility green · Obj Control gold ·
// Firepower red · Melee orange. Themeable vars where a semantic token exists.
const RATING_ORDER = ["durability", "mobility", "obj_control", "firepower", "melee_threat"];
const RATING_META  = {
  durability:   { label: "Durability",  color: "var(--ct-bar-alt)" },  // cyan
  mobility:     { label: "Mobility",    color: "var(--ct-primary)" },  // green
  obj_control:  { label: "Obj Control", color: "var(--ct-accent)"  },  // gold
  firepower:    { label: "Firepower",   color: "var(--ct-danger)"  },  // red
  melee_threat: { label: "Melee",       color: "#ff8a3d" },            // orange
};

function RatingRow({ ratingKey, data }) {
  const meta  = RATING_META[ratingKey];
  const score = data?.score ?? 0;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
        <span style={{ color: C.bodyDim, fontSize: "11px", letterSpacing: "0.04em" }}>
          {meta.label}
        </span>
        <span style={{ color: meta.color, fontSize: "11px", fontWeight: 700 }}>
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
    // Wraps when the column is narrow (e.g. the datasheet tab, where the 190px ★
    // rail eats width) — ratings/radar drop below instead of squeezing the table.
    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "flex-start" }}>

      {/* Left card: stat boxes + weapons table */}
      <Card style={{ ...CARD_STYLE, flex: "1 1 340px", minWidth: 0 }}>
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
        <div style={{ flex: "1 1 270px", minWidth: 0, display: "flex", flexDirection: "column", gap: "6px" }}>

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
