/**
 * MusterPanel — select an Order-of-Battle detachment for a battle.
 *
 * Checkbox unit selector with a running point counter against a battle point
 * limit, plus a "Mark for Greatness" pick. "Start Battle" pushes the selected,
 * crusade-enriched units into the engine's player roster (via startBattle) so
 * the terminal's combat/spec commands immediately use the crusade data.
 */

import { useState } from "react";
import { C } from "../shared/colors";
import { ActionChip, SectionHeader, RankBadge, inputStyle, labelStyle } from "./ui";
import { startBattle } from "@/lib/crusade";

function Row({ unit, checked, marked, onToggle, onMark }) {
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: "10px", padding: "6px 10px",
        border: `1px solid ${checked ? C.bordermid : C.border}`,
        background: checked ? C.panel : "transparent",
        fontFamily: "monospace", transition: "border-color 0.1s, background 0.1s",
      }}
    >
      <span
        onClick={onToggle}
        style={{
          width: "16px", height: "16px", border: `1px solid ${checked ? C.green : C.border}`,
          color: C.green, fontSize: "12px", lineHeight: "14px", textAlign: "center",
          cursor: "pointer", flexShrink: 0, userSelect: "none",
        }}
      >{checked ? "✓" : ""}</span>
      <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={onToggle}>
        <span style={{ color: unit.is_leader ? C.amber : C.green, fontSize: "13px", fontWeight: unit.is_leader ? 600 : 400 }}>
          {marked ? "★ " : ""}{unit.nickname || unit.unit_name}
        </span>
        {unit.nickname && <span style={{ color: C.dim, fontSize: "11px", marginLeft: "8px" }}>{unit.unit_name}</span>}
        <span style={{ marginLeft: "8px" }}><RankBadge rank={unit.rank} /></span>
      </div>
      {checked && (
        <span
          onClick={onMark}
          title="Mark for Greatness"
          style={{
            color: marked ? C.yellow : C.dim, cursor: "pointer", fontSize: "13px",
            flexShrink: 0, userSelect: "none",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = C.yellow; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = marked ? C.yellow : C.dim; }}
        >★</span>
      )}
      <span style={{ color: C.dim, fontSize: "11px", flexShrink: 0, minWidth: "48px", textAlign: "right" }}>{unit.points} pts</span>
    </div>
  );
}

export function MusterPanel({ campaign, units, engineId, onInject, onClose }) {
  const [limit, setLimit] = useState(1000);
  const [selected, setSelected] = useState(() => new Set());
  const [marked, setMarked] = useState(null);   // unit id marked for greatness
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);       // { count, points }

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); if (marked === id) setMarked(null); }
      else next.add(id);
      return next;
    });
  };

  const selectedUnits = units.filter((u) => selected.has(u.id));
  const total = selectedUnits.reduce((s, u) => s + (u.points || 0), 0);
  const over = total > limit;

  const start = async () => {
    if (!selectedUnits.length) { setError("Select at least one unit."); return; }
    if (!engineId) { setError("No engine connected."); return; }
    setBusy(true); setError(null);
    try {
      await startBattle(engineId, selectedUnits, campaign.faction);
      setDone({ count: selectedUnits.length, points: total });
    } catch (e) {
      setError(e.message || "Failed to start battle");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div style={{ border: `1px solid ${C.green}`, background: "#06140a", padding: "16px 18px", fontFamily: "monospace" }}>
        <div style={{ color: C.green, fontSize: "14px", fontWeight: 700, marginBottom: "6px" }}>
          ✓ Battle mustered
        </div>
        <div style={{ color: C.mid, fontSize: "12px", lineHeight: 1.7, marginBottom: "12px" }}>
          {done.count} unit{done.count === 1 ? "" : "s"} ({done.points} pts) are now your active player roster, enriched with
          rank, honours, and scars. Switch to the TERMINAL and run combat commands —
          battle traits auto-apply to the math (look for ◈ markers).
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <ActionChip label="→ Open Terminal" color={C.cyan} hoverColor={C.green}
            onClick={() => { onInject?.("home"); }} />
          <ActionChip label="Done" color={C.dim} hoverColor={C.cyan} onClick={onClose} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ border: `1px solid ${C.border}`, background: C.panel, padding: "16px 18px" }}>
      <SectionHeader
        title="Muster for Battle"
        subtitle={`${selectedUnits.length} selected`}
        right={<ActionChip label="✕ Close" color={C.dim} hoverColor={C.cyan} onClick={onClose} />}
      />

      <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "flex-end", marginBottom: "14px" }}>
        <div style={{ width: "140px" }}>
          <label style={labelStyle}>Point limit</label>
          <input style={inputStyle} type="number" min={0} step={100} value={limit}
            onChange={(e) => setLimit(parseInt(e.target.value || "0", 10))} />
        </div>
        <div style={{ flex: 1, minWidth: "160px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "monospace", fontSize: "11px", marginBottom: "4px" }}>
            <span style={{ color: C.dim }}>SELECTED</span>
            <span style={{ color: over ? C.red : C.green }}>{total} / {limit} pts{over ? `  (+${total - limit} over)` : ""}</span>
          </div>
          <div style={{ height: "5px", background: C.bgDark, border: `1px solid ${C.border}` }}>
            <div style={{ width: `${limit > 0 ? Math.min(100, (total / limit) * 100) : 0}%`, height: "100%", background: over ? C.red : C.green, transition: "width 0.2s" }} />
          </div>
        </div>
      </div>

      {units.length === 0 ? (
        <div style={{ color: C.dim, fontFamily: "monospace", fontSize: "12px", fontStyle: "italic", marginBottom: "12px" }}>
          No units in the Order of Battle yet. Add some before mustering.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginBottom: "14px" }}>
          {units.map((u) => (
            <Row
              key={u.id} unit={u}
              checked={selected.has(u.id)}
              marked={marked === u.id}
              onToggle={() => toggle(u.id)}
              onMark={() => setMarked(marked === u.id ? null : u.id)}
            />
          ))}
        </div>
      )}

      {error && <div style={{ color: C.red, fontFamily: "monospace", fontSize: "12px", marginBottom: "10px" }}>✗ {error}</div>}

      <div style={{ display: "flex", gap: "10px" }}>
        <ActionChip
          label={busy ? "Starting…" : "⚔ Start Battle"}
          color={C.green} hoverColor={C.green}
          disabled={busy || selectedUnits.length === 0}
          onClick={start}
        />
        <ActionChip label="Cancel" color={C.dim} hoverColor={C.red} onClick={onClose} />
      </div>
    </div>
  );
}

export default MusterPanel;
