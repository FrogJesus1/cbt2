/**
 * VerdictSummary
 *
 * Closing summary of a combat result: big slain number · plain-language verdict
 * · survivors N/M. There is no server "verdict" field — everything here is
 * derived from expected_kills + the real defender model count (def_models).
 * Stays honest: survivors uses the actual squad size, never a hardcoded /5.
 *
 * Props: ranged, melee (summary objects | null), def_models (number)
 */

import { C } from "./shared";

export function VerdictSummary({ ranged, melee, def_models }) {
  const r = ranged || {};
  const m = melee || {};

  let slain = (r.expected_kills ?? 0) + (m.expected_kills ?? 0);
  const haveModels = def_models != null && def_models > 0;
  if (haveModels) slain = Math.min(slain, def_models);

  const survivors = haveModels ? Math.max(0, def_models - slain) : null;
  const ratio = haveModels ? slain / def_models : 0;

  let verdict;
  if (!haveModels) {
    verdict = "Expected casualties for the matchup as configured.";
  } else if (ratio >= 0.999) {
    verdict = "Squad wiped — the target is destroyed outright.";
  } else if (ratio >= 0.5) {
    verdict = `Heavy losses — over half the squad falls (${Math.round(survivors)} of ${def_models} hold).`;
  } else if (slain >= 0.5) {
    verdict = `Target holds — ${Math.round(survivors)} of ${def_models} survive. Commit more to break it.`;
  } else {
    verdict = "Negligible — the target shrugs this off.";
  }

  return (
    <div style={{
      display:       "flex",
      alignItems:    "center",
      gap:           "14px",
      padding:       "12px 14px",
      border:        `1px solid color-mix(in srgb, ${C.green} 27%, transparent)`,
      borderRadius:  "5px",
      background:    `rgba(var(--ct-glow-rgb), 0.05)`,
    }}>
      <div style={{ flexShrink: 0, textAlign: "center", minWidth: "70px" }}>
        <div
          className="ct-display"
          style={{ color: C.green, fontSize: "30px", fontWeight: 700, lineHeight: 1, textShadow: `0 0 12px color-mix(in srgb, ${C.green} 33%, transparent)` }}
        >
          {slain.toFixed(1)}
        </div>
        <div className="ct-display" style={{ color: C.dim, fontSize: "8px", letterSpacing: "0.12em", marginTop: "3px" }}>
          Slain
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="ct-display" style={{ color: C.accent, fontSize: "9px", letterSpacing: "0.12em", marginBottom: "3px" }}>
          Verdict
        </div>
        <div style={{ color: C.text, fontSize: "12px", lineHeight: 1.5 }}>
          {verdict}
        </div>
      </div>

      {survivors != null && (
        <div style={{ flexShrink: 0, textAlign: "right" }}>
          <div className="ct-display" style={{ color: C.dim, fontSize: "8px", letterSpacing: "0.12em" }}>
            Survivors
          </div>
          <div style={{ color: C.text, fontSize: "15px", fontWeight: 600, marginTop: "2px" }}>
            {Math.round(survivors)}<span style={{ color: C.dim }}>/{def_models}</span>
          </div>
        </div>
      )}
    </div>
  );
}
