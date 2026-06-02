/**
 * RulesContext
 *
 * Rules terminal context.  Wraps a Terminal with a minimal search bar at the top.
 * Searches inject `rule <term>` into the CommandBar — results appear in the terminal stream.
 */

import { useState } from "react";
import { Terminal } from "./Terminal";

import { C } from "./shared/colors";

const RULES_BOOT_LINES = [
  "╔══════════════════════════════════════════════════════════════╗",
  "║  RULES CONTEXT  ·  Core Rules & Keyword Lookup               ║",
  "╚══════════════════════════════════════════════════════════════╝",
  "",
  "  rule <keyword>          — look up a rule or keyword",
  "  rule fly                — example: Fly keyword",
  "  rule devastating wounds — example: Devastating Wounds rule",
  "",
];

const QUICK_RULES = [
  "fly", "lethal hits", "devastating wounds", "feel no pain",
  "deep strike", "scouts", "rapid fire", "blast",
];

export function RulesContext({
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
  const [query, setQuery] = useState("");

  const search = (term) => {
    const t = (term || query).trim();
    if (!t) return;
    onInject?.(`rule ${t}`);
    setQuery("");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", backgroundColor: "var(--ct-bg)" }}>

      {/* ── Search bar ── */}
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
        <span style={{
          color:         C.dim,
          fontSize:      "10px",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          flexShrink:    0,
          userSelect:    "none",
        }}>
          RULES ›
        </span>

        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === "Enter" && search()}
          placeholder="rule name or keyword…"
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

        <button
          onClick={() => search()}
          style={{
            background:    "none",
            border:        `1px solid ${C.border}`,
            color:         C.label,
            fontSize:      "11px",
            fontFamily:    "inherit",
            letterSpacing: "0.1em",
            padding:       "4px 12px",
            cursor:        "pointer",
            userSelect:    "none",
            textTransform: "uppercase",
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = C.green; e.currentTarget.style.color = C.green; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.label; }}
        >
          LOOKUP
        </button>

        {/* Quick-access common rules */}
        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginLeft: "4px" }}>
          {QUICK_RULES.map(r => (
            <button
              key={r}
              onClick={() => search(r)}
              style={{
                background:    "none",
                border:        `1px solid ${C.border}`,
                color:         C.dim,
                fontSize:      "10px",
                fontFamily:    "inherit",
                letterSpacing: "0.04em",
                padding:       "3px 8px",
                cursor:        "pointer",
                userSelect:    "none",
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = C.cyan + "80"; e.currentTarget.style.color = C.cyan; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.dim; }}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* ── Terminal output ── */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <Terminal
          engineId={engineId}
          contextId="rules"
          onExec={onExec}
          onEdit={onEdit}
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
          contextBootLines={RULES_BOOT_LINES}
        />
      </div>
    </div>
  );
}
