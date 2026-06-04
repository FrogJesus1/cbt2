/**
 * rosterParse.js — shared roster-text parser
 *
 * Single source of truth for turning raw CT-export roster text into a flat
 * unit list. Used by the Terminal (roster_context payload) and the Crusade
 * Tracker's Order-of-Battle import flow, so both parse roster text identically.
 */

/**
 * Parse raw roster text content (CT export format) into a flat unit list.
 *
 * Handles lines like:
 *   "3x Crisis Fireknife Battlesuits (120 pts)"
 *   "Char1: 1x Commander Farsight (85 pts): Warlord, ..."
 *   "1x Ghostkeel Battlesuit (160 pts): ..."
 *
 * Skips: blank lines, # comments, + section headers, • sub-model bullets,
 *        indented continuation lines, enhancement lines.
 *
 * @param {{ faction?: string, content?: string }} roster
 * @returns {Array<{
 *   name: string, faction: string, models: number,
 *   weapons: string[], is_leader: boolean, points: number|null,
 *   attached_to: string|null, nickname: string|null,
 * }>}
 */
export function parseRosterUnits(roster) {
  if (!roster?.content) return [];
  const { faction, content } = roster;

  // ── First pass: extract embedded metadata lines ─────────────────────────
  // Format: # @nickname:idx:value  or  # @attach:leaderName:unitName
  const embeddedNicknames = {};   // idx → string
  const embeddedAttach = {};      // leaderName → unitName
  const lines = content.split("\n");
  for (const rawLine of lines) {
    const line = rawLine.trim();
    const nickMatch = line.match(/^#\s*@nickname:(\d+):(.+)/);
    if (nickMatch) {
      embeddedNicknames[parseInt(nickMatch[1], 10)] = nickMatch[2].trim();
      continue;
    }
    const attachMatch = line.match(/^#\s*@attach:([^:]+):(.+)/);
    if (attachMatch) {
      embeddedAttach[attachMatch[1].trim()] = attachMatch[2].trim();
      continue;
    }
  }

  // ── Second pass: parse units ────────────────────────────────────────────
  const units = [];
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    // Skip comments (including our metadata lines), headers, bullets, enhancements
    if (
      line.startsWith("#") ||
      line.startsWith("+") ||
      line.startsWith("•") ||
      line.startsWith("-") ||
      line.toLowerCase().startsWith("enhancement:")
    ) continue;
    // Detect leader prefix (CharN:)
    const isLeader = /^Char\d+:/i.test(line);
    // Strip optional "Char1: " / "CharN: " prefix (character unit entries)
    const stripped = line.replace(/^Char\d+:\s*/i, "");
    // Match the leading "Nx" count: "3x Crisis Fireknife Battlesuits (120 pts): ..."
    const m = stripped.match(/^(\d+)[xX×]\s+([^(:\n]+)/);
    if (m) {
      const models = parseInt(m[1], 10);
      const name   = m[2].trim();
      if (!name) continue;

      // Extract points: "... (120 pts)" or "(120pts)"
      let points = null;
      const ptsMatch = stripped.match(/\((\d+)\s*pts?\)/i);
      if (ptsMatch) points = parseInt(ptsMatch[1], 10);

      // Extract weapons: everything after the colon that follows the points/name
      let weapons = [];
      const colonIdx = stripped.indexOf(":", (ptsMatch ? ptsMatch.index : name.length));
      if (colonIdx !== -1) {
        const weaponStr = stripped.slice(colonIdx + 1).trim();
        if (weaponStr) {
          weapons = weaponStr.split(",").map(w => {
            return w.trim().replace(/^\d+[xX×]\s*/, "").trim();
          }).filter(Boolean);
        }
      }

      const idx = units.length;
      const nickname = embeddedNicknames[idx] || null;
      const attached_to = (isLeader && embeddedAttach[name]) ? embeddedAttach[name] : null;

      units.push({
        name, faction: faction || "", models, weapons,
        is_leader: isLeader, points, attached_to, nickname,
      });
    }
  }
  return units;
}

export default parseRosterUnits;
