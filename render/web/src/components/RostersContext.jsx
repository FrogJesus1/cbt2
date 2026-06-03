/**
 * RostersContext
 *
 * Dedicated roster management dashboard — replaces the old Campaign tab.
 * Shows session state, player/enemy army panels, saved rosters, and campaigns.
 *
 * No terminal stream — all display data comes from VFS (localStorage) and
 * engine session API.  Actions inject commands into the global command bar
 * via onInject, reusing Terminal.jsx's existing command handlers.
 *
 * Layout:
 *   ┌──────────────────────────────────────────┐
 *   │  SESSION STATE         TURN badge        │
 *   ├───────────────────┬──────────────────────┤
 *   │  PLAYER ARMY      │  ENEMY ARMY          │
 *   │  (loaded roster)  │  (loaded roster)     │
 *   │  [change] [edit]  │  [change] [edit]     │
 *   ├───────────────────┴──────────────────────┤
 *   │  SAVED ROSTERS (grouped by faction)      │
 *   │  [upload roster]                         │
 *   ├──────────────────────────────────────────┤
 *   │  CAMPAIGNS                               │
 *   │  [new campaign]                          │
 *   └──────────────────────────────────────────┘
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  listRosters, listCampaigns, getCampaignCount, getRosterCount,
  labelify,
} from "@/lib/vfs";

// ─── Colour palette ──────────────────────────────────────────────────────────

import { C } from "./shared/colors";

// ─── Divider ─────────────────────────────────────────────────────────────────

function Divider({ width = 56 }) {
  return (
    <div style={{ color: C.border, margin: "8px 0", fontFamily: "monospace", fontSize: "13px" }}>
      {"─".repeat(width)}
    </div>
  );
}

// ─── Clickable chip ──────────────────────────────────────────────────────────

function ActionChip({ label, onClick, color = C.cyan, hoverColor = C.green }) {
  return (
    <span
      onClick={onClick}
      style={{
        color,
        fontSize:      "11px",
        border:        `1px solid ${C.border}`,
        padding:       "2px 8px",
        cursor:        "pointer",
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        userSelect:    "none",
        fontFamily:    "monospace",
        transition:    "color 0.1s, border-color 0.1s",
      }}
      onMouseEnter={e => { e.currentTarget.style.color = hoverColor; e.currentTarget.style.borderColor = hoverColor; }}
      onMouseLeave={e => { e.currentTarget.style.color = color; e.currentTarget.style.borderColor = C.border; }}
    >
      {label}
    </span>
  );
}

// ─── Section header ──────────────────────────────────────────────────────────

function SectionHeader({ title, subtitle, badge, badgeColor = C.green }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      marginBottom: "8px",
    }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
        <span style={{
          color: C.amber, fontWeight: 700, fontSize: "13px",
          textTransform: "uppercase", letterSpacing: "0.1em",
          fontFamily: "monospace",
        }}>
          {title}
        </span>
        {subtitle && (
          <span style={{ color: C.dim, fontSize: "11px", fontFamily: "monospace" }}>
            {subtitle}
          </span>
        )}
      </div>
      {badge !== undefined && (
        <span style={{
          color: badgeColor, fontFamily: "monospace", fontSize: "11px",
          border: `1px solid ${C.border}`, padding: "1px 8px", letterSpacing: "0.12em",
        }}>
          {badge}
        </span>
      )}
    </div>
  );
}

// ─── Army panel (player or enemy) ────────────────────────────────────────────

function ArmyPanel({ roster, side, onInject }) {
  const { name, unit_count = 0, total_points, units = [] } = roster || {};
  const hasUnits = units.length > 0;
  const sideColor = side === "PLAYER" ? C.cyan : C.amber;
  const isEmpty = !hasUnits;

  return (
    <div style={{
      flex: 1, padding: "10px 14px", background: C.panel,
      border: `1px solid ${C.border}`, minWidth: "200px",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
        marginBottom: "8px", paddingBottom: "6px", borderBottom: `1px solid ${C.border}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{
            color: sideColor, fontSize: "9px", letterSpacing: "0.16em",
            textTransform: "uppercase", border: `1px solid ${sideColor}50`,
            padding: "1px 5px", fontFamily: "monospace",
          }}>
            {side}
          </span>
          <span style={{
            color: C.green, fontWeight: 700, fontSize: "13px",
            textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "monospace",
          }}>
            {name || "—"}
          </span>
        </div>
        {hasUnits && (
          <div style={{ display: "flex", gap: "12px", fontSize: "11px", fontFamily: "monospace" }}>
            <span style={{ color: C.dim }}>{unit_count} {unit_count === 1 ? "unit" : "units"}</span>
            {total_points ? <span style={{ color: C.amber }}>{total_points} pts</span> : null}
          </div>
        )}
      </div>

      {/* Unit list */}
      {hasUnits ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          {units.slice(0, 12).map((u, i) => {
            const uname = typeof u === "string" ? u : u.name;
            const upts  = typeof u === "object" ? u.points : null;
            return (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "2px 0" }}>
                <span
                  style={{ color: C.mid, fontSize: "12px", cursor: "pointer", fontFamily: "monospace" }}
                  onClick={() => onInject?.(`spec ${uname}`)}
                >
                  {uname}
                </span>
                {upts ? <span style={{ color: C.dim, fontSize: "11px", fontFamily: "monospace" }}>{upts}</span> : null}
              </div>
            );
          })}
          {units.length > 12 && (
            <span style={{ color: C.dim, fontSize: "11px", marginTop: "4px", fontFamily: "monospace" }}>
              +{units.length - 12} more…
            </span>
          )}
        </div>
      ) : (
        <div style={{ color: C.dim, fontSize: "12px", fontStyle: "italic", fontFamily: "monospace" }}>
          No roster loaded
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: "8px", marginTop: "10px", flexWrap: "wrap" }}>
        {isEmpty ? (
          <ActionChip
            label={`load ${side.toLowerCase()}`}
            onClick={() => onInject?.(`load roster ${side === "PLAYER" ? "my" : "enemy"}`)}
          />
        ) : (
          <>
            <ActionChip
              label="change"
              onClick={() => onInject?.(`load roster ${side === "PLAYER" ? "my" : "enemy"}`)}
            />
            <ActionChip
              label="view"
              onClick={() => onInject?.(`roster ${side === "PLAYER" ? "my" : "enemy"}`)}
            />
            <ActionChip
              label="clear"
              onClick={() => onInject?.(`clear roster ${side.toLowerCase()}`)}
              color={C.red}
            />
          </>
        )}
      </div>
    </div>
  );
}

