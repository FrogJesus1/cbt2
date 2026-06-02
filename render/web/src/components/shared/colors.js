/**
 * shared/colors.js
 *
 * Single source of truth for the CT colour palette.
 * All colours reference CSS variables so they respond to data-theme changes.
 * Semantic colours (amber, red, orange) are hardcoded — they never theme-shift.
 */

export const C = {
  green:     "var(--ct-primary)",
  mid:       "var(--ct-primary-mid)",
  label:     "var(--ct-primary-label)",
  dim:       "var(--ct-primary-dim)",
  ghost:     "var(--ct-ghost)",
  amber:     "#ffa328",
  yellow:    "#ffd700",
  cyan:      "var(--ct-bar-alt)",
  red:       "#ff3b3b",
  orange:    "#ff6b2b",
  border:    "var(--ct-border)",
  bordermid: "var(--ct-border-bright)",
  panel:     "var(--ct-bg-panel)",
  bg:        "var(--ct-bg)",
  bgDark:    "var(--ct-bg-dark)",
};
