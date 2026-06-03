/**
 * RostersContext
 *
 * Roster management dashboard with inline upload/delete flows.
 * All roster operations happen directly via API — no terminal injection.
 *
 * Upload flow (inline, no terminal trail):
 *   1. User clicks "upload player/enemy roster"
 *   2. Paste area + file upload shown inline
 *   3. User pastes/uploads → auto-detect faction → ask for name
 *   4. User enters name → save to server → auto-assign → back to dashboard
 *
 * Delete: inline confirm — no terminal.
 * Set as player/enemy: inject via onInject (ONE_SHOT, stays on roster tab).
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  listCampaigns, getCampaignCount,
} from "@/lib/vfs";
import {
  fetchRostersGrouped, uploadRoster, deleteSharedRoster, labelify,
} from "@/lib/shared-rosters";
import { Pattern } from "@/components/ui/file-upload";

// ─── Colour palette ──────────────────────────────────────────────────────────

import { C } from "./shared/colors";

// ─── Clickable chip ──────────────────────────────────────────────────────────

function ActionChip({ label, onClick, color = C.cyan, hoverColor = C.green }) {
  return (
    <span
      onClick={onClick}
      style={{
        color,
        fontSize:      "11px",
        border:        `1px solid ${C.border}`,
        padding:       "2px 8px",
        cursor:        "pointer",
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        userSelect:    "none",
        fontFamily:    "monospace",
        transition:    "color 0.1s, border-color 0.1s",
      }}
      onMouseEnter={e => { e.currentTarget.style.color = hoverColor; e.currentTarget.style.borderColor = hoverColor; }}
      onMouseLeave={e => { e.currentTarget.style.color = color; e.currentTarget.style.borderColor = C.border; }}
    >
      {label}
    </span>
  );
}

// ─── Section header ──────────────────────────────────────────────────────────

function SectionHeader({ title, subtitle }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      marginBottom: "8px",
    }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
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
    </div>
  );
}

// ─── Army panel (player or enemy) ────────────────────────────────────────────

function ArmyPanel({ roster, side, onUpload, onInject }) {
  const { name, unit_count = 0, total_points, units = [] } = roster || {};
  const hasUnits = units.length > 0;
  const sideColor = side === "PLAYER" ? C.cyan : C.amber;
  const isEmpty = !hasUnits;

  return (
    <div style={{
      flex: 1, padding: "10px 14px", background: C.panel,
      border: `1px solid ${C.border}`, minWidth: "200px",
    }}>
      {/* Header */}
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

      {/* Unit list */}
      {hasUnits ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          {units.slice(0, 12).map((u, i) => {
            const uname = typeof u === "string" ? u : u.name;
            const upts  = typeof u === "object" ? u.points : null;
            return (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "2px 0" }}>
                <span
                  style={{ color: C.mid, fontSize: "12px", cursor: "pointer", fontFamily: "monospace" }}
                  onClick={() => onInject?.(`spec ${uname}`)}
                >
                  {uname}
                </span>
                {upts ? <span style={{ color: C.dim, fontSize: "11px", fontFamily: "monospace" }}>{upts}</span> : null}
              </div>
            );
          })}
          {units.length > 12 && (
            <span style={{ color: C.dim, fontSize: "11px", marginTop: "4px", fontFamily: "monospace" }}>
              +{units.length - 12} more…
            </span>
          )}
        </div>
      ) : (
        <div style={{ color: C.dim, fontSize: "12px", fontStyle: "italic", fontFamily: "monospace" }}>
          No roster loaded
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: "8px", marginTop: "10px", flexWrap: "wrap" }}>
        <ActionChip
          label={isEmpty ? `upload ${side.toLowerCase()}` : "upload new"}
          onClick={() => onUpload?.(side === "PLAYER" ? "player" : "enemy")}
        />
        {!isEmpty && (
          <>
            <ActionChip
              label="clear"
              onClick={() => onInject?.(`clear roster ${side.toLowerCase()}`)}
              color={C.red}
            />
          </>
        )}
      </div>
    </div>
  );
}

// ─── Inline upload flow ─────────────────────────────────────────────────────

