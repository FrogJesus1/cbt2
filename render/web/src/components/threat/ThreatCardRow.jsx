/**
 * ThreatCardRow
 *
 * One collapsible row in the threat index.
 * Collapsed:  unit name + threat badge + 3 micro metric bars (Threat/Dur/Dmg)
 * Expanded:   slim teaser — threat metrics + profile + top counter + a
 *             "run threat <unit>" hint that opens the full single-unit dossier.
 *
 * All units start collapsed; click a row to expand.
 *
 * Props:
 *   unitData  — threat_card data shape (same as ThreatCard expects)
 *   index     — number (for numbered label)
 *   onSubmit  — (cmd: string) => void  (optional)
 */

import { useState } from "react";
import { C, THREAT_COLORS, THREAT_LABELS, METRICS, Bar } from "./shared";

// Profile stat order for the slim expanded teaser
const PROFILE_ORDER = ["T", "Sv", "W", "M", "OC"];

// Small dim uppercase label used inside the expanded teaser
const MINI_LABEL = { fontSize: "9px", letterSpacing: "0.12em", color: C.dim, textTransform: "uppercase", marginBottom: "9px" };

// ─── Micro bar — compact 3px bar for collapsed header ─────────────────────

function MicroBar({ pct, color }) {
  return (
    <div style={{ position: "relative", width: "46px", height: "3px", background: C.track, borderRadius: "2px", overflow: "hidden", flexShrink: 0 }}>
      <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${Math.min(100, pct)}%`, background: color, borderRadius: "2px" }} />
    </div>
  );
}

// ─── Collapsed header ─────────────────────────────────────────────────────

function CollapsedHeader({ unitData, index, open, onToggle, onInject }) {
  const { name = "", threat_level = "low", metrics = {} } = unitData;
  const lvlColor = THREAT_COLORS[threat_level] ?? C.dim;
  const lvlLabel = THREAT_LABELS[threat_level] ?? threat_level.toUpperCase();

  // Show top 3 metrics inline
  const topMetrics = METRICS.slice(0, 3);

  return (
    <div
      onClick={onToggle}
      style={{
        display:      "flex",
        alignItems:   "center",
        gap:          "12px",
        padding:      "9px 14px",
        cursor:       "pointer",
        userSelect:   "none",
        background:   open ? `${lvlColor}08` : "transparent",
        borderBottom: open ? `1px solid ${lvlColor}30` : "none",
        transition:   "background 0.15s",
      }}
      onMouseEnter={e => { if (!open) e.currentTarget.style.background = `${lvlColor}06`; }}
      onMouseLeave={e => { if (!open) e.currentTarget.style.background = "transparent"; }}
    >

      {/* Index number */}
      <span style={{ color: C.dim, fontSize: "10px", fontFamily: "monospace", minWidth: "18px", flexShrink: 0 }}>
        {String(index).padStart(2, "0")}
      </span>

      {/* Threat level colour tab */}
      <div style={{ width: "3px", height: "22px", background: lvlColor, flexShrink: 0, borderRadius: "1px" }} />

      {/* Unit name — clickable to run spec lookup (stops row toggle propagation) */}
      <span
        onClick={onInject ? (e) => { e.stopPropagation(); onInject(`spec ${name}`); } : undefined}
        style={{
          color:         lvlColor,
          fontWeight:    700,
          fontSize:      "13px",
          flex:          1,
          letterSpacing: "0.04em",
          overflow:      "hidden",
          textOverflow:  "ellipsis",
          whiteSpace:    "nowrap",
          cursor:        onInject ? "pointer" : "inherit",
          textDecoration: onInject ? "none" : "none",
        }}
        onMouseEnter={onInject ? (e) => { e.currentTarget.style.textDecoration = "underline"; e.stopPropagation(); } : undefined}
        onMouseLeave={onInject ? (e) => { e.currentTarget.style.textDecoration = "none"; } : undefined}
        title={onInject ? `Look up: spec ${name}` : undefined}
      >
        {(name || "—").toUpperCase()}
      </span>

      {/* Micro metric bars */}
      <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
        {topMetrics.map(({ key, label, color }) => (
          <div key={key} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
            <span style={{ color: C.dim, fontSize: "9px", letterSpacing: "0.06em" }}>{label}</span>
            <MicroBar pct={metrics[key] ?? 0} color={color} />
          </div>
        ))}
      </div>

      {/* Threat badge */}
      <span style={{
        color:         lvlColor,
        fontSize:      "9px",
        fontWeight:    700,
        letterSpacing: "0.14em",
        border:        `1px solid ${lvlColor}50`,
        padding:       "1px 6px",
        background:    `${lvlColor}0e`,
        flexShrink:    0,
      }}>
        {lvlLabel}
      </span>

      {/* Toggle arrow */}
      <span style={{ color: C.dim, fontSize: "9px", flexShrink: 0, width: "10px" }}>
        {open ? "▲" : "▼"}
      </span>

    </div>
  );
}

// ─── Slim expanded teaser ──────────────────────────────────────────────────
// Metrics + profile + top counter + a "run threat <unit>" hint to open the
// full single-unit dossier. (The full dossier is the threat <unit> view.)

function SlimExpanded({ unitData, onInject }) {
  const { name = "", metrics = {}, profile = {}, counters = [] } = unitData;
  const profileKeys = PROFILE_ORDER.filter(k => k in profile);
  const topCounter  = counters[0];

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: "16px" }}>

        {/* Threat metrics */}
        <div>
          <div style={MINI_LABEL}>Threat Metrics</div>
          {METRICS.map(({ key, label, color }) => {
            const score = Math.min(100, Math.max(0, Number(metrics[key] ?? 0)));
            return (
              <div key={key} style={{ display: "grid", gridTemplateColumns: "46px 1fr 28px", alignItems: "center", gap: "9px", marginBottom: "7px" }}>
                <span style={{ fontSize: "10px", color: C.bodyDim }}>{label}</span>
                <Bar pct={score} color={color} height={6} />
                <span style={{ fontSize: "10px", color, textAlign: "right", fontWeight: 700 }}>{score}</span>
              </div>
            );
          })}
        </div>

        {/* Profile + top counter */}
        <div>
          {profileKeys.length > 0 && (
            <>
              <div style={MINI_LABEL}>Profile</div>
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${profileKeys.length},1fr)`, border: `1px solid ${C.border}`, marginBottom: "12px" }}>
                {profileKeys.map((k, i) => (
                  <div key={k} style={{ textAlign: "center", padding: "7px 2px", borderRight: i < profileKeys.length - 1 ? `1px solid ${C.border}` : "none" }}>
                    <div style={{ fontSize: "8px", color: C.label, letterSpacing: "0.1em", fontWeight: 700 }}>{k}</div>
                    <div style={{ fontSize: "14px", color: C.green, fontWeight: 700, marginTop: "3px" }}>{String(profile[k])}</div>
                  </div>
                ))}
              </div>
            </>
          )}
          {topCounter && (
            <>
              <div style={MINI_LABEL}>Top Counter</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "4px" }}>
                <span style={{ fontSize: "11px", color: C.green, fontWeight: 600 }}>{topCounter.name}</span>
                <span style={{ fontSize: "11px", color: C.green, fontWeight: 700 }}>{Math.round(Number(topCounter.score ?? 0))}</span>
              </div>
              <Bar pct={Math.min(100, Math.max(0, Number(topCounter.score ?? 0)))} color={C.green} height={5} />
            </>
          )}
        </div>
      </div>

      {/* Run hint → opens the full dossier */}
      <div style={{ marginTop: "11px", fontSize: "10px", color: C.dim, fontStyle: "italic" }}>
        ↳ run{" "}
        <span
          onClick={onInject ? () => onInject(`threat ${name}`) : undefined}
          style={{ color: C.green, cursor: onInject ? "pointer" : "default", fontStyle: "normal" }}
          title={onInject ? `Run: threat ${name}` : undefined}
        >
          threat {name}
        </span>{" "}
        for the full dossier
      </div>
    </div>
  );
}

// ─── ThreatCardRow ────────────────────────────────────────────────────────

export function ThreatCardRow({ unitData, index, onSubmit, onInject }) {
  // All units start collapsed; click to expand for details
  const [open, setOpen] = useState(false);

  const lvlColor = THREAT_COLORS[unitData?.threat_level ?? "low"] ?? C.dim;

  return (
    <div style={{
      border:       `1px solid ${open ? lvlColor + "40" : C.border}`,
      background:   C.panel,
      marginBottom: "4px",
      transition:   "border-color 0.15s",
    }}>

      {/* Collapsed header — always visible; unit name click → spec, rest toggles expand */}
      <CollapsedHeader
        unitData={unitData}
        index={index}
        open={open}
        onToggle={() => setOpen(o => !o)}
        onInject={onInject}
      />

      {/* Expanded body — slim teaser (full dossier via "run threat <unit>") */}
      {open && (
        <div style={{ padding: "12px 14px", borderTop: `1px solid ${lvlColor}20` }}>
          <SlimExpanded unitData={unitData} onInject={onInject} />
        </div>
      )}

    </div>
  );
}
