/**
 * Theme Registry
 *
 * Single source of truth for all available UI themes.
 * Each theme maps to a data-theme attribute value on the root div (App.jsx)
 * and a token set in index.css.
 *
 * Redesign theme set (the handoff's six) + console as a bonus:
 *   dark          — Default · phosphor green on slate (the mockup palette)
 *   tau-farsight  — T'au · Farsight Enclave · crimson & flame
 *   orks          — Orks · acid yellow & rust
 *   chaos-daemons — Chaos Daemons · blood-red & warp-purple
 *   dark-angels   — Dark Angels · bone & forest (monastic)
 *   light         — White Scars · Light (inverted light ground)
 *   console       — pure monospace retro amber terminal (bonus)
 */

export const THEME_REGISTRY = {
  dark: {
    id:          "dark",
    label:       "DEFAULT",
    description: "Phosphor green on slate — the standard cogitator terminal",
  },
  "tau-farsight": {
    id:          "tau-farsight",
    label:       "T'AU · FARSIGHT",
    description: "Crimson and flame on black — the Farsight Enclaves",
  },
  "orks": {
    id:          "orks",
    label:       "ORKS",
    description: "Acid yellow and rust — brutal, loud, orky",
  },
  "chaos-daemons": {
    id:          "chaos-daemons",
    label:       "CHAOS DAEMONS",
    description: "Blood-red and warp-purple on void black — daemonic corruption",
  },
  "dark-angels": {
    id:          "dark-angels",
    label:       "DARK ANGELS",
    description: "Bone and forest green — the monastic Unforgiven",
  },
  light: {
    id:          "light",
    label:       "WHITE SCARS · LIGHT",
    description: "White ground with red & gold — high-contrast light mode",
  },
  console: {
    id:          "console",
    label:       "CONSOLE",
    description: "Pure retro — amber phosphor on black, monospace only, no chrome",
  },
};

/** All available theme IDs (used by the theme picker + terminal command validation). */
export const ALL_THEME_IDS = Object.keys(THEME_REGISTRY);

/** Theme IDs shown in any menu that wants to exclude `hidden` themes (none hidden today). */
export const MENU_THEME_IDS = ALL_THEME_IDS.filter(id => !THEME_REGISTRY[id].hidden);
