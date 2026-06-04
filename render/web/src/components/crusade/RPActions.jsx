/**
 * RPActions — spend Requisition Points between battles (CRUSADE_SPEC §3.4).
 *
 *   Fresh Recruits        1 RP  add a unit to the Order of Battle
 *   Rearm and Resupply    1 RP  change a unit's weapon loadout
 *   Repair and Recuperate 1 RP  remove a battle scar from a unit
 *   Increase Supply Limit 1 RP  +100 pts to the supply limit
 *   Heroic Relic          1 RP  give a Heroic+ unit a Crusade Relic (honour)
 *
 * Each action decrements campaign.rp and mutates the relevant unit/campaign,
 * composing the existing crusade CRUD helpers (consistent with the OOB editor),
 * then triggers a reload. Actions are disabled when RP is insufficient.
 */

import { useState } from "react";
import { C } from "../shared/colors";
import { ActionChip, SectionHeader, RankBadge, inputStyle, labelStyle } from "./ui";
import { createUnit, updateUnit, updateCampaign, isHeroicPlus } from "@/lib/crusade";
import { HONOUR_EXTRAS } from "@/lib/crusadeTraits";

const COST = 1;

function Frame({ title, children, onCancel }) {
  return (
    <div style={{ border: `1px solid ${C.border}`, background: C.bgDark, padding: "12px 14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
        <span style={{ color: C.amber, fontSize: "11px", fontFamily: "monospace", letterSpacing: "0.08em", textTransform: "uppercase" }}>{title} · {COST} RP</span>
        <ActionChip label="Cancel" color={C.dim} hoverColor={C.red} onClick={onCancel} />
      </div>
      {children}
    </div>
  );
}

function LoadoutChips({ weapons, onChange }) {
  const [val, setVal] = useState("");
  const add = () => { const w = val.trim(); if (!w) return; onChange([...weapons, w]); setVal(""); };
  return (
    <div>
      {weapons.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "8px" }}>
          {weapons.map((w, i) => (
            <span key={i} style={{ fontFamily: "monospace", fontSize: "11px", color: C.green, border: `1px solid ${C.border}`, padding: "2px 6px", display: "inline-flex", gap: "6px" }}>
              {w}
              <span onClick={() => onChange(weapons.filter((_, j) => j !== i))} style={{ color: C.dim, cursor: "pointer" }}
                onMouseEnter={(e) => { e.currentTarget.style.color = C.red; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = C.dim; }}>✕</span>
            </span>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: "6px" }}>
        <input style={{ ...inputStyle, fontSize: "12px", padding: "4px 8px" }} value={val} placeholder="Add a weapon…"
          onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
        <ActionChip label="+ Add" onClick={add} />
      </div>
    </div>
  );
}

// ─── Individual action forms ────────────────────────────────────────────────────

function FreshRecruits({ onCommit, busy }) {
  const [name, setName] = useState("");
  const [points, setPoints] = useState(0);
  const [models, setModels] = useState(1);
  const [leader, setLeader] = useState(false);
  const ok = name.trim() && !busy;
  return (
    <>
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "10px" }}>
        <div style={{ flex: "3 1 200px" }}>
          <label style={labelStyle}>Datasheet name</label>
          <input style={inputStyle} value={name} autoFocus placeholder="Strike Team" onChange={(e) => setName(e.target.value)} />
        </div>
        <div style={{ flex: "1 1 80px" }}>
          <label style={labelStyle}>Points</label>
          <input style={inputStyle} type="number" min={0} value={points} onChange={(e) => setPoints(parseInt(e.target.value || "0", 10))} />
        </div>
        <div style={{ flex: "1 1 70px" }}>
          <label style={labelStyle}>Models</label>
          <input style={inputStyle} type="number" min={1} value={models} onChange={(e) => setModels(parseInt(e.target.value || "1", 10))} />
        </div>
      </div>
      <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
        <ActionChip label={leader ? "★ Leader" : "Not a leader"} color={leader ? C.amber : C.dim} hoverColor={leader ? C.amber : C.cyan} onClick={() => setLeader(!leader)} />
        <div style={{ flex: 1 }} />
        <ActionChip label={busy ? "Spending…" : "Recruit (−1 RP)"} color={C.green} hoverColor={C.green} disabled={!ok}
          onClick={() => ok && onCommit({ createBody: { unit_name: name.trim(), points: points || 0, models: models || 1, is_leader: leader } })} />
      </div>
    </>
  );
}

