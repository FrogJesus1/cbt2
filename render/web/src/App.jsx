/**
 * App — Combat Terminal Web Interface
 *
 * Multi-Context Terminal System
 *
 * Each context is a persistent terminal session with independent state.
 * All five contexts are always mounted (display: none when inactive) so
 * switching contexts never resets their history or output stream.
 *
 * Contexts:
 *   main     — default terminal (command hub, combat math, analysis)
 *   units    — unit database browser (search + filter + list units results)
 *   rosters  — roster management + campaign dashboard (dedicated panel, no terminal)
 *   rules    — rules & keyword lookup
 *   settings — hidden settings terminal (no visible tab)
 *
 * Context switching:
 *   Clicking a tab → injects the nav command (e.g. "units") into CommandBar
 *   → current terminal handles it via Priority 7 nav → App switches context.
 *
 *   `list units [...]` typed in any non-units terminal → Terminal.jsx Priority 7.5
 *   routes the command to units context via onContextRoute callback.
 *
 * Layout:
 *   ┌─────────────────────────────────────────────────────────┐
 *   │  ⚡ COMBAT TERMINAL  MAIN | UNITS | ROSTERS | RULES    │  ← nav bar
 *   ├─────────────────────────────────────────────────────────┤
 *   │                                                         │
 *   │   active context (terminal + optional UI strip)         │
 *   │                                                         │
 *   ├─────────────────────────────────────────────────────────┤
 *   │  › command input                                        │  ← global command bar
 *   └─────────────────────────────────────────────────────────┘
 */

import { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from "react";
import { Terminal }         from "@/components/Terminal";
import { UnitsContext }     from "@/components/UnitsContext";
import { RulesContext }     from "@/components/RulesContext";
import { RostersContext }   from "@/components/RostersContext";

import { DiagnosticsPage }  from "@/components/DiagnosticsPage";

// ─── Theme persistence helpers ─────────────────────────────────────────────────
// Active theme is stored in localStorage so it survives page reloads.
// Theme validation lives in Terminal.jsx (reads themeRegistry + unlocked list).

const CT_ACTIVE_KEY = "ct_active_theme";

function readStoredTheme() {
  try { return localStorage.getItem(CT_ACTIVE_KEY) || "dark"; }
  catch { return "dark"; }
}

// ─── Context config ───────────────────────────────────────────────────────────

const VISIBLE_CONTEXTS = ["main", "units", "rosters", "rules"];  // settings hidden
const CONTEXT_LABELS   = { main: "MAIN", units: "UNITS", rosters: "ROSTERS", rules: "RULES" };
const CONTEXT_NAV_CMD  = { main: "home",  units: "units",  rosters: "rosters",  rules: "rules" };

// ─── Boot lines ───────────────────────────────────────────────────────────────

const SETTINGS_BOOT_LINES = [
  "╔══════════════════════════════════════════════════════════════╗",
  "║  SETTINGS  ·  Hidden Configuration Terminal                  ║",
  "╚══════════════════════════════════════════════════════════════╝",
  "",
  "  status    — engine status and loaded data summary",
  "  help       — full command reference",
  "",
];

// ─── Global command bar ───────────────────────────────────────────────────────
//
// Always rendered at the bottom.  Exposes animateAndSubmit(cmd) and
// populateInput(cmd) via forwardRef.  populateInput fills the bar without
// submitting — used by the "edit & re-run" button on past commands.

const CommandBar = forwardRef(function CommandBar(
  { onSubmit, commands = [], loading = false },
  ref
) {
  const [input,     setInput]     = useState("");
  const [cmdHist,   setCmdHist]   = useState([]);
  const [histIdx,   setHistIdx]   = useState(-1);
  const [animating, setAnimating] = useState(false);
  const inputRef    = useRef(null);
  const animTimer   = useRef(null);
  const animActive  = useRef(false);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => () => { if (animTimer.current) clearTimeout(animTimer.current); }, []);

  function submit(raw) {
    const trimmed = raw.trim();
    if (!trimmed || loading) return;
    setCmdHist(prev => [...prev.slice(-49), trimmed]);
    setHistIdx(-1);
    setInput("");
    onSubmit(trimmed);
    inputRef.current?.focus();
  }

  useImperativeHandle(ref, () => ({
    focus() {
      inputRef.current?.focus();
    },
    animateAndSubmit(cmd) {
      if (animTimer.current) clearTimeout(animTimer.current);
      animActive.current = true;
      setAnimating(true);
      setInput("");

      const chars = [...cmd];
      let   i     = 0;

      function tick() {
        if (!animActive.current) return;
        if (i < chars.length) {
          const snapshot = chars.slice(0, i + 1).join("");
          setInput(snapshot);
          i++;
          animTimer.current = setTimeout(tick, 28 + Math.random() * 18);
        } else {
          animActive.current = false;
          setAnimating(false);
          submit(cmd);
        }
      }

      animTimer.current = setTimeout(tick, 55);
    },
    /** Fill the input bar without submitting — lets the user edit before Enter. */
    populateInput(cmd) {
      if (animTimer.current) clearTimeout(animTimer.current);
      animActive.current = false;
      setAnimating(false);
      setInput(cmd);
      setHistIdx(-1);
      setTimeout(() => {
        inputRef.current?.focus();
        // Place cursor at end
        inputRef.current?.setSelectionRange(cmd.length, cmd.length);
      }, 0);
    },
  }));

  const handleChange = (e) => {
    if (animActive.current) {
      if (animTimer.current) clearTimeout(animTimer.current);
      animActive.current = false;
      setAnimating(false);
    }
    setInput(e.target.value);
    setHistIdx(-1);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      if (animActive.current) {
        if (animTimer.current) clearTimeout(animTimer.current);
        animActive.current = false;
        setAnimating(false);
      }
      submit(input);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!cmdHist.length) return;
      const next = histIdx === -1 ? cmdHist.length - 1 : Math.max(0, histIdx - 1);
      setHistIdx(next);
      setInput(cmdHist[next] ?? "");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (histIdx === -1) return;
      const next = histIdx + 1;
      if (next >= cmdHist.length) { setHistIdx(-1); setInput(""); }
      else { setHistIdx(next); setInput(cmdHist[next] ?? ""); }
    } else if (e.key === "Tab") {
      e.preventDefault();
      const val = input.trim().toLowerCase();
      if (!val) return;
      const matches = commands.filter(c => c.startsWith(val));
      if (matches.length === 1) setInput(matches[0] + " ");
    }
  };

  return (
    <div
      className="shrink-0 flex items-center gap-3 px-5 font-mono"
      style={{
        borderTop:       "2px solid var(--ct-border-bright)",
        backgroundColor: "var(--ct-bg-dark)",
        minHeight:       "52px",
        boxShadow:       "0 -4px 20px rgba(var(--ct-glow-rgb), 0.06)",
      }}
      onClick={() => inputRef.current?.focus()}
    >
      <span
        className={`ct-glow-sm select-none shrink-0 ${animating ? "animate-pulse" : ""}`}
        style={{ color: animating ? "#ffa328" : "var(--ct-primary)", fontSize: "20px", transition: "color 0.15s" }}
      >
        ›
      </span>
      <input
        ref={inputRef}
        type="text"
        value={input}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={animating ? "" : "enter command…"}
        className="flex-1 bg-transparent outline-none font-mono"
        style={{
          color:      animating ? "#ffa32899" : "var(--ct-primary)",
          fontSize:   "15px",
          caretColor: animating ? "transparent" : "var(--ct-primary)",
          transition: "color 0.1s",
        }}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        disabled={loading}
      />
      {loading && !animating && (
        <span className="shrink-0 font-mono animate-pulse" style={{ color: "var(--ct-primary-dim)", fontSize: "13px", letterSpacing: "0.1em" }}>
          WAIT
        </span>
      )}
      {animating && (
        <span className="shrink-0 font-mono" style={{ color: "#ffa32870", fontSize: "11px", letterSpacing: "0.15em" }}>
          INJECT
        </span>
      )}
    </div>
  );
});

