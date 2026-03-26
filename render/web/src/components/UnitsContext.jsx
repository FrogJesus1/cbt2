/**
 * UnitsContext
 *
 * Units terminal context.  Wraps a Terminal instance with:
 *   - A thin search bar + FILTERS button at the top
 *   - A filter modal that translates checkbox selections into `list units` commands
 *
 * Architecture:
 *   - All actual output lives in the Terminal (terminal-first model)
 *   - Search bar + filter modal only build and inject commands — they don't render results
 *   - Clicking SEARCH in the modal injects e.g. `list units --deepstrike tyranids`
 *   - Unit rows in the terminal output are clickable → inject `spec <unit>` (handled by UnitListRich)
 *
 * Props:
 *   engineId, onExec, onStreamChange          standard terminal props
 *   pendingCommand, onPendingCommandConsumed   per-context command queue
 *   onInject                                  animate-inject into global CommandBar
 *   onNavigate, onContextRoute                navigation callbacks
 *   scrollToId, onScrollComplete              scroll jump support
 */

import { useState } from "react";
import { Terminal } from "./Terminal";

// ─── Colour palette ──────────────────────────────────────────────────────────

const C = {
  green:  "var(--ct-primary)",
  mid:    "var(--ct-primary-mid)",
  label:  "var(--ct-primary-label)",
  dim:    "var(--ct-primary-dim)",
  border: "var(--ct-border)",
  panel:  "var(--ct-bg-panel)",
  amber:  "#ffa328",
  cyan:   "var(--ct-bar-alt)",
};

// ─── Filter data ─────────────────────────────────────────────────────────────

const FACTIONS = [
  "Tau", "Tyranids", "Space Marines", "Aeldari", "Necrons",
  "Orks", "Chaos Space Marines", "Astra Militarum", "Dark Angels",
  "Chaos Daemons", "Drukhari", "Deathguard", "Thousand Sons",
  "World Eaters", "Grey Knights", "Blood Angels", "Space Wolves",
  "Adeptus Custodes", "Adepta Sororitas", "Imperial Knights",
  "Chaos Knights", "Genestealer Cults", "Adeptus Mechanicus",
  "Leagues of Votann", "Deathwatch",
];

const UNIT_TYPES = [
  "Character", "Battleline", "Vehicle", "Mounted",
  "Infantry", "Monster", "Fly", "Walker",
];

const KEYWORDS = [
  "Blast", "Deep Strike", "Heavy", "Twin-Linked",
  "Rapid Fire", "Lethal Hits", "Devastating Wounds",
  "Fly", "Scouts", "Stealth", "Infiltrators",
];

// ─── Command builder ─────────────────────────────────────────────────────────

/**
 * Translate filter selections + search text into a `list units` command string.
 *
 * Examples:
 *   {factions:["Tau"], keywords:["Deep Strike"]}  →  "list units --deepstrike tau"
 *   {keywords:["Blast","Heavy"]}                  →  "list units --blast --heavy"
 *   {searchText:"broadside"}                      →  "list units broadside"
 */
function buildListUnitsCommand({ searchText = "", factions = [], keywords = [] }) {
  const parts = ["list units"];

  // Keyword flags — normalise to lowercase no-space form
  for (const kw of keywords) {
    const flag = kw.toLowerCase().replace(/[\s-]/g, "");
    parts.push(`--${flag}`);
  }

  // Faction (only single-faction filtering is supported in one command)
  if (factions.length === 1) {
    parts.push(factions[0].toLowerCase());
  }

  // Free-text search
  if (searchText.trim()) {
    parts.push(searchText.trim().toLowerCase());
  }

  return parts.join(" ");
}

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

// ─── Checkbox group ───────────────────────────────────────────────────────────

