/**
 * RosterListBlock
 *
 * Renders the `/rosters/` directory listing, grouped by faction.
 * Clicking a roster name injects "load roster <name>" into the command bar.
 *
 * result_type: "roster_list"
 * data: { rosters: { "<faction-slug>": { "<name>": rosterObj } }, count: number }
 */

import { labelify } from "@/lib/vfs";

// ─── Colour palette (mirrors TerminalBlock C constants) ─────────────────────
const C = {
  green:  "var(--ct-primary)",
  mid:    "var(--ct-primary-mid)",
  label:  "var(--ct-primary-label)",
  dim:    "var(--ct-primary-dim)",
  amber:  "#ffa328",
  cyan:   "#00e5ff",
  border: "var(--ct-border)",
  panel:  "var(--ct-bg-panel)",
};

export function RosterListBlock({ data, onInject }) {
  const { rosters = {}, count = 0, prompt } = data;
  const factions = Object.keys(rosters).sort();

  if (count === 0) {
    return (
      <div className="font-mono" style={{ paddingLeft: "18px", fontSize: "14px" }}>
        <div style={{ color: C.dim }}>
          No rosters saved.  Paste roster text and type{" "}
          <span
            style={{ color: C.cyan, cursor: "pointer", userSelect: "none" }}
            onClick={() => onInject?.("upload roster")}
          >
            upload roster
          </span>
          {" "}to save your first roster.
        </div>
      </div>
    );
  }

  // Build a flat numbered list for selection by number
  let globalIdx = 0;
  const flatRosters = [];

  return (
    <div className="font-mono" style={{ paddingLeft: "18px", fontSize: "14px" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "baseline", gap: "12px", marginBottom: "6px" }}>
        <span style={{ color: C.green, fontWeight: 700, letterSpacing: "0.08em" }}>
          ROSTERS
        </span>
        <span style={{ color: C.dim, fontSize: "12px" }}>
          /rosters/  ·  {count} saved
        </span>
      </div>

      <div style={{ color: C.border, marginBottom: "10px" }}>{"─".repeat(52)}</div>

      {/* Faction groups */}
      {factions.map(faction => {
        const factionRosters = Object.keys(rosters[faction] || {}).sort();

        return (
          <div key={faction} style={{ marginBottom: "12px" }}>
            {/* Faction header */}
            <div style={{
              color:         C.amber,
              fontWeight:    700,
              fontSize:      "12px",
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              marginBottom:  "4px",
            }}>
              [{labelify(faction)}]
            </div>

            {/* Roster entries */}
            {factionRosters.map(name => {
              globalIdx++;
              const n     = globalIdx;
              const roster = rosters[faction][name];

              flatRosters.push({ faction, name });

              return (
                <div
                  key={name}
                  onClick={() => onInject?.(`load roster ${name}`)}
                  style={{
                    display:    "flex",
                    alignItems: "baseline",
                    gap:        "10px",
                    lineHeight: "1.9",
                    cursor:     "pointer",
                    userSelect: "none",
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.querySelector(".roster-name").style.color = C.green;
                    e.currentTarget.querySelector(".roster-num").style.color  = C.green;
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.querySelector(".roster-name").style.color = C.mid;
                    e.currentTarget.querySelector(".roster-num").style.color  = C.dim;
                  }}
                >
                  <span
                    className="roster-num"
                    style={{ color: C.dim, minWidth: "20px", textAlign: "right", flexShrink: 0 }}
                  >
                    {n}.
                  </span>
                  <span
                    className="roster-name"
                    style={{ color: C.mid, flex: 1 }}
                  >
                    {name}
                  </span>
                  {roster?.updated_at && (
                    <span style={{ color: C.dim, fontSize: "11px" }}>
                      {new Date(roster.updated_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}

      {/* Footer prompt */}
      <div style={{ color: C.border, marginTop: "4px", marginBottom: "8px" }}>{"─".repeat(52)}</div>
      <div style={{ color: C.label, fontSize: "13px" }}>
        {prompt || "Select a roster — type a number, a name, or click to load."}
      </div>

    </div>
  );
}
