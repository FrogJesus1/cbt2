/**
 * session.js — per-tab client session token (P0-2)
 *
 * The backend keys all engine session state (active faction, disambiguation,
 * last combat, loaded rosters) by this token so two browser tabs — or two
 * people on one deploy — never corrupt each other's state.
 *
 * Stored in sessionStorage, so it is:
 *   - unique per browser tab (two tabs = two isolated sessions),
 *   - stable across reloads of that tab.
 */

const SESSION_KEY = "ct_session_id";

function _randomId() {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {}
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getSessionId() {
  try {
    let sid = sessionStorage.getItem(SESSION_KEY);
    if (!sid) {
      sid = _randomId();
      sessionStorage.setItem(SESSION_KEY, sid);
    }
    return sid;
  } catch {
    // Private mode / storage disabled — fall back to a per-load id so the app
    // still works (isolation is best-effort in that case).
    if (!globalThis.__ctSessionId) globalThis.__ctSessionId = _randomId();
    return globalThis.__ctSessionId;
  }
}
