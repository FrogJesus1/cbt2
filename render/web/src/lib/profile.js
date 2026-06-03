/**
 * profile.js — Profile API client
 *
 * Talks to /api/profiles endpoints. Also manages the localStorage marker
 * for "last active profile" so the app can auto-login on reload.
 */

const API = "/api";
const PROFILE_KEY = "ct_profile";  // localStorage key for last-used profile name

// ─── API calls ───────────────────────────────────────────────────────────────

export async function fetchProfiles() {
  const res = await fetch(`${API}/profiles`);
  if (!res.ok) throw new Error("Failed to fetch profiles");
  const data = await res.json();
  return data.profiles;
}

export async function createProfile(name, pin = null) {
  const res = await fetch(`${API}/profiles`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, pin: pin || null }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to create profile");
  }
  return res.json();
}

export async function loginProfile(name, pin = null) {
  const res = await fetch(`${API}/profiles/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, pin: pin || null }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Login failed");
  }
  return res.json();
}

export async function saveProfileState(name, state) {
  const res = await fetch(`${API}/profiles/state`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, state }),
  });
  if (!res.ok) throw new Error("Failed to save profile state");
  return res.json();
}

// ─── Local marker (which profile was last active on this device) ─────────

export function getLastProfile() {
  try { return localStorage.getItem(PROFILE_KEY) || null; }
  catch { return null; }
}

export function setLastProfile(name) {
  try { localStorage.setItem(PROFILE_KEY, name); } catch {}
}

export function clearLastProfile() {
  try { localStorage.removeItem(PROFILE_KEY); } catch {}
}

// ─── State hydration helpers ─────────────────────────────────────────────────

const CT_ACTIVE_KEY  = "ct_active_theme";
const CT_HISTORY_KEY = "ct_cmd_history";
const CT_STARRED_KEY = "ct_starred_units";
const VFS_KEY        = "ct_vfs_v1";

/**
 * Write server profile state into localStorage so the rest of the app
 * (which reads localStorage) picks it up immediately.
 */
export function hydrateFromProfile(state) {
  try {
    if (state.theme)            localStorage.setItem(CT_ACTIVE_KEY, state.theme);
    if (state.command_history)  localStorage.setItem(CT_HISTORY_KEY, JSON.stringify(state.command_history));
    if (state.starred_units)    localStorage.setItem(CT_STARRED_KEY, JSON.stringify(state.starred_units));
    if (state.vfs)              localStorage.setItem(VFS_KEY, JSON.stringify(state.vfs));
  } catch {}
}

/**
 * Read current localStorage state into a profile-save payload.
 */
export function collectCurrentState() {
  try {
    return {
      theme:           localStorage.getItem(CT_ACTIVE_KEY) || "dark",
      command_history: JSON.parse(localStorage.getItem(CT_HISTORY_KEY) || "[]"),
      starred_units:   JSON.parse(localStorage.getItem(CT_STARRED_KEY) || "[]"),
      vfs:             JSON.parse(localStorage.getItem(VFS_KEY) || '{"rosters":{},"campaigns":{}}'),
    };
  } catch {
    return { theme: "dark", starred_units: [], command_history: [], vfs: { rosters: {}, campaigns: {} } };
  }
}
