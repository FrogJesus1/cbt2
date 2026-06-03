/**
 * Theme Registry
 *
 * Single source of truth for all available UI themes.
 * Each theme maps to a data-theme attribute value on the root div (App.jsx).
 *
 * Six themes — all always available, no unlock system.
 *   dark          — phosphor green on near-black (default)
 *   light         — light background variant
 *   console       — pure monospace retro terminal
 *   chaos-daemons — blood-red / warp-purple
 *   dark-angels   — deep forest green / bone
 *   orks          — grimy yellow-green / rust
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
    description: "Pure retro — amber phosphor on black, monospace only, no chrome",
  },
  "chaos-daemons": {
    id:          "chaos-daemons",
    label:       "CHAOS DAEMONS",
    description: "Blood-red and warp-purple on void black — daemonic corruption",
  },
  "dark-angels": {
    id:          "dark-angels",
    label:       "DARK ANGELS",
    description: "Deep forest green and bone-white — the Unforgiven",
  },
  "orks": {
    id:          "orks",
    label:       "ORKS",
    description: "Grimy yellow-green and rust — brutal, loud, orky",
  },
};

/** All available theme IDs. */
export const ALL_THEME_IDS = Object.keys(THEME_REGISTRY);
