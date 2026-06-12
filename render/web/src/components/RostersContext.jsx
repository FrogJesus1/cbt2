/**
 * RostersContext
 *
 * Roster management dashboard with inline upload/delete flows.
 * All roster operations happen directly via API — no terminal.
 *
 * Upload flow (user's spec):
 *   1. Paste or upload roster
 *   2. Auto-detect faction (or numbered list if unsure)
 *   3. Name it
 *   4. Choose: load as player / load as enemy / just save
 *   → Back to dashboard
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  listCampaigns, getCampaignCount,
} from "@/lib/vfs";
import {
  fetchRostersGrouped, uploadRoster, deleteSharedRoster, labelify,
} from "@/lib/shared-rosters";
import { getSessionId } from "@/lib/session";
import { Pattern } from "@/components/ui/file-upload";

// ─── Colour palette ──────────────────────────────────────────────────────────

import { C } from "./shared/colors";

// ─── Clickable chip ──────────────────────────────────────────────────────────

function ActionChip({ label, onClick, color = C.cyan, hoverColor = C.green, disabled = false }) {
  return (
    <span
      onClick={disabled ? undefined : onClick}
      style={{
        color: disabled ? C.border : color,
        fontSize:      "11px",
        border:        `1px solid ${C.border}`,
        padding:       "2px 8px",
        cursor:        disabled ? "default" : "pointer",
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        userSelect:    "none",
        fontFamily:    "monospace",
        transition:    "color 0.1s, border-color 0.1s",
        opacity:       disabled ? 0.4 : 1,
      }}
      onMouseEnter={e => { if (!disabled) { e.currentTarget.style.color = hoverColor; e.currentTarget.style.borderColor = hoverColor; } }}
      onMouseLeave={e => { if (!disabled) { e.currentTarget.style.color = color; e.currentTarget.style.borderColor = C.border; } }}
    >
      {label}
    </span>
  );
}

// ─── Section header ──────────────────────────────────────────────────────────

function SectionHeader({ title, subtitle }) {
  return (
    <div style={{
      display: "flex", alignItems: "baseline", gap: "10px", marginBottom: "8px",
    }}>
      <span style={{
        color: C.amber, fontWeight: 700, fontSize: "13px",
        textTransform: "uppercase", letterSpacing: "0.1em",
        fontFamily: "monospace",
      }}>
        {title}
      </span>
      {subtitle && (
        <span style={{ color: C.dim, fontSize: "11px", fontFamily: "monospace" }}>
          {subtitle}
        </span>
      )}
    </div>
  );
}

// ─── Attachment migration ─────────────────────────────────────────────────────
// Leader→bodyguard attachments are keyed by roster INDEX (leaderIdx → bgIdx) so
// two identical, un-nicknamed units carry leaders independently. Older saves were
// keyed by NAME (leaderName → bgName), which collapsed all same-named units onto
// one leader. Convert legacy maps to index form using the current unit list.
function migrateAttachments(map, units) {
  const keys = Object.keys(map || {});
  if (keys.length === 0) return { map: map || {}, changed: false };
  // Already index-keyed if every key is a plain integer string.
  if (keys.every(k => /^\d+$/.test(k))) return { map, changed: false };
  const next = {};
  for (const [leaderName, bgName] of Object.entries(map)) {
    if (/^\d+$/.test(leaderName)) { next[leaderName] = bgName; continue; }
    const leaderIdx = units.findIndex(
      u => typeof u === "object" && u.is_leader && u.name === leaderName);
    const bgIdx = units.findIndex(
      u => (typeof u === "object" ? u.name : u) === bgName);
    if (leaderIdx !== -1 && bgIdx !== -1) next[leaderIdx] = bgIdx;
  }
  return { map: next, changed: true };
}

// ─── Army panel (player or enemy) ────────────────────────────────────────────

function ArmyPanel({ roster, side, onUpload, onInject }) {
  const { name, unit_count = 0, total_points, units = [] } = roster || {};
  const hasUnits = units.length > 0;
  const sideColor = side === "PLAYER" ? C.cyan : C.amber;
  const sideKey = side === "PLAYER" ? "player" : "enemy";
  const [expanded, setExpanded] = useState(false);
  const [attachingLeader, setAttachingLeader] = useState(null);
  const [editingNickname, setEditingNickname] = useState(null); // index of unit being renamed
  const [nicknameInput, setNicknameInput] = useState("");
  const nicknameRef = useRef(null);

  // ── Attachments (leader → bodyguard) ────────────────────────────────────
  const [attachments, setAttachments] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("ct_leader_attachments") || "{}");
      return stored[sideKey] || {};
    } catch { return {}; }
  });

  const saveAttachments = (newMap) => {
    setAttachments(newMap);
    try {
      const stored = JSON.parse(localStorage.getItem("ct_leader_attachments") || "{}");
      stored[sideKey] = newMap;
      localStorage.setItem("ct_leader_attachments", JSON.stringify(stored));
    } catch {}
    persistMetadata(nicknames, newMap);
  };

  // ── Nicknames (keyed by side:index for uniqueness with duplicates) ──────
  const [nicknames, setNicknames] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("ct_unit_nicknames") || "{}");
      return stored[sideKey] || {};
    } catch { return {}; }
  });

  const saveNicknames = (newMap) => {
    setNicknames(newMap);
    try {
      const stored = JSON.parse(localStorage.getItem("ct_unit_nicknames") || "{}");
      stored[sideKey] = newMap;
      localStorage.setItem("ct_unit_nicknames", JSON.stringify(stored));
    } catch {}
    persistMetadata(newMap, attachments);
  };

  const startNicknameEdit = (idx, currentNick) => {
    setEditingNickname(idx);
    setNicknameInput(currentNick || "");
    setTimeout(() => nicknameRef.current?.focus(), 30);
  };

  const commitNickname = (idx) => {
    const val = nicknameInput.trim();
    const next = { ...nicknames };
    if (val) { next[idx] = val; } else { delete next[idx]; }
    saveNicknames(next);
    setEditingNickname(null);
  };

  // ── Persist metadata to Airtable (debounced) ─────────────────────────────
  const saveTimerRef = useRef(null);
  const persistMetadata = useCallback((nicks, attachs) => {
    if (!name) return;  // no roster loaded
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const lines = [];
      for (const [idx, nick] of Object.entries(nicks)) {
        if (nick) lines.push(`# @nickname:${idx}:${nick}`);
      }
      for (const [leader, unit] of Object.entries(attachs)) {
        if (unit) lines.push(`# @attach:${leader}:${unit}`);
      }
      fetch("/api/rosters/save-metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, metadata: lines.join("\n") }),
      }).catch(() => {}); // silent fail — localStorage is the fallback
    }, 1500);
  }, [name]);

  // ── Seed localStorage from embedded content metadata on roster load ──────
  useEffect(() => {
    if (!hasUnits) return;
    let seedNick = false, seedAttach = false;
    const sNick = { ...nicknames };
    // Migrate any legacy name-keyed attachment map to index-keyed first.
    const migrated = migrateAttachments({ ...attachments }, units);
    let sAttach = migrated.map;
    if (migrated.changed) seedAttach = true;
    units.forEach((u, i) => {
      if (typeof u !== "object") return;
      if (u.nickname && !sNick[i]) { sNick[i] = u.nickname; seedNick = true; }
      // Seed an index-based attachment from embedded roster metadata.
      if (u.is_leader && u.attached_idx != null && sAttach[i] == null) {
        sAttach[i] = u.attached_idx; seedAttach = true;
      }
    });
    if (seedNick) saveNicknames(sNick);
    if (seedAttach) saveAttachments(sAttach);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  const PREVIEW_LIMIT = 12;
  const showAll = expanded || units.length <= PREVIEW_LIMIT;
  const visibleUnits = showAll ? units : units.slice(0, PREVIEW_LIMIT);

  // Non-leader units for attachment picker (show nickname if set)
  const bodyguardUnits = units.map((u, i) => ({ u, i })).filter(({ u }) => {
    if (typeof u === "string") return true;
    return !u.is_leader;
  });

  // Indices of bodyguard instances that currently have a leader attached —
  // used to mark them with a "*" so the player can see at a glance which units
  // are already led (without blocking — some units can take a second leader).
  const ledIndices = new Set(Object.values(attachments).map(Number));

  return (
    <div style={{
      flex: 1, padding: "10px 14px", background: C.panel,
      border: `1px solid ${C.border}`, minWidth: "200px",
    }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
        marginBottom: "8px", paddingBottom: "6px", borderBottom: `1px solid ${C.border}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{
            color: sideColor, fontSize: "9px", letterSpacing: "0.16em",
            textTransform: "uppercase", border: `1px solid ${sideColor}50`,
            padding: "1px 5px", fontFamily: "monospace",
          }}>
            {side}
          </span>
          <span style={{
            color: C.green, fontWeight: 700, fontSize: "13px",
            textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "monospace",
          }}>
            {name || "—"}
          </span>
        </div>
        {hasUnits && (
          <div style={{ display: "flex", gap: "12px", fontSize: "11px", fontFamily: "monospace" }}>
            <span style={{ color: C.dim }}>{unit_count} {unit_count === 1 ? "unit" : "units"}</span>
            {total_points ? <span style={{ color: C.amber }}>{total_points} pts</span> : null}
          </div>
        )}
      </div>

      {hasUnits ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          {visibleUnits.map((u, i) => {
            const uname = typeof u === "string" ? u : u.name;
            const upts  = typeof u === "object" ? u.points : null;
            const isLdr = typeof u === "object" && u.is_leader;
            // Index-based attachment: a leader at this index points at a bodyguard index.
            const attachedIdx  = isLdr && attachments[i] != null ? Number(attachments[i]) : null;
            const attachedUnit = attachedIdx != null ? units[attachedIdx] : null;
            const attachedNick = attachedIdx != null ? nicknames[attachedIdx] : null;
            const attachedToName = attachedUnit
              ? (typeof attachedUnit === "object" ? attachedUnit.name : attachedUnit)
              : null;
            const attachedTo = attachedToName
              ? `${attachedToName}${attachedNick ? ` (${attachedNick})` : ""}`
              : null;
            // Is this (non-leader) unit being led by someone?
            const isLed = !isLdr && ledIndices.has(i);
            const nick = nicknames[i] || null;
            return (
              <div key={i}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "2px 0" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", flex: 1, minWidth: 0 }}>
                    <span style={{
                      color: isLdr ? C.amber : C.mid,
                      fontSize: "12px", cursor: "pointer", fontFamily: "monospace",
                      fontWeight: isLdr ? 600 : 400,
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }}
                      onClick={() => onInject?.(`spec ${uname}`)}>
                      {isLdr ? "★ " : ""}{uname}
                    </span>
                    {/* Marker: this unit already has a leader attached. */}
                    {isLed && (
                      <span
                        title="Has a leader attached"
                        style={{
                          color: C.green, fontWeight: 700, fontSize: "13px",
                          fontFamily: "monospace", flexShrink: 0, lineHeight: 1,
                        }}
                      >
                        *
                      </span>
                    )}
                    {/* Nickname display / edit */}
                    {editingNickname === i ? (
                      <input
                        ref={nicknameRef}
                        value={nicknameInput}
                        onChange={e => setNicknameInput(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") commitNickname(i); if (e.key === "Escape") setEditingNickname(null); }}
                        onBlur={() => commitNickname(i)}
                        style={{
                          background: C.bg, color: C.green, border: `1px solid ${C.cyan}`,
                          fontSize: "10px", fontFamily: "monospace", padding: "0px 4px",
                          width: "90px", outline: "none",
                        }}
                        placeholder="nickname"
                        maxLength={20}
                      />
                    ) : (
                      <span
                        onClick={() => startNicknameEdit(i, nick)}
                        style={{
                          color: nick ? C.green : C.dim,
                          fontSize: nick ? "10px" : "9px",
                          cursor: "pointer", fontFamily: "monospace",
                          border: nick ? "none" : `1px dashed ${C.border}`,
                          padding: "0px 3px", userSelect: "none", flexShrink: 0,
                          fontStyle: nick ? "normal" : "italic",
                        }}
                        onMouseEnter={e => { e.currentTarget.style.color = C.cyan; }}
                        onMouseLeave={e => { e.currentTarget.style.color = nick ? C.green : C.dim; }}
                      >
                        {nick ? `(${nick})` : "name"}
                      </span>
                    )}
                    {isLdr && (
                      <span
                        onClick={() => setAttachingLeader(attachingLeader === i ? null : i)}
                        style={{
                          color: attachedTo ? C.green : C.dim,
                          fontSize: "9px", cursor: "pointer", fontFamily: "monospace",
                          border: `1px solid ${attachedTo ? C.green + "50" : C.border}`,
                          padding: "0px 4px", letterSpacing: "0.06em",
                          textTransform: "uppercase", userSelect: "none", flexShrink: 0,
                        }}
                        onMouseEnter={e => { e.currentTarget.style.color = C.cyan; e.currentTarget.style.borderColor = C.cyan + "50"; }}
                        onMouseLeave={e => { e.currentTarget.style.color = attachedTo ? C.green : C.dim; e.currentTarget.style.borderColor = attachedTo ? C.green + "50" : C.border; }}
                      >
                        {attachedTo ? `→ ${attachedTo}` : "attach"}
                      </span>
                    )}
                  </div>
                  {upts ? <span style={{ color: C.dim, fontSize: "11px", fontFamily: "monospace", flexShrink: 0 }}>{upts}</span> : null}
                </div>
                {/* Attachment picker — inline list of bodyguard units */}
                {attachingLeader === i && (
                  <div style={{
                    marginLeft: "16px", marginTop: "2px", marginBottom: "4px",
                    padding: "4px 8px", border: `1px solid ${C.border}`,
                    background: C.bg, fontSize: "11px", fontFamily: "monospace",
                  }}>
                    <div style={{ color: C.dim, marginBottom: "4px" }}>Attach to unit:</div>
                    {attachedTo && (
                      <div
                        onClick={() => {
                          const next = { ...attachments };
                          delete next[i];
                          saveAttachments(next);
                          setAttachingLeader(null);
                        }}
                        style={{ color: C.red, cursor: "pointer", padding: "1px 0", marginBottom: "2px" }}
                        onMouseEnter={e => e.currentTarget.style.color = C.amber}
                        onMouseLeave={e => e.currentTarget.style.color = C.red}
                      >
                        ✕ detach from {attachedTo}
                      </div>
                    )}
                    {bodyguardUnits.map(({ u: bg, i: bgIdx }) => {
                      const bgName = typeof bg === "string" ? bg : bg.name;
                      const bgNick = nicknames[bgIdx];
                      return (
                        <div
                          key={bgIdx}
                          onClick={() => {
                            saveAttachments({ ...attachments, [i]: bgIdx });
                            setAttachingLeader(null);
                          }}
                          style={{
                            color: C.mid, cursor: "pointer", padding: "1px 0",
                          }}
                          onMouseEnter={e => e.currentTarget.style.color = C.green}
                          onMouseLeave={e => e.currentTarget.style.color = C.mid}
                        >
                          → {bgName}{bgNick ? ` (${bgNick})` : ""}
                        </div>
                      );
                    })}
                    {bodyguardUnits.length === 0 && (
                      <div style={{ color: C.dim, fontStyle: "italic" }}>No non-leader units to attach to</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {units.length > PREVIEW_LIMIT && (
            <span
              onClick={() => setExpanded(!expanded)}
              style={{
                color: C.cyan, fontSize: "11px", marginTop: "4px",
                fontFamily: "monospace", cursor: "pointer",
                userSelect: "none",
              }}
              onMouseEnter={e => { e.currentTarget.style.color = C.green; }}
              onMouseLeave={e => { e.currentTarget.style.color = C.cyan; }}
            >
              {expanded ? "▴ show less" : `▾ +${units.length - PREVIEW_LIMIT} more…`}
            </span>
          )}
        </div>
      ) : (
        <div style={{ color: C.dim, fontSize: "12px", fontStyle: "italic", fontFamily: "monospace" }}>
          No roster loaded
        </div>
      )}

      <div style={{ display: "flex", gap: "8px", marginTop: "10px", flexWrap: "wrap" }}>
        <ActionChip
          label={hasUnits ? "upload new" : `upload ${side.toLowerCase()}`}
          onClick={() => onUpload?.(side === "PLAYER" ? "player" : "enemy")}
        />
        {hasUnits && (
          <ActionChip label="clear" onClick={() => onInject?.(`clear roster ${side.toLowerCase()}`)} color={C.red} />
        )}
      </div>
    </div>
  );
}

// ─── Inline upload flow ─────────────────────────────────────────────────────
//
// Steps: paste → faction (if unsure) → name → role (player/enemy/save)

function UploadFlow({ mode, engineId, profileName, onComplete, onCancel }) {
  const [step, setStep]             = useState("paste");   // paste | faction | name | role
  const [content, setContent]       = useState(null);
  const [faction, setFaction]       = useState(null);
  const [allFactions, setAllFactions] = useState([]);
  const [rosterName, setRosterName] = useState("");
  const [error, setError]           = useState(null);
  const [saving, setSaving]         = useState(false);
  const pasteRef  = useRef(null);
  const nameRef   = useRef(null);

  // Auto-focus
  useEffect(() => {
    if (step === "paste")   setTimeout(() => pasteRef.current?.focus(), 50);
    if (step === "name")    setTimeout(() => nameRef.current?.focus(), 50);
  }, [step]);

  // Detect faction from content
  async function processContent(text) {
    setError(null);
    try {
      const res = await fetch("/api/rosters/detect-faction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.faction) {
          setContent(text);
          setFaction(data.faction);
          setStep("name");
          return;
        }
      }
    } catch {}
    // Detection failed — load faction list for manual pick
    try {
      const res = await fetch("/api/factions");
      if (res.ok) {
        const data = await res.json();
        setAllFactions(data.factions || []);
      }
    } catch {}
    setContent(text);
    setStep("faction");
  }

  // Handle pasted text submit
  function handlePasteSubmit(e) {
    e?.preventDefault();
    const text = pasteRef.current?.value?.trim();
    if (!text) { setError("Paste your roster text first."); return; }
    processContent(text);
  }

  // Handle file upload
  function handleFiles(files) {
    if (!files.length) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result;
      if (typeof text !== "string" || !text.trim()) { setError("File was empty."); return; }
      processContent(text.trim());
    };
    reader.readAsText(files[0].file);
  }

  // Handle faction pick
  function handleFactionPick(e) {
    e?.preventDefault();
    const val = e.target?.elements?.faction?.value?.trim();
    if (!val) { setError("Select a faction."); return; }
    // Check if it's a number (index into list)
    const num = parseInt(val, 10);
    if (!isNaN(num) && num >= 1 && num <= allFactions.length) {
      setFaction(allFactions[num - 1]);
    } else {
      // Try to match by name
      const lower = val.toLowerCase();
      const match = allFactions.find(f => f.toLowerCase().includes(lower));
      if (match) {
        setFaction(match);
      } else {
        setError(`Faction "${val}" not found.`);
        return;
      }
    }
    setError(null);
    setStep("name");
  }

  // Handle name submit → save
  async function handleNameSubmit(e) {
    e?.preventDefault();
    const name = rosterName.trim();
    if (!name) { setError("Enter a name."); return; }
    setSaving(true);
    setError(null);
    try {
      await uploadRoster(name, faction, content, profileName || "unknown");
      setStep("role");
      setSaving(false);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  // Handle role selection
  function handleRole(role) {
    onComplete?.(rosterName.trim(), faction, role); // role: "player" | "enemy" | "save"
  }

  const F = { fontFamily: "monospace" };
  const boxStyle = {
    border: `1px solid ${C.border}`, background: C.panel,
    padding: "16px 20px", ...F,
  };
  const headerStyle = {
    display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px",
  };
  const titleStyle = { color: C.amber, fontWeight: 700, fontSize: "13px", letterSpacing: "0.1em" };

  // ── Step 1: Paste / Upload ──────────────────────────────────────────────

  if (step === "paste") {
    return (
      <div style={boxStyle}>
        <div style={headerStyle}>
          <span style={titleStyle}>UPLOAD ROSTER</span>
          <ActionChip label="cancel" onClick={onCancel} color={C.dim} />
        </div>

        <div style={{ marginBottom: "12px" }}>
          <Pattern accept=".roz,.rozs,.json" multiple={false} maxFiles={1} onFilesChange={handleFiles} />
        </div>

        <div style={{ color: C.dim, fontSize: "11px", margin: "10px 0 8px", letterSpacing: "0.08em" }}>
          — OR PASTE BELOW —
        </div>

        <form onSubmit={handlePasteSubmit}>
          <textarea
            ref={pasteRef}
            rows={6}
            placeholder="Paste roster text here…"
            style={{
              width: "100%", boxSizing: "border-box",
              backgroundColor: C.bgDark, border: `1px solid ${C.border}`,
              color: C.green, padding: "10px", fontSize: "12px",
              ...F, resize: "vertical", outline: "none",
            }}
          />
          <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
            <ActionChip label="next →" onClick={handlePasteSubmit} color={C.green} />
          </div>
        </form>
        {error && <div style={{ color: C.red, fontSize: "12px", marginTop: "8px" }}>{error}</div>}
      </div>
    );
  }

  // ── Step 2: Faction pick (only if auto-detect failed) ───────────────────

  if (step === "faction") {
    return (
      <div style={boxStyle}>
        <div style={headerStyle}>
          <span style={titleStyle}>SELECT FACTION</span>
          <ActionChip label="cancel" onClick={onCancel} color={C.dim} />
        </div>
        <div style={{ color: C.dim, fontSize: "11px", marginBottom: "10px" }}>
          Could not auto-detect faction. Select from the list:
        </div>
        <div style={{
          maxHeight: "200px", overflowY: "auto", marginBottom: "10px",
          border: `1px solid ${C.border}`, background: C.bgDark, padding: "6px 0",
        }}>
          {allFactions.map((f, i) => (
            <div
              key={f}
              onClick={() => { setFaction(f); setError(null); setStep("name"); }}
              style={{
                padding: "3px 12px", cursor: "pointer", fontSize: "12px",
                display: "flex", gap: "8px", ...F,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = C.panel; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
            >
              <span style={{ color: C.dim, minWidth: "24px", textAlign: "right" }}>{i + 1}.</span>
              <span style={{ color: C.mid }}>{labelify(f)}</span>
            </div>
          ))}
        </div>
        <form onSubmit={handleFactionPick} style={{ display: "flex", gap: "8px" }}>
          <input
            name="faction"
            type="text"
            placeholder="Type number or name"
            autoFocus
            style={{
              flex: 1, backgroundColor: C.bgDark, border: `1px solid ${C.border}`,
              color: C.green, padding: "8px 10px", fontSize: "13px",
              ...F, outline: "none",
            }}
          />
          <button type="submit" style={{
            backgroundColor: "transparent", border: `1px solid ${C.green}`,
            color: C.green, padding: "8px 14px", fontSize: "12px",
            ...F, letterSpacing: "0.1em", cursor: "pointer",
          }}>OK</button>
        </form>
        {error && <div style={{ color: C.red, fontSize: "12px", marginTop: "8px" }}>{error}</div>}
      </div>
    );
  }

  // ── Step 3: Name ────────────────────────────────────────────────────────

  if (step === "name") {
    return (
      <div style={boxStyle}>
        <div style={headerStyle}>
          <span style={titleStyle}>NAME THIS ROSTER</span>
          <ActionChip label="cancel" onClick={onCancel} color={C.dim} />
        </div>
        <div style={{ color: C.dim, fontSize: "11px", marginBottom: "10px" }}>
          Faction: <span style={{ color: C.amber }}>{labelify(faction)}</span>
        </div>
        <form onSubmit={handleNameSubmit} style={{ display: "flex", gap: "8px" }}>
          <input
            ref={nameRef}
            type="text"
            value={rosterName}
            onChange={e => setRosterName(e.target.value)}
            placeholder="e.g. Retaliation Cadre v2"
            maxLength={48}
            disabled={saving}
            style={{
              flex: 1, backgroundColor: C.bgDark, border: `1px solid ${C.border}`,
              color: C.green, padding: "8px 10px", fontSize: "13px",
              ...F, outline: "none",
            }}
          />
          <button type="submit" disabled={saving} style={{
            backgroundColor: "transparent", border: `1px solid ${C.green}`,
            color: C.green, padding: "8px 14px", fontSize: "12px",
            ...F, letterSpacing: "0.1em", cursor: saving ? "wait" : "pointer",
            opacity: saving ? 0.4 : 1,
          }}>{saving ? "…" : "SAVE"}</button>
        </form>
        {error && <div style={{ color: C.red, fontSize: "12px", marginTop: "8px" }}>{error}</div>}
      </div>
    );
  }

  // ── Step 4: Choose role ─────────────────────────────────────────────────

  if (step === "role") {
    return (
      <div style={boxStyle}>
        <div style={headerStyle}>
          <span style={titleStyle}>ROSTER SAVED</span>
        </div>
        <div style={{ color: C.green, fontSize: "12px", marginBottom: "4px" }}>
          ✓ {rosterName} ({labelify(faction)}) uploaded
        </div>
        <div style={{ color: C.dim, fontSize: "11px", marginBottom: "14px" }}>
          Load this roster now?
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <ActionChip label="load as player" onClick={() => handleRole("player")} color={C.cyan} />
          <ActionChip label="load as enemy" onClick={() => handleRole("enemy")} color={C.amber} />
          <ActionChip label="just save" onClick={() => handleRole("save")} color={C.dim} />
        </div>
      </div>
    );
  }

  return null;
}

// ─── Saved rosters section ──────────────────────────────────────────────────

function formatDate(isoStr) {
  if (!isoStr) return "";
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "2-digit" });
  } catch { return ""; }
}

function SavedRostersSection({ onInject, onRefresh, refreshKey }) {
  const [grouped, setGrouped]           = useState({});
  const [rosterCount, setRosterCount]   = useState(0);
  const [loading, setLoading]           = useState(true);
  const [expanded, setExpanded]         = useState(null);
  const [activeRoster, setActiveRoster] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleteError, setDeleteError]   = useState(null);

  useEffect(() => {
    setLoading(true);
    fetchRostersGrouped()
      .then(data => {
        setGrouped(data);
        setRosterCount(Object.values(data).reduce((n, arr) => n + arr.length, 0));
      })
      .catch(() => { setGrouped({}); setRosterCount(0); })
      .finally(() => setLoading(false));
  }, [refreshKey]);

  async function handleDelete(id) {
    setDeleteError(null);
    try {
      await deleteSharedRoster(id);
      setDeleteConfirm(null);
      setActiveRoster(null);
      onRefresh?.();
    } catch (e) {
      setDeleteError(e.message || "Delete failed");
    }
  }

  const factions = Object.keys(grouped).sort();

  return (
    <div>
      <SectionHeader title="Shared Rosters" subtitle={loading ? "loading…" : `${rosterCount} saved`} />

      {!loading && rosterCount === 0 && (
        <div style={{ color: C.dim, fontSize: "13px", fontFamily: "monospace", marginBottom: "8px" }}>
          No rosters uploaded yet.
        </div>
      )}

      {rosterCount > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1px", marginBottom: "8px" }}>
          {factions.map(faction => {
            const factionRosters = grouped[faction] || [];
            const isOpen = expanded === faction;
            return (
              <div key={faction}>
                <div
                  onClick={() => { setExpanded(isOpen ? null : faction); setActiveRoster(null); setDeleteConfirm(null); setDeleteError(null); }}
                  style={{
                    display: "flex", alignItems: "center", gap: "8px",
                    padding: "5px 8px", cursor: "pointer", userSelect: "none",
                    fontFamily: "monospace", fontSize: "13px",
                    background: isOpen ? C.panel : "transparent",
                    borderLeft: isOpen ? `2px solid ${C.amber}` : "2px solid transparent",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={e => { if (!isOpen) e.currentTarget.style.background = C.panel; }}
                  onMouseLeave={e => { if (!isOpen) e.currentTarget.style.background = "transparent"; }}
                >
                  <span style={{ color: C.dim, fontSize: "10px", width: "10px", textAlign: "center" }}>
                    {isOpen ? "▾" : "▸"}
                  </span>
                  <span style={{ color: isOpen ? C.amber : C.mid, flex: 1, fontWeight: 600 }}>
                    {labelify(faction)}
                  </span>
                  <span style={{
                    color: C.dim, fontSize: "11px", background: C.bgDark,
                    padding: "0 6px", border: `1px solid ${C.border}`,
                  }}>
                    {factionRosters.length}
                  </span>
                </div>

                {isOpen && factionRosters.map(r => (
                  <div key={r.id} style={{ paddingLeft: "22px" }}>
                    <div
                      onClick={() => { setActiveRoster(activeRoster === r.id ? null : r.id); setDeleteConfirm(null); setDeleteError(null); }}
                      style={{
                        display: "flex", alignItems: "center", gap: "8px",
                        padding: "4px 8px", cursor: "pointer", userSelect: "none",
                        fontFamily: "monospace", fontSize: "12px",
                      }}
                      onMouseEnter={e => { e.currentTarget.querySelector(".r-name").style.color = C.green; }}
                      onMouseLeave={e => { e.currentTarget.querySelector(".r-name").style.color = C.mid; }}
                    >
                      <span className="r-name" style={{ color: C.mid, flex: 1 }}>{r.name}</span>
                      <span style={{ color: C.dim, fontSize: "10px", letterSpacing: "0.05em" }}>{r.uploaded_by}</span>
                      <span style={{ color: C.border, fontSize: "10px" }}>{formatDate(r.uploaded_at)}</span>
                    </div>

                    {activeRoster === r.id && (
                      <div style={{ padding: "2px 8px 6px" }}>
                        {deleteConfirm?.id === r.id ? (
                          <div style={{ display: "flex", gap: "8px", alignItems: "center", fontFamily: "monospace", fontSize: "11px" }}>
                            <span style={{ color: C.red }}>Delete '{r.name}'?</span>
                            <ActionChip label="yes" onClick={() => handleDelete(r.id)} color={C.red} />
                            <ActionChip label="no" onClick={() => { setDeleteConfirm(null); setDeleteError(null); }} color={C.dim} />
                            {deleteError && <span style={{ color: C.red, fontSize: "10px" }}>{deleteError}</span>}
                          </div>
                        ) : (
                          <div style={{ display: "flex", gap: "6px", fontFamily: "monospace", fontSize: "11px" }}>
                            <ActionChip label="player" onClick={() => onInject?.(`set roster player ${r.name}`)} color={C.cyan} />
                            <ActionChip label="enemy" onClick={() => onInject?.(`set roster enemy ${r.name}`)} color={C.amber} />
                            <ActionChip label="delete" onClick={() => setDeleteConfirm({ id: r.id, name: r.name })} color={C.red} />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Campaigns section ───────────────────────────────────────────────────────

function CampaignsSection({ onInject }) {
  const campaigns     = listCampaigns();
  const campaignCount = getCampaignCount();
  const names         = Object.keys(campaigns).sort();

  return (
    <div>
      <SectionHeader title="Campaigns" subtitle={`${campaignCount} saved`} />
      {campaignCount === 0 ? (
        <div style={{ color: C.dim, fontSize: "13px", fontFamily: "monospace", marginBottom: "8px" }}>
          No campaigns yet.
        </div>
      ) : (
        names.map((name, i) => {
          const camp = campaigns[name];
          const state = camp?.state || {};
          return (
            <div key={name} onClick={() => onInject?.(`load campaign ${name}`)}
              style={{
                display: "flex", gap: "10px", alignItems: "baseline",
                lineHeight: "2.0", cursor: "pointer", userSelect: "none",
                fontFamily: "monospace", fontSize: "13px",
              }}
              onMouseEnter={e => e.currentTarget.querySelector(".camp-name").style.color = C.green}
              onMouseLeave={e => e.currentTarget.querySelector(".camp-name").style.color = C.mid}
            >
              <span style={{ color: C.dim, minWidth: "18px", textAlign: "right", flexShrink: 0 }}>{i + 1}.</span>
              <span className="camp-name" style={{ color: C.mid, flex: 1, fontWeight: 700 }}>{name}</span>
              <span style={{ color: C.amber, fontSize: "12px", minWidth: "10ch" }}>Turn {state.turn ?? 1}</span>
              <span style={{ color: C.dim, fontSize: "11px" }}>{state.player_wins ?? 0}W – {state.enemy_wins ?? 0}L</span>
            </div>
          );
        })
      )}
      <div style={{ display: "flex", gap: "8px", marginTop: "6px" }}>
        <ActionChip label="new campaign" onClick={() => onInject?.("new campaign")} />
      </div>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function RostersContext({ engineId, onExec, onInject, theme, profileName, triggerUpload, onUploadConsumed }) {
  const [session, setSession]       = useState(null);
  const [loading, setLoading]       = useState(false);
  const [tick, setTick]             = useState(0);
  const [uploadMode, setUploadMode] = useState(null); // null | "player" | "enemy"
  const pollRef                     = useRef(null);

  // External trigger from command bar (App.jsx routes "upload roster" here)
  useEffect(() => {
    if (triggerUpload) {
      setUploadMode(triggerUpload);
      onUploadConsumed?.();
    }
  }, [triggerUpload, onUploadConsumed]);

  const fetchSession = useCallback(async () => {
    if (!engineId) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/engines/${engineId}/exec`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // MUST send the same per-tab session_id the Terminal uses (App.jsx
        // handleExec). The engine keys all roster/faction state by this token;
        // without it this poll reads a different (empty) session, so a roster
        // loaded via the Terminal shows as "No roster loaded" here.
        body: JSON.stringify({ input: "session", session_id: getSessionId() }),
      });
      if (res.ok) {
        const result = await res.json();
        if (result?.data) setSession(result.data);
      }
    } catch {} finally { setLoading(false); }
  }, [engineId]);

  useEffect(() => {
    fetchSession();
    const startPolling = () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(() => { fetchSession(); setTick(t => t + 1); }, 3000);
    };
    const stopPolling = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
    startPolling();
    const onVis = () => { if (document.hidden) stopPolling(); else { fetchSession(); setTick(t => t + 1); startPolling(); } };
    document.addEventListener("visibilitychange", onVis);
    return () => { stopPolling(); document.removeEventListener("visibilitychange", onVis); };
  }, [fetchSession]);

  const handleInject = useCallback((cmd) => {
    onInject?.(cmd);
    setTimeout(() => { fetchSession(); setTick(t => t + 1); }, 600);
  }, [onInject, fetchSession]);

  // Upload complete — handle role choice
  const handleUploadComplete = useCallback((name, faction, role) => {
    setUploadMode(null);
    setTick(t => t + 1);
    if (role === "player" || role === "enemy") {
      handleInject(`set roster ${role} ${name}`);
    }
    // "save" → just close, roster is already saved server-side
  }, [handleInject]);

  const handleRefresh = useCallback(() => { setTick(t => t + 1); }, []);

  const myRoster    = session?.my_roster || {};
  const enemyRoster = session?.enemy_roster || {};

  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100%",
      backgroundColor: C.bg, overflow: "auto",
    }}>
      <div style={{ flex: 1, overflow: "auto", padding: "16px 24px 24px" }}>

        <div style={{
          border: "1px solid var(--ct-border)", borderRadius: "6px",
          padding: "12px 16px", marginBottom: "16px",
          background: "var(--ct-bg-dark)", fontSize: "12px",
          fontFamily: "var(--ct-font-mono, monospace)",
          color: "var(--ct-primary-dim)", lineHeight: "1.7",
        }}>
          <div style={{ color: "var(--ct-primary-mid)", fontWeight: 600, marginBottom: "6px", fontSize: "12px" }}>
            ⚠ UNDER CONSTRUCTION — BUGS LIKELY
          </div>
          <div style={{ marginBottom: "4px" }}>
            When a roster is loaded (player or enemy), all combat commands use only the weapons and profiles in that roster.
          </div>
          <div>Remove a roster to see all possible weapon profiles and matchups.</div>
        </div>

        {/* Upload flow (replaces dashboard) */}
        {uploadMode && (
          <div style={{ marginBottom: "24px" }}>
            <UploadFlow
              mode={uploadMode}
              engineId={engineId}
              profileName={profileName}
              onComplete={handleUploadComplete}
              onCancel={() => setUploadMode(null)}
            />
          </div>
        )}

        {/* Dashboard (hidden during upload) */}
        {!uploadMode && (
          <>
            <SectionHeader title="Active Armies" />
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "24px" }}>
              <ArmyPanel roster={myRoster}    side="PLAYER" onUpload={setUploadMode} onInject={handleInject} />
              <ArmyPanel roster={enemyRoster} side="ENEMY"  onUpload={setUploadMode} onInject={handleInject} />
            </div>

            <div style={{ marginBottom: "24px" }}>
              <SavedRostersSection refreshKey={tick} onInject={handleInject} onRefresh={handleRefresh} />
            </div>

            <div style={{ marginBottom: "24px" }}>
              <CampaignsSection key={`campaigns-${tick}`} onInject={handleInject} />
            </div>
          </>
        )}

      </div>
    </div>
  );
}
