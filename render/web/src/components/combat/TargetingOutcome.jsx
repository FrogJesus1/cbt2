/**
 * TargetingOutcome
 *
 * Per-weapon probability cards in a 2-column grid. Each weapon shows three
 * solid bars: HIT (green) / WOUND (gold) / UNSAVED (red), matching the redesign.
 *   HIT     = hit_pct      (P hit per attack)
 *   WOUND   = wound_pct    (P wound given hit)
 *   UNSAVED = kill_pct     (P fail save given wound)
 *
 * Props: weapons[] — each may carry hit_pct, wound_pct, kill_pct, type, _drone
 */

import { C, SectionHeader, Bar } from "./shared";

function Row({ label, value, color }) {
  if (value == null) return null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "58px 1fr 34px", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
      <span className="ct-display" style={{ color: C.dim, fontSize: "8px", letterSpacing: "0.08em", textAlign: "right" }}>{label}</span>
      <Bar pct={value} color={color} solid height={6} />
      <span style={{ color, fontSize: "9px", fontWeight: 600, textAlign: "right" }}>{Math.round(value)}%</span>
    </div>
  );
}

function WeaponCard({ w }) {
  const isMelee = w.type === "melee";
  const nameColor = w._drone ? C.cyan : C.text;
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: "5px", padding: "10px 12px", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "8px", marginBottom: "9px" }}>
        <span style={{ color: nameColor, fontSize: "11px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {w.name}
        </span>
        <span className="ct-display" style={{ color: C.dim, fontSize: "8px", letterSpacing: "0.08em", flexShrink: 0 }}>
          {isMelee ? "MELEE" : "RANGED"}
        </span>
      </div>
      <Row label="HIT"     value={w.hit_pct}   color={C.green} />
      <Row label="WOUND"   value={w.wound_pct} color={C.accent} />
      <Row label="UNSAVED" value={w.kill_pct}  color={C.danger} />
    </div>
  );
}

export function TargetingOutcome({ weapons = [] }) {
  const shown = weapons.filter(w =>
    w.hit_pct != null || w.wound_pct != null || w.kill_pct != null
  );
  if (!shown.length) return null;

  return (
    <div>
      <SectionHeader>Targeting Outcome</SectionHeader>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "8px" }}>
        {shown.map((w, i) => <WeaponCard key={i} w={w} />)}
      </div>
    </div>
  );
}
