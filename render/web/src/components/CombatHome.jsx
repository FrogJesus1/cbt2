/**
 * CombatHome — the `main` context landing (empty-state).
 *
 * Renders only while the main terminal stream is empty. The first command that
 * produces output swaps this for the result stream; this is gated upstream in
 * Terminal.jsx by `contextId === "main" && stream.length === 0`. Typing `clear`
 * empties the stream, so Home returns — by design.
 *
 * Mockup: design_handoff_combat_terminal_redesign/Combat Home.dc.html
 *   hero (⚡ title + tagline + Engine / Library readouts)
 *   → Quick Start grid (6 cards → run an example command)
 *   → Command History panel (hydrated from App's ct_cmd_history state)
 *
 * Constraints honoured:
 *   • No router — cards + history call onRun (handleAnimatedInject) / onEdit,
 *     which route through the authoritative command bar. We do NOT reimplement
 *     the mockup's route()/run() logic.
 *   • No new stores — history comes from App's `cmdHistory` (ct_cmd_history)
 *     state + handlers, the same data the nav HISTORY dropdown reads.
 *   • Themeable — every colour is a C.* token / CSS var. The two decorative
 *     card-glyph tints (Rosters purple, Rules slate) are intentionally fixed:
 *     they are not semantic and do not re-hue per faction theme.
 */

import { useState, useEffect } from "react";
import { C } from "./shared/colors";
import { SectionHeader } from "./shared/constants";

const API = "/api";

// ─── Command type → badge (semantic, theme-driven) ──────────────────────────
// Mirrors the mockup's typeOf(): combat (X vs Y), threat, spec, else cmd.
function typeOf(input) {
  const low = (input || "").trim().toLowerCase();
  if (/\bvs\b/.test(low))                                return { label: "COMBAT", color: C.green };
  if (low.startsWith("threat"))                          return { label: "THREAT", color: C.danger };
  if (low.startsWith("spec") || low.startsWith("unit"))  return { label: "SPEC",   color: C.cyan };
  return { label: "CMD", color: C.label };
}

// ─── Quick-start cards ──────────────────────────────────────────────────────
// Each runs an example command through onRun (animate-types into the bar, then
// submits — the bar routes it). Glyph tints: the first four are theme tokens so
// they re-hue per faction; the last two are fixed decorative accents.
const QUICK_CARDS = [
  { glyph: "⚔", color: C.green,    title: "Run Combat",        desc: "Full attacker-vs-target probability math.",   cmd: "intercessors vs plague marines" },
  { glyph: "▤", color: C.cyan,     title: "Unit Datasheet",    desc: "Stats, weapons, ratings & abilities.",        cmd: "spec broadside battlesuits" },
  { glyph: "⚠", color: C.danger,   title: "Threat Assessment", desc: "Faction overview & counter picks.",           cmd: "threat t'au empire" },
  { glyph: "⌗", color: C.accent,   title: "Unit Database",     desc: "Search & filter every unit.",                 cmd: "list units" },
  { glyph: "▦", color: "#a78bdb",  title: "Rosters",           desc: "Manage player & enemy armies.",               cmd: "rosters" },
  { glyph: "§", color: "#8fb0c4",  title: "Rules Lookup",      desc: "Keywords, stratagems & detachments.",         cmd: "rules" },
];

const RUN_BORDER = "var(--ct-verdict-border)"; // #1f5a36 — the green hairline used in the mockup

