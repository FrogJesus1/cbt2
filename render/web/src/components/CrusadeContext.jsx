/**
 * CrusadeContext
 *
 * Top-level CRUSADE tab — Warhammer 40K Crusade campaign manager.
 * Session 1 (Foundation): create / load / delete campaigns, view the
 * campaign header and a read-only Order of Battle summary. Unit editing,
 * muster, and the combat bridge arrive in later sessions.
 */

import { useState, useEffect, useCallback } from "react";
import {
  listCampaigns, getCampaign, createCampaign, deleteCampaign, labelify,
} from "@/lib/crusade";
import { C } from "./shared/colors";
import { OrderOfBattle } from "./crusade/OrderOfBattle";
import { MusterPanel } from "./crusade/MusterPanel";
import { BattleTracker } from "./crusade/BattleTracker";
import { PostBattleFlow } from "./crusade/PostBattleFlow";
import { RPActions } from "./crusade/RPActions";
import { BattleHistory } from "./crusade/BattleHistory";

// ─── Small shared bits ─────────────────────────────────────────────────────────

function ActionChip({ label, onClick, color = C.cyan, hoverColor = C.green, disabled = false }) {
  return (
    <span
      onClick={disabled ? undefined : onClick}
      style={{
        color: disabled ? C.border : color,
        fontSize: "11px",
        border: `1px solid ${C.border}`,
        padding: "3px 10px",
        cursor: disabled ? "default" : "pointer",
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        userSelect: "none",
        fontFamily: "monospace",
        transition: "color 0.1s, border-color 0.1s",
        opacity: disabled ? 0.4 : 1,
      }}
      onMouseEnter={(e) => { if (!disabled) { e.currentTarget.style.color = hoverColor; e.currentTarget.style.borderColor = hoverColor; } }}
      onMouseLeave={(e) => { if (!disabled) { e.currentTarget.style.color = color; e.currentTarget.style.borderColor = C.border; } }}
    >
      {label}
    </span>
  );
}

function SectionHeader({ title, subtitle }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: "10px", marginBottom: "10px" }}>
      <span style={{
        color: C.amber, fontWeight: 700, fontSize: "13px",
        textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: "monospace",
      }}>
        {title}
      </span>
      {subtitle && <span style={{ color: C.dim, fontSize: "11px", fontFamily: "monospace" }}>{subtitle}</span>}
    </div>
  );
}

const inputStyle = {
  background: C.bgDark,
  border: `1px solid ${C.border}`,
  color: C.green,
  fontFamily: "monospace",
  fontSize: "13px",
  padding: "6px 10px",
  outline: "none",
  width: "100%",
};

const labelStyle = {
  color: C.dim, fontSize: "10px", fontFamily: "monospace",
  letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "4px", display: "block",
};

// ─── Create form ────────────────────────────────────────────────────────────────

function CreateCampaignForm({ factions, onCreate, onCancel, busy }) {
  const [name, setName] = useState("");
  const [faction, setFaction] = useState("");
  const [rp, setRp] = useState(5);
  const [supply, setSupply] = useState(1000);

  const canSubmit = name.trim() && faction.trim() && !busy;

  return (
    <div style={{
      border: `1px solid ${C.border}`, background: C.panel, padding: "18px", maxWidth: "520px",
    }}>
      <SectionHeader title="New Crusade" subtitle="Forge a new campaign" />
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div>
          <label style={labelStyle}>Campaign Name</label>
          <input
            style={inputStyle} value={name} autoFocus
            placeholder="Siege of Corfex"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && canSubmit) onCreate({ name, faction, rp, supplyLimit: supply }); }}
          />
        </div>
        <div>
          <label style={labelStyle}>Faction</label>
          <input
            style={inputStyle} value={faction} list="crusade-factions"
            placeholder="tau"
            onChange={(e) => setFaction(e.target.value)}
          />
          <datalist id="crusade-factions">
            {factions.map((f) => <option key={f} value={f} />)}
          </datalist>
        </div>
        <div style={{ display: "flex", gap: "12px" }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Starting RP</label>
            <input
              style={inputStyle} type="number" min={0} value={rp}
              onChange={(e) => setRp(parseInt(e.target.value || "0", 10))}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Supply Limit</label>
            <input
              style={inputStyle} type="number" min={0} step={100} value={supply}
              onChange={(e) => setSupply(parseInt(e.target.value || "0", 10))}
            />
          </div>
        </div>
        <div style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
          <ActionChip
            label={busy ? "Creating…" : "Create"}
            color={C.green} hoverColor={C.green} disabled={!canSubmit}
            onClick={() => canSubmit && onCreate({ name, faction, rp, supplyLimit: supply })}
          />
          <ActionChip label="Cancel" color={C.dim} hoverColor={C.red} onClick={onCancel} />
        </div>
      </div>
    </div>
  );
}

