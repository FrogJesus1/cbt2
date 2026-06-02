/**
 * RosterActionBlock
 *
 * Shown after a roster is selected — presents Load / Rename / Edit / Delete actions.
 * Each action click injects the appropriate command.
 *
 * result_type: "roster_action"
 * data: { name, faction, path }
 */

import { labelify } from "@/lib/vfs";

import { C } from "../shared/colors";

const ACTIONS = [
  {
    key:     "load",
    label:   "Load",
    color:   "green",
    desc:    "Load this roster and assign a role (Player / Enemy)",
    cmd:     (name) => `load roster ${name}`,
  },
  {
    key:     "rename",
    label:   "Rename",
    color:   "mid",
    desc:    "Give this roster a new name",
    cmd:     (name) => `rename roster ${name}`,
  },
  {
    key:     "edit",
    label:   "Edit",
    color:   "mid",
    desc:    "Paste updated roster text to overwrite",
    cmd:     (name) => `edit roster ${name}`,
  },
  {
    key:     "delete",
    label:   "Delete",
    color:   "red",
    desc:    "Permanently remove this roster from storage",
    cmd:     (name) => `delete roster ${name}`,
  },
];

export function RosterActionBlock({ data, onInject }) {
  const { name, faction, path } = data;
  const factionLabel = labelify(faction);

  return (
    <div className="font-mono" style={{ paddingLeft: "18px", fontSize: "14px" }}>

      {/* Path header */}
      <div style={{ display: "flex", alignItems: "baseline", gap: "10px", marginBottom: "6px" }}>
        <span style={{ color: C.green, fontWeight: 700 }}>{name}</span>
        <span style={{ color: C.dim, fontSize: "12px" }}>
          {path || `/rosters/${faction}/${name}`}
        </span>
      </div>
      {factionLabel && (
        <div style={{ color: C.amber, fontSize: "12px", marginBottom: "8px" }}>
          {factionLabel}
        </div>
      )}

      <div style={{ color: C.border, marginBottom: "10px" }}>{"─".repeat(52)}</div>

      {/* Action menu */}
      <div style={{ marginBottom: "8px", color: C.label, fontSize: "13px" }}>
        What would you like to do?
      </div>

      {ACTIONS.map((action, i) => {
        const textColor = action.color === "green" ? C.green
                        : action.color === "red"   ? C.red
                        :                            C.mid;

        return (
          <div
            key={action.key}
            onClick={() => onInject?.(action.cmd(name))}
            style={{
              display:    "flex",
              gap:        "10px",
              alignItems: "baseline",
              lineHeight: "1.9",
              cursor:     "pointer",
              userSelect: "none",
            }}
            onMouseEnter={e => {
              e.currentTarget.querySelector(".action-label").style.color = C.green;
              e.currentTarget.querySelector(".action-num").style.color   = C.green;
            }}
            onMouseLeave={e => {
              e.currentTarget.querySelector(".action-label").style.color = textColor;
              e.currentTarget.querySelector(".action-num").style.color   = C.dim;
            }}
          >
            <span
              className="action-num"
              style={{ color: C.dim, minWidth: "20px", textAlign: "right", flexShrink: 0 }}
            >
              {i + 1}.
            </span>
            <span
              className="action-label"
              style={{ color: textColor, minWidth: "8ch", fontWeight: action.key === "load" ? 700 : 400 }}
            >
              {action.label}
            </span>
            <span style={{ color: C.dim, fontSize: "12px" }}>
              {action.desc}
            </span>
          </div>
        );
      })}

      <div style={{ color: C.border, marginTop: "8px" }}>{"─".repeat(52)}</div>
      <div style={{ color: C.label, fontSize: "12px", marginTop: "6px" }}>
        Click an action or type its number.
      </div>
    </div>
  );
}
