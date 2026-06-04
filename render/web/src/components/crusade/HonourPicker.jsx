/**
 * HonourPicker — choose battle honour(s) when a unit ranks up (CRUSADE_SPEC §3.5).
 *
 * Reuses the crusadeTraits preset tables (each carries an optional combat flag,
 * so a chosen honour auto-applies to the math next muster). The unit earns one
 * honour slot per rank tier crossed; the picker lets the user fill up to `slots`
 * (filling fewer is allowed — an honour can be banked for later).
 *
 * Returns honour objects shaped exactly like the stored honours/scars:
 *   { name, effect, flag? }
 */

import { useState } from "react";
import { C } from "../shared/colors";
import { ActionChip, inputStyle } from "./ui";
import {
  BATTLE_TRAITS_INFANTRY, BATTLE_TRAITS_VEHICLE, HONOUR_EXTRAS,
} from "@/lib/crusadeTraits";

const GROUPS = [
  { label: "Infantry Traits", items: BATTLE_TRAITS_INFANTRY },
  { label: "Vehicle Traits", items: BATTLE_TRAITS_VEHICLE },
  { label: "Relics / Enhancements", items: HONOUR_EXTRAS },
];

export function HonourPicker({ slots = 1, value = [], onChange }) {
  const [name, setName] = useState("");
  const [effect, setEffect] = useState("");
  const [flag, setFlag] = useState("");

  const full = value.length >= slots;

  const addEntry = (entry) => {
    if (value.length >= slots) return;
    onChange([...value, entry]);
  };

  const addCustom = () => {
    const n = name.trim();
    if (!n || full) return;
    const e = { name: n, effect: effect.trim() };
    if (flag.trim()) e.flag = flag.trim();
    addEntry(e);
    setName(""); setEffect(""); setFlag("");
  };

  const applyPreset = (val) => {
    if (val === "" || full) return;
    const [g, i] = val.split(":").map((n) => parseInt(n, 10));
    const p = GROUPS[g]?.items[i];
    if (p) addEntry({ name: p.name, effect: p.effect, ...(p.flag ? { flag: p.flag } : {}) });
  };

  return (
    <div style={{ border: `1px solid ${C.amber}55`, padding: "10px 12px", background: C.bgDark, marginTop: "8px" }}>
      <div style={{ color: C.amber, fontSize: "10px", fontFamily: "monospace", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "8px" }}>
        Promoted — pick battle honour <span style={{ color: C.dim }}>({value.length}/{slots})</span>
      </div>

      {value.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginBottom: "8px" }}>
          {value.map((e, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontFamily: "monospace", fontSize: "12px" }}>
              <span style={{ minWidth: 0 }}>
                <span style={{ color: C.amber }}>{e.name}</span>
                {e.effect && <span style={{ color: C.dim, marginLeft: "8px" }}>{e.effect}</span>}
                {e.flag && <span style={{ color: C.cyan, marginLeft: "8px", fontSize: "10px" }} title="auto-applies to combat math">◈ {e.flag}</span>}
              </span>
              <span onClick={() => onChange(value.filter((_, j) => j !== i))}
                style={{ color: C.dim, cursor: "pointer", flexShrink: 0 }}
                onMouseEnter={(ev) => { ev.currentTarget.style.color = C.red; }}
                onMouseLeave={(ev) => { ev.currentTarget.style.color = C.dim; }}>✕</span>
            </div>
          ))}
        </div>
      )}

      {!full && (
        <>
          <select
            style={{ ...inputStyle, fontSize: "11px", padding: "4px 8px", marginBottom: "6px", cursor: "pointer" }}
            value="" onChange={(e) => applyPreset(e.target.value)}
          >
            <option value="">— quick-pick honour —</option>
            {GROUPS.map((g, gi) => (
              <optgroup key={gi} label={g.label}>
                {g.items.map((p, i) => (
                  <option key={i} value={`${gi}:${i}`}>{p.name} · {p.effect}{p.flag ? "  ◈" : ""}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            <input style={{ ...inputStyle, flex: "1 1 110px", fontSize: "12px", padding: "4px 8px" }}
              value={name} placeholder="custom name" onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addCustom(); }} />
            <input style={{ ...inputStyle, flex: "2 1 140px", fontSize: "12px", padding: "4px 8px" }}
              value={effect} placeholder="effect" onChange={(e) => setEffect(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addCustom(); }} />
            <input style={{ ...inputStyle, flex: "1 1 80px", fontSize: "11px", padding: "4px 8px" }}
              value={flag} placeholder="flag (opt.)" onChange={(e) => setFlag(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addCustom(); }} />
            <ActionChip label="+ Add" color={C.amber} hoverColor={C.amber} onClick={addCustom} />
          </div>
        </>
      )}
    </div>
  );
}

export default HonourPicker;
