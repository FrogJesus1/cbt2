/**
 * shared/colors.js
 *
 * Single source of truth for the CT colour palette.
 * Every colour references a CSS variable so it responds to data-theme changes.
 *
 * Redesign note: `accent` (gold), `danger` (red) and `cyan` now re-hue per
 * faction theme (they are CSS vars, defined per [data-theme] in index.css).
 * The legacy aliases `amber`/`red` point at the same vars so existing
 * components shift to the new palette without edits.
 */

export const C = {
  // ── primary (theme-driven) ──
  green:     "var(--ct-primary)",
  mid:       "var(--ct-primary-mid)",
  label:     "var(--ct-primary-label)",
  dim:       "var(--ct-primary-dim)",
  ghost:     "var(--ct-ghost)",

  // ── text (near-white body / muted / faint) ──
  text:      "var(--ct-text)",
  textMid:   "var(--ct-text-mid)",
  bodyDim:   "var(--ct-body-dim)",

  // ── semantic accents (theme-driven) ──
  accent:    "var(--ct-accent)",   // gold — section headers, wound bar, points
  amber:     "var(--ct-accent)",   // legacy alias → gold
  danger:    "var(--ct-danger)",   // red — unsaved / kill / critical
  red:       "var(--ct-danger)",   // legacy alias → danger
  cyan:      "var(--ct-cyan)",     // leader / drone / secondary
  leadCyan:  "var(--ct-lead-cyan)",
  warn:      "var(--ct-warn)",     // amber warning (engine degraded etc.)
  improved:  "var(--ct-improved)", // green "stat improved" highlight
  yellow:    "#ffd700",
  orange:    "#ff6b2b",

  // ── surfaces ──
  border:    "var(--ct-border)",
  bordermid: "var(--ct-border-bright)",
  hairline:  "var(--ct-hairline)",
  track:     "var(--ct-track)",
  panel:     "var(--ct-bg-panel)",
  bg:        "var(--ct-bg)",
  bgDark:    "var(--ct-bg-dark)",

  // ── faction tag colours (Units DB / Spec banner / shared rosters) ──
  factionSM:      "var(--ct-faction-sm)",
  factionTau:     "var(--ct-faction-tau)",
  factionNecron:  "var(--ct-faction-necron)",
  factionOrk:     "var(--ct-faction-ork)",
  factionAeldari: "var(--ct-faction-aeldari)",
  factionDG:      "var(--ct-faction-dg)",
};
