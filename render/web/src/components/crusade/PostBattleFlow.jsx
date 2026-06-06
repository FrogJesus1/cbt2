/**
 * PostBattleFlow — resolve an ended battle (CRUSADE_SPEC Phase 5 / §3.2–3.5).
 *
 *  1. Pick the result (win / loss / draw).
 *  2. Auto-calculate per-unit XP (§3.2: participated, winning side, killed 1+/3+,
 *     marked for greatness) with a manual override per unit.
 *  3. Manually assign a battle scar to each destroyed unit (§3.3 — manual table
 *     selection; no auto D6, per the build decision).
 *  4. Detect promotions via the XP→rank thresholds and slot battle honours
 *     through the HonourPicker.
 *  5. +1 RP (editable), optional notes.
 *  6. Finalize → server applies all unit updates, writes the CrusadeBattles row,
 *     bumps the campaign, and clears state.active_battle.
 */

import { useState, useMemo } from "react";
import { C } from "../shared/colors";
import { ActionChip, SectionHeader, RankBadge, inputStyle, labelStyle } from "./ui";
import { autoXp, rankForXp, promotionSlots, finalizeBattle } from "@/lib/crusade";
import { BATTLE_SCARS, AGENDAS } from "@/lib/crusadeTraits";
import { HonourPicker } from "./HonourPicker";

const RESULTS = [
  { key: "win", label: "Victory", color: C.green },
  { key: "loss", label: "Defeat", color: C.red },
  { key: "draw", label: "Draw", color: C.yellow },
];

function ResultPicker({ value, onChange }) {
  return (
    <div style={{ display: "flex", gap: "8px" }}>
      {RESULTS.map((r) => (
        <span key={r.key} onClick={() => onChange(r.key)}
          style={{
            fontFamily: "monospace", fontSize: "12px", padding: "5px 14px", cursor: "pointer",
            textTransform: "uppercase", letterSpacing: "0.08em", userSelect: "none",
            border: `1px solid ${value === r.key ? r.color : C.border}`,
            color: value === r.key ? r.color : C.dim,
            background: value === r.key ? `${r.color}14` : "transparent",
          }}>
          {r.label}
        </span>
      ))}
    </div>
  );
}

function ScarPicker({ value, onChange }) {
  const idx = value && value.length ? BATTLE_SCARS.findIndex((s) => s.name === value[0].name) : -1;
  return (
    <div style={{ marginTop: "8px" }}>
      <label style={labelStyle}>Battle scar (destroyed)</label>
      <select
        style={{ ...inputStyle, cursor: "pointer", borderColor: idx >= 0 ? `${C.red}88` : C.border }}
        value={idx < 0 ? "" : String(idx)}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "") { onChange([]); return; }
          const s = BATTLE_SCARS[parseInt(v, 10)];
          onChange([{ name: s.name, effect: s.effect, ...(s.flag ? { flag: s.flag } : {}) }]);
        }}
      >
        <option value="">— no scar —</option>
        {BATTLE_SCARS.map((s, i) => (
          <option key={i} value={i}>{s.name} · {s.effect}{s.flag ? "  ◈" : ""}</option>
        ))}
      </select>
    </div>
  );
}

function UnitResolveCard({ unit, tally, won, override, onOverride, scars, onScars, honours, onHonours }) {
  const auto = autoXp({ kills: tally.kills, won, marked: tally.marked });
  const xpFinal = override == null ? auto : override;
  const newXp = (unit?.xp || 0) + xpFinal;
  const slots = promotionSlots(unit?.xp || 0, newXp);
  const newRank = rankForXp(newXp);

  const breakdown = [
    "participated +1",
    won ? "won +1" : null,
    tally.kills >= 1 ? "killed 1+ +1" : null,
    tally.kills >= 3 ? "killed 3+ +1" : null,
    tally.marked ? "marked +1" : null,
  ].filter(Boolean).join(", ");

  return (
    <div style={{ border: `1px solid ${C.border}`, background: C.bgDark, padding: "12px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "10px" }}>
        <span style={{ color: tally.destroyed ? C.red : C.green, fontSize: "13px", fontFamily: "monospace", fontWeight: 600 }}>
          {tally.marked ? "★ " : ""}{tally.unit_name}
        </span>
        <RankBadge rank={unit?.rank || rankForXp(unit?.xp || 0)} />
        <span style={{ color: C.dim, fontSize: "11px", fontFamily: "monospace" }}>
          {tally.kills} kill{tally.kills === 1 ? "" : "s"}{tally.destroyed ? " · destroyed" : ""}
        </span>
      </div>

      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ width: "110px" }}>
          <label style={labelStyle}>XP gained</label>
          <input style={inputStyle} type="number" min={0} value={xpFinal}
            onChange={(e) => onOverride(parseInt(e.target.value || "0", 10))} />
        </div>
        <div style={{ flex: 1, minWidth: "160px", paddingBottom: "2px" }}>
          <div style={{ color: C.dim, fontSize: "10px", fontFamily: "monospace" }}>auto: {auto} ({breakdown})</div>
          <div style={{ color: C.mid, fontSize: "11px", fontFamily: "monospace", marginTop: "2px" }}>
            {unit?.xp || 0} → <span style={{ color: C.amber }}>{newXp} XP</span>
            {slots > 0 && <span style={{ color: C.amber }}>  ▲ {newRank}</span>}
          </div>
        </div>
        {override != null && (
          <ActionChip label="↺ auto" color={C.dim} hoverColor={C.cyan} onClick={() => onOverride(null)} />
        )}
      </div>

      {tally.destroyed && <ScarPicker value={scars} onChange={onScars} />}
      {slots > 0 && <HonourPicker slots={slots} value={honours} onChange={onHonours} />}
    </div>
  );
}