function PickUnit({ units, value, onChange, label = "Unit", filter }) {
  const list = filter ? units.filter(filter) : units;
  return (
    <div style={{ marginBottom: "10px" }}>
      <label style={labelStyle}>{label}</label>
      <select style={{ ...inputStyle, cursor: "pointer" }} value={value || ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">— select —</option>
        {list.map((u) => <option key={u.id} value={u.id}>{(u.nickname || u.unit_name)} · {u.rank}</option>)}
      </select>
      {list.length === 0 && <div style={{ color: C.dim, fontSize: "10px", fontFamily: "monospace", marginTop: "4px" }}>No eligible units.</div>}
    </div>
  );
}

function Rearm({ units, onCommit, busy }) {
  const [unitId, setUnitId] = useState("");
  const unit = units.find((u) => u.id === unitId);
  const [loadout, setLoadout] = useState([]);
  const choose = (id) => { setUnitId(id); const u = units.find((x) => x.id === id); setLoadout(u ? [...(u.loadout || [])] : []); };
  return (
    <>
      <PickUnit units={units} value={unitId} onChange={choose} label="Unit to rearm" />
      {unit && (
        <div style={{ marginBottom: "10px" }}>
          <label style={labelStyle}>New loadout</label>
          <LoadoutChips weapons={loadout} onChange={setLoadout} />
        </div>
      )}
      <ActionChip label={busy ? "Spending…" : "Rearm (−1 RP)"} color={C.green} hoverColor={C.green} disabled={!unit || busy}
        onClick={() => unit && onCommit({ unitId, updates: { loadout } })} />
    </>
  );
}

function Repair({ units, onCommit, busy }) {
  const [unitId, setUnitId] = useState("");
  const [scarIdx, setScarIdx] = useState("");
  const unit = units.find((u) => u.id === unitId);
  const scars = unit?.scars || [];
  return (
    <>
      <PickUnit units={units} value={unitId} onChange={(id) => { setUnitId(id); setScarIdx(""); }} label="Unit to heal" filter={(u) => (u.scars || []).length > 0} />
      {unit && (
        <div style={{ marginBottom: "10px" }}>
          <label style={labelStyle}>Scar to remove</label>
          <select style={{ ...inputStyle, cursor: "pointer" }} value={scarIdx} onChange={(e) => setScarIdx(e.target.value)}>
            <option value="">— select scar —</option>
            {scars.map((s, i) => <option key={i} value={i}>{s.name}{s.effect ? ` · ${s.effect}` : ""}</option>)}
          </select>
        </div>
      )}
      <ActionChip label={busy ? "Spending…" : "Repair (−1 RP)"} color={C.green} hoverColor={C.green} disabled={!unit || scarIdx === "" || busy}
        onClick={() => { if (unit && scarIdx !== "") onCommit({ unitId, updates: { scars: scars.filter((_, j) => j !== parseInt(scarIdx, 10)) } }); }} />
    </>
  );
}

function HeroicRelic({ units, onCommit, busy }) {
  const [unitId, setUnitId] = useState("");
  const [presetIdx, setPresetIdx] = useState("");
  const [name, setName] = useState("");
  const [effect, setEffect] = useState("");
  const [flag, setFlag] = useState("");
  const unit = units.find((u) => u.id === unitId);

  const applyPreset = (v) => {
    setPresetIdx(v);
    const p = HONOUR_EXTRAS[parseInt(v, 10)];
    if (p) { setName(p.name); setEffect(p.effect); setFlag(p.flag || ""); }
  };

  const relic = () => {
    const e = { type: "relic", name: name.trim(), effect: effect.trim() };
    if (flag.trim()) e.flag = flag.trim();
    return e;
  };
  const ok = unit && name.trim() && !busy;
  return (
    <>
      <PickUnit units={units} value={unitId} onChange={setUnitId} label="Heroic+ unit" filter={(u) => isHeroicPlus(u.rank)} />
      <div style={{ marginBottom: "10px" }}>
        <label style={labelStyle}>Relic</label>
        <select style={{ ...inputStyle, cursor: "pointer", marginBottom: "6px" }} value={presetIdx} onChange={(e) => applyPreset(e.target.value)}>
          <option value="">— quick-pick —</option>
          {HONOUR_EXTRAS.map((p, i) => <option key={i} value={i}>{p.name} · {p.effect}{p.flag ? "  ◈" : ""}</option>)}
        </select>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          <input style={{ ...inputStyle, flex: "1 1 110px", fontSize: "12px", padding: "4px 8px" }} value={name} placeholder="relic name" onChange={(e) => setName(e.target.value)} />
          <input style={{ ...inputStyle, flex: "2 1 140px", fontSize: "12px", padding: "4px 8px" }} value={effect} placeholder="effect" onChange={(e) => setEffect(e.target.value)} />
          <input style={{ ...inputStyle, flex: "1 1 80px", fontSize: "11px", padding: "4px 8px" }} value={flag} placeholder="flag (opt.)" onChange={(e) => setFlag(e.target.value)} />
        </div>
      </div>
      <ActionChip label={busy ? "Spending…" : "Bestow Relic (−1 RP)"} color={C.green} hoverColor={C.green} disabled={!ok}
        onClick={() => ok && onCommit({ unitId, updates: { honours: [...(unit.honours || []), relic()] } })} />
    </>
  );
}

// ─── Panel ──────────────────────────────────────────────────────────────────────

const ACTIONS = [
  { key: "recruit",  label: "Fresh Recruits",        desc: "Add a unit to the Order of Battle" },
  { key: "rearm",    label: "Rearm and Resupply",    desc: "Change a unit's weapon loadout" },
  { key: "repair",   label: "Repair and Recuperate", desc: "Remove a battle scar from a unit" },
  { key: "supply",   label: "Increase Supply Limit", desc: "+100 pts to the supply limit" },
  { key: "relic",    label: "Heroic Relic",          desc: "Give a Heroic+ unit a Crusade Relic" },
];

export function RPActions({ campaign, units, onReload, onError }) {
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(null);
  const rp = campaign.rp || 0;
  const canSpend = rp >= COST;

  // Run an action's mutation(s), then decrement RP and reload.
  const commit = async ({ createBody, unitId, updates, campaignUpdates } = {}) => {
    if (!canSpend) { onError?.("Not enough RP."); return; }
    setBusy(true);
    try {
      if (createBody) await createUnit(campaign.id, createBody);
      if (unitId && updates) await updateUnit(unitId, updates);
      await updateCampaign(campaign.id, { rp: rp - COST, ...(campaignUpdates || {}) });
      setOpen(null);
      setFlash(`${ACTIONS.find((a) => a.key === open)?.label || "Action"} applied · −${COST} RP`);
      await onReload?.();
      setTimeout(() => setFlash(null), 5000);
    } catch (e) {
      onError?.(e.message || "RP action failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ border: `1px solid ${C.border}`, background: C.panel, padding: "16px 18px" }}>
      <SectionHeader title="Requisition" subtitle={`${rp} RP available`} />

      {flash && (
        <div style={{ border: `1px solid ${C.green}`, background: "#06140a", color: C.green, padding: "8px 12px", fontFamily: "monospace", fontSize: "12px", marginBottom: "12px" }}>✓ {flash}</div>
      )}

      {!open ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {ACTIONS.map((a) => (
            <div key={a.key} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px",
              border: `1px solid ${C.border}`, background: C.bgDark, padding: "8px 12px",
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: C.green, fontSize: "12px", fontFamily: "monospace" }}>{a.label}</div>
                <div style={{ color: C.dim, fontSize: "10px", fontFamily: "monospace" }}>{a.desc}</div>
              </div>
              <ActionChip label={`${COST} RP`} color={canSpend ? C.cyan : C.dim} hoverColor={canSpend ? C.green : C.dim}
                disabled={!canSpend} onClick={() => setOpen(a.key)} />
            </div>
          ))}
          {!canSpend && (
            <div style={{ color: C.dim, fontSize: "11px", fontFamily: "monospace", fontStyle: "italic", marginTop: "4px" }}>
              Win battles to earn more Requisition Points.
            </div>
          )}
        </div>
      ) : (
        <Frame title={ACTIONS.find((a) => a.key === open)?.label} onCancel={() => setOpen(null)}>
          {open === "recruit" && <FreshRecruits onCommit={commit} busy={busy} />}
          {open === "rearm"   && <Rearm units={units} onCommit={commit} busy={busy} />}
          {open === "repair"  && <Repair units={units} onCommit={commit} busy={busy} />}
          {open === "supply"  && (
            <ActionChip label={busy ? "Spending…" : `+100 pts (−${COST} RP)`} color={C.green} hoverColor={C.green} disabled={busy}
              onClick={() => commit({ campaignUpdates: { supply_limit: (campaign.supply_limit || 0) + 100 } })} />
          )}
          {open === "relic"   && <HeroicRelic units={units} onCommit={commit} busy={busy} />}
        </Frame>
      )}
    </div>
  );
}

export default RPActions;
