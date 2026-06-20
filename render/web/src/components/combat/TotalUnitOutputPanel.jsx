/**
 * TotalUnitOutputPanel
 *
 * Aggregate output card for one phase. Redesign layout: a phase dot + label,
 * a big hero damage number, a solid damage bar, then Slain / Kill% / Overkill
 * rows, and a swinginess footer.
 *
 * Pass phase="ranged" (green) or phase="melee" (gold).
 *
 * Props: data (summary | null), maxDmg, phase
 */

import { C, CARD_STYLE, fmt, fmtPct, fmtKills, Bar } from "./shared";

const PHASE = {
  ranged: { title: "Ranged Output", dot: C.green,  empty: "No ranged data." },
  melee:  { title: "Melee Output",  dot: C.accent, empty: "No melee data." },
};

function StatRow({ label, value, color }) {
  if (value === undefined) return null;
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "8px", lineHeight: 1.9 }}>
      <span className="ct-display" style={{ color: C.dim, fontSize: "8px", letterSpacing: "0.08em" }}>{label}</span>
      <span style={{ color: color || C.textMid, fontSize: "11px", fontWeight: 600 }}>{value}</span>
    </div>
  );
}

export function TotalUnitOutputPanel({ data, maxDmg = 10, phase = "ranged" }) {
  const cfg = PHASE[phase] || PHASE.ranged;

  const card = { ...CARD_STYLE, padding: "12px 14px", flex: "1 1 220px", minWidth: 0 };

  if (!data) {
    return (
      <div style={card}>
        <Header cfg={cfg} />
        <div style={{ color: C.dim, fontSize: "12px", fontStyle: "italic" }}>{cfg.empty}</div>
      </div>
    );
  }

  const { expected_dmg, expected_kills, kill_chance_pct, overkill_waste_pct, swinginess, swinginess_label } = data;

  return (
    <div style={card}>
      <Header cfg={cfg} />

      {/* hero damage number */}
      <div style={{ display: "flex", alignItems: "baseline", gap: "6px", margin: "2px 0 9px" }}>
        <span className="ct-display" style={{ color: cfg.dot, fontSize: "26px", fontWeight: 700, lineHeight: 1, textShadow: `0 0 10px color-mix(in srgb, ${cfg.dot} 27%, transparent)` }}>
          {fmt(expected_dmg)}
        </span>
        <span style={{ color: C.dim, fontSize: "10px" }}>dmg</span>
      </div>
      <Bar pct={Math.min(100, ((expected_dmg ?? 0) / Math.max(1, maxDmg)) * 100)} color={cfg.dot} solid height={6} />

      {/* stat rows */}
      <div style={{ marginTop: "10px", borderTop: `1px solid ${C.border}`, paddingTop: "6px" }}>
        <StatRow label="Models Slain" value={expected_kills != null ? fmtKills(expected_kills) : undefined} color={C.text} />
        <StatRow label="Kill Chance"  value={kill_chance_pct != null ? fmtPct(kill_chance_pct) : undefined} color={C.danger} />
        <StatRow label="Overkill"     value={overkill_waste_pct != null ? fmtPct(overkill_waste_pct) : undefined} color={C.danger} />
      </div>

      {/* swinginess footer */}
      {swinginess != null && (
        <div style={{ marginTop: "8px", paddingTop: "7px", borderTop: `1px solid ${C.border}`, display: "flex", alignItems: "baseline", gap: "8px" }}>
          <span className="ct-display" style={{ color: C.dim, fontSize: "8px", letterSpacing: "0.1em" }}>Swinginess</span>
          <span style={{ color: C.accent, fontSize: "14px", fontWeight: 700 }}>{Number(swinginess).toFixed(2)}</span>
          {swinginess_label && <span style={{ color: C.accent, opacity: 0.6, fontSize: "10px", fontStyle: "italic" }}>— {swinginess_label}</span>}
        </div>
      )}
    </div>
  );
}

function Header({ cfg }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "8px" }}>
      <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: cfg.dot, boxShadow: `0 0 6px ${cfg.dot}` }} />
      <span className="ct-display" style={{ color: cfg.dot, fontSize: "10px", letterSpacing: "0.12em" }}>{cfg.title}</span>
    </div>
  );
}
