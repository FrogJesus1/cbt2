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

  return (
    <div>
      <SectionHeader
        title="Saved Rosters"
        subtitle={`${rosterCount} saved`}
      />
      <Divider />

      {rosterCount === 0 ? (
        <div style={{ color: C.dim, fontSize: "13px", fontFamily: "monospace", marginBottom: "8px" }}>
          No rosters saved yet.
        </div>
      ) : (
        factions.map(faction => {
          const factionRosters = Object.keys(rosters[faction] || {}).sort();
          return (
            <div key={faction} style={{ marginBottom: "10px" }}>
              <div style={{
                color: C.amber, fontWeight: 700, fontSize: "11px",
                textTransform: "uppercase", letterSpacing: "0.12em",
                marginBottom: "3px", fontFamily: "monospace",
              }}>
                [{labelify(faction)}]
              </div>
              {factionRosters.map(name => {
                const r = rosters[faction][name];
                return (
                  <div
                    key={name}
                    style={{
                      display: "flex", alignItems: "baseline", gap: "8px",
                      lineHeight: "1.8", cursor: "pointer", userSelect: "none",
                      fontFamily: "monospace", fontSize: "13px",
                    }}
                    onClick={() => onInject?.(`load roster ${name}`)}
                    onMouseEnter={e => e.currentTarget.style.color = C.green}
                    onMouseLeave={e => e.currentTarget.style.color = "inherit"}
                  >
                    <span style={{ color: C.mid, flex: 1 }}>{name}</span>
                    <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                      <span
                        style={{ color: C.dim, fontSize: "11px", cursor: "pointer" }}
                        onClick={e => { e.stopPropagation(); onInject?.(`set roster player ${name}`); }}
                        onMouseEnter={e => e.currentTarget.style.color = C.cyan}
                        onMouseLeave={e => e.currentTarget.style.color = C.dim}
                        title="Load as player"
                      >
                        [P]
                      </span>
                      <span
                        style={{ color: C.dim, fontSize: "11px", cursor: "pointer" }}
                        onClick={e => { e.stopPropagation(); onInject?.(`set roster enemy ${name}`); }}
                        onMouseEnter={e => e.currentTarget.style.color = C.amber}
                        onMouseLeave={e => e.currentTarget.style.color = C.dim}
                        title="Load as enemy"
                      >
                        [E]
                      </span>
                      <span
                        style={{ color: C.dim, fontSize: "11px", cursor: "pointer" }}
                        onClick={e => { e.stopPropagation(); onInject?.(`edit roster ${name}`); }}
                        onMouseEnter={e => e.currentTarget.style.color = C.mid}
                        onMouseLeave={e => e.currentTarget.style.color = C.dim}
                        title="Edit roster"
                      >
                        [✎]
                      </span>
                      <span
                        style={{ color: C.dim, fontSize: "11px", cursor: "pointer" }}
                        onClick={e => { e.stopPropagation(); onInject?.(`delete roster ${name}`); }}
                        onMouseEnter={e => e.currentTarget.style.color = C.red}
                        onMouseLeave={e => e.currentTarget.style.color = C.dim}
                        title="Delete roster"
                      >
                        [×]
                      </span>
                    </div>
                    {r?.updated_at && (
                      <span style={{ color: C.dim, fontSize: "11px", flexShrink: 0 }}>
                        {new Date(r.updated_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })
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

        {/* ── Session header ── */}
        <SectionHeader
          title="Session State"
          badge={`TURN ${state.turn ?? 0}`}
        />
        <Divider />

        {/* State grid */}
        <div style={{
          display: "grid", gridTemplateColumns: "130px 1fr",
          gap: "0", marginBottom: "14px", fontFamily: "monospace",
        }}>
          {[
            { label: "Roster Mode", value: state.roster_mode, color: state.roster_mode === "ON" ? C.green : C.dim },
            {
              label: "Player Faction",
              value: state.faction !== "—" ? state.faction?.toUpperCase() : "—",
              color: state.faction !== "—" ? C.cyan : C.dim,
              click: state.faction !== "—" ? `list units ${state.faction}` : null,
            },
            {
              label: "Enemy Faction",
              value: state.enemy !== "—" ? state.enemy?.toUpperCase() : "—",
              color: state.enemy !== "—" ? C.amber : C.dim,
              click: state.enemy !== "—" ? `list units ${state.enemy}` : null,
            },
          ].map(({ label, value, color, click }) => (
            <div key={label} style={{ display: "contents" }}>
              <span style={{
                color: C.label, fontSize: "12px", textTransform: "uppercase",
                letterSpacing: "0.1em", padding: "4px 0", borderBottom: `1px solid ${C.border}`,
              }}>
                {label}
              </span>
              <span
                style={{
                  color: color ?? C.mid, fontSize: "13px", padding: "4px 0",
                  borderBottom: `1px solid ${C.border}`,
                  cursor: click ? "pointer" : "default",
                }}
                onClick={() => click && handleInject(click)}
              >
                {value ?? "—"}
              </span>
            </div>
          ))}
        </div>

        {/* Quick actions row */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "20px", flexWrap: "wrap" }}>
          <ActionChip label="next turn" onClick={() => handleInject("next turn")} color={C.green} />
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
