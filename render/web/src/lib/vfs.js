/**
 * vfs.js — Virtual Filesystem (localStorage-backed)
 *
 * Provides a simple, flat persistence layer for rosters and campaigns.
 * All data lives in a single localStorage key ("ct_vfs_v1") as JSON.
 *
 * Structure:
 *   {
 *     rosters: {
 *       "<faction>": {
 *         "<name>": { name, faction, content, created_at, updated_at }
 *       }
 *     },
 *     campaigns: {
 *       "<name>": {
 *         config:   { name, created_at, updated_at? },
 *         state:    { turn, player_wins, enemy_wins, notes? },
 *         missions: { "<mission_name>": { ... } }
 *       }
 *     }
 *   }
 *
 * Design rules:
 *   - No backend calls — purely localStorage
 *   - No complex abstractions — plain get/set functions
 *   - Every function is synchronous
 *   - Graceful fallback on corrupt data
 */

const VFS_KEY = "ct_vfs_v1";

// ─── Core read / write ────────────────────────────────────────────────────────

function _load() {
  try {
    const raw = localStorage.getItem(VFS_KEY);
    if (!raw) return { rosters: {}, campaigns: {} };
    const parsed = JSON.parse(raw);
    // Ensure both top-level keys exist even if the stored object is partial
    if (!parsed.rosters)   parsed.rosters   = {};
    if (!parsed.campaigns) parsed.campaigns = {};
    return parsed;
  } catch {
    return { rosters: {}, campaigns: {} };
  }
}

function _save(vfs) {
  try {
    localStorage.setItem(VFS_KEY, JSON.stringify(vfs));
    // Notify profile auto-save (storage event only fires cross-tab)
    window.dispatchEvent(new CustomEvent("ct-state-changed", { detail: { key: VFS_KEY } }));
  } catch (e) {
    console.error("[vfs] failed to write localStorage:", e);
  }
}

// ─── Roster: faction slug helpers ────────────────────────────────────────────

