/**
 * DiagnosticsPage — Engine Status Dashboard
 *
 * A full-page diagnostic view surfacing:
 *  • System Health Header    — large MC / Deterministic status badges + heartbeat SVG
 *  • Data Integrity Grid     — traffic-light completion bars per faction (green/amber/red)
 *  • Animated Data Flow Diagram — pipeline nodes with CSS stroke-dash animation
 *  • Engine Docs & Tooltips  — interactive glossary explaining the math
 *
 * Fetches:  GET /api/engines/{engineId}/status  (every 4s for heartbeat)
 *
 * Color system:  matches the terminal aesthetic from combat/shared.jsx
 */

import { useState, useEffect, useRef } from "react";

// ─── Color constants (mirrors combat/shared.jsx) ───────────────────────────────

const C = {
  green:     "var(--ct-primary)",
  mid:       "var(--ct-primary-mid)",
  label:     "var(--ct-primary-label)",
  dim:       "var(--ct-primary-dim)",
  ghost:     "var(--ct-ghost)",
  amber:     "#ffa328",
  cyan:      "var(--ct-bar-alt)",
  red:       "#ff3b3b",
  border:    "var(--ct-border)",
  bordermid: "var(--ct-border-bright)",
  panel:     "var(--ct-bg-panel)",
  bg:        "var(--ct-bg)",
};

// ─── Known faction reference counts (from tau-ai skill data) ──────────────────
// Used to compute completion % for the Data Integrity grid.
// Sourced from the faction library as of 2026-03-09.

const KNOWN_FACTION_COUNTS = {
  "aeldari":             72,
  "space marines":       72,
  "tyranids":            51,
  "chaos space marines": 49,
  "necrons":             55,
  "astra militarum":     51,
  "chaos daemons":       55,
  "tau":                 41,
  "adepta sororitas":    32,
  "deathguard":          32,
  "adeptus custodes":    31,
  "grey knights":        30,
  "adeptus mechanicus":  29,
  "orks":                31,
  "thousand sons":       28,
  "drukhari":            25,
  "worldeaters":         23,
  "genestealer cults":   22,
  "imperial knights":    20,
  "chaos knights":       19,
  "space wolves":        17,
  "imperial agents":     17,
  "dark angels":         12,
  "leagues of votann":   12,
  "blood angels":        9,
  "black templars":      9,
  "deathwatch":          9,
  "adeptus titanicus":   4,
  "emperors children":   0,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function trafficLight(pct) {
  if (pct >= 90) return C.green;
  if (pct >= 70) return C.amber;
  return C.red;
}

function trafficLabel(pct) {
  if (pct >= 90) return "Production Ready";
  if (pct >= 70) return "Playable";
  return "Critical Gaps";
}

// ─── Heartbeat SVG ────────────────────────────────────────────────────────────
// A CSS-animated sparkline that "pulses" to show the engine is live.

function HeartbeatMonitor({ active }) {
  const path = "M 0,20 L 15,20 L 20,5 L 25,35 L 30,20 L 35,20 L 40,8 L 45,32 L 50,20 L 65,20";
  const inactiveColor = C.dim;
  const activeColor   = active ? C.green : C.amber;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
      <svg
        width="65"
        height="40"
        viewBox="0 0 65 40"
        style={{ overflow: "visible" }}
      >
        {/* Background trace */}
        <path d={path} fill="none" stroke={C.ghost} strokeWidth="1.5" />
        {/* Animated active trace */}
        <path
          d={path}
          fill="none"
          stroke={activeColor}
          strokeWidth="1.5"
          strokeLinecap="round"
          style={{
            filter:           `drop-shadow(0 0 3px ${activeColor})`,
            strokeDasharray:  "200",
            strokeDashoffset: active ? "0" : "200",
            transition:       "stroke-dashoffset 1.2s ease-in-out, stroke 0.3s",
            animation:        active ? "heartbeat 2.4s ease-in-out infinite" : "none",
          }}
        />
        {/* Scanning dot */}
        {active && (
          <circle r="3" fill={C.green} style={{
            filter:    `drop-shadow(0 0 4px ${C.green})`,
            animation: "scanDot 2.4s ease-in-out infinite",
          }}>
            <animateMotion dur="2.4s" repeatCount="indefinite" path={path} />
          </circle>
        )}
      </svg>
      <span style={{
        color:         active ? C.green : C.amber,
        fontSize:      "10px",
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        textShadow:    active ? `0 0 6px ${C.green}60` : "none",
      }}>
        {active ? "ENGINE ACTIVE" : "ENGINE OFFLINE"}
      </span>
    </div>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ label, active, pulse = false }) {
  const color = active ? C.green : C.red;
  return (
    <div style={{
      display:       "flex",
      alignItems:    "center",
      gap:           "10px",
      padding:       "10px 18px",
      background:    active ? "#051005" : "#100505",
      border:        `1px solid ${active ? C.bordermid : "#3a0808"}`,
      position:      "relative",
      overflow:      "hidden",
    }}>
      {/* Animated border glow when offline */}
      {!active && pulse && (
        <div style={{
          position:   "absolute",
          inset:      0,
          border:     `1px solid ${C.red}`,
          animation:  "borderPulse 1.5s ease-in-out infinite",
          pointerEvents: "none",
        }} />
      )}
      <div style={{
        width:        "12px",
        height:       "12px",
        borderRadius: "50%",
        background:   color,
        boxShadow:    `0 0 ${active ? "8px" : "12px"} ${color}`,
        flexShrink:   0,
        animation:    (!active && pulse) ? "pulse 1.5s ease-in-out infinite" : "none",
      }} />
      <span style={{
        color:         color,
        textShadow:    `0 0 8px ${color}70`,
        fontWeight:    700,
        fontSize:      "13px",
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        fontFamily:    "monospace",
      }}>
        {label}
      </span>
    </div>
  );
}