// ─── API constant ─────────────────────────────────────────────────────────────

const API = "/api";

// ─── History constants ───────────────────────────────────────────────────────
const CT_HISTORY_KEY = "ct_cmd_history";
const HISTORY_TYPES  = new Set(["combat", "threat_card", "threat_view"]);

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [engines,        setEngines]        = useState([]);
  const [activeEngineId, setActiveEngineId] = useState(null);
  const [commands,       setCommands]       = useState([]);
  const [apiError,       setApiError]       = useState(null);
  const [activeContext,  setActiveContext]  = useState("main");
  const [historyOpen,    setHistoryOpen]    = useState(false);
  const [scrollToId,     setScrollToId]     = useState(null);
  const [cmdBarLoading,  setCmdBarLoading]  = useState(false);
  // Initialise from localStorage so the last-active theme is restored on reload
  const [theme, setTheme] = useState(readStoredTheme);

  // Per-context pending command queue
  const [pendingCommands, setPendingCommands] = useState({
    main:     null,
    units:    null,
    rosters:  null,
    rules:    null,
    settings: null,
    diag:     null,
  });

  const [buildHash, setBuildHash] = useState(null);  // git short hash from /api/version

  const historyRef = useRef(null);
  const cmdBarRef  = useRef(null);

  // ── Load engines + version ────────────────────────────────────────────────

  useEffect(() => {
    fetch(`${API}/engines`)
      .then(r => r.json())
      .then(data => {
        const list    = data.engines ?? [];
        const primary = data.primary ?? list[0]?.id ?? null;
        setEngines(list);
        setActiveEngineId(primary);
      })
      .catch(() => setApiError("Cannot reach API — run: python main.py"));

    fetch(`${API}/version`)
      .then(r => r.json())
      .then(data => setBuildHash(data.commit ?? null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!activeEngineId) return;
    fetch(`${API}/engines/${activeEngineId}/commands`)
      .then(r => r.json())
      .then(data => setCommands(data.commands ?? []))
      .catch(() => setCommands([]));
  }, [activeEngineId]);

  // Persist active theme to localStorage whenever it changes
  useEffect(() => {
    try { localStorage.setItem(CT_ACTIVE_KEY, theme); } catch {}
  }, [theme]);

  // Close history dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (historyRef.current && !historyRef.current.contains(e.target)) {
        setHistoryOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Persistent CLI focus — refocus the command bar after any click on
  // non-interactive content so the user can always keep typing.
  // Skips buttons, inputs, selects, textareas, links, and [contenteditable]
  // so built-in browser behaviour for those elements is never disrupted.
  useEffect(() => {
    const SKIP_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A", "LABEL"]);
    const handler = (e) => {
      const tag = e.target?.tagName ?? "";
      const editable = e.target?.isContentEditable;
      if (SKIP_TAGS.has(tag) || editable) return;
      // Small defer so the click handler on the target fires first
      setTimeout(() => cmdBarRef.current?.focus(), 0);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Exec handler ─────────────────────────────────────────────────────────

  const handleExec = useCallback(async (rawInput, rosterContext = null) => {
    const body = { input: rawInput };
    if (rosterContext) body.roster_context = rosterContext;
    const res = await fetch(`${API}/engines/${activeEngineId}/exec`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    });
    if (!res.ok) {
      return {
        ok:          false,
        result_type: "error",
        data:        `API error ${res.status}: ${res.statusText}`,
        meta:        {},
      };
    }
    return res.json();
  }, [activeEngineId]);

  // ── Command history — filtered, deduped, starred ─────────────────────────
  //
  // Shape: [{ key, input, starred, streamId }]
  //   key      = normalised lowercase input (dedup key)
  //   input    = original-cased command text
  //   starred  = boolean — pinned to top
  //   streamId = most recent stream entry id (for scroll-to-jump)
  //
  // Only combat (contains " vs ") and threat commands are tracked.
  // Errors, edits, and duplicate runs move existing entries to the top.

  // Hydrate once from localStorage
  const [cmdHistory, setCmdHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem(CT_HISTORY_KEY) || "[]"); }
    catch { return []; }
  });

  // Persist whenever history changes
  useEffect(() => {
    try { localStorage.setItem(CT_HISTORY_KEY, JSON.stringify(cmdHistory)); }
    catch { /* storage unavailable */ }
  }, [cmdHistory]);

  // Track which stream entry ids we've already processed into history
  const processedHistoryIds = useRef(new Set());

  const handleStreamChange = useCallback((stream) => {
    // Only process new, finished, successful combat/threat entries
    const fresh = stream.filter(e =>
      !e.pending && e.input && e.result?.ok
      && HISTORY_TYPES.has(e.result?.result_type)
      && !processedHistoryIds.current.has(e.id)
    );
    if (!fresh.length) return;

    // Mark as processed
    for (const e of fresh) processedHistoryIds.current.add(e.id);

    setCmdHistory(prev => {
      let next = [...prev];
      for (const e of fresh) {
        const key = e.input.trim().toLowerCase();
        const idx = next.findIndex(h => h.key === key);
        if (idx !== -1) {
          // Already exists — update streamId, move to front of its group (keep star state)
          const existing = next.splice(idx, 1)[0];
          if (existing.starred) {
            // Insert at front of starred group
            next.unshift({ ...existing, streamId: e.id });
          } else {
            // Insert after last starred item
            const firstUnstarred = next.findIndex(h => !h.starred);
            const insertAt = firstUnstarred === -1 ? next.length : firstUnstarred;
            next.splice(insertAt, 0, { ...existing, streamId: e.id });
          }
        } else {
          // New entry — insert after starred items
          const firstUnstarred = next.findIndex(h => !h.starred);
          const insertAt = firstUnstarred === -1 ? next.length : firstUnstarred;
          next.splice(insertAt, 0, { key, input: e.input.trim(), starred: false, streamId: e.id });
        }
      }
      // Cap at 30
      return next.slice(0, 30);
    });
  }, []);

  const handleHistoryDelete = useCallback((key) => {
    setCmdHistory(prev => prev.filter(h => h.key !== key));
  }, []);

  const handleHistoryStar = useCallback((key) => {
    setCmdHistory(prev => {
      const updated = prev.map(h =>
        h.key === key ? { ...h, starred: !h.starred } : h
      );
      // Sort: starred first (preserve relative order within each group)
      const starred   = updated.filter(h => h.starred);
      const unstarred = updated.filter(h => !h.starred);
      return [...starred, ...unstarred];
    });
  }, []);

  // ── Global command bar submit ─────────────────────────────────────────────
  // Routes to the appropriate context before the terminal sees the command.
  // `list units [...]` always targets the units context regardless of where
  // the user is currently — this is the authoritative routing point.

  const handleGlobalCommand = useCallback((cmd) => {
    const tokens = cmd.trim().toLowerCase().split(/\s+/);

    // Nav commands — resolve at App level so they work from any context,
    // including non-terminal contexts like DIAG and DEMO that can't consume
    // pending commands.
    const NAV_CMD_MAP = {
      home: "main", h: "main",
      units: "units", u: "units",
      rosters: "rosters", campaign: "rosters", c: "rosters",
      rules: "rules", r: "rules",
      diag: "diag",
      settings: "settings",
    };
    if (NAV_CMD_MAP[tokens[0]] !== undefined) {
      setActiveContext(NAV_CMD_MAP[tokens[0]]);
      // No loading state — pure navigation, no API call
      return;
    }

    if (tokens[0] === "list" && tokens[1] === "units") {
      // Always send list-units commands to the units context
      setActiveContext("units");
      setPendingCommands(prev => ({ ...prev, units: cmd }));
    } else {
      // All other commands go to the currently active context
      setPendingCommands(prev => ({ ...prev, [activeContext]: cmd }));
    }
    setCmdBarLoading(true);
  }, [activeContext]);

  // ── Context route callback ────────────────────────────────────────────────
  // Called by a Terminal when it detects a command that belongs to a different
  // context (e.g. `list units tau` typed in main → routes to units context).

  const handleContextRoute = useCallback((targetContext, cmd) => {
    setActiveContext(targetContext);
    setPendingCommands(prev => ({ ...prev, [targetContext]: cmd }));
    // cmdBarLoading is already true from handleGlobalCommand
  }, []);

  // ── Navigation callback — called by Terminal on nav commands ──────────────
  // Terminal resolves `units`, `rules`, etc. → calls this with the view id.

  const handleNavigate = useCallback((view) => {
    const knownContexts = ["main", "units", "rosters", "rules", "settings", "diag"];
    if (knownContexts.includes(view)) {
      setActiveContext(view);
    }
  }, []);

  // ── Animated command injection ────────────────────────────────────────────
  // Stays in current context — does NOT force-switch to main.

  const handleAnimatedInject = useCallback((cmd) => {
    setTimeout(() => {
      cmdBarRef.current?.animateAndSubmit(cmd);
    }, 40);
  }, []);

  // ── Edit command — fill bar without submitting ──────────────────────────
  const handleEditCommand = useCallback((cmd) => {
    cmdBarRef.current?.populateInput(cmd);
  }, []);

  // ── History jump ─────────────────────────────────────────────────────────

  // handleHistoryJump kept for potential future use (scroll to a stream entry)
  // const handleHistoryJump = useCallback((streamId) => {
  //   setHistoryOpen(false);
  //   setActiveContext("main");
  //   setTimeout(() => setScrollToId(streamId), 50);
  // }, []);

  // ── Consumed callback factory ─────────────────────────────────────────────
  // Returns an `onPendingCommandConsumed` callback for a specific context.
  // Clears that context's pending command and unblocks the CommandBar.

  const makeConsumed = (ctx) => () => {
    setPendingCommands(prev => ({ ...prev, [ctx]: null }));
    setCmdBarLoading(false);
  };

  // ── Derived ──────────────────────────────────────────────────────────────

  const activeEngine = engines.find(e => e.id === activeEngineId);
  const isReady      = activeEngine?.ready ?? false;

  // Shared props passed to every context terminal
  const sharedTerminalProps = {
    engineId:  activeEngineId,
    onExec:    handleExec,
    onInject:  handleAnimatedInject,
    onEdit:    handleEditCommand,
    onNavigate: handleNavigate,
    onContextRoute: handleContextRoute,
    onTheme:   setTheme,
    theme,
  };

  // ── Context panel visibility helper ──────────────────────────────────────
  // All panels are always mounted; only the active one is visible.
  // Using display:flex / display:none preserves React state (stream, history, etc.)

  const panelStyle = (ctx) => ({
    display:       activeContext === ctx ? "flex" : "none",
    flexDirection: "column",
    height:        "100%",
    overflow:      "hidden",
  });

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      data-theme={theme}
      className="flex items-center justify-center h-screen overflow-hidden"
      style={{ background: "#000000" }}
    >
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{
        width:      "100%",
        maxWidth:   "960px",
        background: "var(--ct-bg)",
        borderLeft:  "1px solid var(--ct-border)",
        borderRight: "1px solid var(--ct-border)",
        boxShadow:   "-20px 0 60px rgba(0,0,0,0.8), 20px 0 60px rgba(0,0,0,0.8), 0 0 80px rgba(var(--ct-glow-rgb),0.03)",
      }}
    >

      {/* ── Nav bar ── */}
      <nav
        className="shrink-0 flex items-stretch font-mono select-none"
        style={{
          borderBottom:    "1px solid var(--ct-border)",
          backgroundColor: "var(--ct-bg-dark)",
          minHeight:       "42px",
        }}
      >
        {/* Logo + build hash */}
        <div
          className="flex items-center gap-3 px-4 shrink-0 ct-glow-sm"
          style={{ color: "var(--ct-primary)", borderRight: "1px solid var(--ct-border)" }}
        >
          <span style={{ letterSpacing: "0.18em", fontSize: "14px", fontWeight: 700 }}>
            ⚡ COMBAT TERMINAL
          </span>
          {buildHash && (
            <span
              title={`Build: ${buildHash}`}
              style={{
                color:         "var(--ct-border)",
                fontSize:      "10px",
                letterSpacing: "0.08em",
                fontFamily:    "monospace",
              }}
            >
              {buildHash}
            </span>
          )}
        </div>

        {/* Context tabs — clicking injects the nav command */}
        {VISIBLE_CONTEXTS.map(ctx => {
          const active = activeContext === ctx;
          return (
            <button
              key={ctx}
              onClick={() => cmdBarRef.current?.animateAndSubmit(CONTEXT_NAV_CMD[ctx])}
              className="flex items-center px-5 transition-colors"
              style={{
                color:         active ? "var(--ct-primary)" : "var(--ct-primary-dim)",
                borderBottom:  active ? "2px solid var(--ct-primary)" : "2px solid transparent",
                boxShadow:     active ? "inset 0 -1px 8px rgba(var(--ct-glow-rgb),0.1)" : "none",
                letterSpacing: "0.12em",
                fontSize:      "13px",
              }}
            >
              {CONTEXT_LABELS[ctx]}
            </button>
          );
        })}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Engine status pill */}
        {activeEngine && (
          <div
            className="flex items-center gap-2 px-4"
            style={{ color: "var(--ct-primary-dim)", borderLeft: "1px solid var(--ct-border)", fontSize: "13px" }}
          >
            <span
              className="rounded-full"
              style={{
                width: "6px", height: "6px",
                backgroundColor: isReady ? "#39ff14" : "#ff3b3b",
                boxShadow:       isReady ? "0 0 4px #39ff14" : "0 0 4px #ff3b3b",
              }}
            />
            <span style={{ letterSpacing: "0.1em" }}>
              {isReady ? "ONLINE" : "OFFLINE"}
            </span>
            {activeEngine?.summary?.total_units > 0 && (
              <span style={{ color: "var(--ct-border)" }}>
                · {activeEngine.summary.total_units.toLocaleString()} units
              </span>
            )}
          </div>
        )}

        {/* Context indicator — shows active context (settings shows "SETTINGS" dim badge) */}
        {activeContext === "settings" && (
          <div
            className="flex items-center px-4 font-mono"
            style={{ color: "var(--ct-border)", borderLeft: "1px solid var(--ct-border)", fontSize: "11px", letterSpacing: "0.16em" }}
          >
            SETTINGS
          </div>
        )}

        {/* DIAG tab — visible and clickable when active; navigable via `diag` command */}
        <button
          onClick={() => cmdBarRef.current?.animateAndSubmit("diag")}
          className="flex items-center px-4 transition-colors"
          style={{
            color:         activeContext === "diag" ? "#ffa328" : "var(--ct-primary-dim)",
            borderBottom:  activeContext === "diag" ? "2px solid #ffa328" : "2px solid transparent",
            boxShadow:     activeContext === "diag" ? "inset 0 -1px 8px rgba(255,163,40,0.08)" : "none",
            letterSpacing: "0.12em",
            fontSize:      "13px",
            borderLeft:    "1px solid var(--ct-border)",
            background:    "transparent",
            fontFamily:    "monospace",
          }}
          title="Engine Diagnostics — type 'diag' to open"
        >
          DIAG
        </button>

        {/* Command History dropdown */}
        <div
          ref={historyRef}
          className="relative flex items-stretch"
          style={{ borderLeft: "1px solid var(--ct-border)" }}
        >
          <button
            onClick={() => setHistoryOpen(v => !v)}
            className="flex items-center gap-2 px-4 transition-colors"
            style={{
              color:         historyOpen ? "var(--ct-primary)" : "var(--ct-primary-dim)",
              letterSpacing: "0.1em",
              fontSize:      "13px",
              background:    historyOpen ? "rgba(var(--ct-glow-rgb),0.04)" : "transparent",
            }}
          >
            HISTORY
            {cmdHistory.length > 0 && (
              <span style={{ color: "var(--ct-primary-dim)", fontSize: "10px" }}>{cmdHistory.length}</span>
            )}
            <span style={{ fontSize: "8px" }}>{historyOpen ? "▲" : "▼"}</span>
          </button>

          {historyOpen && (
            <div
              className="absolute right-0 top-full z-50"
              style={{
                backgroundColor: "var(--ct-bg-dark)",
                border:          "1px solid var(--ct-border)",
                borderTop:       "none",
                minWidth:        "340px",
                maxWidth:        "480px",
                maxHeight:       "400px",
                overflowY:       "auto",
              }}
            >
              <div
                className="px-3 py-1.5 flex items-center justify-between"
                style={{
                  color:         "var(--ct-border)",
                  fontSize:      "10px",
                  letterSpacing: "0.15em",
                  borderBottom:  "1px solid var(--ct-border)",
                  textTransform: "uppercase",
                }}
              >
                <span>Combat & Threat History</span>
                <span style={{ letterSpacing: "0.05em" }}>★ pin · ✕ remove · click to edit</span>
              </div>

              {cmdHistory.length === 0 ? (
                <div className="px-3 py-3" style={{ color: "var(--ct-border)", fontSize: "12px" }}>
                  No combat or threat commands yet.
                </div>
              ) : (
                cmdHistory.map((entry) => (
                  <div
                    key={entry.key}
                    className="flex items-center gap-2 px-3 py-1.5 transition-colors"
                    style={{
                      borderBottom:    "1px solid var(--ct-bg-panel)",
                      backgroundColor: entry.starred ? "rgba(255,163,40,0.04)" : "transparent",
                    }}
                    onMouseEnter={e => { if (!entry.starred) e.currentTarget.style.backgroundColor = "var(--ct-bg-panel)"; }}
                    onMouseLeave={e => { if (!entry.starred) e.currentTarget.style.backgroundColor = "transparent"; }}
                  >
                    {/* Star toggle */}
                    <span
                      onClick={(e) => { e.stopPropagation(); handleHistoryStar(entry.key); }}
                      title={entry.starred ? "Unpin" : "Pin to top"}
                      style={{
                        color:      entry.starred ? "#ffa328" : "var(--ct-border)",
                        cursor:     "pointer",
                        userSelect: "none",
                        fontSize:   "13px",
                        flexShrink: 0,
                        width:      "18px",
                        textAlign:  "center",
                        transition: "color 0.15s",
                      }}
                      onMouseEnter={e => { e.currentTarget.style.color = "#ffa328"; }}
                      onMouseLeave={e => { e.currentTarget.style.color = entry.starred ? "#ffa328" : "var(--ct-border)"; }}
                    >
                      {entry.starred ? "★" : "☆"}
                    </span>

                    {/* Command text — click to edit */}
                    <span
                      onClick={() => { handleEditCommand(entry.input); setHistoryOpen(false); }}
                      title="Load into command bar for editing"
                      style={{
                        color:        entry.starred ? "#ffa328" : "var(--ct-primary-mid)",
                        fontSize:     "12px",
                        cursor:       "pointer",
                        flex:         1,
                        whiteSpace:   "nowrap",
                        overflow:     "hidden",
                        textOverflow: "ellipsis",
                        fontFamily:   "monospace",
                      }}
                      onMouseEnter={e => { e.currentTarget.style.color = "var(--ct-primary)"; }}
                      onMouseLeave={e => { e.currentTarget.style.color = entry.starred ? "#ffa328" : "var(--ct-primary-mid)"; }}
                    >
                      {entry.input}
                    </span>

                    {/* Delete button */}
                    <span
                      onClick={(e) => { e.stopPropagation(); handleHistoryDelete(entry.key); }}
                      title="Remove from history"
                      style={{
                        color:      "var(--ct-border)",
                        cursor:     "pointer",
                        userSelect: "none",
                        fontSize:   "11px",
                        flexShrink: 0,
                        width:      "18px",
                        textAlign:  "center",
                        transition: "color 0.15s",
                      }}
                      onMouseEnter={e => { e.currentTarget.style.color = "#ff3b3b"; }}
                      onMouseLeave={e => { e.currentTarget.style.color = "var(--ct-border)"; }}
                    >
                      ✕
                    </span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </nav>

      {/* ── API error banner ── */}
      {apiError && (
        <div
          className="shrink-0 px-5 py-2 font-mono text-sm"
          style={{
            backgroundColor: "#1a0505",
            borderBottom:    "1px solid #3a0808",
            color:           "#ff3b3b",
          }}
        >
          ✗ {apiError}
        </div>
      )}

      {/* ── Context panels — all always mounted, show/hide via display ── */}
      <div className="flex-1 overflow-hidden" style={{ position: "relative" }}>

        {/* MAIN context */}
        <div style={panelStyle("main")}>
          {activeEngineId ? (
            <Terminal
              {...sharedTerminalProps}
              contextId="main"
              onStreamChange={handleStreamChange}
              scrollToId={scrollToId}
              onScrollComplete={() => setScrollToId(null)}
              pendingCommand={pendingCommands.main}
              onPendingCommandConsumed={makeConsumed("main")}
            />
          ) : (
            <div
              className="h-full flex items-center justify-center font-mono"
              style={{ color: "var(--ct-primary-dim)", fontSize: "14px" }}
            >
              {apiError ? "Server offline — run: python main.py" : "Initialising\u2026"}
            </div>
          )}
        </div>

        {/* UNITS context */}
        <div style={panelStyle("units")}>
          <UnitsContext
            {...sharedTerminalProps}
            pendingCommand={pendingCommands.units}
            onPendingCommandConsumed={makeConsumed("units")}
          />
        </div>

        {/* ROSTERS context */}
        <div style={panelStyle("rosters")}>
          <RostersContext
            engineId={activeEngineId}
            onExec={handleExec}
            onInject={handleAnimatedInject}
            theme={theme}
          />
        </div>

        {/* RULES context */}
        <div style={panelStyle("rules")}>
          <RulesContext
            {...sharedTerminalProps}
            pendingCommand={pendingCommands.rules}
            onPendingCommandConsumed={makeConsumed("rules")}
          />
        </div>

        {/* SETTINGS context (hidden — no tab) */}
        <div style={panelStyle("settings")}>
          <Terminal
            {...sharedTerminalProps}
            contextId="settings"
            pendingCommand={pendingCommands.settings}
            onPendingCommandConsumed={makeConsumed("settings")}
            contextBootLines={SETTINGS_BOOT_LINES}
          />
        </div>

        {/* DEMO context (legacy — accessible via `demo` command) */}

        {/* DIAG context — Engine Diagnostics dashboard (accessible via `diag` command or DIAG tab) */}
        <div style={panelStyle("diag")}>
          <DiagnosticsPage engineId={activeEngineId} />
        </div>

      </div>

      {/* ── Global persistent command bar ── */}
      <CommandBar
        ref={cmdBarRef}
        onSubmit={handleGlobalCommand}
        commands={commands}
        loading={cmdBarLoading || !activeEngineId || !!apiError}
      />

    </div>{/* end terminal window frame */}
    </div>
  );
}
