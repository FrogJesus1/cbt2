/**
 * TargetingOutcome
 *
 * Per-weapon probability bar chart — the "math output" companion to WeaponStatsTable.
 * Shows four metrics for each weapon:
 *   Hit%   — probability of hitting per attack
 *   Wound% — probability of wounding given a hit
 *   Kill%  — probability of an unsaved wound (fail-save prob)
 *   Dmg    — expected damage output
 *
 * Weapons are grouped into Ranged and Melee sections.
 *
 * Props:
 *   weapons — full weapons array from combat engine response
 *             Each entry may have: hit_pct, wound_pct, kill_pct, dmg
 */

import { Card, CardContent } from "@/components/ui/card";
import { C, CARD_STYLE, CARD_PAD, fmt, fmtPct, SectionTitle, Bar } from "./shared";

// ─── Single weapon outcome row ─────────────────────────────────────────────

function OutcomeRow({ w, maxDmg }) {
  const hasData = w.hit_pct != null || w.wound_pct != null || w.kill_pct != null || w.dmg != null;
  if (!hasData) return null;

  // Cumulative per-attack efficiency: hit × wound × failsave chain, expressed as %
  const eff = (w.hit_pct != null && w.wound_pct != null && w.kill_pct != null)
    ? (w.hit_pct / 100) * (w.wound_pct / 100) * (w.kill_pct / 100) * 100
    : null;

  return (
    <div style={{ marginBottom: "10px" }}>
      {/* Weapon name header */}
      <div style={{
        color:         C.mid,
        fontSize:      "11px",
        fontWeight:    600,
        marginBottom:  "4px",
        letterSpacing: "0.03em",
      }}>
        {w.name}
      </div>

      {/* Metric rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>

        {w.hit_pct != null && (
          <MetricRow
            label="Hit%"
            value={w.hit_pct}
            max={100}
            display={fmtPct(w.hit_pct)}
            color={C.green}
          />
        )}

        {w.wound_pct != null && (
          <MetricRow
            label="Wound%"
            value={w.wound_pct}
            max={100}
            display={fmtPct(w.wound_pct)}
            color={C.yellow}
          />
        )}

        {w.kill_pct != null && (
          <MetricRow
            label="Failsave%"
            value={w.kill_pct}
            max={100}
            display={fmtPct(w.kill_pct)}
            color={C.red}
          />
        )}

        {eff != null && (
          <MetricRow
            label="Eff%"
            value={eff}
            max={100}
            display={fmtPct(eff)}
            color={C.green}
          />
        )}

        {w.dmg != null && (
          <MetricRow
            label="Dmg"
            value={w.dmg}
            max={maxDmg}
            display={`${fmt(w.dmg)}`}
            color={C.mid}
          />
        )}

        {w.overkill_pct != null && w.overkill_pct > 0 && (
          <MetricRow
            label="Overkill"
            value={w.overkill_pct}
            max={100}
            display={fmtPct(w.overkill_pct)}
            color={C.red}
          />
        )}

      </div>
    </div>
  );
}

// ─── Single metric bar row ─────────────────────────────────────────────────

function MetricRow({ label, value, max, display, color }) {
  return (
    <div style={{
      display:    "grid",
      gridTemplateColumns: "60px 1fr 44px",
      alignItems: "center",
      gap:        "6px",
      lineHeight: "1",
    }}>
      <span style={{
        color:         C.dim,
        fontSize:      "10px",
        letterSpacing: "0.06em",
        textAlign:     "right",
        whiteSpace:    "nowrap",
      }}>
        {label}
      </span>
      <Bar value={value} max={max} color={color} segments={14} />
      <span style={{
        color:      color,
        fontSize:   "10px",
        fontWeight: 600,
        textAlign:  "right",
        whiteSpace: "nowrap",
      }}>
        {display}
      </span>
    </div>
  );
}

// ─── Section divider ───────────────────────────────────────────────────────

function SectionLabel({ title }) {
  return (
    <div style={{
      display:       "flex",
      alignItems:    "center",
      gap:           "8px",
      marginBottom:  "8px",
      marginTop:     "4px",
    }}>
      <span style={{
        color:         C.dim,
        fontSize:      "10px",
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        fontWeight:    600,
        flexShrink:    0,
      }}>
        {title}
      </span>
      <div style={{ flex: 1, height: "1px", background: C.border }} />
    </div>
  );
}

// ─── TargetingOutcome ──────────────────────────────────────────────────────

export function TargetingOutcome({ weapons = [] }) {
  const ranged = weapons.filter(w => w.type !== "melee" && (
    w.hit_pct != null || w.wound_pct != null || w.kill_pct != null || w.dmg != null
  ));
  const melee = weapons.filter(w => w.type === "melee" && (
    w.hit_pct != null || w.wound_pct != null || w.kill_pct != null || w.dmg != null
  ));

  if (!ranged.length && !melee.length) return null;

  // Scale the Dmg bar to the highest damage weapon + a small ceiling
  const maxDmg = Math.max(1, ...weapons.map(w => w.dmg ?? 0)) * 1.1;

  return (
    <Card style={CARD_STYLE}>
      <CardContent style={CARD_PAD}>
        <SectionTitle>Weapon Platforms</SectionTitle>

        {ranged.length > 0 && (
          <>
            <SectionLabel title="Ranged" />
            {ranged.map((w, i) => (
              <OutcomeRow key={i} w={w} maxDmg={maxDmg} />
            ))}
          </>
        )}

        {melee.length > 0 && (
          <>
            <SectionLabel title="Melee" />
            {melee.map((w, i) => (
              <OutcomeRow key={i} w={w} maxDmg={maxDmg} />
            ))}
          </>
        )}
      </CardContent>
    </Card>
  );
}
