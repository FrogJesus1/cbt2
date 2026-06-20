/**
 * UnitsContext
 *
 * Units terminal context.  Wraps a Terminal instance with a starred-units sidebar.
 * All search and filtering is done via terminal commands (list units, spec, etc.).
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { Terminal } from "./Terminal";
import { SpecShortlistRail } from "./SpecShortlistRail";

// ─── Starred units persistence ──────────────────────────────────────────────

const CT_STARRED_KEY = "ct_starred_units";

function loadStarredUnits() {
  try { return JSON.parse(localStorage.getItem(CT_STARRED_KEY) || "[]"); }
  catch { return []; }
}

function saveStarredUnits(units) {
  try {
    localStorage.setItem(CT_STARRED_KEY, JSON.stringify(units));
    window.dispatchEvent(new CustomEvent("ct-state-changed", { detail: { key: CT_STARRED_KEY } }));
  } catch { /* storage unavailable */ }
}

// ─── Colour palette ──────────────────────────────────────────────────────────

import { C } from "./shared/colors";

// ─── Boot lines ──────────────────────────────────────────────────────────────

const UNITS_BOOT_LINES = [
  "╔══════════════════════════════════════════════════════════════╗",
  "║  UNIT DATABASE  ·  browse + filter every faction             ║",
  "╚══════════════════════════════════════════════════════════════╝",
  "",
  "  list units              — all units across all factions",
  "  list units tau          — all tau units",
  "  list units --deepstrike — units with Deep Strike",
  "  (or click  UNITS  in the nav to load the full filterable database)",
  "",
];

const DATASHEET_BOOT_LINES = [
  "╔══════════════════════════════════════════════════════════════╗",
  "║  DATASHEET  ·  full stat sheet for a single unit             ║",
  "╚══════════════════════════════════════════════════════════════╝",
  "",
  "  spec <unit name>     — e.g.  spec broadside battlesuits",
  "  threat <unit name>   — threat assessment",
  "  pick a unit from the UNITS database, or ★ one to pin it here →",
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
  variant = "database",   // "database" → unit list/filters · "datasheet" → spec sheets + ★ rail
}) {
  // Two faces of the same engine context, split to match the mockup's separate
  // UNITS (filterable database) and DATASHEET (single spec sheet + ★ rail) tabs.
  const isDatasheet = variant === "datasheet";
  const contextId   = isDatasheet ? "datasheet" : "units";
  const bootLines   = isDatasheet ? DATASHEET_BOOT_LINES : UNITS_BOOT_LINES;

  // ── Starred units ───────────────────────────────────────────────────────
  const [starredUnits, setStarredUnits] = useState(loadStarredUnits);
  const streamRef = useRef([]);
  const [localScrollToId, setLocalScrollToId] = useState(null);

  // Stars are shared across both faces (DB ★ toggle ↔ datasheet rail) via the
  // ct_starred_units key — re-load when another context mutates it.
  useEffect(() => {
    const sync = (e) => {
      if (e?.detail?.key && e.detail.key !== CT_STARRED_KEY) return;
      setStarredUnits(loadStarredUnits());
    };
    window.addEventListener("ct-state-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("ct-state-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

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
            contextId={contextId}
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
            contextBootLines={bootLines}
            starredUnits={starredUnits}
            onToggleStar={toggleStar}
          />
        </div>

        {/* ── MY UNITS quick-jump rail — datasheet face only (matches mockup) ── */}
        {isDatasheet && (
          <SpecShortlistRail
            starredUnits={starredUnits}
            onJump={handleStarClick}
            onRemove={toggleStar}
          />
        )}
      </div>
    </div>
  );
}
