/**
 * CrusadeCard — per-unit Crusade Card detail view + editor.
 *
 * Edits one CrusadeUnit row: nickname, points/models, leader flag, attachment,
 * XP (with auto-derived rank + manual override), loadout, battle honours,
 * battle scars, and the "marked for greatness" flag. Battle counters
 * (fought / survived / kills / crusade points) are shown read-only — they are
 * driven by the post-battle flow in a later session.
 *
 * Honours and scars are free-form { name, effect } objects in this session;
 * the structured HonourPicker with full trait tables arrives in Session 4/5.
 */

import { useState, useEffect } from "react";
import { C } from "../shared/colors";
import { ActionChip, RankBadge, inputStyle, labelStyle } from "./ui";
import { RANK_NAMES, rankForXp, xpToNextRank } from "@/lib/crusade";

function Counter({ label, value, color = C.green }) {
  return (
    <div style={{ textAlign: "center", minWidth: "58px" }}>
      <div style={{ color, fontSize: "16px", fontFamily: "monospace", fontWeight: 700 }}>{value}</div>
      <div style={{ color: C.dim, fontSize: "8px", fontFamily: "monospace", letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ flex: 1, minWidth: "90px" }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

// ─── Honour / Scar editor ──────────────────────────────────────────────────────

function EntryList({ title, entries, onAdd, onRemove, accent, placeholderName, placeholderEffect }) {
  const [name, setName] = useState("");
  const [effect, setEffect] = useState("");

  const add = () => {
    const n = name.trim();
    if (!n) return;
    onAdd({ name: n, effect: effect.trim() });
    setName(""); setEffect("");
  };

  return (
    <div style={{ border: `1px solid ${C.border}`, padding: "10px 12px", background: C.bgDark }}>
      <div style={{ color: accent, fontSize: "11px", fontFamily: "monospace", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "8px" }}>
        {title} <span style={{ color: C.dim }}>({entries.length})</span>
      </div>
      {entries.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginBottom: "8px" }}>
          {entries.map((e, i) => (
            <div key={i} style={{ display: "flex", alignItems: "baseline", gap: "8px", justifyContent: "space-between" }}>
              <div style={{ fontFamily: "monospace", fontSize: "12px", flex: 1, minWidth: 0 }}>
                <span style={{ color: accent }}>{e.name}</span>
                {e.effect && <span style={{ color: C.dim, marginLeft: "8px" }}>{e.effect}</span>}
              </div>
              <span
                onClick={() => onRemove(i)}
                style={{ color: C.dim, cursor: "pointer", fontSize: "12px", flexShrink: 0 }}
                onMouseEnter={(ev) => { ev.currentTarget.style.color = C.red; }}
                onMouseLeave={(ev) => { ev.currentTarget.style.color = C.dim; }}
              >✕</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
        <input
          style={{ ...inputStyle, flex: "1 1 130px", fontSize: "12px", padding: "4px 8px" }}
          value={name} placeholder={placeholderName}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") add(); }}
        />
        <input
          style={{ ...inputStyle, flex: "2 1 180px", fontSize: "12px", padding: "4px 8px" }}
          value={effect} placeholder={placeholderEffect}
          onChange={(e) => setEffect(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") add(); }}
        />
        <ActionChip label="+ Add" color={accent} hoverColor={accent} onClick={add} />
      </div>
    </div>
  );
}

// ─── Loadout editor ────────────────────────────────────────────────────────────

function LoadoutEditor({ weapons, onChange }) {
  const [val, setVal] = useState("");
  const add = () => {
    const w = val.trim();
    if (!w) return;
    onChange([...weapons, w]);
    setVal("");
  };
  return (
    <div>
      <label style={labelStyle}>Loadout</label>
      {weapons.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "8px" }}>
          {weapons.map((w, i) => (
            <span key={i} style={{
              fontFamily: "monospace", fontSize: "11px", color: C.green,
              border: `1px solid ${C.border}`, padding: "2px 6px",
              display: "inline-flex", alignItems: "center", gap: "6px",
            }}>
              {w}
              <span
                onClick={() => onChange(weapons.filter((_, j) => j !== i))}
                style={{ color: C.dim, cursor: "pointer" }}
                onMouseEnter={(e) => { e.currentTarget.style.color = C.red; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = C.dim; }}
              >✕</span>
            </span>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: "6px" }}>
        <input
          style={{ ...inputStyle, fontSize: "12px", padding: "4px 8px" }}
          value={val} placeholder="Add a weapon…"
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") add(); }}
        />
        <ActionChip label="+ Add" onClick={add} />
      </div>
    </div>
  );
}

// ─── Toggle chip ───────────────────────────────────────────────────────────────

function Toggle({ on, onToggle, onLabel, offLabel, onColor = C.green }) {
  return (
    <ActionChip
      label={on ? onLabel : offLabel}
      color={on ? onColor : C.dim}
      hoverColor={on ? onColor : C.cyan}
      onClick={onToggle}
    />
  );
}

// ─── Main card ─────────────────────────────────────────────────────────────────

export function CrusadeCard({ unit, otherUnits = [], onSave, onDelete, onClose, busy }) {
  const [draft, setDraft] = useState(unit);
  // Auto-derive rank from XP unless the stored rank already disagrees with it.
  const [autoRank, setAutoRank] = useState(unit.rank === rankForXp(unit.xp));
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setDraft(unit);
    setAutoRank(unit.rank === rankForXp(unit.xp));
  }, [unit.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  const effectiveRank = autoRank ? rankForXp(draft.xp) : draft.rank;
  const nextRank = xpToNextRank(draft.xp);

  const handleSave = () => {
    onSave(unit.id, {
      nickname: draft.nickname || "",
      points: parseInt(draft.points, 10) || 0,
      models: parseInt(draft.models, 10) || 1,
      is_leader: !!draft.is_leader,
      attached_to: draft.attached_to || "",
      xp: parseInt(draft.xp, 10) || 0,
      rank: effectiveRank,
      loadout: draft.loadout || [],
      honours: draft.honours || [],
      scars: draft.scars || [],
      marked_for_greatness: !!draft.marked_for_greatness,
    });
  };

  const attachOptions = otherUnits.filter((u) => u.id !== unit.id);

  return (
    <div style={{ border: `1px solid ${C.bordermid}`, background: C.panel, padding: "16px 18px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", marginBottom: "14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <span style={{ color: C.amber, fontSize: "15px", fontWeight: 700, fontFamily: "monospace" }}>
            {draft.marked_for_greatness ? "★ " : ""}{draft.nickname || draft.unit_name}
          </span>
          {draft.nickname && (
            <span style={{ color: C.dim, fontSize: "11px", fontFamily: "monospace" }}>{draft.unit_name}</span>
          )}
          <RankBadge rank={effectiveRank} />
        </div>
        <ActionChip label="✕ Close" color={C.dim} hoverColor={C.cyan} onClick={onClose} />
      </div>

      {/* Read-only battle counters */}
      <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", marginBottom: "16px", paddingBottom: "14px", borderBottom: `1px solid ${C.border}` }}>
        <Counter label="XP" value={draft.xp} color={C.amber} />
        <Counter label="Battles" value={unit.battles_fought} />
        <Counter label="Survived" value={unit.battles_survived} color={C.cyan} />
        <Counter label="Kills" value={unit.enemy_kills} color={C.red} />
        <Counter label="Crusade Pts" value={unit.crusade_points} color={C.yellow} />
      </div>

      {/* Identity row */}
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "14px" }}>
        <Field label="Nickname">
          <input style={inputStyle} value={draft.nickname || ""} placeholder="(none)"
            onChange={(e) => set({ nickname: e.target.value })} />
        </Field>
        <Field label="Points">
          <input style={inputStyle} type="number" min={0} value={draft.points}
            onChange={(e) => set({ points: e.target.value })} />
        </Field>
        <Field label="Models">
          <input style={inputStyle} type="number" min={1} value={draft.models}
            onChange={(e) => set({ models: e.target.value })} />
        </Field>
      </div>

      {/* XP + rank row */}
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "14px", alignItems: "flex-end" }}>
        <Field label="XP">
          <input style={inputStyle} type="number" min={0} value={draft.xp}
            onChange={(e) => set({ xp: e.target.value })} />
        </Field>
        <Field label={`Rank${autoRank ? " (auto from XP)" : " (manual)"}`}>
          <select
            style={{ ...inputStyle, cursor: autoRank ? "default" : "pointer", opacity: autoRank ? 0.6 : 1 }}
            value={effectiveRank}
            disabled={autoRank}
            onChange={(e) => set({ rank: e.target.value })}
          >
            {RANK_NAMES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </Field>
        <div style={{ paddingBottom: "1px" }}>
          <Toggle
            on={autoRank}
            onToggle={() => {
              if (autoRank) { setAutoRank(false); set({ rank: rankForXp(draft.xp) }); }
              else { setAutoRank(true); }
            }}
            onLabel="Auto ◈" offLabel="Manual" onColor={C.cyan}
          />
        </div>
      </div>
      {nextRank && (
        <div style={{ color: C.dim, fontSize: "10px", fontFamily: "monospace", marginTop: "-8px", marginBottom: "14px" }}>
          {nextRank.remaining} XP to {nextRank.rank}
        </div>
      )}

      {/* Leader + attachment + greatness */}
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "16px", alignItems: "flex-end" }}>
        <div>
          <label style={labelStyle}>Leader</label>
          <Toggle on={!!draft.is_leader} onToggle={() => set({ is_leader: !draft.is_leader })}
            onLabel="★ Leader" offLabel="Not a leader" onColor={C.amber} />
        </div>
        <Field label="Attached to">
          <select style={{ ...inputStyle, cursor: "pointer" }} value={draft.attached_to || ""}
            onChange={(e) => set({ attached_to: e.target.value })}>
            <option value="">— none —</option>
            {attachOptions.map((u) => {
              const lbl = u.nickname || u.unit_name;
              return <option key={u.id} value={lbl}>{lbl}</option>;
            })}
          </select>
        </Field>
        <div>
          <label style={labelStyle}>Marked</label>
          <Toggle on={!!draft.marked_for_greatness} onToggle={() => set({ marked_for_greatness: !draft.marked_for_greatness })}
            onLabel="★ Greatness" offLabel="Not marked" onColor={C.yellow} />
        </div>
      </div>

      {/* Loadout */}
      <div style={{ marginBottom: "16px" }}>
        <LoadoutEditor weapons={draft.loadout || []} onChange={(w) => set({ loadout: w })} />
      </div>

      {/* Honours + scars */}
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "18px" }}>
        <div style={{ flex: "1 1 280px" }}>
          <EntryList
            title="Battle Honours" accent={C.amber}
            entries={draft.honours || []}
            placeholderName="Expert Gunners" placeholderEffect="+1 to Hit (ranged)"
            onAdd={(e) => set({ honours: [...(draft.honours || []), e] })}
            onRemove={(i) => set({ honours: (draft.honours || []).filter((_, j) => j !== i) })}
          />
        </div>
        <div style={{ flex: "1 1 280px" }}>
          <EntryList
            title="Battle Scars" accent={C.red}
            entries={draft.scars || []}
            placeholderName="Deep Scars" placeholderEffect="-1 Leadership, -1 OC"
            onAdd={(e) => set({ scars: [...(draft.scars || []), e] })}
            onRemove={(i) => set({ scars: (draft.scars || []).filter((_, j) => j !== i) })}
          />
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: "10px", justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: "10px" }}>
          <ActionChip label={busy ? "Saving…" : "Save Card"} color={C.green} hoverColor={C.green} disabled={busy} onClick={handleSave} />
          <ActionChip label="Cancel" color={C.dim} hoverColor={C.cyan} onClick={onClose} />
        </div>
        {confirmDelete ? (
          <ActionChip label="Confirm Remove" color={C.red} hoverColor={C.red} onClick={() => onDelete(unit.id)} />
        ) : (
          <ActionChip label="Remove Unit" color={C.dim} hoverColor={C.red} onClick={() => setConfirmDelete(true)} />
        )}
      </div>
    </div>
  );
}

export default CrusadeCard;