// ─── Campaign list ────────────────────────────────────────────────────────────

function CampaignCard({ campaign, onOpen, onDelete }) {
  const [confirming, setConfirming] = useState(false);
  const record = `${campaign.wins}–${campaign.losses}–${campaign.draws}`;
  return (
    <div
      style={{
        border: `1px solid ${C.border}`, background: C.panel,
        padding: "12px 14px", display: "flex", alignItems: "center",
        gap: "14px", justifyContent: "space-between",
      }}
    >
      <div
        style={{ cursor: "pointer", flex: 1 }}
        onClick={() => onOpen(campaign.id)}
      >
        <div style={{ color: C.green, fontSize: "14px", fontFamily: "monospace", fontWeight: 700 }}>
          {campaign.name}
        </div>
        <div style={{ color: C.dim, fontSize: "11px", fontFamily: "monospace", marginTop: "3px" }}>
          {labelify(campaign.faction)} · {campaign.rp} RP · {campaign.supply_limit} pt supply · {record} (W–L–D)
        </div>
      </div>
      <div style={{ display: "flex", gap: "8px" }}>
        <ActionChip label="Open" onClick={() => onOpen(campaign.id)} />
        {confirming ? (
          <ActionChip label="Confirm" color={C.red} hoverColor={C.red} onClick={() => onDelete(campaign.id)} />
        ) : (
          <ActionChip label="Delete" color={C.dim} hoverColor={C.red} onClick={() => setConfirming(true)} />
        )}
      </div>
    </div>
  );
}

// ─── Campaign detail (header + OOB summary) ─────────────────────────────────────

function StatBlock({ label, value, color = C.green }) {
  return (
    <div style={{ textAlign: "center", minWidth: "70px" }}>
      <div style={{ color, fontSize: "20px", fontFamily: "monospace", fontWeight: 700 }}>{value}</div>
      <div style={{ color: C.dim, fontSize: "9px", fontFamily: "monospace", letterSpacing: "0.1em", textTransform: "uppercase" }}>{label}</div>
    </div>
  );
}

function MiniBar({ pct, color = C.green }) {
  const clamped = Math.max(0, Math.min(100, pct || 0));
  return (
    <div style={{ height: "5px", background: C.bgDark, border: `1px solid ${C.border}`, marginTop: "4px" }}>
      <div style={{ height: "100%", width: `${clamped}%`, background: color, transition: "width 0.2s" }} />
    </div>
  );
}

function CampaignStats({ campaign, units }) {
  const battles = campaign.battle_count || 0;
  const wins = campaign.wins || 0;
  const winRate = battles > 0 ? Math.round((wins / battles) * 100) : 0;

  const totalPoints = units.reduce((s, u) => s + (u.points || 0) * (u.models ? 1 : 1), 0);
  const supply = campaign.supply_limit || 0;
  const supplyPct = supply > 0 ? Math.round((totalPoints / supply) * 100) : 0;

  const totalXp = units.reduce((s, u) => s + (u.xp || 0), 0);
  const totalKills = units.reduce((s, u) => s + (u.enemy_kills || 0), 0);
  const totalHonours = units.reduce((s, u) => s + ((u.honours || []).length), 0);
  const totalScars = units.reduce((s, u) => s + ((u.scars || []).length), 0);
  const crusadePoints = totalHonours - totalScars;

  const byKills = [...units].sort((a, b) => (b.enemy_kills || 0) - (a.enemy_kills || 0)).slice(0, 3);
  const byXp = [...units].sort((a, b) => (b.xp || 0) - (a.xp || 0)).slice(0, 3);
  const nameOf = (u) => u.nickname || u.name || "—";

  const TopList = ({ title, items, metric, color }) => (
    <div style={{ flex: 1, minWidth: "180px" }}>
      <div style={{ color: C.dim, fontSize: "9px", fontFamily: "monospace", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "6px" }}>{title}</div>
      {items.filter((u) => metric(u) > 0).length === 0 ? (
        <div style={{ color: C.border, fontSize: "11px", fontFamily: "monospace", fontStyle: "italic" }}>none yet</div>
      ) : items.filter((u) => metric(u) > 0).map((u, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", fontFamily: "monospace", color: C.mid, padding: "1px 0" }}>
          <span>{i + 1}. {nameOf(u)}</span>
          <span style={{ color }}>{metric(u)}</span>
        </div>
      ))}
    </div>
  );

  return (
    <div style={{ border: `1px solid ${C.border}`, background: C.panel, padding: "16px 18px" }}>
      <SectionHeader title="Campaign Stats" subtitle={`${units.length} units in the Order of Battle`} />
      <div style={{ display: "flex", gap: "22px", flexWrap: "wrap", marginBottom: "14px" }}>
        <StatBlock label="Win Rate" value={`${winRate}%`} color={winRate >= 50 ? C.green : C.yellow} />
        <StatBlock label="Total XP" value={totalXp} color={C.amber} />
        <StatBlock label="Enemy Kills" value={totalKills} color={C.red} />
        <StatBlock label="Honours" value={totalHonours} color={C.amber} />
        <StatBlock label="Scars" value={totalScars} color={C.red} />
        <StatBlock label="Crusade Pts" value={crusadePoints} color={crusadePoints >= 0 ? C.green : C.red} />
      </div>
      <div style={{ marginBottom: "14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", fontFamily: "monospace", color: C.dim }}>
          <span>SUPPLY USED</span>
          <span style={{ color: supplyPct > 100 ? C.red : C.mid }}>{totalPoints} / {supply} pts ({supplyPct}%)</span>
        </div>
        <MiniBar pct={supplyPct} color={supplyPct > 100 ? C.red : C.green} />
      </div>
      <div style={{ display: "flex", gap: "18px", flexWrap: "wrap" }}>
        <TopList title="Top Killers" items={byKills} metric={(u) => u.enemy_kills || 0} color={C.red} />
        <TopList title="Most Experienced" items={byXp} metric={(u) => u.xp || 0} color={C.amber} />
      </div>
    </div>
  );
}