// ─── Saved rosters section ───────────────────────────────────────────────────

function SavedRostersSection({ onInject }) {
  const rosters      = listRosters();
  const rosterCount  = getRosterCount();
  const factions     = Object.keys(rosters).sort();
  const [expanded, setExpanded] = useState(null);   // faction slug or null
  const [activeRoster, setActiveRoster] = useState(null); // roster name showing actions

  return (
    <div>
      <SectionHeader title="Saved Rosters" subtitle={`${rosterCount} saved`} />

      {rosterCount === 0 ? (
        <div style={{ color: C.dim, fontSize: "13px", fontFamily: "monospace", marginBottom: "8px" }}>
          No rosters saved yet.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1px", marginBottom: "8px" }}>
          {factions.map(faction => {
            const factionRosters = Object.keys(rosters[faction] || {}).sort();
            const isOpen = expanded === faction;
            return (
              <div key={faction}>
                {/* Faction row — click to expand */}
                <div
                  onClick={() => { setExpanded(isOpen ? null : faction); setActiveRoster(null); }}
                  style={{
                    display: "flex", alignItems: "center", gap: "8px",
                    padding: "5px 8px", cursor: "pointer", userSelect: "none",
                    fontFamily: "monospace", fontSize: "13px",
                    background: isOpen ? C.panel : "transparent",
                    borderLeft: isOpen ? `2px solid ${C.amber}` : "2px solid transparent",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={e => { if (!isOpen) e.currentTarget.style.background = C.panel; }}
                  onMouseLeave={e => { if (!isOpen) e.currentTarget.style.background = "transparent"; }}
                >
                  <span style={{ color: C.dim, fontSize: "10px", width: "10px", textAlign: "center" }}>
                    {isOpen ? "▾" : "▸"}
                  </span>
                  <span style={{ color: isOpen ? C.amber : C.mid, flex: 1, fontWeight: 600 }}>
                    {labelify(faction)}
                  </span>
                  <span style={{
                    color: C.dim, fontSize: "11px",
                    background: C.bgDark, padding: "0 6px",
                    border: `1px solid ${C.border}`,
                  }}>
                    {factionRosters.length}
                  </span>
                </div>

                {/* Expanded roster list */}
                {isOpen && factionRosters.map(name => (
                  <div key={name} style={{ paddingLeft: "22px" }}>
                    <div
                      onClick={() => setActiveRoster(activeRoster === name ? null : name)}
                      style={{
                        display: "flex", alignItems: "center", gap: "8px",
                        padding: "3px 8px", cursor: "pointer", userSelect: "none",
                        fontFamily: "monospace", fontSize: "12px",
                      }}
                      onMouseEnter={e => { e.currentTarget.style.color = C.green; }}
                      onMouseLeave={e => { e.currentTarget.style.color = "inherit"; }}
                    >
                      <span style={{ color: C.mid, flex: 1 }}>{name}</span>
                    </div>
                    {/* Action row for selected roster */}
                    {activeRoster === name && (
                      <div style={{
                        display: "flex", gap: "6px", padding: "2px 8px 6px",
                        fontFamily: "monospace", fontSize: "11px",
                      }}>
                        <ActionChip label="load" onClick={() => onInject?.(`load roster ${name}`)} color={C.green} />
                        <ActionChip label="player" onClick={() => onInject?.(`set roster player ${name}`)} color={C.cyan} />
                        <ActionChip label="enemy" onClick={() => onInject?.(`set roster enemy ${name}`)} color={C.amber} />
                        <ActionChip label="edit" onClick={() => onInject?.(`edit roster ${name}`)} color={C.mid} />
                        <ActionChip label="delete" onClick={() => onInject?.(`delete roster ${name}`)} color={C.red} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", gap: "8px", marginTop: "6px" }}>
        <ActionChip label="upload roster" onClick={() => onInject?.("upload roster")} />
        <ActionChip label="upload enemy roster" onClick={() => onInject?.("upload enemy roster")} />
      </div>
    </div>
  );
}

// ─── Campaigns section ───────────────────────────────────────────────────────

function CampaignsSection({ onInject }) {
  const campaigns    = listCampaigns();
  const campaignCount = getCampaignCount();
  const names        = Object.keys(campaigns).sort();

  return (
    <div>
      <SectionHeader
        title="Campaigns"
        subtitle={`${campaignCount} saved`}
      />
      <Divider />

      {campaignCount === 0 ? (
        <div style={{ color: C.dim, fontSize: "13px", fontFamily: "monospace", marginBottom: "8px" }}>
          No campaigns yet.
        </div>
      ) : (
        names.map((name, i) => {
          const camp  = campaigns[name];
          const state = camp?.state || {};
          const turn  = state.turn ?? 1;
          const pw    = state.player_wins ?? 0;
          const ew    = state.enemy_wins ?? 0;

          return (
            <div
              key={name}
              onClick={() => onInject?.(`load campaign ${name}`)}
              style={{
                display: "flex", gap: "10px", alignItems: "baseline",
                lineHeight: "2.0", cursor: "pointer", userSelect: "none",
                fontFamily: "monospace", fontSize: "13px",
              }}
              onMouseEnter={e => e.currentTarget.querySelector(".camp-name").style.color = C.green}
              onMouseLeave={e => e.currentTarget.querySelector(".camp-name").style.color = C.mid}
            >
              <span style={{ color: C.dim, minWidth: "18px", textAlign: "right", flexShrink: 0 }}>
                {i + 1}.
              </span>
              <span className="camp-name" style={{ color: C.mid, flex: 1, fontWeight: 700 }}>
                {name}
              </span>
              <span style={{ color: C.amber, fontSize: "12px", minWidth: "10ch" }}>
                Turn {turn}
              </span>
              <span style={{ color: C.dim, fontSize: "11px" }}>
                {pw}W – {ew}L
              </span>
            </div>
          );
        })
      )}

      <div style={{ display: "flex", gap: "8px", marginTop: "6px" }}>
        <ActionChip label="new campaign" onClick={() => onInject?.("new campaign")} />
      </div>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function RostersContext({ engineId, onExec, onInject, theme }) {
  const [session, setSession]   = useState(null);
  const [loading, setLoading]   = useState(false);
  const [tick, setTick]         = useState(0);    // triggers VFS re-reads
  const pollRef                 = useRef(null);

  // Fetch session state from engine
  const fetchSession = useCallback(async () => {
    if (!engineId) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/engines/${engineId}/exec`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: "session" }),
      });
      if (res.ok) {
        const result = await res.json();
        if (result?.data) setSession(result.data);
      }
    } catch {
      // silent — will retry on next poll
    } finally {
      setLoading(false);
    }
  }, [engineId]);

  // Fetch on mount and poll every 3s — pause when tab is hidden
  useEffect(() => {
    fetchSession();

    const startPolling = () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(() => {
        fetchSession();
        setTick(t => t + 1);
      }, 3000);
    };

    const stopPolling = () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };

    startPolling();

    const onVisibility = () => {
      if (document.hidden) {
        stopPolling();
      } else {
        fetchSession();
        setTick(t => t + 1);
        startPolling();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fetchSession]);

  // Wrap onInject to also refresh after a short delay
  // (gives time for Terminal.jsx to process the command)
  const handleInject = useCallback((cmd) => {
    onInject?.(cmd);
    // Refresh after command likely completes
    setTimeout(() => { fetchSession(); setTick(t => t + 1); }, 600);
  }, [onInject, fetchSession]);

  const state       = session?.state || {};
  const myRoster    = session?.my_roster || {};
  const enemyRoster = session?.enemy_roster || {};

  return (
    <div
      style={{
        display: "flex", flexDirection: "column", height: "100%",
        backgroundColor: C.bg, overflow: "auto",
      }}
    >
      {/* ── Scrollable content ── */}
      <div style={{ flex: 1, overflow: "auto", padding: "16px 24px 24px" }}>

        {/* Under construction notice */}
        <div
          style={{
            border:       "1px solid var(--ct-border)",
            borderRadius: "6px",
            padding:      "12px 16px",
            marginBottom: "16px",
            background:   "var(--ct-bg-dark)",
            fontSize:     "12px",
            fontFamily:   "var(--ct-font-mono, monospace)",
            color:        "var(--ct-primary-dim)",
            lineHeight:   "1.7",
          }}
        >
          <div style={{ color: "var(--ct-primary-mid)", fontWeight: 600, marginBottom: "6px", fontSize: "12px" }}>
            ⚠ UNDER CONSTRUCTION — BUGS LIKELY
          </div>
          <div style={{ marginBottom: "4px" }}>
            When a roster is loaded (player or enemy), all combat commands use only the weapons and profiles in that roster. For example, a Hammerhead with an ion cannon will only show ion cannon results — not railgun.
          </div>
          <div>
            Remove a roster to see all possible weapon profiles and matchups.
          </div>
        </div>

        {/* Quick actions row */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "20px", flexWrap: "wrap" }}>
          <ActionChip label="session" onClick={() => handleInject("session")} />
        </div>

        {/* ── Army panels ── */}
        <SectionHeader title="Active Armies" />
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "24px" }}>
          <ArmyPanel roster={myRoster}    side="PLAYER" onInject={handleInject} />
          <ArmyPanel roster={enemyRoster} side="ENEMY"  onInject={handleInject} />
        </div>

        {/* ── Saved rosters ── */}
        <div style={{ marginBottom: "24px" }}>
          <SavedRostersSection key={`rosters-${tick}`} onInject={handleInject} />
        </div>

        {/* ── Campaigns ── */}
        <div style={{ marginBottom: "24px" }}>
          <CampaignsSection key={`campaigns-${tick}`} onInject={handleInject} />
        </div>

      </div>
    </div>
  );
}
