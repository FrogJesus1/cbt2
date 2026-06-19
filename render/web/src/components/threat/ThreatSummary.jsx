/**
 * ThreatSummary
 *
 * Full-width overview header for a faction threat report.
 * Contains three panels side-by-side:
 *   Left:   Unit count + threat distribution numbers
 *   Centre: Unit type skew breakdown (inline bars)
 *   Right:  Roster status — "no roster loaded" placeholder or filtered unit count
 *
 * Plus a full-width threat distribution chart row below.
 *
 * Props:
 *   faction      — string  (raw faction id, e.g. "space_marines")
 *   factionLabel — string  (display name, e.g. "Space Marines")
 *   stats        — { unit_count, skew_label, skew_breakdown, threat_dist }
 *   rosterLoaded — boolean
 *   detachment   — string | null
 */

import { C, CARD_STYLE, CARD_PAD, SectionTitle, Card, CardContent, THREAT_COLORS, THREAT_LABELS } from "./shared";

// ─── Left panel: counts ────────────────────────────────────────────────────

function ThreatCounts({ unitCount = 0, threatDist = {} }) {
  const high = threatDist.high   ?? 0;
  const med  = threatDist.medium ?? 0;
  const low  = threatDist.low    ?? 0;

  return (
    <Card style={{ ...CARD_STYLE, flex: "1 1 0" }}>
      <CardContent style={CARD_PAD}>
        <SectionTitle>Units Loaded</SectionTitle>

        <div style={{ color: C.green, fontSize: "28px", fontWeight: 700, fontFamily: "monospace", lineHeight: 1, marginBottom: "10px", textShadow: `0 0 10px ${C.green}40` }}>
          {unitCount}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          {[
            { key: "high",   label: "HIGH",   count: high, color: THREAT_COLORS.high   },
            { key: "medium", label: "MED",    count: med,  color: THREAT_COLORS.medium },
            { key: "low",    label: "LOW",    count: low,  color: THREAT_COLORS.low    },
          ].map(({ key, label, count, color }) => (
            <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color, fontSize: "10px", fontWeight: 700, letterSpacing: "0.12em" }}>
                {label}
              </span>
              <span style={{ color, fontSize: "12px", fontWeight: 700, fontFamily: "monospace" }}>
                {count}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Centre panel: skew breakdown ─────────────────────────────────────────

function SkewPanel({ skewLabel = "Mixed", skewBreakdown = [] }) {
  const total = skewBreakdown.reduce((s, b) => s + (b.count ?? 0), 0) || 1;

  const TYPE_COLORS = {
    Infantry: C.green,
    Vehicle:  C.cyan,
    Monster:  C.red,
    Mounted:  C.amber,
    Other:    C.dim,
  };

  return (
    <Card style={{ ...CARD_STYLE, flex: "1.6 1 0" }}>
      <CardContent style={CARD_PAD}>
        <SectionTitle>Army Composition</SectionTitle>

        <div style={{ color: C.mid, fontSize: "11px", fontWeight: 600, marginBottom: "10px", letterSpacing: "0.08em" }}>
          {skewLabel}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {skewBreakdown.slice(0, 5).map((b, i) => {
            const pct   = Math.round((b.count / total) * 100);
            const color = TYPE_COLORS[b.type] ?? C.label;
            return (
              <div key={i}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                  <span style={{ color, fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em" }}>
                    {b.type}
                  </span>
                  <span style={{ color: C.dim, fontSize: "10px", fontFamily: "monospace" }}>
                    {b.count}
                  </span>
                </div>
                <div style={{ position: "relative", height: "4px", background: C.track, borderRadius: "2px", overflow: "hidden" }}>
                  <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${pct}%`, background: color, borderRadius: "2px" }} />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Right panel: roster status ─────────────────────────────────────────────

function RosterStatus({ rosterLoaded = false, detachment = null, unitCount = 0 }) {
  return (
    <Card style={{
      ...CARD_STYLE,
      flex:   "1 1 0",
      border: `1px solid ${rosterLoaded ? C.bordermid : C.border}`,
    }}>
      <CardContent style={CARD_PAD}>
        <SectionTitle>Roster Filter</SectionTitle>

        {rosterLoaded ? (
          <div>
            <div style={{ color: C.green, fontSize: "11px", fontWeight: 600, marginBottom: "6px" }}>
              ✓ Roster loaded
            </div>
            {detachment && (
              <div style={{ color: C.mid, fontSize: "11px", marginBottom: "4px" }}>
                Detachment: <span style={{ color: C.amber }}>{detachment}</span>
              </div>
            )}
            <div style={{ color: C.label, fontSize: "11px" }}>
              {unitCount} unit{unitCount !== 1 ? "s" : ""} filtered
            </div>
          </div>
        ) : (
          <div>
            <div style={{
              display:       "flex",
              flexDirection: "column",
              alignItems:    "center",
              gap:           "8px",
              padding:       "8px 0",
            }}>
              <div style={{
                width:        "32px",
                height:       "32px",
                border:       `1px dashed ${C.border}`,
                display:      "flex",
                alignItems:   "center",
                justifyContent: "center",
                color:        C.dim,
                fontSize:     "16px",
              }}>
                ⊘
              </div>
              <div style={{ color: C.dim, fontSize: "11px", textAlign: "center", lineHeight: "1.6" }}>
                No roster loaded.
                <br />
                Showing full faction.
              </div>
              <div style={{
                color:         C.label,
                fontSize:      "10px",
                textAlign:     "center",
                letterSpacing: "0.06em",
                lineHeight:    "1.5",
              }}>
                Run <span style={{ color: C.mid }}>enemy &lt;faction&gt;</span>
                <br />
                to set detachment filter.
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Bottom: threat distribution chart ────────────────────────────────────

function ThreatDistChart({ threatDist = {}, unitCount = 0 }) {
  const total = unitCount || 1;
  const high  = threatDist.high   ?? 0;
  const med   = threatDist.medium ?? 0;
  const low   = threatDist.low    ?? 0;

  const bars = [
    { label: "HIGH",   count: high, color: THREAT_COLORS.high,   pct: Math.round((high / total) * 100) },
    { label: "MEDIUM", count: med,  color: THREAT_COLORS.medium, pct: Math.round((med  / total) * 100) },
    { label: "LOW",    count: low,  color: THREAT_COLORS.low,    pct: Math.round((low  / total) * 100) },
  ];

  return (
    <Card style={CARD_STYLE}>
      <CardContent style={CARD_PAD}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
          <SectionTitle>Threat Distribution</SectionTitle>
          <span style={{ color: C.dim, fontSize: "10px", letterSpacing: "0.1em" }}>
            BY UNIT COUNT
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
          {bars.map(({ label, count, color, pct }) => (
            <div key={label} style={{ display: "grid", gridTemplateColumns: "60px 1fr 48px", alignItems: "center", gap: "10px" }}>
              <span style={{ color, fontSize: "10px", fontWeight: 700, letterSpacing: "0.12em" }}>{label}</span>
              <div style={{ position: "relative", height: "8px", background: C.track, borderRadius: "3px", overflow: "hidden" }}>
                <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${pct}%`, background: color, borderRadius: "3px", transition: "width 0.4s" }} />
              </div>
              <span style={{ color, fontSize: "11px", fontFamily: "monospace", textAlign: "right" }}>
                {count} <span style={{ color: C.dim, fontSize: "10px" }}>({pct}%)</span>
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── ThreatSummary ────────────────────────────────────────────────────────

export function ThreatSummary({ faction, factionLabel, stats = {}, rosterLoaded = false, detachment = null }) {
  const {
    unit_count      = 0,
    skew_label      = "Mixed",
    skew_breakdown  = [],
    threat_dist     = {},
  } = stats;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>

      {/* Top row: three info panels */}
      <div style={{ display: "flex", gap: "6px", alignItems: "stretch" }}>
        <ThreatCounts    unitCount={unit_count} threatDist={threat_dist} />
        <SkewPanel       skewLabel={skew_label} skewBreakdown={skew_breakdown} />
        <RosterStatus    rosterLoaded={rosterLoaded} detachment={detachment} unitCount={unit_count} />
      </div>

      {/* Bottom: distribution chart */}
      <ThreatDistChart threatDist={threat_dist} unitCount={unit_count} />

    </div>
  );
}
