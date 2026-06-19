/**
 * SettingsPage — Phase 6 settings surface (Settings.dc.html).
 *
 * Four sub-tabs, switched by the App's SETTINGS nav dropdown (no command
 * injection — the dropdown sets `activeTab` directly):
 *   • Diagnostics  — embeds the existing DiagnosticsPage (engine health).
 *   • Command List — LIVE from /api/engines/{id}/schema, grouped by command group.
 *   • Math Mode    — Decision E2: edition (real, via useEdition) + a display
 *                    preference panel for engine mode / iterations / confidence,
 *                    seeded from the engine's LIVE status so it shows truth.
 *   • Aliases      — Decision F1: real ct_aliases CRUD (lib/aliases.js).
 *
 * Themeable throughout (C.* / CSS vars + .ct-display Chakra face). The theme
 * picker itself stays in the App top-bar nav (the mockup's "circle in the tab
 * row") rather than being duplicated here.
 */

import { useState, useEffect, useMemo } from "react";
import { C } from "./shared/colors";
import { SectionHeader } from "./shared/constants";
import { DiagnosticsPage } from "./DiagnosticsPage";
import { useEdition } from "@/hooks/useEdition";
import { readAliases, writeAliases } from "@/lib/aliases";

// ─── Shared bits ──────────────────────────────────────────────────────────────

const PURPLE = "#a78bdb"; // decorative, non-semantic (matches System group elsewhere)

// Command-group → accent dot. Mirrors the engine's GROUP_ORDER/GROUP_LABELS.
const GROUP_LABELS = {
  data:       "Data",
  math:       "Combat Math",
  analysis:   "Analysis",
  rules:      "Rules",
  session:    "Session",
  meta:       "Terminal",
  navigation: "Navigation",
};
const GROUP_ORDER = ["data", "math", "analysis", "rules", "session", "meta", "navigation"];
const GROUP_COLOR = {
  data:       C.cyan,
  math:       C.green,
  analysis:   C.accent,
  rules:      PURPLE,
  session:    C.factionSM,
  meta:       C.label,
  navigation: C.dim,
};

function segStyle(on) {
  return {
    fontFamily:    "'Chakra Petch', monospace",
    fontSize:      "11px",
    letterSpacing: "0.08em",
    padding:       "8px 17px",
    cursor:        "pointer",
    color:         on ? C.bgDark : C.bodyDim,
    background:    on ? C.green : "transparent",
    fontWeight:    on ? 700 : 400,
    textTransform: "uppercase",
    userSelect:    "none",
    transition:    "background .12s, color .12s",
  };
}

function CheckBox({ on }) {
  return (
    <span style={{
      width: "16px", height: "16px", borderRadius: "3px",
      border: `1px solid ${on ? C.green : C.bordermid}`,
      background: on ? C.green : "transparent",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: "10px", color: C.bgDark, flexShrink: 0,
    }}>{on ? "✓" : ""}</span>
  );
}

// ─── Command List tab ───────────────────────────────────────────────────────────