function CampaignDetail({ campaign, onBack, onReload, onError, engineId, onInject }) {
  const units = campaign.units || [];
  const activeBattle = campaign.state?.active_battle || null;
  const [muster, setMuster] = useState(false);
  const [phase, setPhase] = useState("tracking");   // "tracking" | "post" (active battle only)
  const [tally, setTally] = useState(null);          // tracker → post-battle hand-off
  const [historyKey, setHistoryKey] = useState(0);   // bump to refresh history

  // Whenever the active battle clears (or changes), reset the in-battle phase.
  useEffect(() => { setPhase("tracking"); setTally(null); }, [activeBattle?.started_at]);

  const handleEndBattle = (currentTally) => { setTally(currentTally); setPhase("post"); };
  const handleBattleDone = async () => {
    setPhase("tracking"); setTally(null);
    setHistoryKey((k) => k + 1);
    await onReload?.();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
      {/* Header */}
      <div style={{ border: `1px solid ${C.border}`, background: C.panel, padding: "16px 18px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px" }}>
          <div>
            <div style={{ color: C.amber, fontSize: "18px", fontWeight: 700, fontFamily: "monospace", letterSpacing: "0.04em" }}>
              {campaign.name}
            </div>
            <div style={{ color: C.dim, fontSize: "12px", fontFamily: "monospace", marginTop: "4px" }}>
              {labelify(campaign.faction)} · Owner: {campaign.owner}
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            {!activeBattle && !muster && units.length > 0 && (
              <ActionChip label="⚔ Muster for Battle" color={C.green} hoverColor={C.green} onClick={() => setMuster(true)} />
            )}
            <ActionChip label="← Campaigns" color={C.dim} hoverColor={C.cyan} onClick={onBack} />
          </div>
        </div>
        <div style={{ display: "flex", gap: "22px", marginTop: "16px", flexWrap: "wrap" }}>
          <StatBlock label="Req. Points" value={campaign.rp} color={C.cyan} />
          <StatBlock label="Supply Limit" value={campaign.supply_limit} />
          <StatBlock label="Battles" value={campaign.battle_count} />
          <StatBlock label="Wins" value={campaign.wins} color={C.green} />
          <StatBlock label="Losses" value={campaign.losses} color={C.red} />
          <StatBlock label="Draws" value={campaign.draws} color={C.yellow} />
        </div>
      </div>

      {/* In-progress battle: tracker → post-battle resolution */}
      {activeBattle ? (
        phase === "post" ? (
          <PostBattleFlow
            campaign={campaign} units={units} battleUnits={tally}
            onDone={handleBattleDone} onCancel={() => setPhase("tracking")} onError={onError}
          />
        ) : (
          <BattleTracker
            campaign={campaign} units={units} engineId={engineId} onInject={onInject}
            onReload={onReload} onError={onError} onEnd={handleEndBattle}
          />
        )
      ) : muster ? (
        <MusterPanel
          campaign={campaign} units={units} engineId={engineId}
          onInject={onInject} onReload={onReload} onClose={() => setMuster(false)}
        />
      ) : null}

      {/* Campaign stats dashboard (between battles) */}
      {!activeBattle && units.length > 0 && (
        <CampaignStats campaign={campaign} units={units} />
      )}

      {/* Order of Battle — editable */}
      <OrderOfBattle campaign={campaign} units={units} onReload={onReload} onError={onError} />

      {/* Requisition actions (between battles only) */}
      {!activeBattle && (
        <RPActions campaign={campaign} units={units} onReload={onReload} onError={onError} />
      )}

      {/* Battle history */}
      <BattleHistory campaign={campaign} refreshKey={historyKey} onError={onError} />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CrusadeContext({ profileName, engineId, onInject }) {
  const [campaigns, setCampaigns] = useState([]);
  const [factions, setFactions] = useState([]);
  const [active, setActive] = useState(null);   // full campaign with units
  const [view, setView] = useState("list");      // "list" | "create" | "detail"
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listCampaigns();
      setCampaigns(list);
      setError(null);
    } catch (e) {
      setError(e.message || "Failed to load campaigns");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    fetch("/api/factions")
      .then((r) => r.json())
      .then((d) => setFactions((d.factions || []).map((f) => f.replace(/\s+/g, "-"))))
      .catch(() => {});
  }, []);

  const handleCreate = async (form) => {
    setBusy(true);
    try {
      const created = await createCampaign({ ...form, owner: profileName || "unknown" });
      setError(null);
      await refresh();
      const full = await getCampaign(created.id);
      setActive(full);
      setView("detail");
    } catch (e) {
      setError(e.message || "Failed to create campaign");
    } finally {
      setBusy(false);
    }
  };

  const handleOpen = async (id) => {
    setBusy(true);
    try {
      const full = await getCampaign(id);
      setActive(full);
      setView("detail");
      setError(null);
    } catch (e) {
      setError(e.message || "Failed to open campaign");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteCampaign(id);
      await refresh();
    } catch (e) {
      setError(e.message || "Failed to delete campaign");
    }
  };

  // Re-fetch the active campaign (with its units) after an OOB edit.
  const reloadActive = useCallback(async () => {
    if (!active?.id) return;
    try {
      const full = await getCampaign(active.id);
      setActive(full);
    } catch (e) {
      setError(e.message || "Failed to reload campaign");
    }
  }, [active?.id]);

  return (
    <div style={{ height: "100%", overflow: "auto", padding: "20px 22px", fontFamily: "monospace" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "18px" }}>
        <div>
          <span style={{ color: C.amber, fontSize: "16px", fontWeight: 700, letterSpacing: "0.14em" }}>◈ CRUSADE</span>
          <span style={{ color: C.dim, fontSize: "11px", marginLeft: "12px" }}>Campaign tracker</span>
        </div>
        {view === "list" && (
          <ActionChip label="+ New Campaign" color={C.green} hoverColor={C.green} onClick={() => setView("create")} />
        )}
      </div>

      {error && (
        <div style={{
          border: `1px solid ${C.red}`, background: "#1a0505", color: C.red,
          padding: "10px 12px", fontSize: "12px", marginBottom: "16px",
        }}>
          ✗ {error}
        </div>
      )}

      {view === "create" && (
        <CreateCampaignForm
          factions={factions} busy={busy}
          onCreate={handleCreate} onCancel={() => setView("list")}
        />
      )}

      {view === "detail" && active && (
        <CampaignDetail
          campaign={active}
          onBack={() => { setActive(null); setView("list"); refresh(); }}
          onReload={reloadActive}
          onError={setError}
          engineId={engineId}
          onInject={onInject}
        />
      )}

      {view === "list" && (
        loading ? (
          <div style={{ color: C.dim, fontSize: "12px" }}>Loading campaigns…</div>
        ) : campaigns.length === 0 ? (
          <div style={{
            border: `1px dashed ${C.border}`, padding: "40px 22px", textAlign: "center",
            color: C.dim, fontSize: "13px", lineHeight: 1.7,
          }}>
            No campaigns yet.<br />
            Start a Crusade to track your Order of Battle, requisition points, and
            unit progression across battles.
            <div style={{ marginTop: "16px" }}>
              <ActionChip label="+ Create Campaign" color={C.green} hoverColor={C.green} onClick={() => setView("create")} />
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {campaigns.map((c) => (
              <CampaignCard key={c.id} campaign={c} onOpen={handleOpen} onDelete={handleDelete} />
            ))}
          </div>
        )
      )}
    </div>
  );
}

export default CrusadeContext;
