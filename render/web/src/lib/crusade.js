/**
 * crusade.js — Crusade Tracker API client
 *
 * Server-side storage of Crusade campaigns and Orders of Battle, mirroring
 * the shared-rosters client. Session 1 (Foundation): campaign create/load
 * plus unit CRUD scaffolding.
 */

const API = "/api/crusade";

async function jsonOrThrow(res, fallback) {
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || fallback);
  }
  return res.json();
}

/** List campaigns, optionally filtered to a single owner. */
export async function listCampaigns(owner) {
  const qs = owner ? `?owner=${encodeURIComponent(owner)}` : "";
  const data = await jsonOrThrow(await fetch(`${API}/campaigns${qs}`), "Failed to load campaigns");
  return data.campaigns;
}

/** Fetch one campaign with its Order of Battle (units[]). */
export async function getCampaign(campaignId) {
  return jsonOrThrow(await fetch(`${API}/campaigns/${campaignId}`), "Campaign not found");
}

/** Create a campaign. */
export async function createCampaign({ name, faction, rp = 5, supplyLimit = 1000, owner = "unknown" }) {
  const res = await fetch(`${API}/campaigns`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, faction, rp, supply_limit: supplyLimit, owner }),
  });
  return jsonOrThrow(res, "Failed to create campaign");
}

/** Patch a campaign with a partial updates object. */
export async function updateCampaign(campaignId, updates) {
  const res = await fetch(`${API}/campaigns/${campaignId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ updates }),
  });
  return jsonOrThrow(res, "Failed to update campaign");
}

/** Delete a campaign (and its units). */
export async function deleteCampaign(campaignId) {
  const res = await fetch(`${API}/campaigns/${campaignId}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete campaign");
  return true;
}

/** List a campaign's units. */
export async function listUnits(campaignId) {
  const data = await jsonOrThrow(await fetch(`${API}/campaigns/${campaignId}/units`), "Failed to load units");
  return data.units;
}

/** Add a unit to a campaign's Order of Battle. */
export async function createUnit(campaignId, unit) {
  const res = await fetch(`${API}/campaigns/${campaignId}/units`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(unit),
  });
  return jsonOrThrow(res, "Failed to add unit");
}

/** Patch a unit with a partial updates object. */
export async function updateUnit(unitId, updates) {
  const res = await fetch(`${API}/units/${unitId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ updates }),
  });
  return jsonOrThrow(res, "Failed to update unit");
}

/** Delete a unit. */
export async function deleteUnit(unitId) {
  const res = await fetch(`${API}/units/${unitId}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete unit");
  return true;
}

/** Faction slug → display label. */
export function labelify(slug) {
  return (slug || "")
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
