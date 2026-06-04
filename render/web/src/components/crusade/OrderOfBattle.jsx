/**
 * OrderOfBattle — editable Order of Battle for a Crusade campaign.
 *
 * - Lists the campaign's CrusadeUnits with a live point total vs supply limit.
 * - Add a unit manually, or import a whole roster from pasted CT roster text
 *   (parsed with the shared parseRosterUnits, appended, duplicates skipped).
 * - Click a unit to expand its CrusadeCard for detail editing.
 */

import { useState } from "react";
import { C } from "../shared/colors";
import { ActionChip, SectionHeader, RankBadge, inputStyle, labelStyle } from "./ui";
import { CrusadeCard } from "./CrusadeCard";
import { createUnit, updateUnit, deleteUnit, importUnits } from "@/lib/crusade";
import { parseRosterUnits } from "@/lib/rosterParse";

// ─── Supply gauge ──────────────────────────────────────────────────────────────

function SupplyGauge({ used, limit }) {
  const over = used > limit;
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  const fill = over ? C.red : C.green;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "monospace", fontSize: "11px", marginBottom: "4px" }}>
        <span style={{ color: C.dim }}>SUPPLY USED</span>
        <span style={{ color: over ? C.red : C.green }}>
          {used} / {limit} pts{over ? `  (+${used - limit} over)` : ""}
        </span>
      </div>
      <div style={{ height: "5px", background: C.bgDark, border: `1px solid ${C.border}` }}>
        <div style={{ width: `${pct}%`, height: "100%", background: fill, transition: "width 0.2s" }} />
      </div>
    </div>
  );
}

// ─── Add-unit inline form ───────────────────────────────────────────────────────

function AddUnitForm({ onAdd, onCancel, busy }) {
  const [name, setName] = useState("");
  const [points, setPoints] = useState(0);
  const [models, setModels] = useState(1);
  const [isLeader, setIsLeader] = useState(false);
  const canAdd = name.trim() && !busy;

  return (
    <div style={{ border: `1px solid ${C.border}`, background: C.bgDark, padding: "12px 14px" }}>
      <div style={{ color: C.amber, fontSize: "11px", fontFamily: "monospace", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "10px" }}>
        Add Unit
      </div>
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "10px" }}>
        <div style={{ flex: "3 1 200px" }}>
          <label style={labelStyle}>Datasheet name</label>
          <input style={inputStyle} value={name} autoFocus placeholder="Hammerhead Gunship"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && canAdd) onAdd({ name, points, models, isLeader }); }} />
        </div>
        <div style={{ flex: "1 1 80px" }}>
          <label style={labelStyle}>Points</label>
          <input style={inputStyle} type="number" min={0} value={points}
            onChange={(e) => setPoints(parseInt(e.target.value || "0", 10))} />
        </div>
        <div style={{ flex: "1 1 70px" }}>
          <label style={labelStyle}>Models</label>
          <input style={inputStyle} type="number" min={1} value={models}
            onChange={(e) => setModels(parseInt(e.target.value || "1", 10))} />
        </div>
      </div>
      <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
        <ActionChip label={isLeader ? "★ Leader" : "Not a leader"} color={isLeader ? C.amber : C.dim}
          hoverColor={isLeader ? C.amber : C.cyan} onClick={() => setIsLeader(!isLeader)} />
        <div style={{ flex: 1 }} />
        <ActionChip label={busy ? "Adding…" : "Add"} color={C.green} hoverColor={C.green}
          disabled={!canAdd} onClick={() => canAdd && onAdd({ name, points, models, isLeader })} />
        <ActionChip label="Cancel" color={C.dim} hoverColor={C.red} onClick={onCancel} />
      </div>
    </div>
  );
}

// ─── Import-from-roster flow ────────────────────────────────────────────────────

