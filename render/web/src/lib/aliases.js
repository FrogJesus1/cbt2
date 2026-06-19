/**
 * lib/aliases.js — user command aliases (Phase 6, Decision F1).
 *
 * A shorthand the user types that expands to a full command or unit name,
 * applied anywhere in the terminal. Stored client-side in localStorage
 * `ct_aliases` as [{ alias, cmd }]. Distinct from the engine's spelling
 * `term_aliases` (server-side typo correction) — these are user-authored.
 *
 * Expansion happens at the single App command chokepoint (handleGlobalCommand),
 * so typed, injected, and animated commands all benefit. The Settings → Aliases
 * tab is the CRUD surface. Consumers stay in sync via a CustomEvent + storage.
 */

export const CT_ALIASES_KEY = "ct_aliases";
export const ALIASES_EVENT  = "ct-aliases-changed";

export function readAliases() {
  try {
    const raw = JSON.parse(localStorage.getItem(CT_ALIASES_KEY) || "[]");
    if (Array.isArray(raw)) {
      return raw
        .filter((a) => a && a.alias && a.cmd)
        .map((a) => ({ alias: String(a.alias), cmd: String(a.cmd) }));
    }
  } catch { /* storage unavailable / malformed */ }
  return [];
}

export function writeAliases(list) {
  const seen = new Map();
  (Array.isArray(list) ? list : [])
    .map((a) => ({ alias: String(a?.alias ?? "").trim().toLowerCase(), cmd: String(a?.cmd ?? "").trim() }))
    .filter((a) => a.alias && a.cmd)
    .forEach((a) => seen.set(a.alias, a)); // last write wins per alias
  const out = [...seen.values()];
  try { localStorage.setItem(CT_ALIASES_KEY, JSON.stringify(out)); } catch { /* */ }
  try { window.dispatchEvent(new CustomEvent(ALIASES_EVENT, { detail: out })); } catch { /* */ }
  return out;
}

/**
 * Expand `input` against the alias table. Tries a whole-string match first,
 * then a first-token match (so `ds tervigon` → `deep strike tervigon`).
 * Returns the original input unchanged when nothing matches.
 */
export function expandAliases(input, list) {
  const trimmed = String(input ?? "").trim();
  if (!trimmed) return input;
  const table = list || readAliases();
  if (!table.length) return input;
  const map = new Map(table.map((a) => [a.alias.toLowerCase(), a.cmd]));

  const whole = trimmed.toLowerCase();
  if (map.has(whole)) return map.get(whole);

  const sp    = trimmed.search(/\s/);
  const first = (sp === -1 ? trimmed : trimmed.slice(0, sp)).toLowerCase();
  if (map.has(first)) {
    const rest = sp === -1 ? "" : trimmed.slice(sp);
    return map.get(first) + rest;
  }
  return input;
}
