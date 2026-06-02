/**
 * TerminalBlock
 *
 * Renders a single command + result pair inside the terminal output stream.
 *
 * Supported result_types:
 *   disambiguation → numbered match list; clicking a number animates it into the command bar
 *   combat         → rich multi-panel layout (CombatBlock)
 *   spec_sheet     → full unit datacard with ratings (SpecBlock)
 *   threat_card    → threat analysis + counter picks (ThreatCard)
 *   threat_view    → full faction threat report (ThreatBlock)
 *   math_replay    → Math Mode execution ledger replay (MathModeBlock)
 *   table          → column-aligned rows
 *   card           → unit stat sheet with weapon tables, linked abilities/keywords
 *   list           → numbered multi-column list (full-width, clickable)
 *   text           → plain pre-wrapped text
 *   help           → command reference grouped by category
 *   legend         → tabbed glossary: stat columns, prob chain, modifier flags, swinginess
 *   session_summary→ session state: turn, faction, rosters, mods
 *   error          → red error message with numbered suggestions
 */

import { useState, useEffect, useCallback } from "react";
import { CombatBlock }      from "./CombatBlock";
import { SpecBlock }         from "./SpecBlock";
import { ThreatCard }        from "./ThreatCard";
import { ThreatBlock }       from "./ThreatBlock";
import { MathModeBlock }     from "./MathModeBlock";
import { RosterListBlock }   from "./roster/RosterListBlock";
import { RosterActionBlock } from "./roster/RosterActionBlock";
import { RoleAssignBlock }   from "./roster/RoleAssignBlock";
import { CampaignListBlock } from "./roster/CampaignListBlock";
import { RosterSavedBlock, RosterPromptBlock, RosterFactionListBlock } from "./roster/RosterUploadBlock";
import { UploadBlock } from "./roster/UploadBlock";

// ─── Colour palette ────────────────────────────────────────────────────────
// Primary colours reference CSS variables so they respond to theme changes.
// Semantic colours (amber, cyan, red) are hardcoded — they never theme-shift.

import { C } from "./shared/colors";

// ─── Loading animation ────────────────────────────────────────────────────

function buildPendingSteps(input) {
  const lower = (input || "").toLowerCase();
  if (lower.startsWith("rerun")) return [
    "applying modifier change",
    "recalculating simulation",
  ];
  if (lower.includes(" vs ")) return [
    `resolving '${input}'`,
    "querying unit databases",
    "building attack profiles",
    "running monte carlo simulation",
  ];
  if (lower.startsWith("spec") || lower.startsWith("lookup")) return [
    `resolving '${input}'`,
    "querying unit data",
    "loading stat sheet",
  ];
  if (lower.startsWith("list")) return [
    `resolving '${input}'`,
    "querying database",
  ];
  if (lower.startsWith("help")) return [
    "loading command reference",
  ];
  return [
    `resolving '${input}'`,
    "processing request",
  ];
}

