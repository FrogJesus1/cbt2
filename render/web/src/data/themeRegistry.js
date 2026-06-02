/**
 * Theme Registry
 *
 * Single source of truth for all available UI themes.
 * Each theme maps to a data-theme attribute value on the root div (App.jsx).
 *
 * Three themes — all always available, no unlock system.
 *   dark    — phosphor green on near-black (default)
 *   light   — light background variant
 *   console — pure monospace retro terminal
 */

export const THEME_REGISTRY = {
  dark: {
    id:          "dark",
    label:       "DARK",
    description: "Phosphor green on near-black — standard CRT terminal",
  },
  light: {
    id:          "light",
    label:       "LIGHT",
    description: "Light background — high contrast for bright environments",
  },
  console: {
    id:          "console",
    label:       "CONSOLE",
    description: "Pure retro — monospace only, phosphor green, no chrome",
  },
};

/** All available theme IDs. */
export const ALL_THEME_IDS = Object.keys(THEME_REGISTRY);
