/**
 * HeroTiles
 *
 * The 4-tile metric strip at the top of a combat result:
 *   Total Dmg (green) · Models Slain (white) · Squad Wipe % (gold) · Swing (dim)
 *
 * Reads the (already weapon-toggle-adjusted) ranged/melee summaries + def_models.
 * Numbers are derived client-side from values the server already sent — no new
 * engine fields. Squad-wipe and swing are taken as the max across phases (they
 * can't be faithfully recombined from per-phase summaries; documented).
 *
 * Props: ranged, melee (summary objects | null), def_models (number)
 */

import { C } from "./shared";

function num(v, dec = 1) {
  if (v === null || v === undefined) return "—";
  const n = Number(v);
  return dec === 0 ? String(Math.round(n)) : n.toFixed(dec);
}

function Tile({ label, value, color, glow }) {
  return (
    <div style={{
      background:   C.panel,
      border:       `1px solid ${C.border}`,
      borderRadius: "5px",
      padding:      "10px 12px",
      minWidth:     0,
    }}>
      <div className="ct-display" style={{ color: C.dim, fontSize: "9px", letterSpacing: "0.1em" }}>
        {label}
      </div>
      <div
        className="ct-display"
        style={{
          color:        color,
          fontSize:     "23px",
          fontWeight:   700,
          lineHeight:   1.1,
          marginTop:    "3px",
          letterSpacing: "0.02em",
          textShadow:   glow ? `0 0 10px ${color}55` : "none",
        }}
      >
        {value}
      </div>
    </div>
  );
}

export function HeroTiles({ ranged, melee, def_models }) {
  const r = ranged || {};
  const m = melee || {};

  const totalDmg = (r.expected_dmg ?? 0) + (m.expected_dmg ?? 0);

  let slain = (r.expected_kills ?? 0) + (m.expected_kills ?? 0);
  if (def_models != null) slain = Math.min(slain, def_models);

  const wipeVals = [r.squad_wipe_pct, m.squad_wipe_pct].filter(v => v != null);
  const squadWipe = wipeVals.length ? Math.max(...wipeVals) : null;

  const swingVals = [r.swinginess, m.swinginess].filter(v => v != null);
  const swing = swingVals.length ? Math.max(...swingVals) : null;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px" }}>
      <Tile label="Total Dmg"    value={num(totalDmg, 1)} color={C.green}  glow />
      <Tile label="Models Slain" value={num(slain, 1)}    color={C.text} />
      <Tile label="Squad Wipe"   value={squadWipe == null ? "—" : `${num(squadWipe, 0)}%`} color={C.accent} />
      <Tile label="Swing"        value={num(swing, 2)}    color={C.dim} />
    </div>
  );
}