function TerminalPending({ input }) {
  const steps = buildPendingSteps(input);
  const [step, setStep] = useState(0);
  const [cursor, setCursor] = useState(true);

  useEffect(() => {
    if (step >= steps.length - 1) return;
    const t = setTimeout(() => setStep(s => s + 1), 550 + Math.random() * 200);
    return () => clearTimeout(t);
  }, [step, steps.length]);

  useEffect(() => {
    const t = setInterval(() => setCursor(c => !c), 480);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="font-mono" style={{ paddingLeft: "18px", fontSize: "14px", lineHeight: "1.8" }}>
      {steps.map((msg, i) => {
        if (i > step) return null;
        const isCurrent = i === step;
        return (
          <div key={i} style={{ color: isCurrent ? C.label : C.dim, display: "flex", alignItems: "baseline", gap: "7px" }}>
            <span style={{ color: isCurrent ? C.green : C.dim, flexShrink: 0 }}>
              {isCurrent ? "›" : "✓"}
            </span>
            <span>
              {msg}
              {isCurrent && (
                <span style={{ color: C.green }}>{cursor ? " ▌" : ""}</span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Stub Warning ─────────────────────────────────────────────────────────
// Shown in place of raw JSON when the engine returns _stub: true.

function StubWarning({ data }) {
  const name    = data?.name    || "unknown";
  const faction = data?.faction || null;

  return (
    <div className="font-mono" style={{ paddingLeft: "18px", fontSize: "14px" }}>
      <div style={{
        border:        `1px solid ${C.amber}35`,
        background:    "#0d0700",
        padding:       "10px 15px",
        display:       "flex",
        flexDirection: "column",
        gap:           "5px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ color: C.amber }}>⚠</span>
          <span style={{ color: C.amber, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            {name}
          </span>
          <span style={{
            color:         C.dim,
            fontSize:      "11px",
            border:        `1px solid ${C.border}`,
            padding:       "1px 5px",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
          }}>
            STUB
          </span>
        </div>
        <div style={{ color: C.label, fontSize: "13px", paddingLeft: "16px" }}>
          Data not loaded{faction ? ` — faction: ${faction}` : ""}.{" "}
          Run <span style={{ color: C.mid }}>issues</span> to see all missing data this session.
        </div>
      </div>
    </div>
  );
}

// ─── Stub Log ──────────────────────────────────────────────────────────────
// Rendered by the `issues` command — lists all stubs hit this session.

export function StubLog({ entries = [] }) {
  if (!entries.length) {
    return (
      <div className="font-mono" style={{ paddingLeft: "18px", color: C.dim, fontSize: "14px" }}>
        ✓ No missing data detected this session.
      </div>
    );
  }

  return (
    <div className="font-mono" style={{ paddingLeft: "18px", fontSize: "14px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: "10px", marginBottom: "6px" }}>
        <span style={{ color: C.amber, fontWeight: 700 }}>⚠ MISSING DATA</span>
        <span style={{ color: C.label }}>
          {entries.length} stub{entries.length !== 1 ? "s" : ""} this session
        </span>
      </div>
      <div style={{ color: C.border, marginBottom: "8px" }}>{"─".repeat(52)}</div>

      {/* Column headers */}
      <div style={{
        display:             "grid",
        gridTemplateColumns: "60px 28ch 10ch 1fr",
        gap:                 "0 10px",
        color:               C.label,
        fontSize:            "11px",
        fontWeight:          600,
        textTransform:       "uppercase",
        letterSpacing:       "0.1em",
        marginBottom:        "4px",
      }}>
        <span>Time</span>
        <span>Name</span>
        <span>Type</span>
        <span>Command</span>
      </div>
      <div style={{ color: C.border, marginBottom: "5px" }}>{"─".repeat(52)}</div>

      {entries.map((entry, i) => (
        <div key={i} style={{
          display:             "grid",
          gridTemplateColumns: "60px 28ch 10ch 1fr",
          gap:                 "0 10px",
          lineHeight:          "1.9",
          color:               C.mid,
        }}>
          <span style={{ color: C.dim }}>{entry.time}</span>
          <span style={{ color: C.amber }}>{entry.name}</span>
          <span style={{ color: C.label }}>{entry.dataType || "ability"}</span>
          <span style={{ color: C.dim }}>{entry.command}</span>
        </div>
      ))}

      <div style={{ marginTop: "10px", color: C.label, fontSize: "13px", borderTop: `1px solid ${C.border}`, paddingTop: "8px" }}>
        Reparse with:{" "}
        <span style={{ color: C.mid }}>retrain units &lt;faction&gt;</span>
        {" "}or{" "}
        <span style={{ color: C.mid }}>retrain rules &lt;source&gt;</span>
      </div>
    </div>
  );
}

// ─── Issues / Data Status Log ─────────────────────────────────────────────
// Renders the output of the `issues` command — domain-by-domain data status.

function IssuesLog({ data }) {
  // Support both old flat-array format and new {domains, errors, summary} format
  const domains = data?.domains || [];
  const errors  = data?.errors  || [];
  const summary = data?.summary || {};

  // Old flat-array path (backwards compat)
  if (Array.isArray(data) && data.length > 0) {
    return <StubLog entries={data} />;
  }

  const levelColor = { D0: C.red, D1: C.amber, D2: C.green, D3: C.cyan };

  return (
    <div className="font-mono" style={{ paddingLeft: "18px", fontSize: "14px" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "baseline", gap: "10px", marginBottom: "6px" }}>
        <span style={{ color: C.amber, fontWeight: 700 }}>ENGINE DATA STATUS</span>
        <span style={{ color: C.dim, fontSize: "12px" }}>
          {summary.factions || 0} factions · {summary.total_units || 0} units · {summary.stratagems || 0} strats · {summary.enhancements || 0} enhances
        </span>
      </div>
      <div style={{ color: C.border, marginBottom: "8px" }}>{"─".repeat(62)}</div>

      {/* Domain table */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "4ch 24ch 1fr",
        gap: "0 12px",
        color: C.label, fontSize: "11px", fontWeight: 600,
        textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "4px",
      }}>
        <span>Lvl</span><span>Domain</span><span>Status</span>
      </div>
      <div style={{ color: C.border, marginBottom: "4px" }}>{"─".repeat(62)}</div>

      {domains.map((d, i) => (
        <div key={i} style={{
          display: "grid",
          gridTemplateColumns: "4ch 24ch 1fr",
          gap: "0 12px",
          lineHeight: "1.9",
        }}>
          <span style={{ color: levelColor[d.level] || C.label, fontWeight: 700, fontSize: "12px" }}>
            {d.level}
          </span>
          <span style={{ color: d.level === "D0" ? C.dim : C.mid }}>{d.domain}</span>
          <span style={{ color: d.level === "D0" ? C.red : d.level === "D1" ? C.amber : C.green, fontSize: "12px" }}>
            {d.note}
          </span>
        </div>
      ))}

      {/* Loader errors */}
      {errors.length > 0 && (
        <>
          <div style={{ color: C.border, margin: "10px 0 6px" }}>{"─".repeat(62)}</div>
          <div style={{ color: C.red, fontSize: "12px", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            Loader Errors ({errors.length})
          </div>
          {errors.slice(0, 5).map((e, i) => (
            <div key={i} style={{ color: C.dim, fontSize: "12px", lineHeight: "1.7" }}>
              {e}
            </div>
          ))}
        </>
      )}

      {/* Legend */}
      <div style={{ marginTop: "10px", color: C.dim, fontSize: "11px", borderTop: `1px solid ${C.border}`, paddingTop: "8px" }}>
        D0 = stub · D1 = real data · D2 = computed · D3 = compound query
      </div>
    </div>
  );
}

// ─── Disambiguation Block ─────────────────────────────────────────────────
// Rendered when the engine returns result_type: "disambiguation".
// Shows a numbered list of matches; clicking a number animates it into the bar.

function DisambiguationBlock({ data, onInject }) {
  const { message, matches = [], prompt } = data || {};

  return (
    <div className="font-mono" style={{ paddingLeft: "18px", fontSize: "14px" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
        <span style={{ color: C.amber }}>?</span>
        <span style={{ color: C.amber, fontWeight: 700 }}>
          {message || "Multiple matches found:"}
        </span>
      </div>

      <div style={{ color: C.border, marginBottom: "8px" }}>{"─".repeat(52)}</div>

      {/* Numbered match list */}
      <div style={{ marginBottom: "10px" }}>
        {matches.map((label, i) => (
          <div
            key={i}
            style={{
              display:    "flex",
              gap:        "8px",
              alignItems: "baseline",
              lineHeight: "1.8",
            }}
          >
            <span
              onClick={() => onInject?.(String(i + 1))}
              style={{
                color:      C.amber,
                fontWeight: 700,
                flexShrink: 0,
                minWidth:   "20px",
                textAlign:  "right",
                cursor:     onInject ? "pointer" : "default",
                userSelect: "none",
              }}
              onMouseEnter={e => { if (onInject) e.currentTarget.style.color = C.green; }}
              onMouseLeave={e => { e.currentTarget.style.color = C.amber; }}
            >
              {i + 1}.
            </span>
            <span
              onClick={() => onInject?.(String(i + 1))}
              style={{
                color:     C.mid,
                cursor:    onInject ? "pointer" : "default",
                userSelect:"none",
              }}
              onMouseEnter={e => { if (onInject) e.currentTarget.style.color = C.green; }}
              onMouseLeave={e => { e.currentTarget.style.color = C.mid; }}
            >
              {label}
            </span>
          </div>
        ))}
      </div>

      {/* Prompt */}
      {prompt && (
        <div style={{ color: C.label, fontSize: "13px", marginTop: "4px" }}>
          <span style={{ color: C.dim }}>›</span>
          {"  "}
          {prompt}
        </div>
      )}
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────

export function TerminalBlock({ entry, onSubmit, onInject, onEdit, onUpload, starredUnits, onToggleStar }) {
  const { input, result, pending } = entry;
  const [hovered, setHovered] = useState(false);

  const handleEdit = useCallback(() => {
    if (onEdit && input) onEdit(input);
  }, [onEdit, input]);

  // Don't show edit icon for purely client-side results (clear, history, system nav)
  const showEdit = onEdit && input && !pending
    && result?.result_type !== "clear"
    && result?.result_type !== "history";

  return (
    <div className="space-y-2">
      {/* Echoed input line */}
      <div
        className="flex items-center gap-2 font-mono group"
        style={{ fontSize: "15px" }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <span style={{ color: C.green, userSelect: "none", flexShrink: 0, textShadow: `0 0 4px rgba(var(--ct-glow-rgb),0.4)` }}>›</span>
        <span style={{ color: "var(--ct-echo)" }}>{input}</span>
        {showEdit && (
          <span
            onClick={handleEdit}
            title="Edit & re-run"
            style={{
              color:      hovered ? C.label : "transparent",
              cursor:     "pointer",
              userSelect: "none",
              fontSize:   "12px",
              flexShrink: 0,
              padding:    "0 4px",
              transition: "color 0.15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.color = C.green; }}
            onMouseLeave={e => { e.currentTarget.style.color = hovered ? C.label : "transparent"; }}
          >
            ✎
          </span>
        )}
      </div>

      {/* Result */}
      {pending ? (
        <TerminalPending input={input} />
      ) : result ? (
        <TerminalResult result={result} onSubmit={onSubmit} onInject={onInject} onUpload={onUpload} starredUnits={starredUnits} onToggleStar={onToggleStar} />
      ) : null}
    </div>
  );
}

// ─── Result dispatcher ────────────────────────────────────────────────────

function TerminalResult({ result, onSubmit, onInject, onUpload, starredUnits, onToggleStar }) {
  if (!result) return null;
  const { ok, result_type, data, meta } = result;

  if (result_type === "error" || !ok) {
    return <TerminalError message={typeof data === "string" ? data : JSON.stringify(data)} onInject={onInject} />;
  }

  // Stub detection — catch _stub: true from any result type before dispatching
  if (data?._stub === true) {
    return <StubWarning data={data} />;
  }

  switch (result_type) {
    case "disambiguation":  return <DisambiguationBlock data={data} onInject={onInject} />;
    case "combat": {
      // Key on attacker|defender so the same CombatBlock instance (and its
      // weapon-toggle state) is reused across reruns for the same matchup.
      // A fresh attacker/defender pair mounts a new instance with clean state.
      const combatKey = `${data?.attacker_name ?? ""}||${data?.defender_name ?? ""}`;
      return <div style={{ paddingLeft: "18px" }}><CombatBlock key={combatKey} data={data} onSubmit={onSubmit} /></div>;
    }
    case "spec_sheet":      return <div style={{ paddingLeft: "18px" }}><SpecBlock   data={data} meta={meta} onSubmit={onSubmit} onInject={onInject} starredUnits={starredUnits} onToggleStar={onToggleStar} /></div>;
    case "threat_card":     return <div style={{ paddingLeft: "18px" }}><ThreatCard  data={data} meta={meta} onSubmit={onSubmit} onInject={onInject} /></div>;
    case "threat_view":     return <div style={{ paddingLeft: "18px" }}><ThreatBlock data={data} meta={meta} onSubmit={onSubmit} onInject={onInject} /></div>;
    case "math_replay":     return <MathModeBlock data={data} />;
    case "rule_block":       return <TerminalRuleBlock       data={data} onInject={onInject} />;
    case "stratagem_block":  return <TerminalStratagemBlock  data={data} onInject={onInject} />;
    case "enhancement_block":return <TerminalEnhancementBlock data={data} onInject={onInject} />;
    case "mission_block":    return <TerminalMissionBlock    data={data} onInject={onInject} />;
    case "ability_block":    return <TerminalAbilityBlock    data={data} onInject={onInject} />;
    case "detachment_block": return <TerminalDetachmentBlock data={data} onInject={onInject} />;
    case "army_rules_block": return <TerminalArmyRulesBlock  data={data} onInject={onInject} />;
    case "stub_log":         return <IssuesLog data={data} />;
    case "nextturn_block":  return <TerminalNextTurnBlock data={data} onInject={onInject} />;
    case "session_summary": return <TerminalSessionBlock data={data} onInject={onInject} />;
    case "unit_list_rich":  return <UnitListRich data={data} meta={meta} onInject={onInject} />;
    // ── Roster / Campaign blocks ───────────────────────────────────────────────
    case "roster_list":         return <RosterListBlock       data={data} onInject={onInject} />;
    case "roster_action":       return <RosterActionBlock     data={data} onInject={onInject} />;
    case "role_assign":         return <RoleAssignBlock        data={data} onInject={onInject} />;
    case "roster_faction_list": return <RosterFactionListBlock data={data} onInject={onInject} />;
    case "campaign_list":   return <CampaignListBlock  data={data} onInject={onInject} />;
    case "roster_saved":    return <RosterSavedBlock   data={data} onInject={onInject} />;
    case "roster_prompt":   return <RosterPromptBlock  data={data} />;
    case "upload_block":    return <UploadBlock        data={data} onUpload={onUpload} />;
    // ── Generic ───────────────────────────────────────────────────────────────
    case "table":      return <TerminalTable    data={data} meta={meta} />;
    case "card":       return <TerminalCard     data={data} meta={meta} onInject={onInject} />;
    case "list":       return <TerminalList     data={data} meta={meta} onInject={onInject} />;
    case "themes_list": return <ThemesListBlock data={data} meta={meta} onInject={onInject} />;
    case "text":       return <TerminalText     data={data} />;
    case "help":       return <TerminalHelp     data={data} />;
    case "system_msg": return <TerminalSystemMsg data={data} />;
    case "legend":     return <TerminalLegendBlock data={data} />;
    case "clear":      return null;
    case "history":    return null;
    default:           return <TerminalText data={JSON.stringify(data, null, 2)} />;
  }
}

// ─── Legend Block ─────────────────────────────────────────────────────────────
// Renders the `legend` command output: glossary of stat columns, probability
// chain fields, modifier flags, swinginess labels, and footnotes.
// Tabs: Stat Columns | Probability Chain | Modifier Flags | Swinginess

const LEGEND_TABS = [
  { key: "stat_columns",      label: "Stat Columns" },
  { key: "probability_chain", label: "Probability Chain" },
  { key: "modifier_flags",    label: "Modifier Flags" },
  { key: "swinginess_labels", label: "Swinginess" },
];

function TerminalLegendBlock({ data }) {
  const [activeTab, setActiveTab] = useState("stat_columns");
  const {
    stat_columns      = [],
    probability_chain = [],
    modifier_flags    = [],
    swinginess_labels = [],
    notes             = [],
  } = data || {};

  const panels = { stat_columns, probability_chain, modifier_flags, swinginess_labels };

  const rowStyle = {
    display: "grid",
    gap: "0 12px",
    padding: "5px 0",
    borderBottom: `1px solid ${C.border}`,
    fontSize: "13px",
    lineHeight: "1.5",
    color: C.label,
  };

  function StatColumnsPanel() {
    return (
      <div>
        {stat_columns.map((r, i) => (
          <div key={i} style={{ ...rowStyle, gridTemplateColumns: "48px 160px 1fr" }}>
            <span style={{ color: C.green, fontWeight: 700, letterSpacing: "0.04em" }}>{r.abbrev}</span>
            <span style={{ color: C.mid }}>{r.full}</span>
            <span style={{ color: C.label }}>{r.desc}</span>
          </div>
        ))}
      </div>
    );
  }

  function ProbChainPanel() {
    return (
      <div>
        {probability_chain.map((r, i) => (
          <div key={i} style={{ padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: "10px", marginBottom: "3px" }}>
              <span style={{ fontSize: "13px", fontWeight: 700, color: C.green, minWidth: "56px" }}>{r.label}</span>
              <span style={{ fontSize: "13px", color: C.label }}>{r.desc}</span>
            </div>
            {r.note && (
              <div style={{ fontSize: "12px", color: C.dim, paddingLeft: "66px", marginBottom: "2px" }}>{r.note}</div>
            )}
            {r.example && (
              <div style={{ fontSize: "12px", color: C.amber, paddingLeft: "66px", fontStyle: "italic" }}>e.g. {r.example}</div>
            )}
          </div>
        ))}
      </div>
    );
  }

  function ModFlagsPanel() {
    return (
      <div>
        {modifier_flags.map((r, i) => (
          <div key={i} style={{ ...rowStyle, gridTemplateColumns: "110px 130px 1fr" }}>
            <span style={{ color: C.green, fontFamily: "monospace", fontSize: "12px" }}>{r.flag}</span>
            <span style={{ color: C.cyan }}>{r.desc}</span>
            <span style={{ color: C.label }}>{r.effect}</span>
          </div>
        ))}
      </div>
    );
  }

  function SwingPanel() {
    return (
      <div>
        {swinginess_labels.map((r, i) => (
          <div key={i} style={{ ...rowStyle, gridTemplateColumns: "90px 100px 1fr" }}>
            <span style={{ color: C.amber, fontWeight: 600 }}>{r.label}</span>
            <span style={{ color: C.dim, fontFamily: "monospace", fontSize: "12px" }}>CV {r.cv_range}</span>
            <span style={{ color: C.label }}>{r.meaning}</span>
          </div>
        ))}
      </div>
    );
  }

  const panelComponents = {
    stat_columns:      <StatColumnsPanel />,
    probability_chain: <ProbChainPanel />,
    modifier_flags:    <ModFlagsPanel />,
    swinginess_labels: <SwingPanel />,
  };

  return (
    <div className="font-mono" style={{ paddingLeft: "18px", fontSize: "14px" }}>
      {/* Tab bar */}
      <div style={{ display: "flex", gap: "4px", marginBottom: "10px", borderBottom: `1px solid ${C.border}`, paddingBottom: "6px" }}>
        {LEGEND_TABS.map(t => {
          const active = t.key === activeTab;
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              style={{
                fontSize: "12px",
                padding: "3px 10px",
                border: `1px solid ${active ? C.green : C.border}`,
                borderRadius: "3px",
                background: active ? "rgba(var(--ct-glow-rgb),0.08)" : "transparent",
                color: active ? C.green : C.dim,
                cursor: "pointer",
                fontFamily: "monospace",
                letterSpacing: "0.02em",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Active panel */}
      <div style={{ marginBottom: "12px" }}>
        {panelComponents[activeTab]}
      </div>

      {/* Notes footer — always visible */}
      {notes.length > 0 && (
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: "8px", marginTop: "6px" }}>
          <div style={{ color: C.dim, fontSize: "11px", marginBottom: "4px", letterSpacing: "0.08em", textTransform: "uppercase" }}>Notes</div>
          {notes.map((n, i) => (
            <div key={i} style={{ display: "flex", gap: "8px", fontSize: "12px", color: C.dim, marginBottom: "3px", lineHeight: "1.5" }}>
              <span style={{ color: C.border, flexShrink: 0 }}>·</span>
              <span>{n}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Rule Block ──────────────────────────────────────────────────────────────
// Renders a rules lookup result: keyword / special rule with source + related terms.

function TerminalRuleBlock({ data, onInject }) {
  const { name, type, source, description, related = [], _stub } = data;

  return (
    <div className="font-mono" style={{ paddingLeft: "18px", fontSize: "14px" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "baseline", gap: "10px", marginBottom: "6px" }}>
        <span style={{ color: C.amber, fontWeight: 700, fontSize: "16px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {name}
        </span>
        {type && (
          <span style={{
            color: C.label, fontSize: "11px", fontWeight: 600, textTransform: "uppercase",
            letterSpacing: "0.12em", border: `1px solid ${C.border}`, padding: "1px 6px",
          }}>
            {type}
          </span>
        )}
        {source && (
          <span style={{ color: C.dim, fontSize: "12px" }}>
            {source}
          </span>
        )}
        {_stub && (
          <span style={{ color: C.dim, fontSize: "11px", border: `1px solid ${C.border}`, padding: "1px 5px" }}>
            STUB
          </span>
        )}
      </div>

      {/* Divider */}
      <div style={{ color: C.border, marginBottom: "8px" }}>{"─".repeat(52)}</div>

      {/* Description */}
      <div style={{ color: C.mid, lineHeight: "1.65", maxWidth: "72ch", whiteSpace: "pre-wrap" }}>
        {description || "—"}
      </div>

      {/* Related terms */}
      {related.length > 0 && (
        <div style={{ marginTop: "10px", display: "flex", flexWrap: "wrap", gap: "5px", alignItems: "center" }}>
          <span style={{ color: C.label, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.1em", marginRight: "4px" }}>
            See also:
          </span>
          {related.map((term, i) => (
            <span
              key={i}
              onClick={() => onInject?.(`rule ${term}`)}
              style={{
                color:     onInject ? C.cyan : C.label,
                fontSize:  "12px",
                border:    `1px solid ${onInject ? C.cyan + "40" : C.border}`,
                padding:   "1px 7px",
                cursor:    onInject ? "pointer" : "default",
                userSelect:"none",
              }}
            >
              {term}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Stratagem Block ─────────────────────────────────────────────────────────
// Renders a stratagem lookup: name, CP cost, when/target/effect, detachment badge.

function TerminalStratagemBlock({ data, onInject }) {
  const { name, cost, detachment, faction, type: stratType, flavour, when, target, effect, phase, _stub } = data;

  const phaseColor = {
    shooting:  C.cyan,
    fight:     "#ff6b6b",
    movement:  C.green,
    charge:    "#ffa328",
    command:   C.label,
  };
  const phaseKey = (phase || "").toLowerCase();
  const phaseC = phaseColor[phaseKey] || C.label;

  return (
    <div className="font-mono" style={{ paddingLeft: "18px", fontSize: "14px" }}>

      {/* Header row */}
      <div style={{ display: "flex", alignItems: "baseline", gap: "10px", marginBottom: "6px", flexWrap: "wrap" }}>
        <span style={{ color: C.amber, fontWeight: 700, fontSize: "16px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {name}
        </span>
        <span style={{
          color: C.green, fontWeight: 700, fontSize: "13px",
          border: `1px solid ${C.green}60`, padding: "1px 8px",
        }}>
          {cost || "?CP"}
        </span>
        {detachment && (
          <span style={{ color: C.label, fontSize: "11px", border: `1px solid ${C.border}`, padding: "1px 6px" }}>
            {detachment}
          </span>
        )}
        {faction && (
          <span style={{ color: C.dim, fontSize: "12px" }}>{faction}</span>
        )}
        {_stub && (
          <span style={{ color: C.dim, fontSize: "11px", border: `1px solid ${C.border}`, padding: "1px 5px" }}>STUB</span>
        )}
      </div>

      {/* Type / phase tag */}
      {stratType && (
        <div style={{ color: C.label, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "6px" }}>
          {stratType}
        </div>
      )}

      {/* Flavour text */}
      {flavour && (
        <div style={{ color: C.dim, fontSize: "12px", fontStyle: "italic", maxWidth: "72ch", marginBottom: "8px", lineHeight: "1.5" }}>
          {flavour}
        </div>
      )}

      <div style={{ color: C.border, marginBottom: "8px" }}>{"─".repeat(52)}</div>

      {/* When / Target / Effect table */}
      {[
        ["WHEN",   when],
        ["TARGET", target],
        ["EFFECT", effect],
      ].filter(([, v]) => v).map(([label, text]) => (
        <div key={label} style={{ marginBottom: "8px", display: "flex", gap: "12px", alignItems: "flex-start" }}>
          <span style={{
            color: C.amber, fontSize: "11px", fontWeight: 700, textTransform: "uppercase",
            letterSpacing: "0.12em", flexShrink: 0, minWidth: "52px", paddingTop: "1px",
          }}>
            {label}
          </span>
          <span style={{ color: C.mid, lineHeight: "1.6", maxWidth: "64ch" }}>{text}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Enhancement Block ───────────────────────────────────────────────────────
// Renders an enhancement lookup: name, points cost, detachment, rules text.

function TerminalEnhancementBlock({ data, onInject }) {
  const { name, points, detachment, faction, text, links, _stub } = data;
  const linksArr = Array.isArray(links) ? links : (links ? [links] : []);

  return (
    <div className="font-mono" style={{ paddingLeft: "18px", fontSize: "14px" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "baseline", gap: "10px", marginBottom: "6px", flexWrap: "wrap" }}>
        <span style={{ color: C.amber, fontWeight: 700, fontSize: "16px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {name}
        </span>
        <span style={{
          color: C.cyan, fontWeight: 700, fontSize: "13px",
          border: `1px solid ${C.cyan}60`, padding: "1px 8px",
        }}>
          {points || "?"}pts
        </span>
        {detachment && (
          <span style={{ color: C.label, fontSize: "11px", border: `1px solid ${C.border}`, padding: "1px 6px" }}>
            {detachment}
          </span>
        )}
        {faction && (
          <span style={{ color: C.dim, fontSize: "12px" }}>{faction}</span>
        )}
        {_stub && (
          <span style={{ color: C.dim, fontSize: "11px", border: `1px solid ${C.border}`, padding: "1px 5px" }}>STUB</span>
        )}
      </div>

      <div style={{ color: C.border, marginBottom: "8px" }}>{"─".repeat(52)}</div>

      {/* Rules text */}
      <div style={{ color: C.mid, lineHeight: "1.65", maxWidth: "72ch", whiteSpace: "pre-wrap", marginBottom: "8px" }}>
        {text || "—"}
      </div>

      {/* Applies to */}
      {linksArr.length > 0 && (
        <div style={{ color: C.label, fontSize: "12px" }}>
          <span style={{ textTransform: "uppercase", letterSpacing: "0.08em", marginRight: "6px" }}>Applies to:</span>
          {linksArr.slice(0, 4).join("  ·  ")}
        </div>
      )}
    </div>
  );
}

// ─── Detachment Block ────────────────────────────────────────────────────────
// Renders all detachments for a faction: name, rule name + description, strat/enhancement counts.

function TerminalDetachmentBlock({ data, onInject }) {
  const { faction, detachments = [] } = data;

  return (
    <div className="font-mono" style={{ paddingLeft: "18px", fontSize: "14px" }}>

      {/* Faction header */}
      <div style={{ marginBottom: "10px" }}>
        <span style={{ color: C.label, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.12em" }}>
          DETACHMENTS  ·
        </span>
        <span style={{ color: C.amber, fontWeight: 700, fontSize: "13px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          {faction}
        </span>
        <span style={{ color: C.dim, fontSize: "11px", marginLeft: "8px" }}>
          {detachments.length} available
        </span>
      </div>

      {detachments.map((det, i) => {
        const stratCount = Array.isArray(det.stratagems) ? det.stratagems.length : 0;
        const enhCount   = Array.isArray(det.enhancements) ? det.enhancements.length : 0;

        return (
          <div key={i} style={{ marginBottom: "20px" }}>
            <div style={{ color: C.border }}>{"─".repeat(52)}</div>

            {/* Detachment name + rule name row */}
            <div style={{ display: "flex", alignItems: "baseline", gap: "10px", margin: "6px 0 4px", flexWrap: "wrap" }}>
              <span style={{ color: C.amber, fontWeight: 700, fontSize: "15px", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                {det.name}
              </span>
              {det.rule_name && (
                <span style={{
                  color: C.cyan, fontSize: "12px", fontWeight: 600,
                  border: `1px solid ${C.cyan}55`, padding: "1px 7px",
                }}>
                  {det.rule_name}
                </span>
              )}
            </div>

            {/* Rule description */}
            {det.description && (
              <div style={{ color: C.mid, lineHeight: "1.6", maxWidth: "72ch", marginBottom: "8px", whiteSpace: "pre-wrap" }}>
                {det.description}
              </div>
            )}

            {/* Strat / enhancement count badges */}
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              {stratCount > 0 && (
                <span
                  style={{ color: C.green, fontSize: "11px", border: `1px solid ${C.green}55`, padding: "1px 7px", cursor: "pointer" }}
                  title={`Show all stratagems for ${det.name}`}
                  onClick={() => onInject && onInject(`stratagem --detachment ${det.name}`)}
                >
                  {stratCount} stratagem{stratCount !== 1 ? "s" : ""}
                </span>
              )}
              {enhCount > 0 && (
                <span style={{ color: C.label, fontSize: "11px", border: `1px solid ${C.border}`, padding: "1px 7px" }}>
                  {enhCount} enhancement{enhCount !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Army Rules Block ────────────────────────────────────────────────────────
// Renders faction-level special rules: name and full description text.

function TerminalArmyRulesBlock({ data, onInject }) {
  const { faction, rules = [] } = data;

  return (
    <div className="font-mono" style={{ paddingLeft: "18px", fontSize: "14px" }}>

      {/* Faction header */}
      <div style={{ marginBottom: "10px" }}>
        <span style={{ color: C.label, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.12em" }}>
          ARMY RULES  ·
        </span>
        <span style={{ color: C.amber, fontWeight: 700, fontSize: "13px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          {faction}
        </span>
      </div>

      {rules.length === 0 && (
        <div style={{ color: C.dim, fontSize: "13px" }}>No army rules data available for this faction.</div>
      )}

      {rules.map((rule, i) => (
        <div key={i} style={{ marginBottom: "16px" }}>
          <div style={{ color: C.border }}>{"─".repeat(52)}</div>

          {/* Rule name */}
          <div style={{ color: C.amber, fontWeight: 700, fontSize: "14px", textTransform: "uppercase", letterSpacing: "0.06em", margin: "6px 0 4px" }}>
            {rule.name}
          </div>

          {/* Rule description */}
          {rule.description && (
            <div style={{ color: C.mid, lineHeight: "1.65", maxWidth: "72ch", whiteSpace: "pre-wrap" }}>
              {rule.description}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Mission Block ───────────────────────────────────────────────────────────
// Renders a mission lookup: name, type, deployment, scoring summary, rules.

function TerminalMissionBlock({ data, onInject }) {
  const { name, type: missionType, source, size, deployment, description, scoring = [], mission_rules = [], tip, _stub } = data;

  return (
    <div className="font-mono" style={{ paddingLeft: "18px", fontSize: "14px" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "baseline", gap: "10px", marginBottom: "6px", flexWrap: "wrap" }}>
        <span style={{ color: C.amber, fontWeight: 700, fontSize: "16px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {name}
        </span>
        {missionType && (
          <span style={{ color: C.label, fontSize: "11px", border: `1px solid ${C.border}`, padding: "1px 6px" }}>
            {missionType}
          </span>
        )}
        {source && <span style={{ color: C.dim, fontSize: "12px" }}>{source}</span>}
        {_stub && (
          <span style={{ color: C.dim, fontSize: "11px", border: `1px solid ${C.border}`, padding: "1px 5px" }}>STUB</span>
        )}
      </div>

      {/* Meta row */}
      {(deployment || size) && (
        <div style={{ color: C.label, fontSize: "12px", marginBottom: "6px", display: "flex", gap: "16px" }}>
          {deployment && <span><span style={{ color: C.dim }}>Deployment: </span>{deployment}</span>}
          {size && <span><span style={{ color: C.dim }}>Size: </span>{size}</span>}
        </div>
      )}

      <div style={{ color: C.border, marginBottom: "8px" }}>{"─".repeat(52)}</div>

      {/* Description */}
      {description && (
        <div style={{ color: C.mid, lineHeight: "1.65", maxWidth: "72ch", marginBottom: "10px" }}>
          {description}
        </div>
      )}

      {/* Scoring */}
      {scoring.length > 0 && (
        <div style={{ marginBottom: "10px" }}>
          <div style={{ color: C.amber, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700, marginBottom: "6px" }}>
            Scoring
          </div>
          {scoring.map((s, i) => (
            <div key={i} style={{ marginBottom: "6px" }}>
              <div style={{ color: C.label, fontSize: "12px", fontWeight: 600, marginBottom: "2px" }}>{s.header}</div>
              <div style={{ color: C.mid, fontSize: "13px", lineHeight: "1.55", maxWidth: "68ch", paddingLeft: "8px" }}>{s.text}</div>
            </div>
          ))}
        </div>
      )}

      {/* Mission Rules */}
      {mission_rules.length > 0 && (
        <div style={{ marginBottom: "10px" }}>
          <div style={{ color: C.amber, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700, marginBottom: "6px" }}>
            Mission Rules
          </div>
          {mission_rules.map((r, i) => (
            <div key={i} style={{ marginBottom: "6px" }}>
              <span style={{ color: C.cyan, fontSize: "12px", fontWeight: 600 }}>{r.name}: </span>
              <span style={{ color: C.mid, fontSize: "13px", lineHeight: "1.55" }}>{r.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* Tip */}
      {tip && (
        <div style={{ marginTop: "6px", paddingLeft: "12px", borderLeft: `2px solid ${C.amber}60` }}>
          <span style={{ color: C.amber, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.1em", marginRight: "8px" }}>Tip</span>
          <span style={{ color: C.dim, fontSize: "12px", lineHeight: "1.5" }}>{tip}</span>
        </div>
      )}
    </div>
  );
}

// ─── Ability Block ───────────────────────────────────────────────────────────
// Renders an ability lookup: name, type tag (CORE/FACTION), rules text, units list.

function TerminalAbilityBlock({ data, onInject }) {
  const { name, type_tag, text, units = [], units_more = 0, factions = [], _stub } = data;

  return (
    <div className="font-mono" style={{ paddingLeft: "18px", fontSize: "14px" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "baseline", gap: "10px", marginBottom: "6px", flexWrap: "wrap" }}>
        {type_tag && (
          <span style={{
            color: C.amber, fontSize: "11px", fontWeight: 700, textTransform: "uppercase",
            letterSpacing: "0.14em", border: `1px solid ${C.amber}60`, padding: "1px 7px",
          }}>
            {type_tag}
          </span>
        )}
        <span style={{ color: C.amber, fontWeight: 700, fontSize: "16px", letterSpacing: "0.04em" }}>
          {name}
        </span>
        {_stub && (
          <span style={{ color: C.dim, fontSize: "11px", border: `1px solid ${C.border}`, padding: "1px 5px" }}>STUB</span>
        )}
      </div>

      <div style={{ color: C.border, marginBottom: "8px" }}>{"─".repeat(52)}</div>

      {/* Ability text */}
      <div style={{ color: C.mid, lineHeight: "1.65", maxWidth: "72ch", whiteSpace: "pre-wrap", marginBottom: "10px" }}>
        {text || "—"}
      </div>

      {/* Factions */}
      {factions.length > 0 && (
        <div style={{ color: C.label, fontSize: "12px", marginBottom: "6px" }}>
          <span style={{ textTransform: "uppercase", letterSpacing: "0.08em", marginRight: "6px", color: C.dim }}>Factions:</span>
          {factions.slice(0, 6).map(f => f.replace(/_/g, " ")).join("  ·  ")}
        </div>
      )}

      {/* Units that carry this ability */}
      {units.length > 0 && (
        <div style={{ marginTop: "6px" }}>
          <div style={{ color: C.dim, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "4px" }}>
            Found on:
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
            {units.map((u, i) => (
              <span
                key={i}
                onClick={() => onInject?.(`spec ${u}`)}
                style={{
                  color:      onInject ? C.green : C.label,
                  fontSize:   "12px",
                  border:     `1px solid ${onInject ? C.green + "50" : C.border}`,
                  padding:    "1px 7px",
                  cursor:     onInject ? "pointer" : "default",
                  userSelect: "none",
                }}
              >
                {u}
              </span>
            ))}
            {units_more > 0 && (
              <span style={{ color: C.dim, fontSize: "12px", padding: "1px 4px" }}>
                +{units_more} more
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Table ────────────────────────────────────────────────────────────────

function TerminalTable({ data, meta }) {
  const { columns = [], rows = [] } = data;
  if (!columns.length) return null;

  const widths = columns.map((col, i) =>
    Math.min(48, Math.max(col.length, ...rows.map(r => String(r[i] ?? "—").length)))
  );
  const dividerLen = widths.reduce((a, b) => a + b, 0) + (widths.length - 1) * 3;

  return (
    <div className="font-mono" style={{ paddingLeft: "18px", fontSize: "14px" }}>
      {meta && Object.keys(meta).length > 0 && (
        <div style={{ color: C.label, paddingBottom: "4px" }}>
          {Object.entries(meta)
            .filter(([k, v]) => v !== undefined && v !== null && v !== "" && k !== "errors")
            .map(([k, v]) => `${k}: ${v}`)
            .join("  ·  ")}
        </div>
      )}
      <div className="flex" style={{ color: C.mid, fontWeight: 600 }}>
        {columns.map((col, i) => (
          <span key={i} style={{ flexShrink: 0, width: `${widths[i] + (i < columns.length - 1 ? 3 : 0)}ch` }}>
            {col}
          </span>
        ))}
      </div>
      <div style={{ color: C.border }}>{"─".repeat(Math.min(dividerLen, 72))}</div>
      {rows.map((row, ri) => (
        <div key={ri} className="flex">
          {row.map((cell, ci) => {
            const str = cell === null || cell === undefined ? "—" : String(cell);
            return (
              <span
                key={ci}
                style={{ flexShrink: 0, width: `${widths[ci] + (ci < row.length - 1 ? 3 : 0)}ch`, color: ci === 0 ? C.green : C.label }}
                title={str.length > widths[ci] ? str : undefined}
              >
                {str.length > widths[ci] ? str.slice(0, widths[ci] - 1) + "…" : str}
              </span>
            );
          })}
        </div>
      ))}
      {rows.length === 0 && <div style={{ color: C.label }}>(no results)</div>}
      {typeof meta?.count === "number" && rows.length > 0 && (
        <div style={{ color: C.label, paddingTop: "4px" }}>
          {meta.count} result{meta.count !== 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────
// Handles special field types: Stats, Keywords, weapon tables, Abilities.

function CardWeaponTable({ label, table }) {
  const { columns = [], rows = [] } = table;
  // First col (weapon name) wider; stat cols fixed narrow
  const colWidths = columns.map((_, i) => i === 0 ? "22ch" : "5ch");

  return (
    <div style={{ marginBottom: "14px" }}>
      <div style={{ color: C.amber, textTransform: "uppercase", fontSize: "12px", letterSpacing: "0.12em", fontWeight: 700, marginBottom: "6px" }}>
        {label}
      </div>
      {/* Header */}
      <div style={{ display: "flex", color: C.label, fontSize: "12px", fontWeight: 600, marginBottom: "2px" }}>
        {columns.map((col, i) => (
          <span key={i} style={{ width: colWidths[i], flexShrink: 0 }}>{col}</span>
        ))}
      </div>
      <div style={{ color: C.border, marginBottom: "2px" }}>{"─".repeat(40)}</div>
      {/* Rows */}
      {rows.map((row, ri) => (
        <div key={ri} style={{ display: "flex", fontSize: "13px", lineHeight: "1.7" }}>
          {row.map((cell, ci) => (
            <span key={ci} style={{ width: colWidths[ci], flexShrink: 0, color: ci === 0 ? C.mid : C.label }}>
              {cell}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

// CardKeywords — inline chips used by the generic "card" result type.
// Clicking fires:  list units <keyword> [--faction <faction>]
// Routes to UNITS context automatically (App.jsx routes list-units there).
function CardKeywords({ keywords, faction, onInject }) {
  const [hoveredIdx, setHoveredIdx] = useState(null);

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "5px", marginBottom: "12px" }}>
      {keywords.map((kw, i) => {
        const cmd = faction
          ? `list units ${kw} --faction ${faction}`
          : `list units ${kw}`;
        const hovered = hoveredIdx === i;
        return (
          <span
            key={i}
            onClick={() => onInject?.(cmd)}
            onMouseEnter={() => setHoveredIdx(i)}
            onMouseLeave={() => setHoveredIdx(null)}
            style={{
              color:           hovered ? C.amber : (onInject ? C.cyan : C.label),
              fontSize:        "12px",
              border:          `1px solid ${hovered ? C.amber + "70" : (onInject ? C.cyan + "50" : C.border)}`,
              padding:         "2px 8px",
              cursor:          onInject ? "pointer" : "default",
              letterSpacing:   "0.03em",
              userSelect:      "none",
              backgroundColor: hovered && onInject ? "#ffa32812" : "transparent",
              transition:      "color 0.1s, border-color 0.1s, background-color 0.1s",
            }}
          >
            {kw}
          </span>
        );
      })}
    </div>
  );
}

function CardAbilities({ abilities, onInject }) {
  return (
    <div style={{ marginBottom: "10px" }}>
      <div style={{ color: C.label, textTransform: "uppercase", fontSize: "12px", letterSpacing: "0.12em", fontWeight: 600, marginBottom: "6px" }}>
        Abilities
      </div>
      {abilities.map((ab, i) => {
        const name = typeof ab === "string" ? ab : ab.name;
        const desc = typeof ab === "string" ? null : (ab.description || ab.summary || ab.desc);
        return (
          <div key={i} style={{ marginBottom: "5px", lineHeight: "1.5" }}>
            <span
              onClick={() => onInject?.(`ability ${name}`)}
              style={{
                color:      onInject ? C.cyan : C.mid,
                fontWeight: 600,
                cursor:     onInject ? "pointer" : "default",
                userSelect: "none",
              }}
            >
              ◆ {name}
            </span>
            {desc && (
              <span style={{ color: C.label, marginLeft: "8px" }}>— {desc}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TerminalCard({ data, meta, onInject }) {
  const { title = "", fields = [] } = data;

  // Split out Stats and Keywords so we can pin Keywords directly below Stats
  const statsField    = fields.find(f => f.label === "Stats");
  const keywordsField = fields.find(f => f.label === "Keywords");
  const otherFields   = fields.filter(f => f.label !== "Stats" && f.label !== "Keywords");

  return (
    <div className="font-mono" style={{ paddingLeft: "18px", fontSize: "14px" }}>

      {/* Title */}
      <div style={{ marginBottom: "4px" }}>
        <span style={{ color: C.amber, fontWeight: 700, letterSpacing: "0.08em", textShadow: `0 0 6px ${C.amber}80` }}>
          {title.toUpperCase()}
        </span>
        {meta?.faction && meta.faction !== "stub" && (
          <span style={{ color: C.label, marginLeft: "12px" }}>{meta.faction.replace(/_/g, " ")}</span>
        )}
      </div>
      <div style={{ color: C.border, marginBottom: "10px" }}>{"─".repeat(Math.min(60, title.length + 8))}</div>

      {/* Stats block */}
      {statsField && typeof statsField.value === "object" && !Array.isArray(statsField.value) && (
        <div style={{ marginBottom: "8px" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "16px" }}>
            {Object.entries(statsField.value).map(([k, v]) => (
              <span key={k} style={{ display: "flex", gap: "4px", alignItems: "baseline" }}>
                <span style={{ color: C.label, fontSize: "12px", fontWeight: 600 }}>{k}</span>
                <span style={{ color: C.green, fontWeight: 700, fontSize: "15px" }}>{String(v)}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Keywords — inline below stats, scoped to this unit's faction */}
      {keywordsField && Array.isArray(keywordsField.value) && (
        <CardKeywords keywords={keywordsField.value} faction={meta?.faction} onInject={onInject} />
      )}

      {/* All other fields */}
      {otherFields.map((field, i) => {
        const { label, value } = field;

        // Weapon table: { columns, rows }
        if (value && typeof value === "object" && !Array.isArray(value) && value.columns && value.rows) {
          return <CardWeaponTable key={i} label={label} table={value} />;
        }

        // Abilities: array of { name, desc } or strings
        if (label === "Abilities" && Array.isArray(value)) {
          return <CardAbilities key={i} abilities={value} onInject={onInject} />;
        }

        // Array: bullet list
        if (Array.isArray(value)) {
          return (
            <div key={i} style={{ marginBottom: "8px" }}>
              <div style={{ color: C.label, textTransform: "uppercase", fontSize: "12px", letterSpacing: "0.12em", fontWeight: 600, marginBottom: "4px" }}>
                {label}
              </div>
              {value.map((item, j) => (
                <div key={j} style={{ color: C.mid, lineHeight: "1.6" }}>
                  <span style={{ color: C.label }}>· </span>
                  {typeof item === "string" ? item : JSON.stringify(item)}
                </div>
              ))}
            </div>
          );
        }

        // Simple key: value
        return (
          <div key={i} style={{ display: "flex", gap: "12px", marginBottom: "4px" }}>
            <span style={{ color: C.label, textTransform: "uppercase", fontSize: "12px", letterSpacing: "0.12em", fontWeight: 600, width: "80px", flexShrink: 0 }}>
              {label}
            </span>
            <span style={{ color: C.mid }}>{String(value ?? "—")}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Unit List Rich ────────────────────────────────────────────────────────
// Alphabetically sorted, numbered unit list with pts + stat mini-bars.
// Clicking a number submits "spec <unit>" — appears typed in the command line.

function parseStat(val) {
  if (val === null || val === undefined || val === "—") return null;
  const n = parseInt(String(val), 10);
  return isNaN(n) ? null : n;
}

function parseSave(svStr) {
  const m = String(svStr || "").match(/(\d+)\+/);
  return m ? parseInt(m[1], 10) : null;
}

function computeTankiness(unit) {
  const T  = parseStat(unit.T);
  const W  = parseStat(unit.W);
  const sv = parseSave(unit.Sv);
  if (!T || !W) return 0;
  // saveFactor: 3+ → 5, 4+ → 4, 5+ → 3, 6+ → 2, no save → 1
  const saveFactor = sv != null ? Math.max(1, 8 - sv) : 1;
  // Check abilities text for invuln / FNP bonuses
  const abilText = JSON.stringify(unit.abilities || "").toLowerCase();
  const invBonus  = (abilText.includes("invuln") || abilText.includes("ward save") || abilText.includes("inv.")) ? 1.3 : 1.0;
  const fnpBonus  = (abilText.includes("feel no pain") || abilText.includes("fnp") || abilText.includes("5+ feel")) ? 1.2 : 1.0;
  return T * W * saveFactor * invBonus * fnpBonus;
}

function MiniBar({ value, max, color, width = 52, height = 5 }) {
  if (!max || value == null) return <span style={{ color: C.dim, fontSize: "11px" }}>—</span>;
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div style={{ display: "flex", gap: "1px", width: `${width}px` }}>
      {Array.from({ length: 8 }, (_, i) => {
        const threshold = (i + 1) / 8 * 100;
        return (
          <div key={i} style={{
            flex:       1,
            height:     `${height}px`,
            background: pct >= threshold ? color : "#0a140a",
          }} />
        );
      })}
    </div>
  );
}

function UnitListRich({ data = [], meta, onInject }) {
  if (!data.length) {
    return <div style={{ paddingLeft: "18px", color: C.label, fontSize: "13px" }}>(no units)</div>;
  }

  // Compute tankiness scores and find maxima for bar normalization
  const enriched   = data.map(u => ({ ...u, _tank: computeTankiness(u) }));
  const maxW       = Math.max(1, ...enriched.map(u => parseStat(u.W) || 0));
  const maxT       = 14; // absolute game ceiling
  const maxTank    = Math.max(1, ...enriched.map(u => u._tank));

  const numWidth   = String(data.length).length;
  const factionLabel = meta?.faction
    ? meta.faction.replace(/_/g, " ").toUpperCase()
    : null;

  const COL_NUM   = `${numWidth + 1}ch`;
  const COL_NAME  = "1fr";
  const COL_PTS   = "42px";
  const COL_T     = "62px";
  const COL_W     = "62px";
  const COL_TANK  = "62px";
  const GRID      = `${COL_NUM} ${COL_NAME} ${COL_PTS} ${COL_T} ${COL_W} ${COL_TANK}`;

  return (
    <div className="font-mono" style={{ fontSize: "13px" }}>
      {/* Header row */}
      {factionLabel && (
        <div style={{ paddingLeft: "18px", color: C.label, fontSize: "12px", paddingBottom: "6px" }}>
          {meta.count} units  ·  {factionLabel}
        </div>
      )}
      {!factionLabel && meta?.count !== undefined && (
        <div style={{ paddingLeft: "18px", color: C.label, fontSize: "12px", paddingBottom: "6px" }}>
          {meta.count} units
        </div>
      )}

      {/* Column headers */}
      <div style={{
        display:             "grid",
        gridTemplateColumns: GRID,
        gap:                 "0 10px",
        paddingLeft:         "18px",
        paddingRight:        "8px",
        paddingBottom:       "3px",
        color:               C.label,
        fontSize:            "11px",
        fontWeight:          700,
        textTransform:       "uppercase",
        letterSpacing:       "0.1em",
      }}>
        <span></span>
        <span>Unit</span>
        <span style={{ textAlign: "right" }}>Pts</span>
        <span style={{ textAlign: "center" }}>T</span>
        <span style={{ textAlign: "center" }}>W</span>
        <span style={{ textAlign: "center" }}>Tank</span>
      </div>
      <div style={{ paddingLeft: "18px", color: C.border, marginBottom: "3px" }}>
        {"─".repeat(58)}
      </div>

      {/* Unit rows */}
      {enriched.map((unit, i) => {
        const T    = parseStat(unit.T);
        const W    = parseStat(unit.W);
        const pts  = String(unit.points || "—").replace(/pts?/i, "").trim();
        const haveT    = T != null;
        const haveW    = W != null;
        const haveTank = unit._tank > 0;

        return (
          <div
            key={i}
            style={{
              display:             "grid",
              gridTemplateColumns: GRID,
              gap:                 "0 10px",
              paddingLeft:         "18px",
              paddingRight:        "8px",
              lineHeight:          "2",
              alignItems:          "center",
            }}
          >
            {/* Number — click to run spec */}
            <span
              onClick={() => onInject?.(`spec ${unit.name}`)}
              style={{
                color:      C.amber,
                fontWeight: 700,
                textAlign:  "right",
                cursor:     onInject ? "pointer" : "default",
                userSelect: "none",
                flexShrink: 0,
              }}
            >
              {i + 1}.
            </span>

            {/* Unit name — also clickable */}
            <span
              onClick={() => onInject?.(`spec ${unit.name}`)}
              style={{
                color:     C.mid,
                cursor:    onInject ? "pointer" : "default",
                userSelect:"none",
                overflow:  "hidden",
                textOverflow: "ellipsis",
                whiteSpace:"nowrap",
              }}
              onMouseEnter={e => { if (onInject) e.currentTarget.style.color = C.green; }}
              onMouseLeave={e => { e.currentTarget.style.color = C.mid; }}
            >
              {unit.name}
            </span>

            {/* Points */}
            <span style={{ color: C.label, textAlign: "right", fontSize: "12px" }}>
              {pts}
            </span>

            {/* T bar */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1px" }}>
              {haveT ? (
                <>
                  <span style={{ color: C.cyan, fontSize: "11px", fontWeight: 700 }}>{T}</span>
                  <MiniBar value={T} max={maxT} color={C.cyan} width={48} height={4} />
                </>
              ) : (
                <span style={{ color: C.dim, fontSize: "11px" }}>—</span>
              )}
            </div>

            {/* W bar */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1px" }}>
              {haveW ? (
                <>
                  <span style={{ color: C.green, fontSize: "11px", fontWeight: 700 }}>{W}</span>
                  <MiniBar value={W} max={maxW} color={C.green} width={48} height={4} />
                </>
              ) : (
                <span style={{ color: C.dim, fontSize: "11px" }}>—</span>
              )}
            </div>

            {/* Tankiness bar */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1px" }}>
              {haveTank ? (
                <>
                  <span style={{ color: C.amber, fontSize: "11px", fontWeight: 700 }}>
                    {Math.round((unit._tank / maxTank) * 10)}/10
                  </span>
                  <MiniBar value={unit._tank} max={maxTank} color={C.amber} width={48} height={4} />
                </>
              ) : (
                <span style={{ color: C.dim, fontSize: "11px" }}>—</span>
              )}
            </div>
          </div>
        );
      })}

      {/* Footer hint */}
      <div style={{
        paddingLeft:   "18px",
        paddingTop:    "6px",
        color:         C.dim,
        fontSize:      "11px",
        borderTop:     `1px solid ${C.border}`,
        marginTop:     "4px",
      }}>
        Click number or name → spec sheet  ·  Tank = T × W × save × modifiers (relative)
      </div>
    </div>
  );
}

// ─── List ────────────────────────────────────────────────────────────────
// Full-width numbered grid. Columns scale with item count.
// Numbers are always amber — they are navigation elements.

function listColumns(count) {
  if (count > 40) return 4;
  if (count > 20) return 3;
  if (count > 10) return 2;
  return 1;
}

function TerminalList({ data = [], meta, onInject }) {
  const count    = data.length;
  const cols     = listColumns(count);
  const numWidth = String(count || 1).length;
  // Pluralise only if meta.type doesn't already end in 's'
  const typeLabel = meta?.type
    ? (meta.type.endsWith("s") ? meta.type : `${meta.type}s`)
    : "items";

  return (
    <div className="font-mono" style={{ fontSize: "14px" }}>
      {meta?.count !== undefined && (
        <div style={{ paddingLeft: "18px", color: C.label, paddingBottom: "6px" }}>
          {meta.count} {typeLabel}
        </div>
      )}
      {count > 0 ? (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: "1px 20px" }}>
          {data.map((item, i) => (
            <div key={i} style={{ color: C.mid, lineHeight: "1.65", display: "flex", gap: "5px", alignItems: "baseline" }}>
              <span
                onClick={() => onInject?.(String(i + 1))}
                style={{
                  color:      C.amber,
                  flexShrink: 0,
                  minWidth:   `${numWidth + 1}ch`,
                  textAlign:  "right",
                  cursor:     onInject ? "pointer" : "default",
                  fontWeight: 600,
                  userSelect: "none",
                }}
              >
                {i + 1}.
              </span>
              <span>{String(item)}</span>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ paddingLeft: "18px", color: C.label }}>(empty)</div>
      )}
    </div>
  );
}

// ─── System message ───────────────────────────────────────────────────────
// Used for client-side terminal feedback: navigation, clear, delete, back, etc.
// Rendered in dim italic green — visually distinct from data results.

function TerminalSystemMsg({ data }) {
  return (
    <div
      className="font-mono"
      style={{
        paddingLeft: "18px",
        color:       "var(--ct-primary-dim)",
        fontSize:    "14px",
        fontStyle:   "italic",
        letterSpacing: "0.02em",
      }}
    >
      {String(data ?? "")}
    </div>
  );
}

// ─── Themes List ─────────────────────────────────────────────────────────
// Compact list: theme name + command token.
// Clicking an unlocked theme activates it; clicking a locked theme starts the challenge.

function ThemesListBlock({ data = [], meta, onInject }) {
  const [hovered, setHovered] = useState(null);

  return (
    <div className="font-mono" style={{ paddingLeft: "18px", fontSize: "14px" }}>
      {meta?.count && (
        <div style={{ color: C.dim, fontSize: "11px", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          {meta.count}
        </div>
      )}
      {data.map((theme, i) => {
        const cmd   = theme.locked ? "unlock theme" : `theme ${theme.id}`;
        const isHov = hovered === i;
        return (
          <div
            key={theme.id}
            onClick={() => onInject?.(cmd)}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            style={{
              display:    "flex",
              gap:        "8px",
              alignItems: "baseline",
              lineHeight: "1.7",
              cursor:     onInject ? "pointer" : "default",
              userSelect: "none",
            }}
          >
            <span style={{
              color:      theme.locked ? (isHov ? C.label : C.dim) : (isHov ? C.green : C.mid),
              fontWeight: 600,
            }}>
              {theme.label}
            </span>
            <span style={{ color: isHov ? C.label : C.dim, fontSize: "12px" }}>
              [{theme.locked ? "locked" : `theme ${theme.id}`}]
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Text ────────────────────────────────────────────────────────────────

function TerminalText({ data }) {
  return (
    <div className="font-mono whitespace-pre-wrap" style={{ paddingLeft: "18px", color: C.mid, fontSize: "14px", lineHeight: "1.7" }}>
      {String(data ?? "")}
    </div>
  );
}

// ─── Error ───────────────────────────────────────────────────────────────

function parseErrorSuggestions(message) {
  const marker = "Did you mean:";
  const idx    = message.indexOf(marker);
  if (idx === -1) return { main: message, suggestions: [] };
  const main        = message.slice(0, idx).trim();
  const rest        = message.slice(idx + marker.length).trim().replace(/\.$/, "");
  const suggestions = rest.split(/,\s*|\s+or\s+/).map(s => s.trim()).filter(Boolean);
  return { main, suggestions };
}

function TerminalError({ message, onInject }) {
  const { main, suggestions } = parseErrorSuggestions(message);
  return (
    <div className="font-mono" style={{ paddingLeft: "18px", fontSize: "14px" }}>
      <div style={{ color: C.red, fontWeight: 600 }}>✗ {main || message}</div>
      {suggestions.length === 1 && (
        <div style={{ color: C.label, marginTop: "4px" }}>
          Did you mean: <span style={{ color: C.mid }}>{suggestions[0]}</span>?
        </div>
      )}
      {suggestions.length > 1 && (
        <div style={{ marginTop: "6px" }}>
          <div style={{ color: C.label, marginBottom: "3px" }}>Did you mean:</div>
          {suggestions.map((s, i) => (
            <div key={i} style={{ color: C.mid, lineHeight: "1.6", display: "flex", gap: "6px" }}>
              <span
                onClick={() => onInject?.(String(i + 1))}
                style={{ color: C.amber, flexShrink: 0, minWidth: "22px", textAlign: "right", cursor: onInject ? "pointer" : "default", fontWeight: 600, userSelect: "none" }}
              >
                {i + 1}.
              </span>
              <span>{s}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Help ─────────────────────────────────────────────────────────────────

const GROUP_ORDER  = ["data", "math", "analysis", "rules", "session", "meta", "navigation"];
const GROUP_LABELS = {
  data:       "Data",
  math:       "Combat Math",
  analysis:   "Analysis",
  rules:      "Rules",
  session:    "Session",
  meta:       "Terminal",
  navigation: "Navigation (Web UI only)",
};

function TerminalHelp({ data }) {
  if (!data) return null;

  // ── Full help ────────────────────────────────────────────────────────────
  if (data.type === "full") {
    const { groups = {} } = data;
    return (
      <div className="font-mono" style={{ paddingLeft: "18px", fontSize: "14px" }}>
        {GROUP_ORDER.filter(g => groups[g]).map(groupName => (
          <div key={groupName} style={{ marginBottom: "18px" }}>

            {/* Group header */}
            <div style={{
              color:         C.amber,
              fontWeight:    700,
              fontSize:      "13px",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              borderBottom:  `1px solid ${C.border}`,
              paddingBottom: "5px",
              marginBottom:  "8px",
            }}>
              {GROUP_LABELS[groupName] ?? groupName}
            </div>

            {/* Command rows */}
            {groups[groupName].map(cmd => (
              <div
                key={cmd.name}
                style={{
                  display:    "grid",
                  gridTemplateColumns: "220px 1fr",
                  gap:        "0 10px",
                  lineHeight: "1.75",
                  opacity:    cmd.stub ? 0.4 : 1,
                }}
              >
                <span style={{ color: C.green, fontWeight: 600 }}>{cmd.usage}</span>
                <span style={{ color: C.label }}>{cmd.description}</span>
              </div>
            ))}
          </div>
        ))}
        <div style={{ color: C.label, paddingTop: "4px", fontSize: "13px", borderTop: `1px solid ${C.border}` }}>
          Type <span style={{ color: C.mid, fontWeight: 600 }}>help &lt;command&gt;</span> for usage, aliases, and examples.
        </div>
      </div>
    );
  }

  // ── Single command ───────────────────────────────────────────────────────
  if (data.type === "command") {
    return (
      <div className="font-mono" style={{ paddingLeft: "18px", fontSize: "14px" }}>

        <div style={{ color: C.amber, fontWeight: 700, fontSize: "18px", marginBottom: "3px" }}>
          {data.name?.toUpperCase()}
        </div>
        <div style={{ color: C.mid, marginBottom: "12px", lineHeight: "1.5" }}>
          {data.description}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: "5px 12px" }}>
          <span style={{ color: C.label, fontWeight: 600, textTransform: "uppercase", fontSize: "12px", letterSpacing: "0.1em" }}>Usage</span>
          <span style={{ color: C.green, fontWeight: 600 }}>{data.usage}</span>

          {data.aliases?.length > 0 && <>
            <span style={{ color: C.label, fontWeight: 600, textTransform: "uppercase", fontSize: "12px", letterSpacing: "0.1em" }}>Aliases</span>
            <span style={{ color: C.mid }}>{data.aliases.join(", ")}</span>
          </>}
        </div>

        {data.examples?.length > 0 && (
          <div style={{ marginTop: "12px" }}>
            <div style={{ color: C.label, fontWeight: 600, textTransform: "uppercase", fontSize: "12px", letterSpacing: "0.1em", marginBottom: "6px" }}>
              Examples
            </div>
            {data.examples.map((ex, i) => (
              <div key={i} style={{ color: C.mid, paddingLeft: "4px", lineHeight: "1.7" }}>
                <span style={{ color: C.green, marginRight: "6px" }}>›</span>{ex}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return null;
}

// ─── Next Turn Block ─────────────────────────────────────────────────────────
// Renders the output of the `nextturn` command: round number, CP gain,
// turn-specific phase reminders, and a recap of active combat modifiers.

function TerminalNextTurnBlock({ data, onInject }) {
  if (!data) return null;

  const {
    turn             = 1,
    cp_gained        = 1,
    phase_reminders  = [],
    active_modifiers = [],
    attacker         = null,
    defender         = null,
    faction          = null,
    enemy_faction    = null,
  } = data;

  const turnLabel = `BATTLE ROUND ${turn}`;

  return (
    <div
      className="font-mono"
      style={{
        paddingLeft:   "18px",
        display:       "flex",
        flexDirection: "column",
        gap:           "6px",
        fontSize:      "13px",
      }}
    >

      {/* ── Round banner ── */}
      <div style={{
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        padding:        "10px 16px",
        background:     C.panel,
        border:         `1px solid ${C.border}`,
        borderLeft:     `3px solid ${C.amber}`,
      }}>
        <span style={{
          color:         C.amber,
          fontSize:      "18px",
          fontWeight:    700,
          letterSpacing: "0.12em",
          textShadow:    `0 0 10px ${C.amber}50`,
        }}>
          {turnLabel}
        </span>

        {/* CP gained badge */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{
            color:         C.green,
            fontSize:      "11px",
            fontWeight:    700,
            letterSpacing: "0.1em",
            border:        `1px solid ${C.green}60`,
            padding:       "2px 10px",
            background:    `${C.green}10`,
          }}>
            +{cp_gained} CP
          </span>
          <span style={{ color: C.dim, fontSize: "10px", letterSpacing: "0.08em" }}>
            COMMAND PHASE
          </span>
        </div>
      </div>

      {/* ── Phase reminders ── */}
      {phase_reminders.length > 0 && (
        <div style={{
          background: C.panel,
          border:     `1px solid ${C.border}`,
          padding:    "10px 14px",
          display:    "flex",
          flexDirection: "column",
          gap:        "6px",
        }}>
          <div style={{
            color:         C.label,
            fontSize:      "9px",
            fontWeight:    700,
            letterSpacing: "0.18em",
            marginBottom:  "2px",
          }}>
            PHASE NOTES
          </div>
          {phase_reminders.map((r, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "9px" }}>
              <span style={{ color: C.cyan, fontSize: "11px", flexShrink: 0, marginTop: "1px" }}>
                {r.icon ?? "◈"}
              </span>
              <span style={{ color: C.mid, fontSize: "12px", lineHeight: "1.5" }}>
                {r.text}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── Active modifiers recap ── */}
      {active_modifiers.length > 0 && (
        <div style={{
          background: C.panel,
          border:     `1px solid ${C.border}`,
          padding:    "10px 14px",
        }}>
          <div style={{
            color:         C.label,
            fontSize:      "9px",
            fontWeight:    700,
            letterSpacing: "0.18em",
            marginBottom:  "8px",
          }}>
            LAST COMBAT MODIFIERS
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
            {active_modifiers.map((flag, i) => (
              <span key={i} style={{
                color:         C.amber,
                fontSize:      "11px",
                border:        `1px solid ${C.amber}40`,
                padding:       "1px 7px",
                background:    `${C.amber}08`,
                letterSpacing: "0.04em",
                fontFamily:    "monospace",
              }}>
                {flag}
              </span>
            ))}
          </div>
          {(attacker || defender) && (
            <div style={{
              color:      C.dim,
              fontSize:   "11px",
              marginTop:  "7px",
              lineHeight: "1.4",
            }}>
              {attacker && defender
                ? `${attacker} vs ${defender}`
                : attacker || defender}
              {" — "}
              <span
                onClick={() => attacker && defender && onInject?.(`${attacker} vs ${defender}`)}
                style={{
                  color:      onInject && attacker && defender ? C.cyan : C.dim,
                  cursor:     onInject && attacker && defender ? "pointer" : "default",
                  userSelect: "none",
                }}
              >
                rerun combat
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── Faction reminder (dim, only when set) ── */}
      {(faction || enemy_faction) && (
        <div style={{
          display:    "flex",
          gap:        "12px",
          padding:    "6px 14px",
          background: C.panel,
          border:     `1px solid ${C.border}`,
          fontSize:   "11px",
        }}>
          {faction && (
            <span>
              <span style={{ color: C.dim, marginRight: "5px" }}>Player:</span>
              <span
                onClick={() => onInject?.(`list units ${faction}`)}
                style={{
                  color:      onInject ? C.cyan : C.label,
                  cursor:     onInject ? "pointer" : "default",
                  userSelect: "none",
                }}
              >
                {faction}
              </span>
            </span>
          )}
          {enemy_faction && (
            <span>
              <span style={{ color: C.dim, marginRight: "5px" }}>Enemy:</span>
              <span
                onClick={() => onInject?.(`threat ${enemy_faction}`)}
                style={{
                  color:      onInject ? C.red : C.label,
                  cursor:     onInject ? "pointer" : "default",
                  userSelect: "none",
                }}
              >
                {enemy_faction}
              </span>
            </span>
          )}
        </div>
      )}

    </div>
  );
}

// ─── Session Summary Block ────────────────────────────────────────────────────
// Renders the output of the `session` command in a readable, structured layout.
// Shows current turn, faction assignments, roster status, and active modifiers.

function TerminalSessionBlock({ data, onInject }) {
  const { state = {}, my_roster = {}, enemy_roster = {} } = data ?? {};

  const ROW = ({ label, value, color, clickCmd }) => (
    <div style={{
      display:       "grid",
      gridTemplateColumns: "130px 1fr",
      gap:           "8px",
      padding:       "3px 0",
      borderBottom:  `1px solid ${C.border}`,
    }}>
      <span style={{ color: C.label, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.1em" }}>
        {label}
      </span>
      <span
        style={{
          color:     color ?? C.mid,
          fontSize:  "13px",
          fontFamily: "monospace",
          cursor:    clickCmd ? "pointer" : "default",
          textDecoration: clickCmd ? "none" : undefined,
        }}
        onClick={() => clickCmd && onInject?.(clickCmd)}
      >
        {value ?? "—"}
      </span>
    </div>
  );

  function RosterPanel({ roster, side, clickPrefix }) {
    const { name, unit_count, total_points, units = [] } = roster;
    const hasUnits = units.length > 0;
    const sideColor = side === "PLAYER" ? C.cyan : C.amber;

    return (
      <div style={{
        flex:       1,
        padding:    "10px 14px",
        background: C.panel,
        border:     `1px solid ${C.border}`,
      }}>
        {/* Roster header */}
        <div style={{
          display:        "flex",
          justifyContent: "space-between",
          alignItems:     "baseline",
          marginBottom:   "8px",
          paddingBottom:  "6px",
          borderBottom:   `1px solid ${C.border}`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{
              color:         sideColor,
              fontSize:      "9px",
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              border:        `1px solid ${sideColor}50`,
              padding:       "1px 5px",
            }}>
              {side}
            </span>
            <span style={{ color: C.green, fontWeight: 700, fontSize: "13px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {name || "—"}
            </span>
          </div>
          <div style={{ display: "flex", gap: "12px", fontSize: "11px" }}>
            <span style={{ color: C.dim }}>
              {unit_count} {unit_count === 1 ? "unit" : "units"}
            </span>
            {total_points && (
              <span style={{ color: C.amber, fontFamily: "monospace" }}>
                {total_points} pts
              </span>
            )}
          </div>
        </div>

        {/* Unit list */}
        {hasUnits ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            {units.slice(0, 12).map((u, i) => {
              const uname = typeof u === "string" ? u : u.name;
              const upts  = typeof u === "object" ? u.points : null;
              return (
                <div key={i} style={{
                  display:        "flex",
                  justifyContent: "space-between",
                  alignItems:     "center",
                  padding:        "2px 0",
                }}>
                  <span
                    style={{
                      color:     C.mid,
                      fontSize:  "12px",
                      cursor:    onInject ? "pointer" : "default",
                    }}
                    onClick={() => onInject?.(`${clickPrefix} ${uname}`)}
                  >
                    {uname}
                  </span>
                  {upts && (
                    <span style={{ color: C.dim, fontSize: "11px", fontFamily: "monospace" }}>
                      {upts}
                    </span>
                  )}
                </div>
              );
            })}
            {units.length > 12 && (
              <span style={{ color: C.dim, fontSize: "11px", marginTop: "4px" }}>
                +{units.length - 12} more…
              </span>
            )}
          </div>
        ) : (
          <div style={{ color: C.dim, fontSize: "12px", fontStyle: "italic" }}>
            No roster loaded
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="font-mono" style={{ paddingLeft: "18px", fontSize: "13px" }}>

      {/* Header */}
      <div style={{
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        marginBottom:   "10px",
      }}>
        <span style={{
          color:         C.amber,
          fontWeight:    700,
          fontSize:      "14px",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
        }}>
          Session State
        </span>
        <span style={{
          color:         C.green,
          fontFamily:    "monospace",
          fontSize:      "11px",
          border:        `1px solid ${C.border}`,
          padding:       "1px 8px",
          letterSpacing: "0.12em",
        }}>
          TURN {state.turn ?? 0}
        </span>
      </div>

      {/* Divider */}
      <div style={{ color: C.border, marginBottom: "10px" }}>{"─".repeat(52)}</div>

      {/* State grid */}
      <div style={{ marginBottom: "14px" }}>
        <ROW label="Roster Mode" value={state.roster_mode}
          color={state.roster_mode === "ON" ? C.green : C.dim} />
        <ROW label="Player Faction" value={state.faction !== "—" ? state.faction?.toUpperCase() : "—"}
          color={state.faction !== "—" ? C.cyan : C.dim}
          clickCmd={state.faction !== "—" ? `list units ${state.faction}` : null} />
        <ROW label="Enemy Faction" value={state.enemy !== "—" ? state.enemy?.toUpperCase() : "—"}
          color={state.enemy !== "—" ? C.amber : C.dim}
          clickCmd={state.enemy !== "—" ? `list units ${state.enemy}` : null} />
      </div>

      {/* Roster panels */}
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
        <RosterPanel roster={my_roster}    side="PLAYER" clickPrefix="spec" />
        <RosterPanel roster={enemy_roster} side="ENEMY"  clickPrefix="spec" />
      </div>

      {/* Quick actions */}
      <div style={{
        marginTop:  "10px",
        display:    "flex",
        gap:        "8px",
        flexWrap:   "wrap",
      }}>
        {[
          { label: "next turn",    cmd: "next turn" },
          { label: "load roster",  cmd: "load roster" },
          { label: "issues",       cmd: "issues" },
        ].map(({ label, cmd }) => (
          <span
            key={cmd}
            onClick={() => onInject?.(cmd)}
            style={{
              color:         C.green,
              fontSize:      "11px",
              border:        `1px solid ${C.border}`,
              padding:       "2px 8px",
              cursor:        "pointer",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
