/**
 * RoleAssignBlock
 *
 * Shown after "load roster <name>" resolves a roster — asks whether to assign
 * it as the Player roster or the Enemy roster.
 *
 * result_type: "role_assign"
 * data: { name, faction, path }
 */

import { labelify } from "@/lib/vfs";

const C = {
  green:  "var(--ct-primary)",
  mid:    "var(--ct-primary-mid)",
  label:  "var(--ct-primary-label)",
  dim:    "var(--ct-primary-dim)",
  amber:  "#ffa328",
  cyan:   "#00e5ff",
  border: "var(--ct-border)",
};

const ROLES = [
  {
    key:   "player",
    label: "Player",
    desc:  "Your own army — used as the attacker in combat calculations",
    cmd:   (name) => `set roster player ${name}`,
  },
  {
    key:   "enemy",
    label: "Enemy",
    desc:  "Opponent's army — sets the active enemy faction for this session",
    cmd:   (name) => `set roster enemy ${name}`,
  },
];

export function RoleAssignBlock({ data, onInject }) {
  const { name, faction, path } = data;

  return (
    <div className="font-mono" style={{ paddingLeft: "18px", fontSize: "14px" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "baseline", gap: "10px", marginBottom: "4px" }}>
        <span style={{ color: C.green, fontWeight: 700 }}>LOAD ROSTER</span>
        <span style={{ color: C.amber }}>{name}</span>
      </div>
      {faction && (
        <div style={{ color: C.dim, fontSize: "12px", marginBottom: "8px" }}>
          {path || `/rosters/${faction}/${name}`}
        </div>
      )}

      <div style={{ color: C.border, marginBottom: "10px" }}>{"─".repeat(52)}</div>

      <div style={{ color: C.label, marginBottom: "8px" }}>
        Assign this roster as:
      </div>

      {ROLES.map((role, i) => (
        <div
          key={role.key}
          onClick={() => onInject?.(role.cmd(name))}
          style={{
            display:    "flex",
            gap:        "10px",
            alignItems: "baseline",
            lineHeight: "2.0",
            cursor:     "pointer",
            userSelect: "none",
          }}
          onMouseEnter={e => {
            e.currentTarget.querySelector(".role-label").style.color = C.green;
            e.currentTarget.querySelector(".role-num").style.color   = C.green;
          }}
          onMouseLeave={e => {
            e.currentTarget.querySelector(".role-label").style.color = C.mid;
            e.currentTarget.querySelector(".role-num").style.color   = C.dim;
          }}
        >
          <span
            className="role-num"
            style={{ color: C.dim, minWidth: "20px", textAlign: "right", flexShrink: 0 }}
          >
            {i + 1}.
          </span>
          <span
            className="role-label"
            style={{ color: C.mid, minWidth: "8ch", fontWeight: 700 }}
          >
            {role.label}
          </span>
          <span style={{ color: C.dim, fontSize: "12px" }}>
            {role.desc}
          </span>
        </div>
      ))}

      <div style={{ color: C.border, marginTop: "8px" }}>{"─".repeat(52)}</div>
      <div style={{ color: C.label, fontSize: "12px", marginTop: "6px" }}>
        Click a role or type its number.
      </div>
    </div>
  );
}
