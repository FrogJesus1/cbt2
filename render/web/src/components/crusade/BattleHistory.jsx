/**
 * BattleHistory — list of resolved battles for a campaign (CRUSADE_SPEC Phase 6).
 *
 * Reads the normalized CrusadeBattles rows (server) and shows result, mission,
 * RP gained, and an expandable per-unit breakdown (kills, XP, promotion, scars,
 * honours). Refetches whenever `refreshKey` changes (e.g. after a battle ends).
 */

import { useState, useEffect, useCallback } from "react";
import { C } from "../shared/colors";
import { SectionHeader, RankBadge } from "./ui";
import { listBattles } from "@/lib/crusade";

const RESULT_COLOR = { win: C.green, loss: C.red, draw: C.yellow };
const RESULT_LABEL = { win: "VICTORY", loss: "DEFEAT", draw: "DRAW" };

function UnitLine({ r }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "8px", fontFamily: "monospace", fontSize: "11px", padding: "2px 0" }}>
      <span style={{ color: r.destroyed ? C.red : C.green }}>{r.destroyed ? "✗ " : ""}{r.unit_name}</span>
      <span style={{ color: C.dim }}>{r.kills} kill{r.kills === 1 ? "" : "s"}</span>
      <span style={{ color: C.amber }}>+{r.xp_gained} XP</span>
      {r.promoted && <RankBadge rank={r.new_rank} />}
      {(r.honours || []).map((h, i) => <span key={`h${i}`} style={{ color: C.amber, fontSize: "10px" }}>◇ {h.name}</span>)}
      {(r.scars || []).map((s, i) => <span key={`s${i}`} style={{ color: C.red, fontSize: "10px" }}>⚐ {s.name}</span>)}
    </div>
  );
}

function BattleRow({ battle }) {
  const [open, setOpen] = useState(false);
  const color = RESULT_COLOR[battle.result] || C.dim;
  const when = battle.played_at ? new Date(battle.played_at).toLocaleDateString() : "";
  const results = battle.unit_results || [];
  return (
    <div style={{ border: `1px solid ${C.border}`, background: C.panel }}>
      <div onClick={() => setOpen(!open)} style={{
        display: "flex", alignItems: "center", gap: "12px", padding: "8px 12px", cursor: "pointer",
      }}>
        <span style={{ color, fontFamily: "monospace", fontSize: "11px", fontWeight: 700, minWidth: "64px", letterSpacing: "0.06em" }}>
          {RESULT_LABEL[battle.result] || battle.result}
        </span>
        <span style={{ flex: 1, minWidth: 0, color: C.green, fontFamily: "monospace", fontSize: "12px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {battle.mission || "Battle"}{battle.point_limit ? ` · ${battle.point_limit} pts` : ""}
        </span>
        <span style={{ color: C.cyan, fontFamily: "monospace", fontSize: "11px", flexShrink: 0 }}>+{battle.rp_gained} RP</span>
        <span style={{ color: C.dim, fontFamily: "monospace", fontSize: "10px", flexShrink: 0 }}>{when}</span>
        <span style={{ color: C.dim, flexShrink: 0 }}>{open ? "▾" : "▸"}</span>
      </div>
      {open && (
        <div style={{ borderTop: `1px solid ${C.border}`, padding: "8px 12px" }}>
          {results.length === 0 ? (
            <div style={{ color: C.dim, fontFamily: "monospace", fontSize: "11px", fontStyle: "italic" }}>No unit results recorded.</div>
          ) : results.map((r, i) => <UnitLine key={i} r={r} />)}
          {battle.notes && (
            <div style={{ color: C.dim, fontFamily: "monospace", fontSize: "11px", marginTop: "8px", fontStyle: "italic" }}>“{battle.notes}”</div>
          )}
        </div>
      )}
    </div>
  );
}

export function BattleHistory({ campaign, refreshKey, onError }) {
  const [battles, setBattles] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setBattles(await listBattles(campaign.id));
    } catch (e) {
      onError?.(e.message || "Failed to load battle history");
    } finally {
      setLoading(false);
    }
  }, [campaign.id, onError]);

  useEffect(() => { load(); }, [load, refreshKey]);

  return (
    <div>
      <SectionHeader title="Battle History" subtitle={`${battles.length} battle${battles.length === 1 ? "" : "s"}`} />
      {loading ? (
        <div style={{ color: C.dim, fontFamily: "monospace", fontSize: "12px" }}>Loading…</div>
      ) : battles.length === 0 ? (
        <div style={{ border: `1px dashed ${C.border}`, padding: "20px", textAlign: "center", color: C.dim, fontFamily: "monospace", fontSize: "12px" }}>
          No battles fought yet. Muster a detachment to begin.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {battles.map((b) => <BattleRow key={b.id} battle={b} />)}
        </div>
      )}
    </div>
  );
}

export default BattleHistory;
