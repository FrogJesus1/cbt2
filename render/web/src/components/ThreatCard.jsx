/**
 * ThreatCard
 *
 * Composer for threat_card results — assembles sub-components into the
 * full threat analysis layout. Mirrors the pattern of SpecBlock / CombatBlock.
 *
 * Sub-components live in threat/:
 *   threat/shared.jsx         — tokens, Card shell, Bar, SectionTitle
 *   threat/ThreatBanner.jsx   — unit name + threat level badge
 *   threat/MetricBars.jsx     — 5-metric bar chart (Threat/Dur=red, Dmg/Mob/Buff=cyan)
 *   threat/CounterBlock.jsx   — top-3 counter picks with green bars
 *
 * Layout:
 *   ThreatBanner                       ← full width
 *   MetricBars | CounterBlock          ← side by side (counters hidden if show_counters=false)
 *   Profile stat boxes                 ← full width
 *   Keywords chip cloud                ← full width
 *   Abilities list                     ← full width
 *   Enhancement badge                  ← full width (when present)
 *
 * Props:
 *   data     — threat_card result.data from engine
 *   meta     — result.meta (optional)
 *   onSubmit — (cmd: string) => void  (optional — enables clickable items)
 */

// ─── Re-exports ─────────────────────────────────────────────────────────────

export { ThreatBanner }   from "./threat/ThreatBanner";
export { MetricBars }     from "./threat/MetricBars";
export { CounterBlock }   from "./threat/CounterBlock";

// ─── Imports for the composer ────────────────────────────────────────────────

import { useState }       from "react";
import { ThreatBanner }   from "./threat/ThreatBanner";
import { MetricBars }     from "./threat/MetricBars";
import { CounterBlock }   from "./threat/CounterBlock";
import { C, CARD_STYLE, CARD_PAD, SectionTitle, Card, CardContent } from "./threat/shared";

// ─── Profile stat boxes ──────────────────────────────────────────────────────

const STAT_ORDER  = ["T", "Sv", "W", "M", "OC"];

function ProfileBox({ statKey, value, isLast }) {
  return (
    <div style={{
      flex:        "1",
      textAlign:   "center",
      padding:     "8px 4px",
      borderRight: isLast ? "none" : `1px solid ${C.border}`,
    }}>
      <div style={{
        color:         C.label,
        fontSize:      "10px",
        fontWeight:    700,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        marginBottom:  "5px",
      }}>
        {statKey}
      </div>
      <div style={{
        color:      C.green,
        fontSize:   "18px",
        fontWeight: 700,
        fontFamily: "monospace",
        lineHeight: 1,
        textShadow: `0 0 6px ${C.green}50`,
      }}>
        {value !== undefined && value !== null ? String(value) : "—"}
      </div>
    </div>
  );
}