export function PostBattleFlow({ campaign, units, battleUnits, onDone, onCancel, onError }) {
  const active = campaign.state?.active_battle || {};
  const [result, setResult] = useState("win");
  const [overrides, setOverrides] = useState({});      // unitId -> number | undefined
  const [scarsBy, setScarsBy] = useState({});          // unitId -> [scar]
  const [honoursBy, setHonoursBy] = useState({});      // unitId -> [honour]
  const [rpGained, setRpGained] = useState(1);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const won = result === "win";
  const unitById = useMemo(() => {
    const m = {};
    for (const u of units) m[u.id] = u;
    return m;
  }, [units]);

  const rows = (battleUnits || active.units || []);

  const finalize = async () => {
    setBusy(true); setError(null);
    try {
      const unit_results = rows.map((t) => {
        const u = unitById[t.unit_id] || {};
        const auto = autoXp({ kills: t.kills, won, marked: t.marked });
        const xp_gained = overrides[t.unit_id] == null ? auto : overrides[t.unit_id];
        return {
          unit_id: t.unit_id,
          kills: t.kills || 0,
          destroyed: !!t.destroyed,
          xp_gained,
          scars: scarsBy[t.unit_id] || [],
          honours: honoursBy[t.unit_id] || [],
        };
      });
      const refreshed = await finalizeBattle(campaign.id, {
        result,
        mission: active.mission || "",
        point_limit: active.point_limit || 0,
        notes: notes.trim(),
        rp_gained: rpGained,
        unit_results,
        // Idempotency key (stable per battle) so a retry can't double-apply.
        battle_token: active.token || active.started_at || null,
      });
      onDone?.(refreshed);
    } catch (e) {
      setError(e.message || "Failed to finalize battle");
      onError?.(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ border: `1px solid ${C.bordermid}`, background: C.panel, padding: "16px 18px" }}>
      <SectionHeader
        title="End Battle"
        subtitle={[active.mission, active.point_limit ? `${active.point_limit} pts` : null].filter(Boolean).join(" · ")}
        right={<ActionChip label="← Back to tracker" color={C.dim} hoverColor={C.cyan} onClick={onCancel} />}
      />

      <div style={{ marginBottom: "16px" }}>
        <label style={labelStyle}>Result</label>
        <ResultPicker value={result} onChange={setResult} />
      </div>

      <details style={{ marginBottom: "16px" }}>
        <summary style={{ color: C.cyan, fontSize: "11px", fontFamily: "monospace", cursor: "pointer" }}>
          ▸ Agendas reference — add achieved-agenda XP to a unit's "XP gained" field
        </summary>
        <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "4px" }}>
          {AGENDAS.map((a, i) => (
            <div key={i} style={{ color: C.mid, fontSize: "11px", fontFamily: "monospace" }}>
              <span style={{ color: C.amber }}>+{a.xp} XP</span> · <span style={{ color: C.green }}>{a.name}</span>
              <span style={{ color: C.dim }}> — {a.how}</span>
            </div>
          ))}
        </div>
      </details>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
        {rows.length === 0 ? (
          <div style={{ color: C.dim, fontStyle: "italic", fontSize: "12px", fontFamily: "monospace" }}>No units to resolve.</div>
        ) : rows.map((t) => (
          <UnitResolveCard
            key={t.unit_id} unit={unitById[t.unit_id]} tally={t} won={won}
            override={overrides[t.unit_id]}
            onOverride={(v) => setOverrides((p) => ({ ...p, [t.unit_id]: v }))}
            scars={scarsBy[t.unit_id] || []}
            onScars={(v) => setScarsBy((p) => ({ ...p, [t.unit_id]: v }))}
            honours={honoursBy[t.unit_id] || []}
            onHonours={(v) => setHonoursBy((p) => ({ ...p, [t.unit_id]: v }))}
          />
        ))}
      </div>

      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "flex-end", marginBottom: "14px" }}>
        <div style={{ width: "110px" }}>
          <label style={labelStyle}>RP gained</label>
          <input style={inputStyle} type="number" min={0} value={rpGained}
            onChange={(e) => setRpGained(parseInt(e.target.value || "0", 10))} />
        </div>
        <div style={{ flex: 1, minWidth: "200px" }}>
          <label style={labelStyle}>Battle notes (opt.)</label>
          <input style={inputStyle} value={notes} placeholder="Held the centre objective…"
            onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>

      {error && <div style={{ color: C.red, fontFamily: "monospace", fontSize: "12px", marginBottom: "10px" }}>✗ {error}</div>}

      <div style={{ display: "flex", gap: "10px" }}>
        <ActionChip label={busy ? "Finalizing…" : "✓ Finalize Battle"} color={C.green} hoverColor={C.green}
          disabled={busy} onClick={finalize} />
        <ActionChip label="Cancel" color={C.dim} hoverColor={C.cyan} onClick={onCancel} />
      </div>
    </div>
  );
}

export default PostBattleFlow;
