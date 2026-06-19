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
import { CrusadeContext }   from "@/components/CrusadeContext";

import { DiagnosticsPage }  from "@/components/DiagnosticsPage";
import { ProfileGate }      from "@/components/ProfileGate";
import { THEME_REGISTRY, ALL_THEME_IDS } from "@/data/themeRegistry";
import { saveProfileState, collectCurrentState, clearLastProfile } from "@/lib/profile";
import { getSessionId } from "@/lib/session";
import { useEdition } from "@/hooks/useEdition";

// ─── Theme persistence helpers ─────────────────────────────────────────────────
// Active theme is stored in localStorage so it survives page reloads.
// Theme validation lives in Terminal.jsx (reads themeRegistry + unlocked list).

const CT_ACTIVE_KEY = "ct_active_theme";

function readStoredTheme() {
  try { return localStorage.getItem(CT_ACTIVE_KEY) || "dark"; }
  catch { return "dark"; }
}

// ─── Context config ───────────────────────────────────────────────────────────

// Simple top-level tabs (each injects its nav command). Rosters and Settings
// are dropdowns and are rendered separately below.
const SIMPLE_TABS = [
  { id: "main",  label: "COMBAT SIM", cmd: "home"  },
  { id: "units", label: "UNITS",      cmd: "units" },
];
const RULES_TAB = { id: "rules", label: "RULES", cmd: "rules" };

// ─── Dropdown menu item ─────────────────────────────────────────────────────────
// Shared row for the Rosters / Settings nav dropdowns.