function UploadFlow({ mode, engineId, profileName, onComplete, onCancel }) {
  // Steps: "paste" → "name" → "saving"
  const [step, setStep]                 = useState("paste");
  const [content, setContent]           = useState(null);
  const [detectedFaction, setDetectedFaction] = useState(null);
  const [rosterName, setRosterName]     = useState("");
  const [error, setError]               = useState(null);
  const [saving, setSaving]             = useState(false);
  const nameRef = useRef(null);
  const pasteRef = useRef(null);

  const roleLabel = mode === "enemy" ? "ENEMY" : "PLAYER";

  // Auto-focus paste area
  useEffect(() => {
    if (step === "paste") setTimeout(() => pasteRef.current?.focus(), 50);
    if (step === "name")  setTimeout(() => nameRef.current?.focus(), 50);
  }, [step]);

  // Detect faction from content
  async function detectFaction(text) {
    try {
      const res = await fetch(`/api/rosters/detect-faction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      if (res.ok) {
        const data = await res.json();
        return data.faction || null;
      }
    } catch {}
    return null;
  }

  // Handle pasted text
  async function handlePaste() {
    const text = pasteRef.current?.value?.trim();
    if (!text) { setError("Paste your roster text first."); return; }
    setError(null);
    const faction = await detectFaction(text);
    setContent(text);
    setDetectedFaction(faction);
    setStep("name");
  }

  // Handle file upload
  function handleFiles(files) {
    if (!files.length) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result;
      if (typeof text !== "string" || !text.trim()) {
        setError("File was empty.");
        return;
      }
      setError(null);
      const faction = await detectFaction(text.trim());
      setContent(text.trim());
      setDetectedFaction(faction);
      setStep("name");
    };
    reader.readAsText(files[0].file);
  }

  // Save
  async function handleSave(e) {
    e.preventDefault();
    const name = rosterName.trim();
    if (!name) { setError("Enter a name for this roster."); return; }
    if (!detectedFaction) { setError("Could not detect faction. Try a different roster."); return; }
    setSaving(true);
    setError(null);
    try {
      await uploadRoster(name, detectedFaction, content, profileName || "unknown");
      onComplete?.(name, detectedFaction, mode);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  // ── Paste step ──────────────────────────────────────────────────────────

  if (step === "paste") {
    return (
      <div style={{
        border: `1px solid ${C.border}`, background: C.panel,
        padding: "16px 20px", fontFamily: "monospace",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <span style={{ color: C.amber, fontWeight: 700, fontSize: "13px", letterSpacing: "0.1em" }}>
            UPLOAD {roleLabel} ROSTER
          </span>
          <ActionChip label="cancel" onClick={onCancel} color={C.dim} />
        </div>

        <div style={{ marginBottom: "12px" }}>
          <Pattern
            accept=".roz,.rozs,.json"
            multiple={false}
            maxFiles={1}
            onFilesChange={handleFiles}
          />
        </div>

        <div style={{ color: C.dim, fontSize: "11px", margin: "10px 0 8px", letterSpacing: "0.08em" }}>
          — OR PASTE BELOW —
        </div>

        <textarea
          ref={pasteRef}
          rows={6}
          placeholder="Paste roster text here…"
          style={{
            width: "100%", boxSizing: "border-box",
            backgroundColor: C.bgDark, border: `1px solid ${C.border}`,
            color: C.green, padding: "10px", fontSize: "12px",
            fontFamily: "monospace", resize: "vertical", outline: "none",
          }}
        />
        <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
          <ActionChip label="next →" onClick={handlePaste} color={C.green} />
        </div>
        {error && <div style={{ color: C.red, fontSize: "12px", marginTop: "8px" }}>{error}</div>}
      </div>
    );
  }

  // ── Name step ───────────────────────────────────────────────────────────

  if (step === "name") {
    return (
      <div style={{
        border: `1px solid ${C.border}`, background: C.panel,
        padding: "16px 20px", fontFamily: "monospace",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <span style={{ color: C.amber, fontWeight: 700, fontSize: "13px", letterSpacing: "0.1em" }}>
            NAME THIS ROSTER
          </span>
          <ActionChip label="cancel" onClick={onCancel} color={C.dim} />
        </div>

        {detectedFaction && (
          <div style={{ color: C.dim, fontSize: "11px", marginBottom: "10px" }}>
            Faction detected: <span style={{ color: C.amber }}>{labelify(detectedFaction)}</span>
          </div>
        )}
        {!detectedFaction && (
          <div style={{ color: C.red, fontSize: "11px", marginBottom: "10px" }}>
            Could not auto-detect faction — no matching units found.
          </div>
        )}

        <form onSubmit={handleSave} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
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
              fontFamily: "monospace", outline: "none",
            }}
          />
          <button
            type="submit"
            disabled={saving || !detectedFaction}
            style={{
              backgroundColor: "transparent", border: `1px solid ${C.green}`,
              color: C.green, padding: "8px 14px", fontSize: "12px",
              fontFamily: "monospace", letterSpacing: "0.1em", cursor: saving ? "wait" : "pointer",
              opacity: saving || !detectedFaction ? 0.4 : 1,
            }}
          >
            {saving ? "SAVING…" : "SAVE"}
          </button>
        </form>
        {error && <div style={{ color: C.red, fontSize: "12px", marginTop: "8px" }}>{error}</div>}
      </div>
    );
  }

  return null;
}

// ─── Saved rosters section (shared, server-side) ────────────────────────────

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
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { id, name } or null

  useEffect(() => {
    setLoading(true);
    fetchRostersGrouped()
      .then(data => {
        setGrouped(data);
        const total = Object.values(data).reduce((n, arr) => n + arr.length, 0);
        setRosterCount(total);
      })
      .catch(() => { setGrouped({}); setRosterCount(0); })
      .finally(() => setLoading(false));
  }, [refreshKey]);

  async function handleDelete(id, name) {
    try {
      await deleteSharedRoster(id);
      setDeleteConfirm(null);
      setActiveRoster(null);
      onRefresh?.();
    } catch {
      // silent — will show stale until next refresh
    }
  }

  const factions = Object.keys(grouped).sort();

  return (
    <div>
      <SectionHeader
        title="Shared Rosters"
        subtitle={loading ? "loading…" : `${rosterCount} saved`}
      />

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
                {/* Faction row — click to expand */}
                <div
                  onClick={() => { setExpanded(isOpen ? null : faction); setActiveRoster(null); setDeleteConfirm(null); }}
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
                    color: C.dim, fontSize: "11px",
                    background: C.bgDark, padding: "0 6px",
                    border: `1px solid ${C.border}`,
                  }}>
                    {factionRosters.length}
                  </span>
                </div>

                {/* Expanded roster list */}
                {isOpen && factionRosters.map(r => (
                  <div key={r.id} style={{ paddingLeft: "22px" }}>
                    <div
                      onClick={() => { setActiveRoster(activeRoster === r.id ? null : r.id); setDeleteConfirm(null); }}
                      style={{
                        display: "flex", alignItems: "center", gap: "8px",
                        padding: "4px 8px", cursor: "pointer", userSelect: "none",
                        fontFamily: "monospace", fontSize: "12px",
                      }}
                      onMouseEnter={e => { e.currentTarget.querySelector(".r-name").style.color = C.green; }}
                      onMouseLeave={e => { e.currentTarget.querySelector(".r-name").style.color = C.mid; }}
                    >
                      <span className="r-name" style={{ color: C.mid, flex: 1 }}>{r.name}</span>
                      <span style={{ color: C.dim, fontSize: "10px", letterSpacing: "0.05em" }}>
                        {r.uploaded_by}
                      </span>
                      <span style={{ color: C.border, fontSize: "10px" }}>
                        {formatDate(r.uploaded_at)}
                      </span>
                    </div>

                    {/* Action row */}
                    {activeRoster === r.id && (
                      <div style={{ padding: "2px 8px 6px" }}>
                        {deleteConfirm?.id === r.id ? (
                          <div style={{ display: "flex", gap: "8px", alignItems: "center", fontFamily: "monospace", fontSize: "11px" }}>
                            <span style={{ color: C.red }}>Delete '{r.name}'?</span>
                            <ActionChip label="yes" onClick={() => handleDelete(r.id, r.name)} color={C.red} />
                            <ActionChip label="no" onClick={() => setDeleteConfirm(null)} color={C.dim} />
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
  const campaigns    = listCampaigns();
  const campaignCount = getCampaignCount();
  const names        = Object.keys(campaigns).sort();

  return (
    <div>
      <SectionHeader
        title="Campaigns"
        subtitle={`${campaignCount} saved`}
      />

      {campaignCount === 0 ? (
        <div style={{ color: C.dim, fontSize: "13px", fontFamily: "monospace", marginBottom: "8px" }}>
          No campaigns yet.
        </div>
      ) : (
        names.map((name, i) => {
          const camp  = campaigns[name];
          const state = camp?.state || {};
          const turn  = state.turn ?? 1;
          const pw    = state.player_wins ?? 0;
          const ew    = state.enemy_wins ?? 0;

          return (
            <div
              key={name}
              onClick={() => onInject?.(`load campaign ${name}`)}
              style={{
                display: "flex", gap: "10px", alignItems: "baseline",
                lineHeight: "2.0", cursor: "pointer", userSelect: "none",
                fontFamily: "monospace", fontSize: "13px",
              }}
              onMouseEnter={e => e.currentTarget.querySelector(".camp-name").style.color = C.green}
              onMouseLeave={e => e.currentTarget.querySelector(".camp-name").style.color = C.mid}
            >
              <span style={{ color: C.dim, minWidth: "18px", textAlign: "right", flexShrink: 0 }}>
                {i + 1}.
              </span>
              <span className="camp-name" style={{ color: C.mid, flex: 1, fontWeight: 700 }}>
                {name}
              </span>
              <span style={{ color: C.amber, fontSize: "12px", minWidth: "10ch" }}>
                Turn {turn}
              </span>
              <span style={{ color: C.dim, fontSize: "11px" }}>
                {pw}W – {ew}L
              </span>
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

export function RostersContext({ engineId, onExec, onInject, theme, profileName }) {
  const [session, setSession]     = useState(null);
  const [loading, setLoading]     = useState(false);
  const [tick, setTick]           = useState(0);
  const [uploadMode, setUploadMode] = useState(null); // null | "player" | "enemy"
  const pollRef                   = useRef(null);

  // Fetch session state from engine
  const fetchSession = useCallback(async () => {
    if (!engineId) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/engines/${engineId}/exec`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: "session" }),
      });
      if (res.ok) {
        const result = await res.json();
        if (result?.data) setSession(result.data);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [engineId]);

  // Poll session
  useEffect(() => {
    fetchSession();
    const startPolling = () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(() => {
        fetchSession();
        setTick(t => t + 1);
      }, 3000);
    };
    const stopPolling = () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
    startPolling();
    const onVisibility = () => {
      if (document.hidden) { stopPolling(); }
      else { fetchSession(); setTick(t => t + 1); startPolling(); }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { stopPolling(); document.removeEventListener("visibilitychange", onVisibility); };
  }, [fetchSession]);

  // Inject wrapper — refreshes session after command
  const handleInject = useCallback((cmd) => {
    onInject?.(cmd);
    setTimeout(() => { fetchSession(); setTick(t => t + 1); }, 600);
  }, [onInject, fetchSession]);

  // Upload complete — assign roster and refresh
  const handleUploadComplete = useCallback((name, faction, mode) => {
    setUploadMode(null);
    setTick(t => t + 1);
    // Auto-assign the uploaded roster
    const role = mode === "enemy" ? "enemy" : "player";
    handleInject(`set roster ${role} ${name}`);
  }, [handleInject]);

  const handleRefresh = useCallback(() => {
    setTick(t => t + 1);
  }, []);

  const myRoster    = session?.my_roster || {};
  const enemyRoster = session?.enemy_roster || {};

  return (
    <div
      style={{
        display: "flex", flexDirection: "column", height: "100%",
        backgroundColor: C.bg, overflow: "auto",
      }}
    >
      <div style={{ flex: 1, overflow: "auto", padding: "16px 24px 24px" }}>

        {/* Under construction notice */}
        <div
          style={{
            border:       "1px solid var(--ct-border)",
            borderRadius: "6px",
            padding:      "12px 16px",
            marginBottom: "16px",
            background:   "var(--ct-bg-dark)",
            fontSize:     "12px",
            fontFamily:   "var(--ct-font-mono, monospace)",
            color:        "var(--ct-primary-dim)",
            lineHeight:   "1.7",
          }}
        >
          <div style={{ color: "var(--ct-primary-mid)", fontWeight: 600, marginBottom: "6px", fontSize: "12px" }}>
            ⚠ UNDER CONSTRUCTION — BUGS LIKELY
          </div>
          <div style={{ marginBottom: "4px" }}>
            When a roster is loaded (player or enemy), all combat commands use only the weapons and profiles in that roster. For example, a Hammerhead with an ion cannon will only show ion cannon results — not railgun.
          </div>
          <div>
            Remove a roster to see all possible weapon profiles and matchups.
          </div>
        </div>

        {/* ── Upload flow (replaces dashboard content when active) ── */}
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

        {/* ── Dashboard (hidden during upload) ── */}
        {!uploadMode && (
          <>
            {/* Army panels */}
            <SectionHeader title="Active Armies" />
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "24px" }}>
              <ArmyPanel roster={myRoster}    side="PLAYER" onUpload={setUploadMode} onInject={handleInject} />
              <ArmyPanel roster={enemyRoster} side="ENEMY"  onUpload={setUploadMode} onInject={handleInject} />
            </div>

            {/* Saved rosters */}
            <div style={{ marginBottom: "24px" }}>
              <SavedRostersSection refreshKey={tick} onInject={handleInject} onRefresh={handleRefresh} />
            </div>

            {/* Campaigns */}
            <div style={{ marginBottom: "24px" }}>
              <CampaignsSection key={`campaigns-${tick}`} onInject={handleInject} />
            </div>
          </>
        )}

      </div>
    </div>
  );
}
