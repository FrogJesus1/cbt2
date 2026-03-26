/**
 * RosterUploadBlock
 *
 * Renders the "roster saved" confirmation after a successful upload.
 * Also shown when the user is prompted to enter faction / name during the flow.
 *
 * result_type: "roster_saved"
 * data: { name, faction, path, size }
 *
 * result_type: "roster_prompt"
 * data: { message, hint? }
 */

const C = {
  green:  "var(--ct-primary)",
  mid:    "var(--ct-primary-mid)",
  label:  "var(--ct-primary-label)",
  dim:    "var(--ct-primary-dim)",
  amber:  "#ffa328",
  cyan:   "#00e5ff",
  border: "var(--ct-border)",
};

/** Shown when a roster is successfully saved to VFS. */
export function RosterSavedBlock({ data, onInject }) {
  const { name, faction, path, size } = data;

  return (
    <div className="font-mono" style={{ paddingLeft: "18px", fontSize: "14px" }}>
      <div style={{
        border:    `1px solid ${C.green}35`,
        background: "#020d02",
        padding:   "10px 15px",
        display:   "flex",
        flexDirection: "column",
        gap:       "5px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ color: C.green }}>✓</span>
          <span style={{ color: C.green, fontWeight: 700 }}>ROSTER SAVED</span>
        </div>
        <div style={{ color: C.mid, paddingLeft: "16px" }}>
          {path || `/rosters/${faction}/${name}`}
        </div>
        {size !== undefined && (
          <div style={{ color: C.dim, paddingLeft: "16px", fontSize: "12px" }}>
            {size} chars
          </div>
        )}
      </div>

      <div style={{ marginTop: "8px", display: "flex", gap: "14px" }}>
        <span
          onClick={() => onInject?.(`load roster ${name}`)}
          style={{ color: C.cyan, cursor: "pointer", userSelect: "none" }}
          onMouseEnter={e => e.currentTarget.style.color = C.green}
          onMouseLeave={e => e.currentTarget.style.color = C.cyan}
        >
          load roster {name}
        </span>
        <span
          onClick={() => onInject?.("rosters")}
          style={{ color: C.dim, cursor: "pointer", userSelect: "none" }}
          onMouseEnter={e => e.currentTarget.style.color = C.mid}
          onMouseLeave={e => e.currentTarget.style.color = C.dim}
        >
          rosters
        </span>
      </div>
    </div>
  );
}

/** Shown as a prompt step during multi-step flows (upload, rename, new campaign). */
export function RosterPromptBlock({ data }) {
  const { message, hint } = data;

  return (
    <div className="font-mono" style={{ paddingLeft: "18px", fontSize: "14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
        <span style={{ color: C.amber }}>›</span>
        <span style={{ color: C.label }}>{message}</span>
      </div>
      {hint && (
        <div style={{ color: C.dim, fontSize: "12px", paddingLeft: "18px" }}>
          {hint}
        </div>
      )}
    </div>
  );
}

/** Active session roster status pill — shows which rosters are loaded. */
export function ActiveRosterStatus({ player, enemy, onInject }) {
  if (!player && !enemy) return null;

  return (
    <div
      className="font-mono"
      style={{
        display:       "flex",
        gap:           "12px",
        fontSize:      "12px",
        color:         "var(--ct-primary-dim)",
        flexWrap:      "wrap",
      }}
    >
      {player && (
        <span
          onClick={() => onInject?.("rosters")}
          style={{ cursor: "pointer", userSelect: "none" }}
          title={`Player roster: ${player.name}`}
        >
          <span style={{ color: "var(--ct-primary)", marginRight: "4px" }}>▶</span>
          {player.name}
        </span>
      )}
      {enemy && (
        <span
          onClick={() => onInject?.("rosters")}
          style={{ cursor: "pointer", userSelect: "none" }}
          title={`Enemy roster: ${enemy.name}`}
        >
          <span style={{ color: "#ff3b3b", marginRight: "4px" }}>▶</span>
          {enemy.name}
        </span>
      )}
    </div>
  );
}
