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
import { ActionChip, RankBadge, rankLabel, rankColor, inputStyle, labelStyle } from "./ui";
import { RANK_NAMES, rankForXp, xpToNextRank } from "@/lib/crusade";
import { ALL_HONOUR_PRESETS, BATTLE_SCARS } from "@/lib/crusadeTraits";

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

function EntryList({ title, entries, onAdd, onRemove, accent, placeholderName, placeholderEffect, presets = [] }) {
  const [name, setName] = useState("");
  const [effect, setEffect] = useState("");
  const [flag, setFlag] = useState("");

  const add = () => {
    const n = name.trim();
    if (!n) return;
    const entry = { name: n, effect: effect.trim() };
    if (flag.trim()) entry.flag = flag.trim();
    onAdd(entry);
    setName(""); setEffect(""); setFlag("");
  };

  const applyPreset = (idx) => {
    if (idx === "") return;
    const p = presets[parseInt(idx, 10)];
    if (!p) return;
    setName(p.name); setEffect(p.effect); setFlag(p.flag || "");
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
                {e.flag && (
                  <span style={{ color: C.cyan, marginLeft: "8px", fontSize: "10px" }} title="auto-applies to combat math">
                    ◈ {e.flag}
                  </span>
                )}
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
      {presets.length > 0 && (
        <select
          style={{ ...inputStyle, fontSize: "11px", padding: "4px 8px", marginBottom: "6px", cursor: "pointer" }}
          value="" onChange={(e) => applyPreset(e.target.value)}
        >
          <option value="">— quick-pick from table —</option>
          {presets.map((p, i) => (
            <option key={i} value={i}>{p.name} · {p.effect}{p.flag ? "  ◈" : ""}</option>
          ))}
        </select>
      )}
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
        <input
          style={{ ...inputStyle, flex: "1 1 120px", fontSize: "12px", padding: "4px 8px" }}
          value={name} placeholder={placeholderName}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") add(); }}
        />
        <input
          style={{ ...inputStyle, flex: "2 1 160px", fontSize: "12px", padding: "4px 8px" }}
          value={effect} placeholder={placeholderEffect}
          onChange={(e) => setEffect(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") add(); }}
        />
        <input
          style={{ ...inputStyle, flex: "1 1 90px", fontSize: "11px", padding: "4px 8px" }}
          value={flag} placeholder="flag (opt.)"
          title="Engine combat flag, e.g. hitplus:1, fnp:6, lethal. Leave blank for display-only."
          onChange={(e) => setFlag(e.target.value)}
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

// ─── Counter stepper (edit mode, Decision D2 manual override) ──────────────────

function StepBtn({ label, onClick }) {
  return (
    <span
      onClick={onClick}
      style={{
        cursor: "pointer", userSelect: "none", color: C.dim,
        border: `1px solid ${C.border}`, borderRadius: "3px",
        width: "18px", height: "18px", lineHeight: "16px", textAlign: "center",
        fontFamily: "monospace", fontSize: "13px", display: "inline-block", flexShrink: 0,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = C.green; e.currentTarget.style.borderColor = C.green; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = C.dim; e.currentTarget.style.borderColor = C.border; }}
    >{label}</span>
  );
}

function Stepper({ label, value, onChange, color = C.green, min = 0 }) {
  const v = parseInt(value, 10) || 0;
  return (
    <div style={{ textAlign: "center", minWidth: "78px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "4px", marginBottom: "3px" }}>
        <StepBtn label="−" onClick={() => onChange(Math.max(min, v - 1))} />
        <input
          value={v}
          onChange={(e) => onChange(Math.max(min, parseInt(e.target.value.replace(/[^0-9]/g, "") || "0", 10)))}
          style={{
            width: "38px", textAlign: "center", background: C.bg, color,
            border: `1px solid ${C.border}`, fontFamily: "monospace", fontSize: "15px",
            fontWeight: 700, padding: "1px 0", outline: "none",
          }}
        />
        <StepBtn label="+" onClick={() => onChange(v + 1)} />
      </div>
      <div style={{ color: C.dim, fontSize: "8px", fontFamily: "monospace", letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</div>
    </div>
  );
}

// ─── Read-only chip list (honours / scars / loadout in view mode) ──────────────

function ReadChips({ entries, accent, plain = false }) {
  if (!entries || entries.length === 0) {
    return <span style={{ color: C.border, fontSize: "11px", fontFamily: "monospace", fontStyle: "italic" }}>none</span>;
  }
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
      {entries.map((e, i) => {
        const name = plain ? e : e.name;
        const effect = plain ? null : e.effect;
        return (
          <span key={i} style={{
            fontFamily: "monospace", fontSize: "11px", color: accent,
            border: `1px solid color-mix(in srgb, ${accent} 25%, transparent)`, borderRadius: "3px", padding: "1px 6px",
          }}>
            {name}{effect ? <span style={{ color: C.dim }}> · {effect}</span> : null}
          </span>
        );
      })}
    </div>
  );
}

function ReadRow({ label, children }) {
  return (
    <div style={{ marginBottom: "12px" }}>
      <div style={{ ...labelStyle, marginBottom: "5px" }}>{label}</div>
      {children}
    </div>
  );
}

// ─── Main card ─────────────────────────────────────────────────────────────────

export function CrusadeCard({ unit, otherUnits = [], onSave, onDelete, onClose, busy }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(unit);
  // Auto-derive rank from XP unless the stored rank already disagrees with it.
  const [autoRank, setAutoRank] = useState(unit.rank === rankForXp(unit.xp));
  const [cpTouched, setCpTouched] = useState(false);   // manual Crusade-Pts override
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setEditing(false);
    setDraft(unit);
    setAutoRank(unit.rank === rankForXp(unit.xp));
    setCpTouched(false);
    setConfirmDelete(false);
  }, [unit.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  const effectiveRank = autoRank ? rankForXp(draft.xp) : draft.rank;
  const nextRank = xpToNextRank(draft.xp);
  const died = !!draft.died;

  const startEdit = () => { setDraft(unit); setAutoRank(unit.rank === rankForXp(unit.xp)); setCpTouched(false); setEditing(true); };
  const cancelEdit = () => { setDraft(unit); setEditing(false); setConfirmDelete(false); };

  const handleSave = () => {
    const updates = {
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
      // Decision D2 — manual counter override.
      battles_fought: parseInt(draft.battles_fought, 10) || 0,
      battles_survived: parseInt(draft.battles_survived, 10) || 0,
      enemy_kills: parseInt(draft.enemy_kills, 10) || 0,
      died: !!draft.died,
    };
    // Only hand-write CrusadePoints when the user touched its stepper; otherwise
    // the store keeps it derived from honours − scars.
    if (cpTouched) updates.crusade_points = parseInt(draft.crusade_points, 10) || 0;
    onSave(unit.id, updates);
  };

  const attachOptions = otherUnits.filter((u) => u.id !== unit.id);
  const borderTint = died ? C.red : rankColor(effectiveRank);

  // ── Header (shared by read + edit) ──────────────────────────────────────
  const header = (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", marginBottom: "14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
        <span className="ct-display" style={{
          color: died ? C.dim : (draft.is_leader ? C.amber : C.text), fontSize: "16px", letterSpacing: "0.03em",
          textDecoration: died ? "line-through" : "none",
        }}>
          {draft.marked_for_greatness && !died ? "★ " : ""}{draft.nickname || draft.unit_name}
        </span>
        {draft.nickname && (
          <span style={{ color: C.dim, fontSize: "11px", fontFamily: "monospace" }}>{draft.unit_name}</span>
        )}
        {died ? (
          <span className="ct-display" style={{ color: C.red, fontSize: "9px", letterSpacing: "0.12em", border: `1px solid color-mix(in srgb, ${C.red} 33%, transparent)`, padding: "1px 6px" }}>✝ SLAIN</span>
        ) : (
          <RankBadge rank={effectiveRank} />
        )}
      </div>
      <div style={{ display: "flex", gap: "8px" }}>
        {!editing && <ActionChip label="✎ Edit" color={C.cyan} hoverColor={C.cyan} onClick={startEdit} />}
        <ActionChip label="✕ Close" color={C.dim} hoverColor={C.cyan} onClick={onClose} />
      </div>
    </div>
  );

  // ── READ VIEW ───────────────────────────────────────────────────────────
  if (!editing) {
    return (
      <div style={{ border: `1px solid color-mix(in srgb, ${borderTint} 33%, transparent)`, borderLeft: `3px solid ${borderTint}`, borderRadius: "5px", background: C.panel, padding: "16px 18px", opacity: died ? 0.7 : 1 }}>
        {header}

        <div style={{ display: "flex", gap: "18px", flexWrap: "wrap", marginBottom: "16px", paddingBottom: "14px", borderBottom: `1px solid ${C.border}` }}>
          <Counter label="XP" value={unit.xp} color={C.amber} />
          <Counter label="Battles" value={unit.battles_fought} />
          <Counter label="Survived" value={unit.battles_survived} color={C.cyan} />
          <Counter label="Kills" value={unit.enemy_kills} color={C.red} />
          <Counter label="Crusade Pts" value={unit.crusade_points} color={C.yellow} />
        </div>

        <div style={{ display: "flex", gap: "24px", flexWrap: "wrap", marginBottom: "12px" }}>
          <div style={{ fontFamily: "monospace", fontSize: "12px" }}>
            <span style={{ color: C.dim }}>Points </span><span style={{ color: C.text }}>{unit.points}</span>
            <span style={{ color: C.border }}>  ·  </span>
            <span style={{ color: C.dim }}>Models </span><span style={{ color: C.text }}>{unit.models}</span>
          </div>
          {unit.is_leader && <span style={{ color: C.amber, fontFamily: "monospace", fontSize: "12px" }}>★ Leader</span>}
          {unit.attached_to && <span style={{ color: C.cyan, fontFamily: "monospace", fontSize: "12px" }}>→ {unit.attached_to}</span>}
          {unit.marked_for_greatness && !died && <span style={{ color: C.yellow, fontFamily: "monospace", fontSize: "12px" }}>★ Marked for Greatness</span>}
        </div>

        <ReadRow label="Battle Honours"><ReadChips entries={unit.honours} accent={C.amber} /></ReadRow>
        <ReadRow label="Battle Scars"><ReadChips entries={unit.scars} accent={C.red} /></ReadRow>
        {(unit.loadout && unit.loadout.length > 0) && (
          <ReadRow label="Loadout"><ReadChips entries={unit.loadout} accent={C.green} plain /></ReadRow>
        )}
      </div>
    );
  }

  // ── EDIT VIEW (Decision D2 — full manual override) ──────────────────────
  return (
    <div style={{ border: `1px solid ${C.bordermid}`, borderRadius: "5px", background: C.panel, padding: "16px 18px" }}>
      {header}

      {/* Battle counters — manual steppers */}
      <div style={{ marginBottom: "16px", paddingBottom: "14px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ ...labelStyle, marginBottom: "8px" }}>Battle Record <span style={{ color: C.border }}>· manual override</span></div>
        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
          <Stepper label="Battles" value={draft.battles_fought} onChange={(v) => set({ battles_fought: v })} color={C.text} />
          <Stepper label="Survived" value={draft.battles_survived} onChange={(v) => set({ battles_survived: v })} color={C.cyan} />
          <Stepper label="Kills" value={draft.enemy_kills} onChange={(v) => set({ enemy_kills: v })} color={C.red} />
          <Stepper label="Crusade Pts" value={draft.crusade_points} onChange={(v) => { setCpTouched(true); set({ crusade_points: v }); }} color={C.yellow} min={-99} />
        </div>
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
            {RANK_NAMES.map((r) => <option key={r} value={r}>{rankLabel(r)}</option>)}
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
          {nextRank.remaining} XP to {rankLabel(nextRank.rank)}
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
        <div>
          <label style={labelStyle}>Status</label>
          <Toggle on={died} onToggle={() => set({ died: !died })}
            onLabel="✝ Slain" offLabel="Mark died" onColor={C.red} />
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
            presets={ALL_HONOUR_PRESETS}
            placeholderName="Expert Gunners" placeholderEffect="+1 to Hit (ranged)"
            onAdd={(e) => set({ honours: [...(draft.honours || []), e] })}
            onRemove={(i) => set({ honours: (draft.honours || []).filter((_, j) => j !== i) })}
          />
        </div>
        <div style={{ flex: "1 1 280px" }}>
          <EntryList
            title="Battle Scars" accent={C.red}
            entries={draft.scars || []}
            presets={BATTLE_SCARS}
            placeholderName="Deep Scars" placeholderEffect="-1 Leadership, -1 OC"
            onAdd={(e) => set({ scars: [...(draft.scars || []), e] })}
            onRemove={(i) => set({ scars: (draft.scars || []).filter((_, j) => j !== i) })}
          />
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: "10px", justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: "10px" }}>
          <ActionChip label={busy ? "Saving…" : "✓ Save"} color={C.green} hoverColor={C.green} disabled={busy} onClick={handleSave} />
          <ActionChip label="Cancel" color={C.dim} hoverColor={C.cyan} onClick={cancelEdit} />
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
