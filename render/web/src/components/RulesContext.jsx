/**
 * RulesContext
 *
 * Rules terminal context.  Wraps a Terminal with rules-specific boot lines.
 * Commands inject `rule <term>` via the global CommandBar.
 */

import { Terminal } from "./Terminal";

const RULES_BOOT_LINES = [
  "╔══════════════════════════════════════════════════════════════╗",
  "║  RULES CONTEXT  ·  Core Rules & Keyword Lookup               ║",
  "╚══════════════════════════════════════════════════════════════╝",
  "",
  "  rule <keyword>          — look up a rule or keyword",
  "  rule fly                — example: Fly keyword",
  "  rule devastating wounds — example: Devastating Wounds rule",
  "",
  "  ⚠  This feature is under construction. Expect errors.",
  "",
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
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", backgroundColor: "var(--ct-bg)" }}>

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
