/**
 * shared-rosters.js — Shared roster API client
 *
 * All roster storage is server-side and visible to all users.
 * Each roster is tagged with who uploaded it and when.
 */

const API = "/api";

/**
 * Fetch all shared rosters (flat list, sorted by faction then name).
 * Each entry: { id, name, faction, uploaded_by, uploaded_at }
 */
export async function fetchRosters() {
  const res = await fetch(`${API}/rosters`);
  if (!res.ok) throw new Error("Failed to fetch rosters");
  const data = await res.json();
  return data.rosters;
}

/**
 * Fetch rosters grouped by faction.
 * Returns: { "<faction>": [ { id, name, uploaded_by, uploaded_at }, ... ] }
 */
export async function fetchRostersGrouped() {
  const res = await fetch(`${API}/rosters?grouped=true`);
  if (!res.ok) throw new Error("Failed to fetch rosters");
  const data = await res.json();
  return data.rosters;
}

/**
 * Fetch a single roster by ID (includes full content).
 */
export async function fetchRoster(rosterId) {
  const res = await fetch(`${API}/rosters/${rosterId}`);
  if (!res.ok) throw new Error("Roster not found");
  return res.json();
}

/**
 * Find a roster by name (partial, case-insensitive). Returns full roster with content.
 */
export async function findRosterByName(name) {
  const res = await fetch(`${API}/rosters/find`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) return null;
  return res.json();
}

/**
 * Upload a new roster to the shared library.
 */
export async function uploadRoster(name, faction, content, uploadedBy) {
  const res = await fetch(`${API}/rosters`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, faction, content, uploaded_by: uploadedBy }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to upload roster");
  }
  return res.json();
}

/**
 * Delete a shared roster by ID.
 */
export async function deleteSharedRoster(rosterId) {
  const res = await fetch(`${API}/rosters/${rosterId}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete roster");
  return true;
}

/**
 * Labelify a faction slug → display label (e.g. "space-marines" → "Space Marines")
 */
export function labelify(slug) {
  return (slug || "")
    .split("-")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