function CommandListTab({ engineId }) {
  const [schema, setSchema] = useState(null);
  const [error,  setError]  = useState(false);

  useEffect(() => {
    if (!engineId) return;
    let alive = true;
    fetch(`/api/engines/${engineId}/schema`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { if (alive) setSchema(d); })
      .catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, [engineId]);

  const groups = useMemo(() => {
    const queries = schema?.queries || {};
    const byGroup = {};
    Object.entries(queries).forEach(([name, def]) => {
      if (def?.stub) return; // hide not-yet-real commands
      const g = def?.group || "meta";
      (byGroup[g] = byGroup[g] || []).push({
        cmd:  def?.usage || name,
        desc: def?.description || "",
      });
    });
    const ordered = [...GROUP_ORDER, ...Object.keys(byGroup).filter((g) => !GROUP_ORDER.includes(g))];
    return ordered
      .filter((g) => byGroup[g]?.length)
      .map((g) => ({
        key: g, title: GROUP_LABELS[g] || g, color: GROUP_COLOR[g] || C.label,
        cmds: byGroup[g].sort((a, b) => a.cmd.localeCompare(b.cmd)),
      }));
  }, [schema]);

  if (error) {
    return <div style={{ color: C.dim, fontSize: "12px", fontStyle: "italic" }}>Command reference unavailable — engine offline.</div>;
  }
  if (!schema) {
    return <div style={{ color: C.dim, fontSize: "12px", fontStyle: "italic" }}>Loading command reference…</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
      {groups.map((g) => (
        <div key={g.key}>
          <div style={{ display: "flex", alignItems: "center", gap: "9px", paddingBottom: "8px", borderBottom: `1px solid ${C.border}`, marginBottom: "6px" }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "2px", background: g.color }} />
            <span className="ct-display" style={{ fontSize: "11px", letterSpacing: "0.14em", color: C.text, textTransform: "uppercase" }}>{g.title}</span>
          </div>
          {g.cmds.map((c, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: "14px", padding: "6px 4px", borderBottom: `1px solid ${C.hairline}`, alignItems: "baseline" }}>
              <span style={{ fontSize: "12px", color: C.green, fontFamily: "monospace" }}>{c.cmd}</span>
              <span style={{ fontSize: "11px", color: C.bodyDim, lineHeight: 1.5 }}>{c.desc}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── Math Mode tab (E2) ─────────────────────────────────────────────────────────

const CT_MATH_PREFS_KEY = "ct_math_prefs";
const CONF_DEFS = [["vhigh", "Very High ≤1%"], ["high", "High ≤3%"], ["med", "Medium ≤7%"]];

function readMathPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(CT_MATH_PREFS_KEY) || "{}");
    if (p && typeof p === "object") return p;
  } catch { /* */ }
  return {};
}

function MathModeTab({ engineId }) {
  const { edition, setEdition } = useEdition();
  const [live, setLive] = useState(null); // engine's real current sim config

  const saved = readMathPrefs();
  const [mode,     setMode]     = useState(saved.mode || null);     // null → adopt live
  const [iters,    setIters]    = useState(saved.iters || null);
  const [conf,     setConf]     = useState(saved.conf || "high");
  const [working,  setWorking]  = useState(saved.working ?? true);
  const [variance, setVariance] = useState(saved.variance ?? true);

  // Pull the engine's LIVE mode + trials so the panel shows truth on load.
  useEffect(() => {
    if (!engineId) return;
    let alive = true;
    fetch(`/api/engines/${engineId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (!alive) return;
        setLive(d);
        setMode((m) => m || (d?.simulation_mode === "deterministic" ? "det" : "mc"));
        setIters((n) => n || (d?.simulation_config?.trials ?? 5000));
      })
      .catch(() => { if (alive) { setMode((m) => m || "mc"); setIters((n) => n || 5000); } });
    return () => { alive = false; };
  }, [engineId]);

  // Persist preference whenever it changes.
  useEffect(() => {
    if (mode == null || iters == null) return;
    try { localStorage.setItem(CT_MATH_PREFS_KEY, JSON.stringify({ mode, iters, conf, working, variance })); } catch { /* */ }
  }, [mode, iters, conf, working, variance]);

  const isMC = mode !== "det";
  const itersLabel = isMC ? Number(iters || 5000).toLocaleString() : "—";
  const confName = (CONF_DEFS.find((c) => c[0] === conf) || CONF_DEFS[1])[1];
  const liveTrials = live?.simulation_config?.trials;
  const liveMode = live ? (live.simulation_mode === "deterministic" ? "Deterministic" : "Monte Carlo") : null;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: "16px", alignItems: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>

        {/* Rules Edition — real (useEdition) */}
        <div>
          <div className="ct-display" style={{ fontSize: "10px", letterSpacing: "0.14em", color: C.accent, textTransform: "uppercase", fontWeight: 700, marginBottom: "9px" }}>Rules Edition</div>
          <div style={{ display: "inline-flex", border: `1px solid ${C.border}`, borderRadius: "5px", overflow: "hidden" }}>
            <div onClick={() => setEdition("11th")} style={segStyle(edition === "11th")}>11th Edition</div>
            <div onClick={() => setEdition("10th")} style={segStyle(edition === "10th")}>10th Edition</div>
          </div>
          <div style={{ fontSize: "11px", color: C.bodyDim, lineHeight: 1.6, marginTop: "9px" }}>
            Sets the edition label shown sitewide (chrome chip + footer). The loaded datasheets are 10th-edition data; the switch is a cosmetic label for now.
          </div>
        </div>

        {/* Engine Mode — seeded from live status (display preference) */}
        <div>
          <div className="ct-display" style={{ fontSize: "10px", letterSpacing: "0.14em", color: C.dim, textTransform: "uppercase", fontWeight: 700, marginBottom: "9px" }}>Engine Mode</div>
          <div style={{ display: "inline-flex", border: `1px solid ${C.border}`, borderRadius: "5px", overflow: "hidden" }}>
            <div onClick={() => setMode("mc")}  style={segStyle(isMC)}>Monte Carlo</div>
            <div onClick={() => setMode("det")} style={segStyle(!isMC)}>Deterministic</div>
          </div>
          <div style={{ fontSize: "11px", color: C.bodyDim, lineHeight: 1.6, marginTop: "9px" }}>
            {isMC
              ? "Simulates thousands of full combat sequences — captures variance, swinginess and tail outcomes."
              : "Single fixed expected-value calculation per weapon. Fast and exact mean, but no variance or spikes."}
          </div>
        </div>

        {/* Iterations */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "8px" }}>
            <span className="ct-display" style={{ fontSize: "10px", letterSpacing: "0.14em", color: C.dim, textTransform: "uppercase", fontWeight: 700 }}>Iterations</span>
            <span style={{ fontSize: "13px", color: C.green, fontWeight: 700, fontFamily: "monospace" }}>{itersLabel}</span>
          </div>
          <input
            type="range" min="1000" max="20000" step="1000"
            value={iters || 5000}
            disabled={!isMC}
            onChange={(e) => setIters(Number(e.target.value))}
            style={{ width: "100%", accentColor: C.green, opacity: isMC ? 1 : 0.4 }}
          />
          <div style={{ fontSize: "10px", color: C.dim, marginTop: "5px" }}>
            More trials → tighter confidence interval, slower compute.{!isMC && " (Deterministic mode runs a single pass.)"}
          </div>
        </div>

        {/* Confidence target */}
        <div>
          <div className="ct-display" style={{ fontSize: "10px", letterSpacing: "0.14em", color: C.dim, textTransform: "uppercase", fontWeight: 700, marginBottom: "9px" }}>Confidence Target</div>
          <div style={{ display: "flex", gap: "6px" }}>
            {CONF_DEFS.map(([k, label]) => {
              const on = conf === k;
              return (
                <span key={k} onClick={() => setConf(k)} style={{
                  fontSize: "10px", letterSpacing: "0.04em", padding: "5px 10px", borderRadius: "3px", cursor: "pointer",
                  color: on ? C.bgDark : C.bodyDim, background: on ? C.green : "transparent",
                  border: `1px solid ${on ? C.green : C.bordermid}`, fontWeight: on ? 700 : 400,
                }}>{label}</span>
              );
            })}
          </div>
        </div>

        {/* Toggles */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <div onClick={() => setWorking((v) => !v)} style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
            <CheckBox on={working} />
            <div>
              <div style={{ fontSize: "12px", color: C.textMid }}>Show working (Math Mode replay)</div>
              <div style={{ fontSize: "10px", color: C.dim }}>Step through every dice-math event after a result.</div>
            </div>
          </div>
          <div onClick={() => setVariance((v) => !v)} style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
            <CheckBox on={variance && isMC} />
            <div>
              <div style={{ fontSize: "12px", color: C.textMid }}>Report variance &amp; swinginess</div>
              <div style={{ fontSize: "10px", color: C.dim }}>Show the coefficient of variation per result.{!isMC && " (MC only.)"}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Preview card */}
      <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: "5px", padding: "14px 15px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "11px" }}>
          <span style={{ color: PURPLE }}>◈</span>
          <span className="ct-display" style={{ fontSize: "10px", letterSpacing: "0.14em", color: PURPLE, textTransform: "uppercase", fontWeight: 700 }}>Current Config</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "7px", fontSize: "11px" }}>
          {[["Mode", isMC ? "Monte Carlo" : "Deterministic"], ["Trials", itersLabel], ["Target CI", confName], ["Replay", working ? "On" : "Off"], ["Variance", (variance && isMC) ? "On" : "Off"]].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: C.label }}>{k}</span>
              <span style={{ color: C.text }}>{v}</span>
            </div>
          ))}
        </div>

        {liveMode && (
          <div style={{ marginTop: "12px", paddingTop: "11px", borderTop: `1px solid ${C.border}`, fontSize: "10px", color: C.dim, lineHeight: 1.6 }}>
            Engine is live in <span style={{ color: C.green }}>{liveMode}</span>{liveTrials ? <> · <span style={{ color: C.green }}>{Number(liveTrials).toLocaleString()}</span> trials</> : null}. Mode &amp; iteration tuning is saved as your preference.
          </div>
        )}

        <div style={{ marginTop: "13px", paddingTop: "11px", borderTop: `1px solid ${C.border}` }}>
          <div className="ct-display" style={{ fontSize: "9px", color: C.dim, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "7px" }}>Sample ledger</div>
          <div style={{ fontSize: "10px", lineHeight: 1.9, color: C.bodyDim, fontFamily: "monospace" }}>
            {[["hit", "10 × .833", "8.33", C.accent], ["wound", "8.33 × .333", "2.78", C.accent], ["unsaved", "2.78 × .50", "1.39", C.accent], ["damage", "1.39 × 1", "1.39", C.green]].map(([step, calc, out, col]) => (
              <div key={step}>
                <span style={{ color: PURPLE }}>{step}</span> = {calc} <span style={{ color: C.ghost }}>→</span> <span style={{ color: col }}>{out}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Aliases tab (F1) ───────────────────────────────────────────────────────────

function AliasesTab() {
  const [aliases,  setAliases]  = useState(readAliases);
  const [newAlias, setNewAlias] = useState("");
  const [newCmd,   setNewCmd]   = useState("");

  function commit(next) { setAliases(writeAliases(next)); }

  function add() {
    const al = newAlias.trim().toLowerCase(), cm = newCmd.trim();
    if (!al || !cm) return;
    commit([...aliases.filter((a) => a.alias.toLowerCase() !== al), { alias: al, cmd: cm }]);
    setNewAlias(""); setNewCmd("");
  }
  function remove(i) { commit(aliases.filter((_, j) => j !== i)); }

  const inputStyle = {
    background: C.panel, border: `1px solid ${C.border}`, color: C.text,
    fontFamily: "monospace", fontSize: "12px", padding: "9px 11px", borderRadius: "4px", outline: "none",
  };

  return (
    <div style={{ maxWidth: "640px" }}>
      <div style={{ fontSize: "11px", color: C.bodyDim, lineHeight: 1.6, marginBottom: "16px" }}>
        Aliases let you type a shorthand that expands to a full command or unit name. They apply anywhere in the terminal — saved on this device.
      </div>
      <div style={{ display: "flex", gap: "9px", marginBottom: "16px" }}>
        <input value={newAlias} onChange={(e) => setNewAlias(e.target.value)} placeholder="alias  (e.g. ds)" style={{ ...inputStyle, width: "160px" }} />
        <span style={{ color: C.dim, alignSelf: "center" }}>→</span>
        <input
          value={newCmd}
          onChange={(e) => setNewCmd(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") add(); }}
          placeholder="expands to…  (e.g. deep strike)"
          style={{ ...inputStyle, flex: 1 }}
        />
        <span onClick={add} className="ct-display" style={{
          fontSize: "11px", letterSpacing: "0.08em", textTransform: "uppercase", color: C.bgDark,
          background: C.green, fontWeight: 700, padding: "9px 16px", borderRadius: "4px", cursor: "pointer", alignSelf: "center",
        }}>+ Add</span>
      </div>
      <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: "5px", overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "160px 1fr 40px", gap: "12px", padding: "8px 14px", borderBottom: `1px solid ${C.border}`, fontSize: "9px", letterSpacing: "0.1em", textTransform: "uppercase", color: C.dim }}>
          <span>Alias</span><span>Expands to</span><span />
        </div>
        {aliases.map((a, i) => (
          <div key={a.alias} style={{ display: "grid", gridTemplateColumns: "160px 1fr 40px", gap: "12px", padding: "9px 14px", borderBottom: `1px solid ${C.hairline}`, alignItems: "center" }}>
            <span style={{ fontSize: "12px", color: C.green, fontFamily: "monospace" }}>{a.alias}</span>
            <span style={{ fontSize: "12px", color: C.bodyDim, fontFamily: "monospace" }}>{a.cmd}</span>
            <span onClick={() => remove(i)} title="Remove" style={{ color: C.dim, fontSize: "12px", cursor: "pointer", textAlign: "center" }}>✕</span>
          </div>
        ))}
        {aliases.length === 0 && (
          <div style={{ padding: "18px 14px", fontSize: "12px", color: C.dim, fontStyle: "italic" }}>No aliases yet — add one above.</div>
        )}
      </div>
    </div>
  );
}

// ─── Shell ──────────────────────────────────────────────────────────────────────

const TABS = [["diagnostics", "Diagnostics"], ["commands", "Command List"], ["math", "Math Mode"], ["aliases", "Aliases"]];

export function SettingsPage({ engineId, activeTab = "diagnostics", onTab }) {
  const tab = TABS.some(([k]) => k === activeTab) ? activeTab : "diagnostics";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", backgroundColor: "var(--ct-bg)" }}>
      {/* sub-tabs */}
      <div className="shrink-0" style={{ display: "flex", gap: "6px", padding: "12px 20px 0", borderBottom: `1px solid ${C.hairline}` }}>
        {TABS.map(([k, label]) => {
          const on = tab === k;
          return (
            <div
              key={k}
              onClick={() => onTab?.(k)}
              className="ct-display"
              style={{
                fontSize: "11px", letterSpacing: "0.1em", textTransform: "uppercase",
                padding: "8px 14px", cursor: "pointer",
                color: on ? C.text : C.dim,
                borderBottom: on ? `2px solid ${C.green}` : "2px solid transparent",
              }}
            >{label}</div>
          );
        })}
      </div>

      {/* content */}
      {tab === "diagnostics" ? (
        // DiagnosticsPage owns its own scroll + padding.
        <div style={{ flex: 1, overflow: "hidden" }}>
          <DiagnosticsPage engineId={engineId} />
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 22px 28px" }}>
          {tab === "commands" && <CommandListTab engineId={engineId} />}
          {tab === "math"     && <MathModeTab engineId={engineId} />}
          {tab === "aliases"  && <AliasesTab />}
        </div>
      )}
    </div>
  );
}