function MenuItem({ label, hint, active = false, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-2 transition-colors flex flex-col"
      style={{
        backgroundColor: active ? "rgba(var(--ct-glow-rgb),0.06)" : "transparent",
        borderBottom:    "1px solid var(--ct-bg-panel)",
        fontFamily:      "monospace",
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.backgroundColor = "var(--ct-bg-panel)"; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.backgroundColor = "transparent"; }}
    >
      <span style={{
        color:         active ? "var(--ct-primary)" : "var(--ct-primary-mid)",
        fontSize:      "12px",
        letterSpacing: "0.08em",
      }}>
        {active ? "● " : ""}{label}
      </span>
      {hint && (
        <span style={{ color: "var(--ct-primary-dim)", fontSize: "10px", opacity: 0.7, marginTop: "1px" }}>
          {hint}
        </span>
      )}
    </button>
  );
}

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
  // Tab completion state
  const [tabMatches, setTabMatches] = useState([]);   // visible dropdown items
  const [tabIdx,     setTabIdx]     = useState(-1);   // highlighted index (-1 = none)
  const [noMatch,    setNoMatch]    = useState(false); // flash for no matches
  const inputRef    = useRef(null);
  const animTimer   = useRef(null);
  const animActive  = useRef(false);
  const noMatchTimer = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => () => { if (animTimer.current) clearTimeout(animTimer.current); }, []);

  // Re-focus input when loading finishes (disabled=true → false loses focus)
  const prevLoadingRef = useRef(loading);
  useEffect(() => {
    if (prevLoadingRef.current && !loading) {
      // Small delay to let React re-enable the input first
      setTimeout(() => inputRef.current?.focus(), 0);
    }
    prevLoadingRef.current = loading;
  }, [loading]);

  function submit(raw) {
    const trimmed = raw.trim();
    if (!trimmed || loading) return;
    setCmdHist(prev => [...prev.slice(-49), trimmed]);
    setHistIdx(-1);
    setInput("");
    setTabMatches([]);
    setTabIdx(-1);
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
      setTabMatches([]);
      setTabIdx(-1);

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
      setTabMatches([]);
      setTabIdx(-1);
      setTimeout(() => {
        inputRef.current?.focus();
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
    setTabMatches([]);
    setTabIdx(-1);
  };

  const handleKeyDown = (e) => {
    // When tab dropdown is open, arrow keys and Enter navigate it
    if (tabMatches.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setTabIdx(i => (i + 1) % tabMatches.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setTabIdx(i => (i <= 0 ? tabMatches.length - 1 : i - 1));
        return;
      }
      if (e.key === "Enter" && tabIdx >= 0) {
        e.preventDefault();
        setInput(tabMatches[tabIdx] + " ");
        setTabMatches([]);
        setTabIdx(-1);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setTabMatches([]);
        setTabIdx(-1);
        return;
      }
    }

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
      if (matches.length === 1) {
        setInput(matches[0] + " ");
        setTabMatches([]);
        setTabIdx(-1);
      } else if (matches.length > 1) {
        setTabMatches(matches.slice(0, 12));
        setTabIdx(0);
      } else {
        // No matches — brief flash
        setNoMatch(true);
        if (noMatchTimer.current) clearTimeout(noMatchTimer.current);
        noMatchTimer.current = setTimeout(() => setNoMatch(false), 600);
      }
    }
  };

  return (
    <div
      className="shrink-0 relative font-mono"
      style={{
        borderTop:       "2px solid var(--ct-border-bright)",
        backgroundColor: "var(--ct-bg-dark)",
        boxShadow:       "0 -4px 20px rgba(var(--ct-glow-rgb), 0.06)",
      }}
    >
      {/* Tab completion dropdown — anchored above the input */}
      {tabMatches.length > 0 && (
        <div
          className="absolute left-0 right-0 bottom-full z-50"
          style={{
            backgroundColor: "var(--ct-bg-dark)",
            borderTop:       "1px solid var(--ct-border)",
            borderLeft:      "1px solid var(--ct-border)",
            borderRight:     "1px solid var(--ct-border)",
            maxHeight:       "200px",
            overflowY:       "auto",
          }}
        >
          {tabMatches.map((m, i) => (
            <div
              key={m}
              onClick={() => { setInput(m + " "); setTabMatches([]); setTabIdx(-1); inputRef.current?.focus(); }}
              style={{
                padding:         "4px 20px",
                fontSize:        "13px",
                cursor:          "pointer",
                color:           i === tabIdx ? "var(--ct-primary)" : "var(--ct-primary-dim)",
                backgroundColor: i === tabIdx ? "var(--ct-bg-panel)" : "transparent",
                borderBottom:    "1px solid var(--ct-bg-panel)",
                letterSpacing:   "0.04em",
              }}
              onMouseEnter={() => setTabIdx(i)}
            >
              {m}
            </div>
          ))}
        </div>
      )}

      {/* Input row */}
      <div
        className="flex items-center gap-3 px-5"
        style={{ minHeight: "52px" }}
        onClick={() => inputRef.current?.focus()}
      >
        <span
          className={`ct-glow-sm select-none shrink-0 ${animating ? "animate-pulse" : ""}`}
          style={{ color: animating ? "var(--ct-accent)" : noMatch ? "var(--ct-danger)" : "var(--ct-primary)", fontSize: "20px", transition: "color 0.15s" }}
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
            color:      animating ? "var(--ct-accent)" : noMatch ? "var(--ct-danger)" : "var(--ct-primary)",
            fontSize:   "15px",
            caretColor: animating ? "transparent" : "var(--ct-primary)",
            transition: "color 0.15s",
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
          <span className="shrink-0 font-mono" style={{ color: "var(--ct-accent)", opacity: 0.7, fontSize: "11px", letterSpacing: "0.15em" }}>
            INJECT
          </span>
        )}
      </div>
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
  // ── Profile gate ─────────────────────────────────────────────────────────
  const [profile, setProfile] = useState(null);

  if (!profile) {
    return <ProfileGate onLogin={setProfile} />;
  }

  return <AppInner profile={profile} onLogout={() => { clearLastProfile(); setProfile(null); }} />;
}