function ProfilePanel({ profile = {} }) {
  const statKeys = STAT_ORDER.filter(k => k in profile);
  if (!statKeys.length) return null;

  return (
    <Card style={CARD_STYLE}>
      <CardContent style={CARD_PAD}>
        <SectionTitle>Profile</SectionTitle>
        <div style={{
          display:     "flex",
          borderTop:   `1px solid ${C.border}`,
          borderLeft:  `1px solid ${C.border}`,
        }}>
          {statKeys.map((k, i) => (
            <ProfileBox
              key={k}
              statKey={k}
              value={profile[k]}
              isLast={i === statKeys.length - 1}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Keywords chips ──────────────────────────────────────────────────────────

function KeywordChips({ keywords = [], onSubmit }) {
  if (!keywords.length) return null;
  return (
    <Card style={CARD_STYLE}>
      <CardContent style={CARD_PAD}>
        <SectionTitle>Keywords</SectionTitle>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
          {keywords.map((kw, i) => (
            <span
              key={i}
              onClick={() => onSubmit?.(`search ${kw}`)}
              style={{
                color:         C.cyan,
                fontSize:      "11px",
                border:        `1px solid ${C.cyan}40`,
                borderRadius:  "3px",
                padding:       "2px 8px",
                cursor:        onSubmit ? "pointer" : "default",
                letterSpacing: "0.04em",
                userSelect:    "none",
                fontFamily:    "monospace",
              }}
            >
              {kw}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Abilities list ──────────────────────────────────────────────────────────

function AbilityRow({ ab, onSubmit, isLast }) {
  const [open, setOpen] = useState(false);

  const name       = typeof ab === "string" ? ab : (ab.name || String(ab));
  const bodyText   = typeof ab === "string" ? null : (ab.description || ab.text || null);
  const expandable = Boolean(bodyText);

  return (
    <div style={{ borderBottom: isLast ? "none" : `1px solid ${C.border}` }}>
      <div
        onClick={() => expandable ? setOpen(o => !o) : onSubmit?.(`ability ${name}`)}
        style={{
          display:    "flex",
          alignItems: "baseline",
          gap:        "8px",
          padding:    "7px 0",
          cursor:     (expandable || onSubmit) ? "pointer" : "default",
          userSelect: "none",
        }}
      >
        <span style={{ color: C.amber, fontSize: "11px", flexShrink: 0 }}>◆</span>
        <span style={{
          color:      C.textMid,
          fontWeight: 600,
          fontSize:   "13px",
          flex:       1,
        }}>
          {name}
        </span>
        {expandable && (
          <span style={{ color: C.dim, fontSize: "10px", flexShrink: 0 }}>
            {open ? "▲" : "▼"}
          </span>
        )}
      </div>
      {expandable && open && (
        <div style={{
          color:      C.label,
          fontSize:   "12px",
          lineHeight: "1.65",
          padding:    "0 0 9px 20px",
        }}>
          {bodyText}
        </div>
      )}
    </div>
  );
}

function AbilitiesPanel({ abilities = [], onSubmit }) {
  if (!abilities.length) return null;
  return (
    <Card style={CARD_STYLE}>
      <CardContent style={CARD_PAD}>
        <SectionTitle>Abilities</SectionTitle>
        <div>
          {abilities.map((ab, i) => (
            <AbilityRow
              key={i}
              ab={ab}
              onSubmit={onSubmit}
              isLast={i === abilities.length - 1}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Enhancement badge ───────────────────────────────────────────────────────

function EnhancementBadge({ enhancement }) {
  if (!enhancement) return null;

  // Accept either a bare name string or { name, effect } / { name, description }.
  const name   = typeof enhancement === "string" ? enhancement : (enhancement.name || "");
  const effect = typeof enhancement === "string" ? null
    : (enhancement.effect || enhancement.description || enhancement.text || null);
  if (!name) return null;

  return (
    <div style={{
      display:      "flex",
      alignItems:   "center",
      gap:          "10px",
      padding:      "11px 16px",
      border:       `1px solid ${C.accent}40`,
      background:   `${C.accent}0c`,
      borderRadius: "5px",
      fontSize:     "12px",
    }}>
      <span style={{ fontSize: "14px" }}>⚡</span>
      <span className="ct-display" style={{ color: C.accent, fontWeight: 700, fontSize: "9px", letterSpacing: "0.14em" }}>
        Enhancement
      </span>
      <span style={{ color: C.textMid }}>
        {name}
      </span>
      {effect && (
        <span style={{ marginLeft: "auto", color: C.dim, fontSize: "10px", fontStyle: "italic" }}>
          {effect}
        </span>
      )}
    </div>
  );
}

// ─── ThreatCard ──────────────────────────────────────────────────────────────

export function ThreatCard({ data, meta, onSubmit, onInject }) {
  if (!data) return null;

  const {
    name          = "",
    threat_level  = "medium",
    metrics       = {},
    profile       = {},
    keywords      = [],
    abilities     = [],
    enhancement   = "",
    counters      = [],
    show_counters = true,
    _stub         = false,
  } = data;

  const hasCounters = show_counters && counters.length > 0;

  return (
    <div
      className="font-mono"
      style={{
        fontSize:      "13px",
        display:       "flex",
        flexDirection: "column",
        gap:           "6px",
      }}
    >

      {/* Stub warning */}
      {_stub && (
        <div style={{
          color:      C.amber,
          fontSize:   "12px",
          border:     `1px solid ${C.amber}40`,
          padding:    "6px 12px",
          background: "#140a00",
        }}>
          ⚠ Stub data — unit not found in loaded data. Add faction JSON for full stats.
        </div>
      )}

      {/* 1. Banner — unit name is clickable → spec lookup */}
      <ThreatBanner name={name} threatLevel={threat_level} onInject={onInject} />

      {/* 2. Metrics + Counters (side by side) */}
      <div style={{ display: "flex", gap: "6px", alignItems: "flex-start" }}>

        {/* MetricBars — takes 3/5 of the row */}
        <div style={{ flex: hasCounters ? "3 1 0" : "1 1 auto" }}>
          <MetricBars metrics={metrics} />
        </div>

        {/* CounterBlock — takes 2/5 when shown */}
        {hasCounters && (
          <div style={{ flex: "2 1 0" }}>
            <CounterBlock counters={counters} onInject={onInject} onSubmit={onSubmit} />
          </div>
        )}

      </div>

      {/* 3. Profile stat row */}
      {Object.keys(profile).length > 0 && (
        <ProfilePanel profile={profile} />
      )}

      {/* 4. Keywords */}
      {keywords.length > 0 && (
        <KeywordChips keywords={keywords} onSubmit={onSubmit} />
      )}

      {/* 5. Abilities */}
      {abilities.length > 0 && (
        <AbilitiesPanel abilities={abilities} onSubmit={onSubmit} />
      )}

      {/* 6. Enhancement */}
      {enhancement && (
        <EnhancementBadge enhancement={enhancement} />
      )}

    </div>
  );
}
