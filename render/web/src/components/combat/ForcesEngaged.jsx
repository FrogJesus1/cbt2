/**
 * ForcesEngaged
 *
 * Two-column roster summary under the hero tiles:
 *   left  — attacker unit (+ leader chip if attached) + per-weapon summary lines
 *   right — target unit + stat line (T / SV / W / INV) + model count
 *
 * Replaces the old inline CalcList. Attacker/leader split is parsed from the
 * combined display name ("Unit + Leader"). Target stats come from target_profile
 * (T/Sv/W/invuln) surfaced by the engine; def_models gives the squad size.
 *
 * Props: attacker_name, defender_name, weapons[], target_profile, att_models,
 *        def_models, footer
 */

import { C, SectionHeader } from "./shared";

function StatBox({ label, value }) {
  return (
    <div style={{
      flex: "1 1 0", minWidth: 0, textAlign: "center",
      background: C.bgDark, border: `1px solid ${C.border}`, borderRadius: "4px", padding: "6px 4px",
    }}>
      <div className="ct-display" style={{ color: C.dim, fontSize: "8px", letterSpacing: "0.08em" }}>{label}</div>
      <div className="ct-display" style={{ color: C.text, fontSize: "15px", fontWeight: 600, marginTop: "1px" }}>{value}</div>
    </div>
  );
}

function WeaponLine({ w }) {
  const isMelee = w.type === "melee";
  const shotVal = w.shots != null ? w.shots : "?";
  const unit = isMelee ? (shotVal === 1 ? "attack" : "attacks") : (shotVal === 1 ? "shot" : "shots");
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: "7px", lineHeight: 1.7 }}>
      <span style={{ color: C.border, fontSize: "11px", flexShrink: 0 }}>↳</span>
      <span style={{ color: C.textMid, fontSize: "11px", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {w.name}
      </span>
      <span style={{ color: C.dim, fontSize: "10px", flexShrink: 0, whiteSpace: "nowrap" }}>{shotVal} {unit}</span>
      <span style={{ color: isMelee ? C.accent : C.dim, fontSize: "9px", flexShrink: 0, border: `1px solid ${C.border}`, borderRadius: "3px", padding: "0 4px" }}>
        {isMelee ? "melee" : "ranged"}
      </span>
    </div>
  );
}

function Panel({ children, accent }) {
  return (
    <div style={{
      flex: "1 1 240px", minWidth: 0,
      background: C.panel, border: `1px solid ${C.border}`, borderRadius: "5px",
      borderTop: `2px solid ${accent}`, padding: "11px 13px",
    }}>
      {children}
    </div>
  );
}

export function ForcesEngaged({
  attacker_name = "", defender_name = "",
  weapons = [], target_profile, att_models, def_models, footer,
}) {
  // Split "Unit + Leader" → unit + leader
  const [attUnit, ...attRest] = attacker_name.split(" + ");
  const leader = attRest.join(" + ") || null;

  const ranged = weapons.filter(w => w.type !== "melee");
  const melee  = weapons.filter(w => w.type === "melee");
  const ordered = [...ranged, ...melee];

  const tp = target_profile || {};
  const stats = [];
  if (tp.toughness != null) stats.push({ label: "T",   value: tp.toughness });
  if (tp.save != null)      stats.push({ label: "SV",  value: `${tp.save}+` });
  if (tp.wounds != null)    stats.push({ label: "W",   value: tp.wounds });
  if (tp.invuln != null && tp.invuln <= 6) stats.push({ label: "INV", value: `${tp.invuln}+` });

  return (
    <div>
      <SectionHeader>Forces Engaged</SectionHeader>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "stretch" }}>

        {/* Attacker */}
        <Panel accent={C.green}>
          <div style={{ display: "flex", alignItems: "baseline", gap: "8px", flexWrap: "wrap" }}>
            <span style={{ color: C.green, fontSize: "13px", fontWeight: 600 }}>{attUnit || "—"}</span>
            {att_models != null && <span style={{ color: C.dim, fontSize: "10px" }}>×{att_models}</span>}
          </div>
          {leader && (
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "4px" }}>
              <span className="ct-display" style={{ color: C.cyan, fontSize: "8px", letterSpacing: "0.1em", border: `1px solid ${C.cyan}55`, borderRadius: "3px", padding: "1px 5px" }}>
                LEADER
              </span>
              <span style={{ color: C.cyan, fontSize: "12px" }}>{leader}</span>
            </div>
          )}
          <div style={{ marginTop: "8px", borderTop: `1px solid ${C.border}`, paddingTop: "6px" }}>
            {ordered.length
              ? ordered.map((w, i) => <WeaponLine key={i} w={w} />)
              : <span style={{ color: C.dim, fontSize: "11px", fontStyle: "italic" }}>No active weapons.</span>}
          </div>
        </Panel>

        {/* Target */}
        <Panel accent={C.accent}>
          <div style={{ display: "flex", alignItems: "baseline", gap: "8px", flexWrap: "wrap" }}>
            <span style={{ color: C.accent, fontSize: "13px", fontWeight: 600 }}>{defender_name || "—"}</span>
            {def_models != null && <span style={{ color: C.dim, fontSize: "10px" }}>×{def_models}</span>}
          </div>
          {stats.length > 0 && (
            <div style={{ display: "flex", gap: "5px", marginTop: "10px" }}>
              {stats.map((s, i) => <StatBox key={i} label={s.label} value={s.value} />)}
            </div>
          )}
        </Panel>

      </div>
    </div>
  );
}