export function CombatHome({
  engineId,
  cmdHistory   = [],
  onRun,            // (cmd) → void — animate-type + submit (handleAnimatedInject)
  onEdit,           // (cmd) → void — populate the bar without submitting
  onHistoryStar,    // (key) → void
  onHistoryDelete,  // (key) → void
}) {
  // Live hero readouts (real data, with graceful fallbacks).
  const [factionCount, setFactionCount] = useState(null);
  const [engineMode,   setEngineMode]   = useState(null); // { label, color }

  useEffect(() => {
    let alive = true;

    fetch(`${API}/factions`)
      .then(r => r.json())
      .then(d => { if (alive) setFactionCount(Array.isArray(d?.factions) ? d.factions.length : null); })
      .catch(() => { /* offline — fall back to em dash */ });

    if (engineId) {
      fetch(`${API}/engines/${engineId}/status`)
        .then(r => r.json())
        .then(d => {
          if (!alive) return;
          if (d?.ready === false)                          setEngineMode({ label: "○ OFFLINE",       color: C.danger });
          else if (d?.simulation_mode === "deterministic") setEngineMode({ label: "● DETERMINISTIC", color: C.cyan });
          else                                             setEngineMode({ label: "● MC ACTIVE",      color: C.green });
        })
        .catch(() => { /* keep optimistic default */ });
    }

    return () => { alive = false; };
  }, [engineId]);

  const mode    = engineMode || { label: "● MC ACTIVE", color: C.green };
  const library = factionCount != null ? `${factionCount} factions` : "— factions";

  return (
    <div style={{ paddingBottom: "8px" }}>

      {/* ── Hero ── */}
      <div
        style={{
          display: "flex", alignItems: "flex-end", justifyContent: "space-between",
          gap: "16px", flexWrap: "wrap",
          paddingBottom: "18px", marginBottom: "20px",
          borderBottom: `1px solid ${C.hairline}`,
        }}
      >
        <div>
          <div style={{
            fontFamily: "'Chakra Petch', 'IBM Plex Mono', monospace",
            fontSize: "28px", fontWeight: 700, letterSpacing: "0.04em",
            color: C.text, textTransform: "uppercase",
          }}>
            <span style={{ color: C.green, textShadow: "0 0 14px rgba(var(--ct-glow-rgb),0.4)" }}>⚡</span> COMBAT TERMINAL
          </div>
          <div style={{ fontSize: "12px", color: C.label, marginTop: "7px", lineHeight: 1.6, maxWidth: "560px" }}>
            Probability-driven Warhammer 40k combat math. Type a matchup, look up a unit, or assess a threat.
          </div>
        </div>

        <div style={{ display: "flex", gap: "22px", flexShrink: 0 }}>
          <Readout label="Engine"  value={mode.label} color={mode.color}  bold />
          <Readout label="Library" value={library}    color={C.bodyDim} />
        </div>
      </div>

      {/* ── Quick Start ── */}
      <SectionHeader accent={C.text} style={{ marginBottom: "11px" }}>Quick Start</SectionHeader>
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px", marginBottom: "24px",
      }}>
        {QUICK_CARDS.map(c => (
          <button
            key={c.title}
            onClick={() => onRun?.(c.cmd)}
            style={{
              textAlign: "left",
              border: `1px solid ${C.border}`, borderRadius: "6px",
              background: C.panel, padding: "15px 16px", cursor: "pointer",
              transition: "border-color 0.15s, box-shadow 0.15s",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = "var(--ct-primary-mid)";
              e.currentTarget.style.boxShadow   = "inset 0 0 0 1px rgba(var(--ct-glow-rgb),0.05)";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = C.border;
              e.currentTarget.style.boxShadow   = "none";
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
              <span style={{ fontSize: "16px", color: c.color, flexShrink: 0 }}>{c.glyph}</span>
              <span className="ct-display" style={{ fontSize: "12px", letterSpacing: "0.1em", color: C.text }}>
                {c.title}
              </span>
            </div>
            <div style={{ fontSize: "11px", color: C.label, lineHeight: 1.5, marginBottom: "9px" }}>
              {c.desc}
            </div>
            <div style={{ fontSize: "11px", color: C.green, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              › {c.cmd}
            </div>
          </button>
        ))}
      </div>

      {/* ── Command History ── */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "11px" }}>
        <span className="ct-display" style={{ fontSize: "12px", letterSpacing: "0.14em", color: C.text, flexShrink: 0 }}>
          Command History
        </span>
        <span style={{ fontSize: "9px", color: C.label, flexShrink: 0 }}>
          {cmdHistory.length} saved · ★ pin · click to edit · ▸ run
        </span>
        <span className="ct-hazard" />
      </div>

      <div style={{ border: `1px solid ${C.border}`, borderRadius: "5px", background: C.panel, overflow: "hidden" }}>
        {cmdHistory.length === 0 ? (
          <div style={{ padding: "18px 14px", fontSize: "12px", color: C.dim, fontStyle: "italic" }}>
            No history yet — run a command below.
          </div>
        ) : (
          cmdHistory.map(entry => {
            const t = typeOf(entry.input);
            return (
              <div
                key={entry.key}
                style={{
                  display: "flex", alignItems: "center", gap: "11px",
                  padding: "10px 14px", borderBottom: `1px solid ${C.hairline}`,
                }}
              >
                {/* Star / pin */}
                <button
                  onClick={() => onHistoryStar?.(entry.key)}
                  title={entry.starred ? "Unpin" : "Pin to top"}
                  style={{
                    background: "transparent", border: "none", cursor: "pointer",
                    fontSize: "15px", flexShrink: 0, padding: "0 2px", lineHeight: 1,
                    color: entry.starred ? C.accent : C.ghost,
                    textShadow: entry.starred ? "0 0 8px rgba(216,178,90,.5)" : "none",
                  }}
                >
                  {entry.starred ? "★" : "☆"}
                </button>

                {/* Type badge */}
                <span style={{
                  fontSize: "8px", letterSpacing: "0.1em", color: t.color,
                  border: `1px solid ${t.color}`, background: "transparent",
                  padding: "2px 0", borderRadius: "2px",
                  flexShrink: 0, width: "54px", textAlign: "center",
                }}>
                  {t.label}
                </span>

                {/* Command text — click to edit */}
                <span
                  onClick={() => onEdit?.(entry.input)}
                  title="Load into command bar to edit"
                  style={{
                    flex: 1, minWidth: 0, fontSize: "13px", color: C.textMid, cursor: "pointer",
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color = C.text; }}
                  onMouseLeave={e => { e.currentTarget.style.color = C.textMid; }}
                >
                  {entry.input}
                </span>

                {/* Re-run */}
                <span
                  onClick={() => onRun?.(entry.input)}
                  title="Re-run"
                  className="ct-display"
                  style={{
                    fontSize: "9px", letterSpacing: "0.08em", color: C.green,
                    border: `1px solid ${RUN_BORDER}`, padding: "3px 9px", borderRadius: "3px",
                    cursor: "pointer", flexShrink: 0,
                  }}
                >
                  ▸ Run
                </span>

                {/* Delete */}
                <span
                  onClick={() => onHistoryDelete?.(entry.key)}
                  title="Remove"
                  style={{ color: C.dim, fontSize: "12px", cursor: "pointer", flexShrink: 0 }}
                  onMouseEnter={e => { e.currentTarget.style.color = C.danger; }}
                  onMouseLeave={e => { e.currentTarget.style.color = C.dim; }}
                >
                  ✕
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Hero readout (label over value, right-aligned) ─────────────────────────
function Readout({ label, value, color, bold = false }) {
  return (
    <div style={{ textAlign: "right" }}>
      <div style={{ fontSize: "9px", color: C.dim, letterSpacing: "0.1em", textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ fontSize: "13px", color, fontWeight: bold ? 700 : 400, marginTop: "3px" }}>
        {value}
      </div>
    </div>
  );
}