/** Normalise a faction name for use as a VFS key: lowercase, hyphens. */
export function slugify(str) {
  return (str || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

/** Restore a VFS slug to a display label. */
export function labelify(slug) {
  return (slug || "")
    .split("-")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ─── Roster CRUD ──────────────────────────────────────────────────────────────

/**
 * Return all rosters grouped by faction slug.
 *   { "<faction-slug>": { "<name>": rosterObj } }
 */
export function listRosters() {
  return _load().rosters;
}

/**
 * Return a flat array of all roster objects, sorted by faction then name.
 */
export function listAllRosters() {
  const rosters = _load().rosters;
  const out = [];
  for (const faction of Object.keys(rosters).sort()) {
    for (const name of Object.keys(rosters[faction]).sort()) {
      out.push(rosters[faction][name]);
    }
  }
  return out;
}

/**
 * Return a roster by faction slug + name.  Null if not found.
 */
export function getRoster(faction, name) {
  const slug = slugify(faction);
  return _load().rosters[slug]?.[name] ?? null;
}

/**
 * Search for a roster by name across all factions (case-insensitive partial match).
 * Returns the first match, or null.
 */
export function findRosterByName(searchName) {
  const lower = (searchName || "").toLowerCase().trim();
  const rosters = _load().rosters;
  for (const factionRosters of Object.values(rosters)) {
    for (const [name, roster] of Object.entries(factionRosters)) {
      if (name.toLowerCase().includes(lower)) return roster;
    }
  }
  return null;
}

/**
 * Save (create or update) a roster.
 * faction — raw faction string (will be slugified)
 * name    — roster name (stored as-is)
 * content — raw text content of the roster
 */
export function saveRoster(faction, name, content) {
  const vfs  = _load();
  const slug = slugify(faction);
  if (!vfs.rosters[slug]) vfs.rosters[slug] = {};
  const now      = new Date().toISOString();
  const existing = vfs.rosters[slug][name];
  vfs.rosters[slug][name] = {
    name,
    faction:    slug,
    content,
    created_at: existing?.created_at || now,
    updated_at: now,
  };
  _save(vfs);
  return vfs.rosters[slug][name];
}

/**
 * Delete a roster.  Returns true on success.
 */
export function deleteRoster(faction, name) {
  const vfs  = _load();
  const slug = slugify(faction);
  if (!vfs.rosters[slug]?.[name]) return false;
  delete vfs.rosters[slug][name];
  if (Object.keys(vfs.rosters[slug]).length === 0) delete vfs.rosters[slug];
  _save(vfs);
  return true;
}

/**
 * Rename a roster within the same faction.  Returns true on success.
 */
export function renameRoster(faction, oldName, newName) {
  const vfs  = _load();
  const slug = slugify(faction);
  if (!vfs.rosters[slug]?.[oldName]) return false;
  const roster = { ...vfs.rosters[slug][oldName], name: newName, updated_at: new Date().toISOString() };
  vfs.rosters[slug][newName] = roster;
  delete vfs.rosters[slug][oldName];
  _save(vfs);
  return true;
}

/**
 * Total number of saved rosters across all factions.
 */
export function getRosterCount() {
  const rosters = _load().rosters;
  return Object.values(rosters).reduce((n, f) => n + Object.keys(f).length, 0);
}

/**
 * Return sorted array of faction slugs that have at least one roster.
 */
export function listFactionsWithRosters() {
  const rosters = _load().rosters;
  return Object.keys(rosters)
    .filter(f => Object.keys(rosters[f]).length > 0)
    .sort();
}

/**
 * Return a flat array of roster objects for a given faction slug.
 * Returns [] if faction not found or has no rosters.
 */
export function listRostersByFaction(faction) {
  const slug = slugify(faction);
  const rosters = _load().rosters;
  const factionRosters = rosters[slug] || {};
  return Object.values(factionRosters).sort((a, b) => a.name.localeCompare(b.name));
}

// ─── Campaign CRUD ────────────────────────────────────────────────────────────

/**
 * Return all campaigns as an object { "<name>": campaignObj }.
 */
export function listCampaigns() {
  return _load().campaigns;
}

/**
 * Create a new campaign.  Returns the new campaign, or null if name exists.
 */
export function createCampaign(name) {
  const vfs = _load();
  if (vfs.campaigns[name]) return null;
  const now = new Date().toISOString();
  vfs.campaigns[name] = {
    config:   { name, created_at: now },
    state:    { turn: 1, player_wins: 0, enemy_wins: 0, notes: "" },
    missions: {},
  };
  _save(vfs);
  return vfs.campaigns[name];
}

/**
 * Return a campaign by name.  Null if not found.
 */
export function getCampaign(name) {
  return _load().campaigns[name] ?? null;
}

/**
 * Merge a partial state update into a campaign's state field.
 */
export function updateCampaignState(name, partialState) {
  const vfs = _load();
  if (!vfs.campaigns[name]) return false;
  vfs.campaigns[name].state = { ...vfs.campaigns[name].state, ...partialState };
  vfs.campaigns[name].config.updated_at = new Date().toISOString();
  _save(vfs);
  return true;
}

/**
 * Save a mission result into a campaign.
 */
export function saveCampaignMission(campaignName, missionKey, missionData) {
  const vfs = _load();
  if (!vfs.campaigns[campaignName]) return false;
  vfs.campaigns[campaignName].missions[missionKey] = {
    ...missionData,
    saved_at: new Date().toISOString(),
  };
  _save(vfs);
  return true;
}

/**
 * Delete a campaign.  Returns true on success.
 */
export function deleteCampaign(name) {
  const vfs = _load();
  if (!vfs.campaigns[name]) return false;
  delete vfs.campaigns[name];
  _save(vfs);
  return true;
}

/**
 * Total number of saved campaigns.
 */
export function getCampaignCount() {
  return Object.keys(_load().campaigns).length;
}
