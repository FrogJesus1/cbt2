/**
 * CampaignListBlock
 *
 * Renders the /campaigns/ directory — a list of all saved campaigns.
 * Clicking a campaign injects "load campaign <name>".
 *
 * result_type: "campaign_list"
 * data: { campaigns: { "<name>": campaignObj }, count: number }
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

export function CampaignListBlock({ data, onInject }) {
  const { campaigns = {}, count = 0 } = data;
  const names = Object.keys(campaigns).sort();

  if (count === 0) {
    return (
      <div className="font-mono" style={{ paddingLeft: "18px", fontSize: "14px" }}>
        <div style={{ color: C.dim }}>
          No campaigns saved.  Type{" "}
          <span
            style={{ color: C.cyan, cursor: "pointer", userSelect: "none" }}
            onClick={() => onInject?.("new campaign")}
          >
            new campaign
          </span>
          {" "}to create one.
        </div>
      </div>
    );
  }

  return (
    <div className="font-mono" style={{ paddingLeft: "18px", fontSize: "14px" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "baseline", gap: "12px", marginBottom: "6px" }}>
        <span style={{ color: C.green, fontWeight: 700, letterSpacing: "0.08em" }}>
          CAMPAIGNS
        </span>
        <span style={{ color: C.dim, fontSize: "12px" }}>
          /campaigns/  ·  {count} saved
        </span>
      </div>

      <div style={{ color: C.border, marginBottom: "10px" }}>{"─".repeat(52)}</div>

      {/* Campaign rows */}
      {names.map((name, i) => {
        const camp  = campaigns[name];
        const state = camp?.state || {};
        const turn  = state.turn ?? 1;
        const pw    = state.player_wins ?? 0;
        const ew    = state.enemy_wins  ?? 0;

        return (
          <div
            key={name}
            onClick={() => onInject?.(`load campaign ${name}`)}
            style={{
              display:    "flex",
              gap:        "10px",
              alignItems: "baseline",
              lineHeight: "2.0",
              cursor:     "pointer",
              userSelect: "none",
            }}
            onMouseEnter={e => {
              e.currentTarget.querySelector(".camp-name").style.color = C.green;
              e.currentTarget.querySelector(".camp-num").style.color  = C.green;
            }}
            onMouseLeave={e => {
              e.currentTarget.querySelector(".camp-name").style.color = C.mid;
              e.currentTarget.querySelector(".camp-num").style.color  = C.dim;
            }}
          >
            <span
              className="camp-num"
              style={{ color: C.dim, minWidth: "20px", textAlign: "right", flexShrink: 0 }}
            >
              {i + 1}.
            </span>
            <span
              className="camp-name"
              style={{ color: C.mid, flex: 1, fontWeight: 700 }}
            >
              {name}
            </span>
            <span style={{ color: C.amber, fontSize: "12px", minWidth: "12ch" }}>
              Turn {turn}
            </span>
            <span style={{ color: C.dim, fontSize: "11px" }}>
              {pw}W – {ew}L
            </span>
          </div>
        );
      })}

      <div style={{ color: C.border, marginTop: "6px", marginBottom: "8px" }}>{"─".repeat(52)}</div>

      {/* Actions footer */}
      <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
        <span
          onClick={() => onInject?.("new campaign")}
          style={{ color: C.cyan, fontSize: "13px", cursor: "pointer", userSelect: "none" }}
          onMouseEnter={e => e.currentTarget.style.color = C.green}
          onMouseLeave={e => e.currentTarget.style.color = C.cyan}
        >
          + new campaign
        </span>
        <span style={{ color: C.dim, fontSize: "13px" }}>
          Click a campaign or type its number to load.
        </span>
      </div>
    </div>
  );
}