function ImportFlow({ campaign, existing, onImported, onCancel, onError }) {
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState(null);  // null | unit[]
  const [busy, setBusy] = useState(false);

  const existingKeys = new Set(
    existing.map((u) => `${(u.unit_name || "").toLowerCase()}|${(u.nickname || "").toLowerCase()}`)
  );

  const doParse = () => {
    const units = parseRosterUnits({ faction: campaign.faction, content: text });
    setParsed(units);
  };

  const doImport = async () => {
    setBusy(true);
    try {
      const res = await importUnits(campaign.id, parsed, { existing, mode: "skip" });
      onImported(res);
    } catch (e) {
      onError?.(e.message || "Import failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ border: `1px solid ${C.border}`, background: C.bgDark, padding: "14px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
        <span style={{ color: C.amber, fontSize: "12px", fontFamily: "monospace", letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Import from Roster Text
        </span>
        <ActionChip label="Cancel" color={C.dim} hoverColor={C.red} onClick={onCancel} />
      </div>

      {!parsed ? (
        <>
          <div style={{ color: C.dim, fontSize: "11px", fontFamily: "monospace", marginBottom: "8px", lineHeight: 1.6 }}>
            Paste CT roster text. Units are appended to the Order of Battle;
            duplicates already present are skipped.
          </div>
          <textarea
            rows={8} value={text} placeholder="3x Crisis Fireknife Battlesuits (120 pts)&#10;Char1: 1x Commander Farsight (95 pts)&#10;…"
            onChange={(e) => setText(e.target.value)}
            style={{ ...inputStyle, resize: "vertical", fontSize: "12px", lineHeight: 1.5 }}
          />
          <div style={{ marginTop: "10px" }}>
            <ActionChip label="Parse →" color={C.green} hoverColor={C.green}
              disabled={!text.trim()} onClick={doParse} />
          </div>
        </>
      ) : (
        <>
          {parsed.length === 0 ? (
            <div style={{ color: C.red, fontSize: "12px", fontFamily: "monospace", marginBottom: "10px" }}>
              No units recognised in that text. Check the format and try again.
            </div>
          ) : (
            <>
              <div style={{ color: C.dim, fontSize: "11px", fontFamily: "monospace", marginBottom: "8px" }}>
                {parsed.length} unit{parsed.length === 1 ? "" : "s"} parsed:
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "2px", marginBottom: "12px", maxHeight: "220px", overflow: "auto" }}>
                {parsed.map((u, i) => {
                  const dup = existingKeys.has(`${u.name.toLowerCase()}|${(u.nickname || "").toLowerCase()}`);
                  return (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", fontFamily: "monospace", fontSize: "12px", padding: "2px 0", opacity: dup ? 0.45 : 1 }}>
                      <span style={{ color: u.is_leader ? C.amber : C.mid }}>
                        {u.is_leader ? "★ " : ""}{u.models > 1 ? `${u.models}× ` : ""}{u.name}
                        {dup && <span style={{ color: C.dim, marginLeft: "8px", fontSize: "10px" }}>(already in OOB — skip)</span>}
                      </span>
                      <span style={{ color: C.dim }}>{u.points != null ? `${u.points} pts` : "—"}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
          <div style={{ display: "flex", gap: "10px" }}>
            {parsed.length > 0 && (
              <ActionChip label={busy ? "Importing…" : "Import units"} color={C.green} hoverColor={C.green}
                disabled={busy} onClick={doImport} />
            )}
            <ActionChip label="← Back" color={C.dim} hoverColor={C.cyan} onClick={() => setParsed(null)} />
          </div>
        </>
      )}
    </div>
  );
}

// ─── Unit row ───────────────────────────────────────────────────────────────────

function UnitRow({ unit, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        border: `1px solid ${C.border}`, background: C.panel, padding: "8px 12px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        gap: "10px", cursor: "pointer", transition: "border-color 0.1s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = C.bordermid; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = C.border; }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: 0 }}>
        <span style={{ color: unit.is_leader ? C.amber : C.green, fontSize: "13px", fontFamily: "monospace", fontWeight: unit.is_leader ? 600 : 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {unit.marked_for_greatness ? "★ " : ""}{unit.nickname || unit.unit_name}
        </span>
        {unit.nickname && (
          <span style={{ color: C.dim, fontSize: "11px", fontFamily: "monospace", whiteSpace: "nowrap" }}>{unit.unit_name}</span>
        )}
        <RankBadge rank={unit.rank} />
        <span style={{ color: C.amber, fontSize: "10px", fontFamily: "monospace" }}>{unit.xp} XP</span>
        {unit.attached_to && (
          <span style={{ color: C.dim, fontSize: "10px", fontFamily: "monospace" }}>→ {unit.attached_to}</span>
        )}
      </div>
      <span style={{ color: C.dim, fontSize: "11px", fontFamily: "monospace", flexShrink: 0 }}>{unit.points} pts</span>
    </div>
  );
}

// ─── Main panel ─────────────────────────────────────────────────────────────────

export function OrderOfBattle({ campaign, units, onReload, onError }) {
  const [mode, setMode] = useState("list");   // "list" | "add" | "import"
  const [expandedId, setExpandedId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(null);

  const oobPoints = units.reduce((sum, u) => sum + (u.points || 0), 0);

  const reload = async () => { await onReload?.(); };

  const handleAdd = async ({ name, points, models, isLeader }) => {
    setBusy(true);
    try {
      await createUnit(campaign.id, {
        unit_name: name.trim(), points: points || 0, models: models || 1, is_leader: !!isLeader,
      });
      setMode("list");
      await reload();
    } catch (e) {
      onError?.(e.message || "Failed to add unit");
    } finally {
      setBusy(false);
    }
  };

  const handleSaveCard = async (unitId, updates) => {
    setBusy(true);
    try {
      await updateUnit(unitId, updates);
      setExpandedId(null);
      await reload();
    } catch (e) {
      onError?.(e.message || "Failed to save unit");
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteCard = async (unitId) => {
    setBusy(true);
    try {
      await deleteUnit(unitId);
      setExpandedId(null);
      await reload();
    } catch (e) {
      onError?.(e.message || "Failed to remove unit");
    } finally {
      setBusy(false);
    }
  };

  const handleImported = async (res) => {
    setMode("list");
    setFlash(`Imported ${res.added} unit${res.added === 1 ? "" : "s"}${res.skipped ? `, skipped ${res.skipped} duplicate${res.skipped === 1 ? "" : "s"}` : ""}.`);
    await reload();
    setTimeout(() => setFlash(null), 5000);
  };

  const expanded = units.find((u) => u.id === expandedId);

  return (
    <div>
      <SectionHeader
        title="Order of Battle"
        subtitle={`${units.length} unit${units.length === 1 ? "" : "s"}`}
        right={mode === "list" ? (
          <div style={{ display: "flex", gap: "8px" }}>
            <ActionChip label="+ Add Unit" color={C.green} hoverColor={C.green} onClick={() => { setMode("add"); setExpandedId(null); }} />
            <ActionChip label="⇩ Import Roster" onClick={() => { setMode("import"); setExpandedId(null); }} />
          </div>
        ) : null}
      />

      <div style={{ marginBottom: "14px" }}>
        <SupplyGauge used={oobPoints} limit={campaign.supply_limit} />
      </div>

      {flash && (
        <div style={{ border: `1px solid ${C.green}`, background: "#06140a", color: C.green, padding: "8px 12px", fontFamily: "monospace", fontSize: "12px", marginBottom: "12px" }}>
          ✓ {flash}
        </div>
      )}

      {mode === "add" && (
        <div style={{ marginBottom: "14px" }}>
          <AddUnitForm onAdd={handleAdd} onCancel={() => setMode("list")} busy={busy} />
        </div>
      )}

      {mode === "import" && (
        <div style={{ marginBottom: "14px" }}>
          <ImportFlow campaign={campaign} existing={units} onImported={handleImported} onCancel={() => setMode("list")} onError={onError} />
        </div>
      )}

      {units.length === 0 && mode === "list" ? (
        <div style={{ border: `1px dashed ${C.border}`, padding: "22px", textAlign: "center", color: C.dim, fontSize: "12px", fontFamily: "monospace", lineHeight: 1.6 }}>
          No units yet. Add one manually or import a roster to start the Order of Battle.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {units.map((u) => (
            expandedId === u.id ? (
              <CrusadeCard
                key={u.id} unit={u} otherUnits={units}
                onSave={handleSaveCard} onDelete={handleDeleteCard}
                onClose={() => setExpandedId(null)} busy={busy}
              />
            ) : (
              <UnitRow key={u.id} unit={u} onClick={() => { setExpandedId(u.id); setMode("list"); }} />
            )
          ))}
        </div>
      )}
    </div>
  );
}

export default OrderOfBattle;
