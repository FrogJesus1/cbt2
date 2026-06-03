/**
 * UnitsContext
 *
 * Units terminal context.  Wraps a Terminal instance with a starred-units sidebar.
 * All search and filtering is done via terminal commands (list units, spec, etc.).
 */

import { useState, useRef, useCallback } from "react";
import { Terminal } from "./Terminal";

// ─── Starred units persistence ──────────────────────────────────────────────

const CT_STARRED_KEY = "ct_starred_units";

function loadStarredUnits() {
  try { return JSON.parse(localStorage.getItem(CT_STARRED_KEY) || "[]"); }
  catch { return []; }
}

function saveStarredUnits(units) {
  try { localStorage.setItem(CT_STARRED_KEY, JSON.stringify(units)); }
  catch { /* storage unavailable */ }
}

// ─── Colour palette ──────────────────────────────────────────────────────────

import { C } from "./shared/colors";

// ─── Boot lines ──────────────────────────────────────────────────────────────

const UNITS_BOOT_LINES = [
  "╔══════════════════════════════════════════════════════════════╗",
  "║  UNITS CONTEXT  ·  Unit Database Browser                     ║",
  "╚══════════════════════════════════════════════════════════════╝",
  "",
  "  list units              — all units across all factions",
  "  list units tau          — all tau units",
  "  list units --deepstrike — units with Deep Strike",
  "  spec <unit name>        — full stat sheet",
  "",
];

// ─── UnitsContext component ──────────────────────────────────────────────────

export function UnitsContext({
  engineId,
  onExec,
  onStreamChange,
  pendingCommand,
  onPendingCommandConsumed,
  onInject,
  onNavigate,
  onContextRoute,
  scrollToId,
  onScrollComplete,
  onEdit,
  onTheme,
  theme,
}) {
  // ── Starred units ───────────────────────────────────────────────────────
  const [starredUnits, setStarredUnits] = useState(loadStarredUnits);
  const streamRef = useRef([]);
  const [localScrollToId, setLocalScrollToId] = useState(null);

  const toggleStar = useCallback((unitName) => {
    setStarredUnits(prev => {
      const next = prev.includes(unitName)
        ? prev.filter(n => n !== unitName)
        : [...prev, unitName];
      saveStarredUnits(next);
      return next;
    });
  }, []);

  const handleStarClick = useCallback((unitName) => {
    const entry = [...streamRef.current].reverse().find(e =>
      e.result?.result_type === "spec_sheet" &&
      e.result?.data?.title === unitName
    );
    if (entry) {
      setLocalScrollToId(entry.id);
    } else {
      onInject?.(`spec ${unitName}`);
    }
  }, [onInject]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", backgroundColor: "var(--ct-bg)" }}>

      {/* ── Terminal output + starred sidebar ── */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "row" }}>
        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <Terminal
            engineId={engineId}
            contextId="units"
            onExec={onExec}
            onEdit={onEdit}
            onStreamChange={(stream) => {
              streamRef.current = stream;
              onStreamChange?.(stream);
            }}
            pendingCommand={pendingCommand}
            onPendingCommandConsumed={onPendingCommandConsumed}
            onInject={onInject}
            onNavigate={onNavigate}
            onContextRoute={onContextRoute}
            scrollToId={localScrollToId || scrollToId}
            onScrollComplete={() => {
              if (localScrollToId) setLocalScrollToId(null);
              else onScrollComplete?.();
            }}
            onTheme={onTheme}
            theme={theme}
            contextBootLines={UNITS_BOOT_LINES}
            starredUnits={starredUnits}
            onToggleStar={toggleStar}
          />
        </div>

        {/* ── Starred units sidebar ── */}
        {starredUnits.length > 0 && (
          <div
            style={{
              width:           "44px",
              flexShrink:      0,
              borderLeft:      `1px solid ${C.border}`,
              backgroundColor: "var(--ct-bg-dark)",
              display:         "flex",
              flexDirection:   "column",
              alignItems:      "center",
              paddingTop:      "8px",
              gap:             "2px",
              overflowY:       "auto",
              scrollbarWidth:  "none",
            }}
          >
            {/* Header */}
            <div style={{
              color:         C.amber,
              fontSize:      "9px",
              fontWeight:    700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              writingMode:   "vertical-rl",
              textOrientation: "mixed",
              padding:       "4px 0 8px",
              userSelect:    "none",
            }}>
              ★
            </div>

            {/* Starred unit tabs */}
            {starredUnits.map((name) => {
              const abbr = name.split(/\s+/).map(w => w.slice(0, 3)).join("").slice(0, 6).toUpperCase();
              return (
                <button
                  key={name}
                  onClick={() => handleStarClick(name)}
                  title={name}
                  style={{
                    writingMode:     "vertical-rl",
                    textOrientation: "mixed",
                    background:      "transparent",
                    border:          `1px solid ${C.border}`,
                    color:           C.mid,
                    fontSize:        "10px",
                    fontFamily:      "inherit",
                    fontWeight:      600,
                    letterSpacing:   "0.06em",
                    padding:         "8px 4px",
                    cursor:          "pointer",
                    userSelect:      "none",
                    whiteSpace:      "nowrap",
                    transition:      "all 0.1s",
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = C.amber;
                    e.currentTarget.style.color       = C.amber;
                    e.currentTarget.style.background  = "rgba(255,163,40,0.06)";
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = C.border;
                    e.currentTarget.style.color       = C.mid;
                    e.currentTarget.style.background  = "transparent";
                  }}
                >
                  {abbr}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
