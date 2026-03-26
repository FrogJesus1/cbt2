/**
 * Theme Registry
 *
 * Single source of truth for all available UI themes.
 * Each theme maps to a data-theme attribute value on the root div (App.jsx).
 *
 * Adding a new theme:
 *   1. Add an entry here with the theme metadata.
 *   2. Add a [data-theme="<id>"] CSS block in index.css with the CT vars.
 *   3. If unlockable, add a matching challenge in challengeRegistry.js.
 *   4. That's it — the theme command and unlock flow pick it up automatically.
 *
 * unlockable: false  → available immediately via `theme <id>`
 * unlockable: true   → only available after completing the matching challenge
 */

export const THEME_REGISTRY = {
  default: {
    id:          "default",
    label:       "DEFAULT",
    description: "Phosphor green on near-black — standard CRT terminal",
    unlockable:  false,
  },
  red: {
    id:          "red",
    label:       "RED ALERT",
    description: "Crimson CRT variant — high-threat mode",
    unlockable:  false,
  },
  mainframe: {
    id:          "mainframe",
    label:       "MAINFRAME",
    description: "Total retro — monospace only, pure phosphor green, no chrome",
    unlockable:  true,
  },
  "void-zen": {
    id:          "void-zen",
    label:       "VOID ZEN",
    description: "Minimal silence — dark grey text on near-black, no borders, breathable spacing",
    unlockable:  true,
  },
  "warp-stained": {
    id:          "warp-stained",
    label:       "WARP STAINED",
    description: "Ruinous corruption — neon magenta on deep purple, double borders, offset shadow",
    unlockable:  true,
  },
};

/** IDs of themes that are always available (no unlock required). */
export const BASE_THEME_IDS = Object.values(THEME_REGISTRY)
  .filter(t => !t.unlockable)
  .map(t => t.id);

/** IDs of all themes that CAN be unlocked. */
export const UNLOCKABLE_THEME_IDS = Object.values(THEME_REGISTRY)
  .filter(t => t.unlockable)
  .map(t => t.id);