function CheckboxGroup({ label, items, selected, onToggle }) {
  return (
    <div style={{ marginBottom: "18px" }}>
      <div style={{
        color:         C.amber,
        fontSize:      "10px",
        fontWeight:    700,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        borderBottom:  `1px solid ${C.border}`,
        paddingBottom: "5px",
        marginBottom:  "8px",
      }}>
        {label}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
        {items.map(item => {
          const active = selected.includes(item);
          return (
            <button
              key={item}
              onClick={() => onToggle(item)}
              style={{
                padding:       "3px 10px",
                fontSize:      "11px",
                fontFamily:    "inherit",
                fontWeight:    active ? 700 : 400,
                letterSpacing: "0.04em",
                border:        `1px solid ${active ? C.green : C.border}`,
                background:    active ? "rgba(57,255,20,0.08)" : "transparent",
                color:         active ? C.green : C.label,
                cursor:        "pointer",
                transition:    "all 0.1s",
                userSelect:    "none",
              }}
              onMouseEnter={e => { if (!active) { e.currentTarget.style.borderColor = C.dim; e.currentTarget.style.color = C.mid; }}}
              onMouseLeave={e => { if (!active) { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.label; }}}
            >
              {item}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Filter modal ─────────────────────────────────────────────────────────────

function FilterModal({
  searchText,
  selFactions, selUnitTypes, selKeywords,
  onToggleFaction, onToggleUnitType, onToggleKeyword,
  onClearAll,
  onSearch,
  onClose,
}) {
  const builtCmd = buildListUnitsCommand({
    searchText, factions: selFactions, keywords: selKeywords,
  });

  return (
    /* Overlay backdrop */
    <div
      style={{
        position:   "fixed",
        inset:      0,
        zIndex:     100,
        background: "rgba(0,0,0,0.7)",
        display:    "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "80px",
      }}
      onClick={onClose}
    >
      {/* Modal panel — stop propagation so clicking inside doesn't close */}
      <div
        style={{
          width:      "520px",
          maxHeight:  "72vh",
          overflow:   "auto",
          background: "var(--ct-bg)",
          border:     `1px solid ${C.border}`,
          padding:    "22px 24px 18px",
          fontFamily: "var(--font-mono, monospace)",
          boxShadow:  "0 0 60px rgba(57,255,20,0.06)",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "18px" }}>
          <div style={{ color: C.mid, fontSize: "13px", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase" }}>
            ── FILTER UNITS ──
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: C.dim, fontSize: "16px", cursor: "pointer", padding: "0 4px", fontFamily: "inherit" }}
          >
            ✕
          </button>
        </div>

        {/* Filter groups */}
        <CheckboxGroup label="Faction"    items={FACTIONS}    selected={selFactions}   onToggle={onToggleFaction} />
        <CheckboxGroup label="Keywords"   items={KEYWORDS}    selected={selKeywords}   onToggle={onToggleKeyword} />
        <CheckboxGroup label="Unit Type"  items={UNIT_TYPES}  selected={selUnitTypes}  onToggle={onToggleUnitType} />

        {/* Command preview */}
        <div style={{
          marginTop:     "12px",
          marginBottom:  "16px",
          padding:       "8px 12px",
          background:    C.panel,
          border:        `1px solid ${C.border}`,
          fontSize:      "12px",
          color:         C.dim,
          display:       "flex",
          alignItems:    "center",
          gap:           "8px",
        }}>
          <span style={{ color: C.label, flexShrink: 0, fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase" }}>CMD</span>
          <span style={{ color: C.mid }}>{builtCmd}</span>
        </div>

        {/* Action row */}
        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", alignItems: "center" }}>
          <button
            onClick={onClearAll}
            style={{
              background:    "none",
              border:        `1px solid ${C.border}`,
              color:         C.dim,
              fontSize:      "11px",
              fontFamily:    "inherit",
              letterSpacing: "0.1em",
              padding:       "5px 14px",
              cursor:        "pointer",
              textTransform: "uppercase",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = C.label; e.currentTarget.style.color = C.label; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.dim; }}
          >
            CLEAR
          </button>
          <button
            onClick={onSearch}
            style={{
              background:    "rgba(57,255,20,0.06)",
              border:        `1px solid ${C.green}`,
              color:         C.green,
              fontSize:      "11px",
              fontFamily:    "inherit",
              letterSpacing: "0.12em",
              fontWeight:    700,
              padding:       "5px 20px",
              cursor:        "pointer",
              textTransform: "uppercase",
              boxShadow:     "0 0 10px rgba(57,255,20,0.1)",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(57,255,20,0.12)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(57,255,20,0.06)"; }}
          >
            SEARCH
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Toggle helper ───────────────────────────────────────────────────────────

function toggleItem(arr, item) {
  return arr.includes(item) ? arr.filter(v => v !== item) : [...arr, item];
}

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
  onTheme,
  theme,
}) {
  const [searchText,   setSearchText]   = useState("");
  const [filterOpen,   setFilterOpen]   = useState(false);
  const [selFactions,  setSelFactions]  = useState([]);
  const [selUnitTypes, setSelUnitTypes] = useState([]);
  const [selKeywords,  setSelKeywords]  = useState([]);

  const activeFilterCount = selFactions.length + selUnitTypes.length + selKeywords.length;

  // ── Search actions ─────────────────────────────────────────────────────────

  const runSearch = (text, factions, keywords) => {
    const cmd = buildListUnitsCommand({ searchText: text, factions, keywords });
    onInject?.(cmd);
  };

  const handleBarSearch = () => runSearch(searchText, selFactions, selKeywords);

  const handleFilterSearch = () => {
    setFilterOpen(false);
    runSearch(searchText, selFactions, selKeywords);
  };

  const handleClearAll = () => {
    setSelFactions([]);
    setSelUnitTypes([]);
    setSelKeywords([]);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", backgroundColor: "var(--ct-bg)" }}>

      {/* ── Search / filter bar ── */}
      <div
        style={{
          flexShrink:      0,
          display:         "flex",
          alignItems:      "center",
          gap:             "8px",
          padding:         "8px 20px",
          borderBottom:    `1px solid ${C.border}`,
          backgroundColor: "var(--ct-bg-dark)",
        }}
      >
        {/* Section label */}
        <span style={{
          color:         C.dim,
          fontSize:      "10px",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          flexShrink:    0,
          userSelect:    "none",
        }}>
          UNITS ›
        </span>

        {/* Search input */}
        <input
          type="text"
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleBarSearch()}
          placeholder="Search units…"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          style={{
            flex:       1,
            maxWidth:   "320px",
            background: "var(--ct-bg-panel)",
            border:     `1px solid ${C.border}`,
            color:      C.green,
            fontSize:   "12px",
            fontFamily: "inherit",
            padding:    "4px 10px",
            outline:    "none",
            caretColor: C.green,
          }}
          onFocus={e => { e.currentTarget.style.borderColor = C.dim; }}
          onBlur={e  => { e.currentTarget.style.borderColor = C.border; }}
        />

        {/* Filters button */}
        <button
          onClick={() => setFilterOpen(true)}
          style={{
            background:    activeFilterCount > 0 ? "rgba(57,255,20,0.06)" : "none",
            border:        `1px solid ${activeFilterCount > 0 ? C.green : C.border}`,
            color:         activeFilterCount > 0 ? C.green : C.label,
            fontSize:      "11px",
            fontFamily:    "inherit",
            letterSpacing: "0.1em",
            padding:       "4px 12px",
            cursor:        "pointer",
            userSelect:    "none",
            textTransform: "uppercase",
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = C.mid; e.currentTarget.style.color = C.mid; }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = activeFilterCount > 0 ? C.green : C.border;
            e.currentTarget.style.color       = activeFilterCount > 0 ? C.green : C.label;
          }}
        >
          FILTERS{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
        </button>

        {/* Quick-fire faction buttons — top 5 */}
        <div style={{ display: "flex", gap: "4px", marginLeft: "4px" }}>
          {["Tau", "Tyranids", "Necrons", "Space Marines", "Aeldari"].map(f => (
            <button
              key={f}
              onClick={() => onInject?.(`list units ${f.toLowerCase()}`)}
              style={{
                background:    "none",
                border:        `1px solid ${C.border}`,
                color:         C.dim,
                fontSize:      "10px",
                fontFamily:    "inherit",
                letterSpacing: "0.06em",
                padding:       "3px 8px",
                cursor:        "pointer",
                userSelect:    "none",
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = C.label; e.currentTarget.style.color = C.label; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.dim; }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* ── Terminal output ── */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <Terminal
          engineId={engineId}
          contextId="units"
          onExec={onExec}
          onStreamChange={onStreamChange}
          pendingCommand={pendingCommand}
          onPendingCommandConsumed={onPendingCommandConsumed}
          onInject={onInject}
          onNavigate={onNavigate}
          onContextRoute={onContextRoute}
          scrollToId={scrollToId}
          onScrollComplete={onScrollComplete}
          onTheme={onTheme}
          theme={theme}
          contextBootLines={UNITS_BOOT_LINES}
        />
      </div>

      {/* ── Filter modal ── */}
      {filterOpen && (
        <FilterModal
          searchText={searchText}
          selFactions={selFactions}
          selUnitTypes={selUnitTypes}
          selKeywords={selKeywords}
          onToggleFaction={f  => setSelFactions(prev  => toggleItem(prev, f))}
          onToggleUnitType={t => setSelUnitTypes(prev => toggleItem(prev, t))}
          onToggleKeyword={k  => setSelKeywords(prev  => toggleItem(prev, k))}
          onClearAll={handleClearAll}
          onSearch={handleFilterSearch}
          onClose={() => setFilterOpen(false)}
        />
      )}
    </div>
  );
}