// ─── System Health Header ─────────────────────────────────────────────────────

function SystemHealthHeader({ status, lastUpdated }) {
  const ready         = status?.ready ?? false;
  const mcStatus      = status?.simulation_config?.status ?? "OFFLINE";
  const mcActive      = mcStatus === "ACTIVE" && ready;
  const factions      = status?.summary?.factions ?? 0;
  const totalUnits    = status?.summary?.total_units ?? 0;

  return (
    <section>
      <div style={{
        color:         C.amber,
        fontSize:      "11px",
        letterSpacing: "0.2em",
        textTransform: "uppercase",
        marginBottom:  "12px",
        paddingBottom: "8px",
        borderBottom:  `1px solid ${C.border}`,
      }}>
        System Health
      </div>

      {/* Main badges row */}
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "16px" }}>
        <StatusBadge
          label={mcActive ? "Monte Carlo: Active" : "Monte Carlo: Offline"}
          active={mcActive}
          pulse={!mcActive}
        />
        <StatusBadge
          label={ready ? "Deterministic: Active" : "Deterministic: Offline"}
          active={ready}
        />
        <StatusBadge
          label={ready ? "Engine: Online" : "Engine: Offline"}
          active={ready}
        />
      </div>

      {/* Heartbeat + summary */}
      <div style={{
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        flexWrap:       "wrap",
        gap:            "16px",
        padding:        "12px 16px",
        background:     C.panel,
        border:         `1px solid ${C.border}`,
      }}>
        <HeartbeatMonitor active={ready} />

        <div style={{ display: "flex", gap: "28px" }}>
          {[
            ["Factions", factions],
            ["Units", totalUnits.toLocaleString()],
            ["MC Trials", status?.simulation_config?.trials?.toLocaleString() ?? "—"],
            ["Last Polled", lastUpdated ?? "—"],
          ].map(([k, v]) => (
            <div key={k} style={{ textAlign: "center" }}>
              <div style={{ color: C.green, fontSize: "18px", fontWeight: 700, fontFamily: "monospace" }}>
                {v}
              </div>
              <div style={{ color: C.dim, fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                {k}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Data Integrity Grid ──────────────────────────────────────────────────────

function DataIntegrityGrid({ perFaction }) {
  // Merge loaded counts with known reference counts
  const rows = Object.keys(KNOWN_FACTION_COUNTS).map(faction => {
    const loaded   = perFaction?.[faction] ?? 0;
    const expected = KNOWN_FACTION_COUNTS[faction] ?? 0;
    const pct      = expected === 0
      ? (loaded > 0 ? 100 : 0)
      : Math.min(100, Math.round(loaded / expected * 100));
    return { faction, loaded, expected, pct };
  }).sort((a, b) => b.pct - a.pct || b.loaded - a.loaded);

  const critical = rows.filter(r => r.pct < 70);
  const playable  = rows.filter(r => r.pct >= 70 && r.pct < 90);
  const ready     = rows.filter(r => r.pct >= 90);

  function FactionBar({ faction, loaded, expected, pct }) {
    const color = trafficLight(pct);
    const segments = 20;
    const filled   = Math.round(pct / 100 * segments);

    return (
      <div style={{
        display:       "grid",
        gridTemplateColumns: "160px 40px 1fr 80px",
        alignItems:    "center",
        gap:           "10px",
        padding:       "5px 0",
        borderBottom:  `1px solid ${C.ghost}`,
      }}>
        <span style={{ color: C.mid, fontSize: "12px", textTransform: "capitalize" }}>
          {faction}
        </span>
        <span style={{ color: C.label, fontSize: "11px", textAlign: "right", fontFamily: "monospace" }}>
          {loaded}/{expected === 0 ? "?" : expected}
        </span>
        <div style={{ display: "flex", gap: "1px" }}>
          {Array.from({ length: segments }, (_, i) => (
            <div key={i} style={{
              flex:       1,
              height:     "8px",
              background: i < filled ? color : C.ghost,
              boxShadow:  i < filled ? `0 0 3px ${color}50` : "none",
            }} />
          ))}
        </div>
        <span style={{
          color:         color,
          fontSize:      "10px",
          textAlign:     "right",
          letterSpacing: "0.06em",
        }}>
          {pct}%
        </span>
      </div>
    );
  }

  function Section({ title, color, rows: sectionRows }) {
    if (!sectionRows.length) return null;
    return (
      <div style={{ marginBottom: "16px" }}>
        <div style={{
          display:       "flex",
          alignItems:    "center",
          gap:           "8px",
          marginBottom:  "8px",
        }}>
          <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: color, boxShadow: `0 0 4px ${color}` }} />
          <span style={{ color, fontSize: "11px", letterSpacing: "0.14em", textTransform: "uppercase" }}>
            {title}
          </span>
          <span style={{ color: C.dim, fontSize: "10px" }}>
            ({sectionRows.length} {sectionRows.length === 1 ? "faction" : "factions"})
          </span>
        </div>
        {sectionRows.map(r => (
          <FactionBar key={r.faction} {...r} />
        ))}
      </div>
    );
  }

  return (
    <section>
      <div style={{
        color:         C.amber,
        fontSize:      "11px",
        letterSpacing: "0.2em",
        textTransform: "uppercase",
        marginBottom:  "12px",
        paddingBottom: "8px",
        borderBottom:  `1px solid ${C.border}`,
        display:       "flex",
        justifyContent: "space-between",
        alignItems:    "center",
      }}>
        <span>Data Integrity Grid</span>
        <div style={{ display: "flex", gap: "16px", fontSize: "9px", letterSpacing: "0.1em" }}>
          <span style={{ color: C.green }}>■ 90–100% Production</span>
          <span style={{ color: C.amber }}>■ 70–89% Playable</span>
          <span style={{ color: C.red }}>■ &lt;70% Critical</span>
        </div>
      </div>

      {/* Legend header */}
      <div style={{
        display:       "grid",
        gridTemplateColumns: "160px 40px 1fr 80px",
        gap:           "10px",
        marginBottom:  "6px",
        padding:       "0",
      }}>
        {["Faction", "Loaded", "Completion", ""].map(h => (
          <span key={h} style={{ color: C.dim, fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase" }}>
            {h}
          </span>
        ))}
      </div>

      <Section title="Production Ready · 90–100%" color={C.green}  rows={ready}    />
      <Section title="Playable · 70–89%"           color={C.amber}  rows={playable}  />
      <Section title="Critical Gaps · <70%"        color={C.red}    rows={critical}  />

      {/* Missing data table */}
      {critical.length > 0 && (
        <div style={{
          marginTop:  "16px",
          padding:    "12px",
          background: "#100505",
          border:     `1px solid #3a0808`,
        }}>
          <div style={{
            color:         C.red,
            fontSize:      "11px",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            marginBottom:  "8px",
          }}>
            ⚠ Missing Data Table
          </div>
          {critical.map(r => (
            <div key={r.faction} style={{
              display:       "flex",
              justifyContent: "space-between",
              padding:       "3px 0",
              borderBottom:  `1px solid #200808`,
              fontSize:      "11px",
            }}>
              <span style={{ color: C.mid, textTransform: "capitalize" }}>{r.faction}</span>
              <span style={{ color: C.red, fontFamily: "monospace" }}>
                {r.expected - r.loaded > 0
                  ? `${r.expected - r.loaded} units missing`
                  : r.expected === 0 ? "no reference count" : `${r.pct}% complete`}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Animated Data Flow Diagram ───────────────────────────────────────────────

function DataFlowDiagram({ pipeline }) {
  const stages = [
    { id: "dossiers",  label: "DOSSIERS",  sub: "Faction JSON",   ok: pipeline?.dossiers  },
    { id: "rules",     label: "RULES",     sub: "Core + Keywords",ok: pipeline?.rules     },
    { id: "modifiers", label: "MODIFIERS", sub: "Stat transforms", ok: pipeline?.modifiers },
    { id: "engine",    label: "ENGINE",    sub: "Math + MC",      ok: pipeline?.engine    },
    { id: "output",    label: "OUTPUT",    sub: "API response",   ok: pipeline?.output    },
  ];

  const W = 140;   // node width
  const H = 64;    // node height
  const GAP = 30;  // gap between nodes
  const STEP = W + GAP;
  const SVG_W = stages.length * STEP - GAP;
  const SVG_H = H + 40;

  // Each arrow connects mid-right of node N to mid-left of node N+1
  const arrows = stages.slice(0, -1).map((_, i) => {
    const x1 = i * STEP + W;
    const x2 = (i + 1) * STEP;
    const y  = H / 2 + 10;
    return { x1, y1: y, x2, y2: y, ok: stages[i].ok && stages[i + 1].ok };
  });

  return (
    <section>
      <div style={{
        color:         C.amber,
        fontSize:      "11px",
        letterSpacing: "0.2em",
        textTransform: "uppercase",
        marginBottom:  "12px",
        paddingBottom: "8px",
        borderBottom:  `1px solid ${C.border}`,
      }}>
        Data Flow Pipeline
      </div>

      <div style={{
        padding:    "20px 16px 12px",
        background: C.panel,
        border:     `1px solid ${C.border}`,
        overflowX:  "auto",
      }}>
        <svg
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          width="100%"
          style={{ minWidth: `${SVG_W}px`, display: "block" }}
        >
          <defs>
            {/* Animated dash for active flow arrows */}
            <marker id="arrow-active" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M0,0 L0,6 L6,3 z" fill={C.green} />
            </marker>
            <marker id="arrow-inactive" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M0,0 L0,6 L6,3 z" fill={C.red} />
            </marker>
            <marker id="arrow-dim" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M0,0 L0,6 L6,3 z" fill={C.dim} />
            </marker>
          </defs>

          {/* Arrows */}
          {arrows.map((a, i) => {
            const color  = a.ok ? C.green : C.red;
            const marker = a.ok ? "url(#arrow-active)" : "url(#arrow-inactive)";
            const len    = a.x2 - a.x1 - 6;
            return (
              <g key={i}>
                {/* Dim base line */}
                <line
                  x1={a.x1} y1={a.y1}
                  x2={a.x2 - 6} y2={a.y2}
                  stroke={C.ghost} strokeWidth="2"
                />
                {/* Animated flow line */}
                <line
                  x1={a.x1} y1={a.y1}
                  x2={a.x2 - 6} y2={a.y2}
                  stroke={color}
                  strokeWidth="2"
                  strokeDasharray={`${len * 0.3} ${len * 0.7}`}
                  markerEnd={marker}
                  style={{
                    filter:    a.ok ? `drop-shadow(0 0 3px ${C.green})` : "none",
                    animation: a.ok ? `flowDash ${1.8 + i * 0.2}s linear infinite` : "none",
                    strokeDashoffset: "0",
                  }}
                />
              </g>
            );
          })}

          {/* Nodes */}
          {stages.map((stage, i) => {
            const x     = i * STEP;
            const color = stage.ok ? C.green : C.red;
            const bg    = stage.ok ? "#051005" : "#100505";
            const bord  = stage.ok ? C.bordermid : "#3a0808";
            return (
              <g key={stage.id}>
                {/* Node box */}
                <rect
                  x={x} y={10}
                  width={W} height={H}
                  fill={bg}
                  stroke={bord}
                  strokeWidth="1"
                  rx="0"
                  style={{ filter: stage.ok ? `drop-shadow(0 0 4px ${C.green}30)` : "none" }}
                />
                {/* Status dot */}
                <circle
                  cx={x + W - 14} cy={24}
                  r={4}
                  fill={color}
                  style={{ filter: `drop-shadow(0 0 4px ${color})` }}
                />
                {/* Label */}
                <text
                  x={x + W / 2} y={38}
                  textAnchor="middle"
                  fill={color}
                  fontSize="11"
                  fontFamily="monospace"
                  fontWeight="700"
                  letterSpacing="1"
                  style={{ textShadow: stage.ok ? `0 0 6px ${C.green}50` : "none" }}
                >
                  {stage.label}
                </text>
                {/* Subtitle */}
                <text
                  x={x + W / 2} y={56}
                  textAnchor="middle"
                  fill={C.label}
                  fontSize="9"
                  fontFamily="monospace"
                >
                  {stage.sub}
                </text>
                {/* Status text */}
                <text
                  x={x + 12} y={24}
                  fill={color}
                  fontSize="8"
                  fontFamily="monospace"
                  letterSpacing="0.5"
                >
                  {stage.ok ? "OK" : "ERR"}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend */}
      <div style={{
        display:       "flex",
        gap:           "20px",
        marginTop:     "8px",
        fontSize:      "10px",
        color:         C.dim,
        letterSpacing: "0.08em",
      }}>
        <span>
          <span style={{ color: C.green }}>■</span> Stage healthy
        </span>
        <span>
          <span style={{ color: C.red }}>■</span> Stage failure — results may be unreliable
        </span>
        <span>
          Animated arrows indicate active data flow
        </span>
      </div>
    </section>
  );
}

// ─── Engine Docs & Tooltips ───────────────────────────────────────────────────

function EngineDocs() {
  const [openKey, setOpenKey] = useState(null);

  const topics = [
    {
      key:   "deterministic",
      title: "Deterministic Mode",
      badge: { label: "ALWAYS ACTIVE", color: C.green },
      body:  `Every combat result is computed as a fixed expected value using the
              exact probability chain: P(hit) × P(wound|hit) × P(fail save|wound) × Damage.
              This gives a single "mean" outcome per weapon — accurate for large sample sizes
              but unable to capture variance or rare spikes.`,
      math:  "E[dmg] = attacks × P(hit) × P(wound) × P(fail_save) × damage",
    },
    {
      key:   "monte_carlo",
      title: "Monte Carlo Mode",
      badge: { label: "5,000 ITERATIONS", color: C.cyan },
      body:  `Monte Carlo simulation rolls every die 5,000 times per weapon, tracking the
              full distribution of outcomes. This captures: swinginess (how variable the
              result is), overkill waste (damage lost on overkilled models), and kill
              probability distributions for each kill count (0, 1, 2…).
              More reliable than deterministic alone for high-damage, low-shot weapons.`,
      math:  "std_err = σ / √n  ·  95% CI = ±1.96 × std_err",
    },
    {
      key:   "ap",
      title: "AP (Armour Penetration)",
      badge: { label: "40K MECHANIC", color: C.amber },
      body:  `In 10th edition, AP is negative: AP-4 is better than AP-1. AP is subtracted
              from the target's armour save value. AP 0 means the full save is used.
              The engine applies AP correctly: effective_save = base_save - cover_bonus + AP.
              Save values above 6 are unattainable (auto-fail); invulnerable saves are
              compared and the better (lower number) is used.`,
      math:  "effective_save = min(armor_save - cover + AP, invuln)  →  use the lower value",
    },
    {
      key:   "swinginess",
      title: "Swinginess / Variance",
      badge: { label: "MC METRIC", color: C.cyan },
      body:  `Swinginess is the coefficient of variation (CV = σ/μ) of the damage
              distribution. A railgun firing once has high swinginess — it either hits and
              deals massive damage or misses entirely. Bolter fire has low swinginess —
              many dice average out predictably.
              Stable < 0.15 · Moderate 0.15–0.30 · Variable 0.30–0.50 · Swingy > 0.50`,
      math:  "CV = σ / μ  (coefficient of variation)",
    },
    {
      key:   "confidence",
      title: "Confidence Rating",
      badge: { label: "MC METRIC", color: C.cyan },
      body:  `Confidence is derived from the 95% confidence interval half-width as a
              percentage of the mean damage. With 5,000 trials: Very High (≤1%), High (≤3%),
              Medium (≤7%), Low (>7%). For most weapon configurations, 5,000 trials gives
              Very High or High confidence.`,
      math:  "margin% = (1.96 × σ/√n) / μ × 100",
    },
    {
      key:   "pipeline",
      title: "Data Pipeline Stages",
      badge: { label: "SYSTEM", color: C.amber },
      body:  `DOSSIERS: Raw faction JSON files loaded from data/combat_terminal/data/factions/.
              RULES: Core rules keywords index (fly, deep strike, etc.).
              MODIFIERS: Weapon-level special rules (devastating wounds, lethal hits, etc.) —
              always available, hardcoded in math_adapter.py.
              ENGINE: The CombatMathEngine class — deterministic + MC.
              OUTPUT: The FastAPI endpoint returns the final JSON to the UI.`,
      math:  "[ DOSSIERS ] → [ RULES ] → [ MODIFIERS ] → [ ENGINE ] → [ OUTPUT ]",
    },
  ];

  return (
    <section>
      <div style={{
        color:         C.amber,
        fontSize:      "11px",
        letterSpacing: "0.2em",
        textTransform: "uppercase",
        marginBottom:  "12px",
        paddingBottom: "8px",
        borderBottom:  `1px solid ${C.border}`,
      }}>
        Engine Docs
        <span style={{ color: C.dim, marginLeft: "12px", fontSize: "10px", textTransform: "none", letterSpacing: "0" }}>
          — hover or click a topic to expand
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        {topics.map(topic => {
          const isOpen = openKey === topic.key;
          return (
            <div
              key={topic.key}
              style={{
                background: isOpen ? "#070d07" : C.panel,
                border:     `1px solid ${isOpen ? C.bordermid : C.border}`,
                cursor:     "pointer",
                transition: "background 0.15s, border-color 0.15s",
              }}
              onClick={() => setOpenKey(isOpen ? null : topic.key)}
              onMouseEnter={e => {
                if (!isOpen) e.currentTarget.style.background = "#060b06";
              }}
              onMouseLeave={e => {
                if (!isOpen) e.currentTarget.style.background = C.panel;
              }}
            >
              {/* Header row */}
              <div style={{
                display:       "flex",
                alignItems:    "center",
                justifyContent: "space-between",
                padding:       "10px 14px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <span style={{ color: C.mid, fontSize: "12px", fontWeight: 600 }}>
                    {topic.title}
                  </span>
                  <span style={{
                    color:         topic.badge.color,
                    fontSize:      "9px",
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    padding:       "2px 6px",
                    border:        `1px solid ${topic.badge.color}40`,
                    background:    `${topic.badge.color}08`,
                  }}>
                    {topic.badge.label}
                  </span>
                </div>
                <span style={{ color: C.dim, fontSize: "10px" }}>
                  {isOpen ? "▲" : "▼"}
                </span>
              </div>

              {/* Expanded body */}
              {isOpen && (
                <div style={{
                  padding:    "0 14px 14px",
                  borderTop:  `1px solid ${C.border}`,
                }}>
                  <p style={{
                    color:      C.label,
                    fontSize:   "12px",
                    lineHeight: "1.7",
                    margin:     "10px 0 10px",
                  }}>
                    {topic.body}
                  </p>
                  {topic.math && (
                    <div style={{
                      padding:      "8px 12px",
                      background:   "#030703",
                      border:       `1px solid ${C.border}`,
                      fontFamily:   "monospace",
                      fontSize:     "11px",
                      color:        C.cyan,
                      letterSpacing: "0.03em",
                    }}>
                      {topic.math}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ─── CSS keyframes ────────────────────────────────────────────────────────────
// Injected once as a <style> tag so we don't depend on Tailwind animations.

const KEYFRAMES = `
  @keyframes pulse {
    0%, 100% { opacity: 1; box-shadow: 0 0 8px currentColor; }
    50%       { opacity: 0.4; box-shadow: 0 0 2px currentColor; }
  }
  @keyframes borderPulse {
    0%, 100% { opacity: 0.8; }
    50%       { opacity: 0.1; }
  }
  @keyframes flowDash {
    from { stroke-dashoffset: 0; }
    to   { stroke-dashoffset: -60; }
  }
  @keyframes heartbeat {
    0%   { stroke-dashoffset: 200; opacity: 0.3; }
    30%  { stroke-dashoffset: 0;   opacity: 1;   }
    70%  { stroke-dashoffset: 0;   opacity: 1;   }
    100% { stroke-dashoffset: -200; opacity: 0.3; }
  }
`;

// ─── Main page ────────────────────────────────────────────────────────────────

export function DiagnosticsPage({ engineId }) {
  const [status,      setStatus]      = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const intervalRef = useRef(null);

  async function fetchStatus() {
    if (!engineId) return;
    try {
      // The status endpoint is GET /api/engines/{name} — no /status suffix.
      const res = await fetch(`/api/engines/${engineId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      // Guard against SPA fallback returning HTML instead of JSON
      if (text.trimStart().startsWith("<")) {
        throw new Error(`Engine '${engineId}' not found — server returned HTML`);
      }
      const data = JSON.parse(text);
      setStatus(data);
      setError(null);
      const now = new Date();
      setLastUpdated(
        now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchStatus();
    intervalRef.current = setInterval(fetchStatus, 4000);
    return () => clearInterval(intervalRef.current);
  }, [engineId]);

  const containerStyle = {
    fontFamily:   "monospace",
    background:   C.bg,
    color:        C.mid,
    minHeight:    "100%",
    overflowY:    "auto",
    padding:      "24px 28px",
  };

  if (loading && !status) {
    return (
      <div style={{ ...containerStyle, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ color: C.dim, letterSpacing: "0.14em", animation: "pulse 1.5s infinite" }}>
          LOADING ENGINE STATUS…
        </span>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <style>{KEYFRAMES}</style>

      {/* Page title */}
      <div style={{
        display:       "flex",
        alignItems:    "baseline",
        gap:           "16px",
        marginBottom:  "24px",
      }}>
        <h1 style={{
          color:         C.green,
          textShadow:    `0 0 10px ${C.green}60`,
          fontSize:      "18px",
          fontWeight:    700,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          margin:        0,
        }}>
          ⚡ ENGINE DIAGNOSTICS
        </h1>
        <span style={{ color: C.dim, fontSize: "11px", letterSpacing: "0.1em" }}>
          {status?.engine ?? "Combat Terminal"} · v10e
        </span>
        {error && (
          <span style={{ color: C.red, fontSize: "11px" }}>
            API error: {error}
          </span>
        )}
        <button
          onClick={fetchStatus}
          style={{
            marginLeft:    "auto",
            background:    "transparent",
            border:        `1px solid ${C.bordermid}`,
            color:         C.label,
            fontSize:      "10px",
            letterSpacing: "0.1em",
            padding:       "4px 10px",
            cursor:        "pointer",
            fontFamily:    "monospace",
          }}
          onMouseEnter={e => e.currentTarget.style.borderColor = C.green}
          onMouseLeave={e => e.currentTarget.style.borderColor = C.bordermid}
        >
          ↺ REFRESH
        </button>
      </div>

      {/* Sections */}
      <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
        <SystemHealthHeader status={status} lastUpdated={lastUpdated} />
        <DataFlowDiagram pipeline={status?.pipeline} />
        <DataIntegrityGrid perFaction={status?.per_faction} />
        <EngineDocs />
      </div>

      {/* Footer */}
      <div style={{
        marginTop:     "32px",
        paddingTop:    "12px",
        borderTop:     `1px solid ${C.border}`,
        color:         C.dim,
        fontSize:      "10px",
        letterSpacing: "0.08em",
        display:       "flex",
        justifyContent: "space-between",
      }}>
        <span>Auto-refreshes every 4 seconds</span>
        <span>Type  help  in any terminal for commands</span>
      </div>
    </div>
  );
}
