/**
 * UnitsContext
 *
 * Two faces of the unit data, matching the redesign's separate tabs:
 *
 *   variant="database"  → UNITS: a STATIC, filterable database page. Fetches the
 *                         full unit list ONCE (`list units`) and renders
 *                         UnitListRich + the filter rail. It is NOT a terminal
 *                         feed — typing `list units tau` seeds the faction filter
 *                         instead of stacking a second list. (List Units.dc.html)
 *
 *   variant="datasheet" → DATASHEET: the spec-sheet view. A terminal stream that
 *                         renders `spec <unit>` results, plus the ★ MY UNITS
 *                         quick-jump rail. (Spec Unit.dc.html)
 *
 * Stars are shared across both faces via the `ct_starred_units` key + the
 * `ct-state-changed` event.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { Terminal } from "./Terminal";
import { UnitListRich } from "./UnitListRich";
import { SpecShortlistRail } from "./SpecShortlistRail";
import { C } from "./shared/colors";

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

// Shared hook: starred-units state synced across both faces + other tabs.
function useStarredUnits() {
  const [starred, setStarred] = useState(loadStarredUnits);
  useEffect(() => {
    const sync = (e) => {
      if (e?.detail?.key && e.detail.key !== CT_STARRED_KEY) return;
      setStarred(loadStarredUnits());
    };
    window.addEventListener("ct-state-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("ct-state-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  const toggle = useCallback((name) => {
    setStarred((prev) => {
      const next = prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name];
      saveStarredUnits(next);
      return next;
    });
  }, []);
  return [starred, toggle];
}

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

// ─── Database face — STATIC filterable page ───────────────────────────────────

function UnitsDatabase({ engineId, onExec, onInject, pendingCommand, onPendingCommandConsumed }) {
  const [state, setState]   = useState({ loading: true, data: [], meta: null, error: false });
  const [seedFaction, setSeedFaction] = useState(null);  // from `list units <faction>`
  const [starred, toggleStar] = useStarredUnits();

  // Fetch the full unit corpus ONCE. All filtering is then client-side in
  // UnitListRich — no re-query, no stacking.
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: false }));
    Promise.resolve(onExec?.("list units"))
      .then((res) => {
        if (!alive) return;
        const data = Array.isArray(res?.data) ? res.data : [];
        setState({ loading: false, data, meta: res?.meta || null, error: data.length === 0 && res?.ok === false });
      })
      .catch(() => { if (alive) setState({ loading: false, data: [], meta: null, error: true }); });
    return () => { alive = false; };
  }, [onExec, engineId]);

  // A `list units [arg]` command (typed in the bar / the UNITS tab) becomes a
  // FILTER on this static page, not a new feed entry. Bare `list units` resets.
  useEffect(() => {
    if (!pendingCommand) return;
    const m = /^list\s+units\b\s*(.*)$/i.exec(String(pendingCommand).trim());
    if (m) setSeedFaction(m[1] ? m[1].trim() : "All");
    onPendingCommandConsumed?.();
  }, [pendingCommand, onPendingCommandConsumed]);

  return (
    <div className="ct-noscroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", backgroundColor: "var(--ct-bg)", padding: "16px 20px 22px" }}>
      {state.loading ? (
        <div style={{ color: C.dim, fontSize: "12px", fontStyle: "italic", padding: "8px 2px" }}>Loading unit database…</div>
      ) : state.error ? (
        <div style={{ color: C.dim, fontSize: "12px", padding: "8px 2px" }}>
          Could not load the unit database. <span style={{ color: C.green, cursor: "pointer" }} onClick={() => onInject?.("list units")}>↻ retry</span>
        </div>
      ) : (
        <UnitListRich
          data={state.data}
          meta={state.meta}
          onInject={onInject}
          starredUnits={starred}
          onToggleStar={toggleStar}
          initialFaction={seedFaction}
        />
      )}
    </div>
  );
}

// ─── Datasheet face — spec-sheet terminal + ★ rail ────────────────────────────

function DatasheetView(props) {
  const {
    engineId, onExec, onStreamChange, pendingCommand, onPendingCommandConsumed,
    onInject, onNavigate, onContextRoute, scrollToId, onScrollComplete, onEdit, onTheme, theme,
  } = props;

  const [starred, toggleStar] = useStarredUnits();
  const streamRef = useRef([]);
  const [localScrollToId, setLocalScrollToId] = useState(null);

  const handleStarClick = useCallback((unitName) => {
    const entry = [...streamRef.current].reverse().find((e) =>
      e.result?.result_type === "spec_sheet" && e.result?.data?.title === unitName);
    if (entry) setLocalScrollToId(entry.id);
    else onInject?.(`spec ${unitName}`);
  }, [onInject]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", backgroundColor: "var(--ct-bg)" }}>
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "row" }}>
        <div style={{ flex: 1, minWidth: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <Terminal
            engineId={engineId}
            contextId="datasheet"
            onExec={onExec}
            onEdit={onEdit}
            onStreamChange={(stream) => { streamRef.current = stream; onStreamChange?.(stream); }}
            pendingCommand={pendingCommand}
            onPendingCommandConsumed={onPendingCommandConsumed}
            onInject={onInject}
            onNavigate={onNavigate}
            onContextRoute={onContextRoute}
            scrollToId={localScrollToId || scrollToId}
            onScrollComplete={() => { if (localScrollToId) setLocalScrollToId(null); else onScrollComplete?.(); }}
            onTheme={onTheme}
            theme={theme}
            contextBootLines={DATASHEET_BOOT_LINES}
            starredUnits={starred}
            onToggleStar={toggleStar}
          />
        </div>
        <SpecShortlistRail starredUnits={starred} onJump={handleStarClick} onRemove={toggleStar} />
      </div>
    </div>
  );
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

export function UnitsContext({ variant = "database", ...props }) {
  return variant === "datasheet"
    ? <DatasheetView {...props} />
    : <UnitsDatabase {...props} />;
}
