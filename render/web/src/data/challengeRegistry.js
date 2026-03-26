/**
 * Challenge Registry
 *
 * Defines the logic-gate challenges that unlock hidden themes.
 * Each challenge is self-contained: it carries its riddle text, the accepted
 * answers, and the theme it unlocks.  The terminal command handler in
 * Terminal.jsx reads from this array — adding a new challenge here (plus one
 * entry in themeRegistry.js and one CSS block in index.css) is the ONLY step
 * required to add a new unlockable theme to the system.
 *
 * Fields:
 *   id              — unique challenge identifier (slug)
 *   riddleText      — the challenge text shown to the user (\n = line break)
 *   correctAnswers  — array of accepted answers; all are matched case-insensitively
 *                     after trimming.  First entry is the canonical answer.
 *   rewardThemeId   — theme ID (matching THEME_REGISTRY) unlocked on success
 *   hint            — optional flavour hint shown alongside the riddle
 */

export const CHALLENGES = [
  // ── Mathematical: Power Cell weight problem ────────────────────────────────
  {
    id:    "power-cells",
    riddleText:
      "LOGIC GATE ACTIVE — SOLVE TO UNLOCK THEME:\n\n" +
      "  A transport carries 3 types of Power Cells: Red, Blue, and Gold.\n" +
      "  2 Reds and 1 Blue weigh the same as 1 Gold.\n" +
      "  1 Red and 1 Gold weigh the same as 4 Blues.\n\n" +
      "  How many Blues weigh the same as 1 Red?\n\n" +
      "  > Enter your answer (a single integer):",
    correctAnswers: ["1"],
    rewardThemeId:  "mainframe",
    hint:           "Set up two simultaneous equations.",
  },

  // ── Zen riddle: The void between keystrokes ────────────────────────────────
  {
    id:    "void-zen",
    riddleText:
      "LOGIC GATE ACTIVE — SOLVE TO UNLOCK THEME:\n\n" +
      "  I have no voice, yet I answer when called.\n" +
      "  I have no form, yet I take the shape of my container.\n" +
      "  I am the silence between the keys.\n\n" +
      "  What am I?\n\n" +
      "  > Enter your answer:",
    correctAnswers: ["space", "void", "nothing"],
    rewardThemeId:  "void-zen",
    hint:           "Think about what separates every word you type.",
  },

  // ── Chaos riddle: The Ruinous Powers ──────────────────────────────────────
  {
    id:    "warp-stained",
    riddleText:
      "LOGIC GATE ACTIVE — SOLVE TO UNLOCK THEME:\n\n" +
      "  I am the god of what has not yet happened.\n" +
      "  I thrive in the change, the rot, and the blood.\n" +
      "  I have a thousand faces, but no reflection.\n\n" +
      "  What is the one thing I cannot do?\n\n" +
      "  > Enter your answer:",
    correctAnswers: ["stay the same", "stagnate", "stop"],
    rewardThemeId:  "warp-stained",
    hint:           "Chaos is defined by what it opposes.",
  },
];

// ── Helper functions ───────────────────────────────────────────────────────────

/**
 * Return the challenge that rewards the given theme, or null if none exists.
 * @param {string} themeId
 * @returns {object|null}
 */
export function getChallengeForTheme(themeId) {
  return CHALLENGES.find(c => c.rewardThemeId === themeId) ?? null;
}

/**
 * Return a random challenge whose reward theme has NOT yet been unlocked.
 * If every challenge's theme is already in unlockedThemeIds, returns null.
 * Falls back to a random challenge from the full pool if no filter is passed.
 *
 * @param {string[]} [unlockedThemeIds=[]] — theme IDs already unlocked
 * @returns {object|null}
 */
export function getNextChallenge(unlockedThemeIds = []) {
  const remaining = CHALLENGES.filter(c => !unlockedThemeIds.includes(c.rewardThemeId));
  if (!remaining.length) return null;
  return remaining[Math.floor(Math.random() * remaining.length)];
}

/**
 * Return a random challenge from the full registry (ignores unlock state).
 * Kept for backward compatibility — prefer getNextChallenge() in most cases.
 * @returns {object|null}
 */
export function getRandomChallenge() {
  if (!CHALLENGES.length) return null;
  return CHALLENGES[Math.floor(Math.random() * CHALLENGES.length)];
}
