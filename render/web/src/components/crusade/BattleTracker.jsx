/**
 * BattleTracker — in-battle kill/death tracking (CRUSADE_SPEC Phase 4).
 *
 * Renders the units of the campaign's in-progress battle (campaign.state
 * .active_battle). Per-unit kill counter (+/-) and a "destroyed" toggle. Live
 * counters live in React state and are DEBOUNCE-persisted (~1.5s) back into
 * campaign.state.active_battle, so a mid-battle refresh restores the tally.
 *
 * "End Battle" hands the current tally to PostBattleFlow (via onEnd). The
 * engine roster (set at muster) is in-memory, so a "Re-muster" action re-pushes
 * the roster if the engine restarted mid-battle.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { C } from "../shared/colors";
import { ActionChip, SectionHeader, RankBadge } from "./ui";
import { startBattle, persistActiveBattle, updateCampaign } from "@/lib/crusade";

const PERSIST_DELAY = 1500;

function KillStepper({ value, onChange }) {
  const btn = (label, delta, disabled) => (
    <span
      onClick={disabled ? undefined : () => onChange(Math.max(0, value + delta))}
      style={{
        width: "22px", height: "22px", lineHeight: "20px", textAlign: "center",
        border: `1px solid ${C.border}`, color: disabled ? C.border : C.cyan,
        cursor: disabled ? "default" : "pointer", userSelect: "none", fontSize: "13px",
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.borderColor = C.cyan; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = C.border; }}
    >{label}</span>
  );
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
      {btn("−", -1, value <= 0)}
      <span style={{ minWidth: "22px", textAlign: "center", color: C.amber, fontSize: "14px", fontWeight: 700 }}>{value}</span>
      {btn("+", +1, false)}
    </div>
  );
}

function TrackerRow({ entry, rank, onKills, onDestroyed }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "12px", padding: "8px 12px",
      border: `1px solid ${entry.destroyed ? `color-mix(in srgb, ${C.red} 40%, transparent)` : C.border}`,
      background: entry.destroyed ? "#160606" : C.panel, fontFamily: "monospace",
      opacity: entry.destroyed ? 0.85 : 1,
    }}>
      <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
        <span style={{ color: entry.destroyed ? C.red : C.green, fontSize: "13px", textDecoration: entry.destroyed ? "line-through" : "none" }}>
          {entry.marked ? "★ " : ""}{entry.unit_name}
        </span>
        {rank && <RankBadge rank={rank} />}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
        <span style={{ color: C.dim, fontSize: "10px", letterSpacing: "0.06em" }}>KILLS</span>
        <KillStepper value={entry.kills} onChange={onKills} />
      </div>
      <span
        onClick={onDestroyed}
        title="Toggle destroyed"
        style={{
          flexShrink: 0, fontSize: "10px", letterSpacing: "0.06em", textTransform: "uppercase",
          border: `1px solid ${entry.destroyed ? C.red : C.border}`, padding: "3px 8px",
          color: entry.destroyed ? C.red : C.dim, cursor: "pointer", userSelect: "none",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = entry.destroyed ? C.red : C.green; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = entry.destroyed ? C.red : C.dim; }}
      >{entry.destroyed ? "✗ Destroyed" : "Destroyed?"}</span>
    </div>
  );
}

export function BattleTracker({ campaign, units, engineId, onInject, onReload, onError, onEnd }) {
  const active = campaign.state?.active_battle;
  const [entries, setEntries] = useState(() => active?.units || []);
  const [remustering, setRemustering] = useState(false);
  const [abandoning, setAbandoning] = useState(false);
  const timer = useRef(null);
  const latest = useRef(entries);

  // Re-sync if the active battle identity changes (e.g. after reload).
  useEffect(() => {
    setEntries(active?.units || []);
  }, [active?.started_at]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the persist/flush ref aligned with the live entries.
  useEffect(() => { latest.current = entries; }, [entries]);

  const schedulePersist = useCallback((next) => {
    latest.current = next;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      persistActiveBattle(campaign, { ...active, units: latest.current })
        .catch((e) => onError?.(e.message || "Failed to save battle progress"));
    }, PERSIST_DELAY);
  }, [campaign, active, onError]);

  // Flush any pending persist on unmount.
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const mutate = (unitId, patch) => {
    setEntries((prev) => {
      const next = prev.map((e) => (e.unit_id === unitId ? { ...e, ...patch } : e));
      schedulePersist(next);
      return next;
    });
  };

  const flush = async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    await persistActiveBattle(campaign, { ...active, units: latest.current }).catch(() => {});
  };

  const rankFor = (unitId) => (units.find((u) => u.id === unitId) || {}).rank;

  const totalKills = entries.reduce((s, e) => s + (e.kills || 0), 0);
  const losses = entries.filter((e) => e.destroyed).length;

  const remuster = async () => {
    if (!engineId) { onError?.("No engine connected."); return; }
    setRemustering(true);
    try {
      const mustered = entries
        .map((e) => units.find((u) => u.id === e.unit_id))
        .filter(Boolean);
      await startBattle(engineId, mustered, campaign.faction);
      onInject?.("home");
    } catch (e) {
      onError?.(e.message || "Re-muster failed");
    } finally {
      setRemustering(false);
    }
  };

  const abandon = async () => {
    try {
      if (timer.current) clearTimeout(timer.current);
      const state = { ...(campaign.state || {}) };
      delete state.active_battle;
      await updateCampaign(campaign.id, { state });
      await onReload?.();
    } catch (e) {
      onError?.(e.message || "Failed to abandon battle");
    }
  };

  const endBattle = async () => {
    await flush();
    onEnd?.(latest.current);
  };

  return (
    <div style={{ border: `1px solid color-mix(in srgb, ${C.amber} 33%, transparent)`, background: C.panel, padding: "16px 18px" }}>
      <SectionHeader
        title="⚔ Battle in Progress"
        subtitle={[active?.mission, active?.point_limit ? `${active.point_limit} pts` : null]
          .filter(Boolean).join(" · ") || "no mission set"}
        right={
          <div style={{ display: "flex", gap: "8px" }}>
            <ActionChip label={remustering ? "Re-mustering…" : "↻ Re-muster"} color={C.dim} hoverColor={C.cyan}
              disabled={remustering} onClick={remuster} />
            <ActionChip label="→ Terminal" color={C.cyan} hoverColor={C.green} onClick={() => onInject?.("home")} />
          </div>
        }
      />

      <div style={{ color: C.dim, fontSize: "11px", fontFamily: "monospace", lineHeight: 1.6, marginBottom: "12px" }}>
        Log kills and destroyed units as you play — progress saves automatically.
        Combat commands in the TERMINAL use the mustered, crusade-enriched roster
        (look for ◈ markers). End the battle to award XP and resolve scars.
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "14px" }}>
        {entries.length === 0 ? (
          <div style={{ color: C.dim, fontStyle: "italic", fontSize: "12px", fontFamily: "monospace" }}>
            No units in this battle.
          </div>
        ) : entries.map((e) => (
          <TrackerRow
            key={e.unit_id} entry={e} rank={rankFor(e.unit_id)}
            onKills={(v) => mutate(e.unit_id, { kills: v })}
            onDestroyed={() => mutate(e.unit_id, { destroyed: !e.destroyed })}
          />
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
        <span style={{ color: C.dim, fontSize: "11px", fontFamily: "monospace" }}>
          {entries.length} unit{entries.length === 1 ? "" : "s"} · {totalKills} kill{totalKills === 1 ? "" : "s"} · {losses} lost
        </span>
        <div style={{ display: "flex", gap: "10px" }}>
          {abandoning ? (
            <ActionChip label="Confirm Abandon" color={C.red} hoverColor={C.red} onClick={abandon} />
          ) : (
            <ActionChip label="Abandon" color={C.dim} hoverColor={C.red} onClick={() => setAbandoning(true)} />
          )}
          <ActionChip label="End Battle →" color={C.green} hoverColor={C.green} onClick={endBattle} />
        </div>
      </div>
    </div>
  );
}

export default BattleTracker;
