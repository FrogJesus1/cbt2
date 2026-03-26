/**
 * SimulationConfidence
 *
 * Renders Monte Carlo run metadata or an explicit OFFLINE warning when the
 * simulation engine fell back to deterministic averages.
 *
 * Props:
 *   sim — the `simulation` block from a combat result:
 *         {
 *           status:       "ACTIVE" | "OFFLINE",
 *           mode:         "monte_carlo" | "deterministic",
 *           iterations:   number | null,
 *           error_margin: number | null,   // % (95 CI half-width)
 *           confidence:   "Very High" | "High" | "Medium" | "Low" | null,
 *           covers:       string[],
 *           message:      string | null,   // present when OFFLINE
 *         }
 */

import { Card, CardContent } from "@/components/ui/card";
import { C, CARD_STYLE, CARD_PAD, Bar, SectionTitle } from "./shared";

const CONFIDENCE_LEVELS = { "Very High": 100, "High": 75, "Medium": 50, "Low": 25 };

// ── Offline banner ─────────────────────────────────────────────────────────────

function OfflineBanner({ message }) {
  return (
    <Card style={{ ...CARD_STYLE, border: `1px solid ${C.amber}40` }}>
      <CardContent style={{ ...CARD_PAD, fontSize: "12px" }}>
        <SectionTitle>Simulation Confidence</SectionTitle>

        {/* OFFLINE badge */}
        <div style={{
          display:        "flex",
          alignItems:     "center",
          gap:            "10px",
          padding:        "10px 12px",
          background:     "#1a0d00",
          border:         `1px solid ${C.amber}50`,
          borderRadius:   "0",
          marginBottom:   "10px",
        }}>
          <div style={{
            width:            "10px",
            height:           "10px",
            borderRadius:     "50%",
            background:       C.amber,
            boxShadow:        `0 0 8px ${C.amber}`,
            flexShrink:       0,
            animation:        "pulse 1.5s ease-in-out infinite",
          }} />
          <span style={{
            color:         C.amber,
            fontWeight:    700,
            letterSpacing: "0.14em",
            fontSize:      "11px",
            textTransform: "uppercase",
          }}>
            DETERMINISTIC MODE · MC OFFLINE
          </span>
        </div>

        {/* Explanation */}
        <div style={{
          color:       C.label,
          lineHeight:  "1.6",
          fontSize:    "11px",
          fontStyle:   "italic",
          paddingLeft: "4px",
        }}>
          Simulation Engine Offline: Showing Deterministic Averages.
          Results are fixed expected-value calculations — accurate but do not
          capture variance, swinginess, or low-probability spike outcomes.
        </div>

        {/* Tooltip row */}
        <div style={{
          display:      "flex",
          gap:          "20px",
          marginTop:    "10px",
          paddingTop:   "8px",
          borderTop:    `1px solid ${C.border}`,
          fontSize:     "10px",
          color:        C.dim,
          letterSpacing: "0.06em",
        }}>
          <span title="All numbers shown are the mathematical expectation (mean) of each dice chain.">
            Deterministic = Fixed Mean
          </span>
          <span style={{ color: C.bordermid }}>·</span>
          <span title="Monte Carlo simulates 5,000 full combat sequences to capture variance and tail outcomes.">
            Monte Carlo = 5,000-Iteration Variance
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Active panel ───────────────────────────────────────────────────────────────

function ActivePanel({ sim }) {
  const confPct = CONFIDENCE_LEVELS[sim.confidence] ?? 0;

  return (
    <Card style={CARD_STYLE}>
      <CardContent style={{ ...CARD_PAD, fontSize: "13px" }}>
        <SectionTitle>Simulation Confidence</SectionTitle>

        {/* MC ACTIVE badge */}
        <div style={{
          display:      "flex",
          alignItems:   "center",
          gap:          "8px",
          marginBottom: "12px",
        }}>
          <div style={{
            width:        "8px",
            height:       "8px",
            borderRadius: "50%",
            background:   C.green,
            boxShadow:    `0 0 6px ${C.green}`,
            flexShrink:   0,
          }} />
          <span style={{
            color:         C.green,
            fontWeight:    700,
            fontSize:      "11px",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}>
            MONTE CARLO · ACTIVE
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "130px 1fr", gap: "5px 10px" }}>
          <span style={{ color: C.label, fontWeight: 600 }}>Iterations</span>
          <span style={{ color: C.mid }}>{sim.iterations?.toLocaleString() ?? "—"}</span>

          <span style={{ color: C.label, fontWeight: 600 }}>Error Margin</span>
          <span style={{ color: C.mid }}>
            {sim.error_margin !== null && sim.error_margin !== undefined
              ? `±${sim.error_margin}% (95% CI)`
              : "—"}
          </span>

          <span style={{ color: C.label, fontWeight: 600 }}>Confidence</span>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ flex: 1 }}>
              <Bar value={confPct} max={100} color={C.green} />
            </div>
            <span style={{
              color:       C.green,
              textShadow:  `0 0 4px ${C.green}60`,
              whiteSpace:  "nowrap",
            }}>
              {sim.confidence ?? "—"}
            </span>
          </div>
        </div>

        {sim.covers?.length > 0 && (
          <div style={{ color: C.label, marginTop: "8px", fontSize: "11px" }}>
            MC covers: {sim.covers.join(" · ")}
          </div>
        )}

        {/* Tooltip row */}
        <div style={{
          display:      "flex",
          gap:          "20px",
          marginTop:    "8px",
          paddingTop:   "6px",
          borderTop:    `1px solid ${C.border}`,
          fontSize:     "10px",
          color:        C.dim,
          letterSpacing: "0.06em",
        }}>
          <span title="All numbers shown are the mathematical expectation (mean) of each dice chain.">
            Deterministic = Fixed Mean
          </span>
          <span style={{ color: C.bordermid }}>·</span>
          <span title="Monte Carlo simulates 5,000 full combat sequences to capture variance and tail outcomes.">
            Monte Carlo = 5,000-Iteration Variance
          </span>
        </div>

        <div style={{ color: C.dim, marginTop: "4px", fontSize: "11px", fontStyle: "italic" }}>
          Lower error = more reliable · ≤1% is Very High
        </div>
      </CardContent>
    </Card>
  );
}

// ── Export ─────────────────────────────────────────────────────────────────────

export function SimulationConfidence({ sim }) {
  if (!sim) return null;
  if (sim.status === "OFFLINE" || sim.mode === "deterministic") {
    return <OfflineBanner message={sim.message} />;
  }
  return <ActivePanel sim={sim} />;
}