function AppInner({ profile, onLogout }) {
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
  // Rules edition (10th/11th) — shell-level, design-only, rendered sitewide
  const { label: editionLabel, labelLong: editionLabelLong, toggleEdition } = useEdition();

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
  const [themeOpen, setThemeOpen] = useState(false);
  const [rostersOpen,  setRostersOpen]  = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rosterUploadMode, setRosterUploadMode] = useState(null); // null | "player" | "enemy"

  const historyRef  = useRef(null);
  const themeRef    = useRef(null);
  const rostersRef  = useRef(null);
  const settingsRef = useRef(null);
  const cmdBarRef   = useRef(null);

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
  // Also sync to <body> so CSS pseudo-element selectors (scanlines, vignette) can react
  useEffect(() => {
    try { localStorage.setItem(CT_ACTIVE_KEY, theme); } catch {}
    document.body.setAttribute("data-theme", theme);
  }, [theme]);

  // ── Auto-save profile state to server (debounced) ───────────────────────
  // Fires 5s after the last state change (theme, starred, history, vfs).
  const saveTimer = useRef(null);
  const triggerSave = useCallback(() => {
    if (!profile?.name) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveProfileState(profile.name, collectCurrentState()).catch(() => {});
    }, 5000);
  }, [profile?.name]);

  // Watch localStorage changes (covers VFS writes from any component)
  useEffect(() => {
    const storageHandler = (e) => {
      if (["ct_active_theme", "ct_cmd_history", "ct_starred_units", "ct_vfs_v1"].includes(e.key)) {
        triggerSave();
      }
    };
    // Custom event fired by vfs.js and starred-units for same-tab writes
    const customHandler = () => triggerSave();
    window.addEventListener("storage", storageHandler);
    window.addEventListener("ct-state-changed", customHandler);
    return () => {
      window.removeEventListener("storage", storageHandler);
      window.removeEventListener("ct-state-changed", customHandler);
    };
  }, [triggerSave]);

  // Also trigger save when theme changes (same-tab, not caught by storage event)
  useEffect(() => { triggerSave(); }, [theme, triggerSave]);

  // Save on unmount / tab close
  useEffect(() => {
    const handler = () => {
      if (profile?.name) {
        // Synchronous best-effort save via sendBeacon
        const payload = JSON.stringify({ name: profile.name, state: collectCurrentState() });
        navigator.sendBeacon("/api/profiles/state", new Blob([payload], { type: "application/json" }));
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [profile?.name]);

  // Close history / theme dropdowns on outside click
  useEffect(() => {
    const handler = (e) => {
      if (historyRef.current && !historyRef.current.contains(e.target)) {
        setHistoryOpen(false);
      }
      if (themeRef.current && !themeRef.current.contains(e.target)) {
        setThemeOpen(false);
      }
      if (rostersRef.current && !rostersRef.current.contains(e.target)) {
        setRostersOpen(false);
      }
      if (settingsRef.current && !settingsRef.current.contains(e.target)) {
        setSettingsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Persistent CLI focus — refocus the command bar after any click on
  // non-interactive content so the user can always keep typing.
  // Skips buttons, inputs, selects, textareas, links, and [contenteditable]
  // so built-in browser behaviour for those elements is never disrupted.
  //
  // IMPORTANT: this listens on `mouseup` (not `mousedown`) and bails out when
  // the user has an active text selection. Stealing focus into the command bar
  // collapses any document selection, which previously made it impossible to
  // select and copy text (e.g. unit names) anywhere in the app.
  useEffect(() => {
    const SKIP_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A", "LABEL"]);
    const handler = (e) => {
      const tag = e.target?.tagName ?? "";
      const editable = e.target?.isContentEditable;
      if (SKIP_TAGS.has(tag) || editable) return;
      // Defer so the selection is finalised before we inspect it.
      setTimeout(() => {
        const sel = window.getSelection?.();
        // Don't grab focus mid-selection — that would wipe the highlight and
        // break copy. Only refocus on a plain click with nothing selected.
        if (sel && !sel.isCollapsed && sel.toString().length > 0) return;
        cmdBarRef.current?.focus();
      }, 0);
    };
    document.addEventListener("mouseup", handler);
    return () => document.removeEventListener("mouseup", handler);
  }, []);

  // ── Exec handler ─────────────────────────────────────────────────────────

  const handleExec = useCallback(async (rawInput, rosterContext = null) => {
    const body = { input: rawInput, session_id: getSessionId() };
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
    try {
      localStorage.setItem(CT_HISTORY_KEY, JSON.stringify(cmdHistory));
      window.dispatchEvent(new CustomEvent("ct-state-changed", { detail: { key: CT_HISTORY_KEY } }));
    } catch { /* storage unavailable */ }
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
      rosters: "rosters", c: "rosters",
      crusade: "crusade", cr: "crusade", campaign: "crusade",
      rules: "rules", r: "rules",
      diag: "diag",
      settings: "settings",
    };
    if (NAV_CMD_MAP[tokens[0]] !== undefined) {
      setActiveContext(NAV_CMD_MAP[tokens[0]]);
      // No loading state — pure navigation, no API call
      return;
    }

    // Non-terminal contexts (rosters, diag) don't have a Terminal to consume
    // pending commands — route to main terminal instead to prevent hang.
    const NON_TERMINAL = new Set(["rosters", "crusade", "diag"]);
    const isNonTerminal = NON_TERMINAL.has(activeContext);

    // One-shot commands that need no visible output — route to main terminal
    // but keep the user on the current page (RostersContext refreshes via poll).
    const ONE_SHOT = /^(set roster |clear roster )/i;

    // Upload roster commands → switch to rosters context + trigger inline upload
    if (tokens[0] === "upload" && (tokens[1] === "roster" || tokens[1] === "enemy")) {
      const isEnemy = tokens[1] === "enemy" || (tokens[2] === "enemy");
      setActiveContext("rosters");
      setRosterUploadMode(isEnemy ? "enemy" : "player");
      return;
    }

    if (tokens[0] === "list" && tokens[1] === "units") {
      // Always send list-units commands to the units context
      setActiveContext("units");
      setPendingCommands(prev => ({ ...prev, units: cmd }));
    } else if (tokens[0] === "spec" || tokens[0] === "unit" || tokens[0] === "datasheet") {
      // Always send spec commands to the units context so the user can star them
      setActiveContext("units");
      setPendingCommands(prev => ({ ...prev, units: cmd }));
    } else if (isNonTerminal) {
      // Route to main terminal since this context can't process commands
      setPendingCommands(prev => ({ ...prev, main: cmd }));
      // Switch to main for commands that need terminal interaction;
      // stay on current page for one-shot side-effect commands.
      if (!ONE_SHOT.test(cmd)) {
        setActiveContext("main");
      }
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
    const knownContexts = ["main", "units", "rosters", "crusade", "rules", "settings", "diag"];
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

  // ── Open a terminal-output command in the MAIN terminal ──────────────────
  // Used by Settings-menu items (command list, math mode, aliases) so their
  // output always lands in the main terminal regardless of the current view.
  const openInMain = useCallback((cmd) => {
    setActiveContext("main");
    setPendingCommands(prev => ({ ...prev, main: cmd }));
    setCmdBarLoading(true);
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
    profileName: profile?.name,
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
      style={{ background: "var(--ct-bg-dark)" }}
    >
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{
        width:        "100%",
        maxWidth:     "960px",
        background:   "var(--ct-bg)",
        border:       "1px solid var(--ct-border)",
        borderRadius: "3px",
      }}
    >

      {/* ── Chrome bar (status dot · title · version + edition) ── */}
      <div
        className="shrink-0 flex items-center gap-2.5 select-none"
        style={{
          padding:         "8px 14px",
          backgroundColor: "var(--ct-bg-dark)",
          borderBottom:    "1px solid var(--ct-border)",
        }}
      >
        <span
          title={isReady ? "Engine online" : "Engine offline"}
          style={{
            width: "7px", height: "7px", borderRadius: "50%", flexShrink: 0,
            backgroundColor: isReady ? "var(--ct-primary)" : "var(--ct-danger)",
            boxShadow:       isReady ? "0 0 7px var(--ct-primary)" : "0 0 7px var(--ct-danger)",
          }}
        />
        <span className="ct-display" style={{ color: "var(--ct-text)", fontSize: "12px", letterSpacing: "0.16em" }}>
          COMBAT TERMINAL
        </span>

        <div className="flex-1" />

        {profile?.name && (
          <span
            title={`Logged in as ${profile.name} — click to switch profile`}
            onClick={onLogout}
            className="ct-display"
            style={{
              color: "var(--ct-primary-dim)", fontSize: "9px", letterSpacing: "0.12em",
              cursor: "pointer", marginRight: "4px",
            }}
          >
            {profile.name} ⏏
          </span>
        )}

        <span
          className="ct-display"
          title={buildHash && buildHash !== "unknown" ? `Build: ${buildHash}` : ""}
          style={{ color: "var(--ct-primary-dim)", fontSize: "9px", letterSpacing: "0.1em", fontWeight: 500 }}
        >
          v2.0{buildHash && buildHash !== "unknown" ? ` · ${buildHash}` : ""}
        </span>
        <button
          onClick={toggleEdition}
          className="ct-display"
          title="Rules edition (display-only) — click to switch"
          style={{
            fontSize: "8px", letterSpacing: "0.1em", color: "var(--ct-primary)",
            border: "1px solid rgba(var(--ct-glow-rgb),0.4)",
            background: "rgba(var(--ct-glow-rgb),0.1)",
            padding: "2px 7px", borderRadius: "3px", cursor: "pointer",
          }}
        >
          {editionLabel}
        </button>
      </div>

      {/* ── Nav bar (tabs) ── */}
      <nav
        className="shrink-0 flex items-stretch font-mono select-none"
        style={{
          borderBottom:    "1px solid var(--ct-border)",
          backgroundColor: "var(--ct-bg-dark)",
          minHeight:       "40px",
        }}
      >
        {/* Simple context tabs — clicking injects the nav command */}
        {SIMPLE_TABS.map(tab => {
          const active = activeContext === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => cmdBarRef.current?.animateAndSubmit(tab.cmd)}
              className="flex items-center px-4 transition-colors ct-display"
              style={{
                color:         active ? "var(--ct-text)" : "var(--ct-primary-dim)",
                borderBottom:  active ? "2px solid var(--ct-primary)" : "2px solid transparent",
                boxShadow:     active ? "inset 0 -1px 8px rgba(var(--ct-glow-rgb),0.1)" : "none",
                letterSpacing: "0.12em",
                fontSize:      "12px",
              }}
            >
              {tab.label}
            </button>
          );
        })}

        {/* ROSTERS dropdown — clicking opens a menu (Rosters / Crusade) */}
        <div ref={rostersRef} className="relative flex items-stretch">
          {(() => {
            const active = activeContext === "rosters" || activeContext === "crusade";
            return (
              <button
                onClick={() => { setRostersOpen(v => !v); setSettingsOpen(false); }}
                className="flex items-center gap-1.5 px-4 transition-colors ct-display"
                style={{
                  color:         active ? "var(--ct-text)" : rostersOpen ? "var(--ct-primary)" : "var(--ct-primary-dim)",
                  borderBottom:  active ? "2px solid var(--ct-primary)" : "2px solid transparent",
                  boxShadow:     active ? "inset 0 -1px 8px rgba(var(--ct-glow-rgb),0.1)" : "none",
                  letterSpacing: "0.12em",
                  fontSize:      "12px",
                }}
                title="Rosters & Crusade tracking"
              >
                ROSTERS
                <span style={{ fontSize: "8px" }}>{rostersOpen ? "▲" : "▼"}</span>
              </button>
            );
          })()}

          {rostersOpen && (
            <div
              className="absolute left-0 top-full z-50"
              style={{
                backgroundColor: "var(--ct-bg-dark)",
                border:          "1px solid var(--ct-border)",
                borderTop:       "none",
                minWidth:        "190px",
              }}
            >
              <MenuItem
                label="Rosters"
                hint="armies + crusade info"
                active={activeContext === "rosters"}
                onClick={() => { setRostersOpen(false); cmdBarRef.current?.animateAndSubmit("rosters"); }}
              />
              <MenuItem
                label="Crusade"
                hint="campaign tracking"
                active={activeContext === "crusade"}
                onClick={() => { setRostersOpen(false); cmdBarRef.current?.animateAndSubmit("crusade"); }}
              />
            </div>
          )}
        </div>

        {/* RULES tab */}
        {(() => {
          const active = activeContext === RULES_TAB.id;
          return (
            <button
              onClick={() => cmdBarRef.current?.animateAndSubmit(RULES_TAB.cmd)}
              className="flex items-center px-4 transition-colors ct-display"
              style={{
                color:         active ? "var(--ct-text)" : "var(--ct-primary-dim)",
                borderBottom:  active ? "2px solid var(--ct-primary)" : "2px solid transparent",
                boxShadow:     active ? "inset 0 -1px 8px rgba(var(--ct-glow-rgb),0.1)" : "none",
                letterSpacing: "0.12em",
                fontSize:      "12px",
              }}
            >
              {RULES_TAB.label}
            </button>
          );
        })()}

        {/* SETTINGS dropdown — Diagnostics / Command List / Math Mode / Aliases */}
        <div ref={settingsRef} className="relative flex items-stretch">
          {(() => {
            const active = activeContext === "diag" || activeContext === "settings";
            return (
              <button
                onClick={() => { setSettingsOpen(v => !v); setRostersOpen(false); }}
                className="flex items-center gap-1.5 px-4 transition-colors ct-display"
                style={{
                  color:         active ? "var(--ct-text)" : settingsOpen ? "var(--ct-primary)" : "var(--ct-primary-dim)",
                  borderBottom:  active ? "2px solid var(--ct-primary)" : "2px solid transparent",
                  boxShadow:     active ? "inset 0 -1px 8px rgba(var(--ct-glow-rgb),0.1)" : "none",
                  letterSpacing: "0.12em",
                  fontSize:      "12px",
                }}
                title="Settings, diagnostics & reference"
              >
                SETTINGS
                <span style={{ fontSize: "8px" }}>{settingsOpen ? "▲" : "▼"}</span>
              </button>
            );
          })()}

          {settingsOpen && (
            <div
              className="absolute left-0 top-full z-50"
              style={{
                backgroundColor: "var(--ct-bg-dark)",
                border:          "1px solid var(--ct-border)",
                borderTop:       "none",
                minWidth:        "230px",
              }}
            >
              <MenuItem
                label="Diagnostics"
                hint="engine health dashboard"
                active={activeContext === "diag"}
                onClick={() => { setSettingsOpen(false); cmdBarRef.current?.animateAndSubmit("diag"); }}
              />
              <MenuItem
                label="Command List"
                hint="stat keys & modifier flags"
                onClick={() => { setSettingsOpen(false); openInMain("modifiers"); }}
              />
              <MenuItem
                label="Math Mode"
                hint="Monte Carlo / EV settings"
                onClick={() => { setSettingsOpen(false); openInMain("mathmode"); }}
              />
              <MenuItem
                label="Aliases"
                hint="learned spelling shortcuts"
                onClick={() => { setSettingsOpen(false); openInMain("aliases"); }}
              />
            </div>
          )}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Engine status now shown as the chrome-bar dot (top-left). */}

        {/* Theme selector dropdown — small icon, lists every theme */}
        <div
          ref={themeRef}
          className="relative flex items-stretch"
          style={{ borderLeft: "1px solid var(--ct-border)" }}
        >
          <button
            onClick={() => setThemeOpen(v => !v)}
            className="flex items-center justify-center px-3 transition-colors"
            style={{
              background: themeOpen ? "rgba(var(--ct-glow-rgb),0.04)" : "transparent",
            }}
            title="Switch theme"
          >
            <span
              style={{
                width: "13px", height: "13px", borderRadius: "50%",
                background: "var(--ct-primary)",
                border: "1px solid var(--ct-border-bright)",
                boxShadow: "0 0 6px rgba(var(--ct-glow-rgb),0.6)",
              }}
            />
          </button>

          {themeOpen && (
            <div
              className="absolute right-0 top-full z-50"
              style={{
                backgroundColor: "var(--ct-bg-dark)",
                border:          "1px solid var(--ct-border)",
                borderTop:       "none",
                minWidth:        "200px",
              }}
            >
              {ALL_THEME_IDS.map(id => {
                const t      = THEME_REGISTRY[id];
                const active = theme === id;
                return (
                  <button
                    key={id}
                    onClick={() => { setTheme(id); setThemeOpen(false); }}
                    className="w-full text-left px-3 py-2 transition-colors flex items-center gap-2"
                    style={{
                      color:           active ? "var(--ct-primary)" : "var(--ct-primary-dim)",
                      backgroundColor: active ? "rgba(var(--ct-glow-rgb),0.06)" : "transparent",
                      borderBottom:    "1px solid var(--ct-bg-panel)",
                      fontSize:        "12px",
                      fontFamily:      "monospace",
                      letterSpacing:   "0.1em",
                    }}
                    onMouseEnter={e => { if (!active) e.currentTarget.style.backgroundColor = "var(--ct-bg-panel)"; }}
                    onMouseLeave={e => { if (!active) e.currentTarget.style.backgroundColor = "transparent"; }}
                  >
                    <span style={{ width: "14px", textAlign: "center" }}>{active ? "●" : "○"}</span>
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

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
                width:           "420px",
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
                  position:      "sticky",
                  top:           0,
                  backgroundColor: "var(--ct-bg-dark)",
                  zIndex:        1,
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
                    className="flex items-center gap-2 px-3 transition-colors"
                    style={{
                      borderBottom:    "1px solid var(--ct-bg-panel)",
                      backgroundColor: entry.starred ? "rgba(255,163,40,0.04)" : "transparent",
                      height:          "32px",
                      minHeight:       "32px",
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
              cmdHistory={cmdHistory}
              onHistoryStar={handleHistoryStar}
              onHistoryDelete={handleHistoryDelete}
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
            profileName={profile?.name}
            triggerUpload={rosterUploadMode}
            onUploadConsumed={() => setRosterUploadMode(null)}
          />
        </div>

        {/* CRUSADE context */}
        <div style={panelStyle("crusade")}>
          <CrusadeContext profileName={profile?.name} engineId={activeEngineId} onInject={handleAnimatedInject} />
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

      {/* ── Footer strip (version · edition) ── */}
      <div
        className="shrink-0 flex items-center justify-between select-none"
        style={{
          padding:         "5px 14px",
          backgroundColor: "var(--ct-bg-dark)",
          borderTop:       "1px solid var(--ct-border)",
        }}
      >
        <span className="ct-display" style={{ color: "var(--ct-primary-dim)", fontSize: "8px", letterSpacing: "0.14em" }}>
          COMBAT TERMINAL · v2.0
        </span>
        <span
          className="ct-display"
          style={{ color: "var(--ct-primary-dim)", fontSize: "8px", letterSpacing: "0.14em", display: "flex", alignItems: "center", gap: "5px" }}
        >
          <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: "var(--ct-primary)", boxShadow: "0 0 5px var(--ct-primary)" }} />
          {editionLabelLong} · 40K RULES ENGINE
        </span>
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
