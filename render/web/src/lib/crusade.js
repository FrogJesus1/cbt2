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

// ─── Crusade rank progression (CRUSADE_SPEC §3.1) ──────────────────────────────

/** Ordered rank tiers with their XP floor and battle-honour allowance. */
export const RANKS = [
  { name: "Fresh",           xp: 0,  honours: 0 },
  { name: "Blooded",         xp: 6,  honours: 1 },
  { name: "Battle-hardened", xp: 16, honours: 2 },
  { name: "Heroic",          xp: 31, honours: 3 },
  { name: "Legendary",       xp: 51, honours: 4 },
];

export const RANK_NAMES = RANKS.map((r) => r.name);

/** Highest rank whose XP threshold is met by the given XP total. */
export function rankForXp(xp) {
  const x = Number.isFinite(xp) ? xp : 0;
  let rank = RANKS[0].name;
  for (const r of RANKS) {
    if (x >= r.xp) rank = r.name;
  }
  return rank;
}

/** XP needed for the next rank, or null if already Legendary. */
export function xpToNextRank(xp) {
  const x = Number.isFinite(xp) ? xp : 0;
  const next = RANKS.find((r) => r.xp > x);
  return next ? { rank: next.name, remaining: next.xp - x, at: next.xp } : null;
}

// ─── Bulk import from parsed roster units ──────────────────────────────────────

/**
 * Import a list of parsed roster units (see lib/rosterParse) into a campaign's
 * Order of Battle. Returns { added, skipped } counts.
 *
 * @param {string} campaignId
 * @param {Array} parsedUnits   output of parseRosterUnits()
 * @param {Object} [opts]
 * @param {Array}  [opts.existing]   current OOB units (for duplicate detection)
 * @param {"skip"|"all"|"replace"} [opts.mode="skip"]
 */
export async function importUnits(campaignId, parsedUnits, opts = {}) {
  const { existing = [], mode = "skip" } = opts;

  if (mode === "replace") {
    await Promise.all(existing.map((u) => deleteUnit(u.id).catch(() => {})));
  }

  // Build a duplicate-detection set of name|nickname (lowercased).
  const seen = new Set();
  if (mode === "skip") {
    for (const u of existing) {
      seen.add(`${(u.unit_name || "").toLowerCase()}|${(u.nickname || "").toLowerCase()}`);
    }
  }

  return _importLoop(campaignId, parsedUnits, seen, mode);
}

async function _importLoop(campaignId, parsedUnits, seen, mode) {
  let added = 0;
  let skipped = 0;
  for (const pu of parsedUnits) {
    const key = `${(pu.name || "").toLowerCase()}|${(pu.nickname || "").toLowerCase()}`;
    if (mode === "skip" && seen.has(key)) { skipped += 1; continue; }
    seen.add(key);

    const created = await createUnit(campaignId, {
      unit_name: pu.name,
      nickname: pu.nickname || "",
      points: pu.points || 0,
      models: pu.models || 1,
      is_leader: !!pu.is_leader,
      loadout: pu.weapons || [],
    });
    // attached_to isn't accepted by createUnit — patch it in when present.
    if (pu.attached_to && created?.id) {
      await updateUnit(created.id, { attached_to: pu.attached_to }).catch(() => {});
    }
    added += 1;
  }
  return { added, skipped };
}

// ─── Muster → combat bridge (CRUSADE_SPEC §5) ───────────────────────────────────

/**
 * Convert a stored CrusadeUnit into an enriched roster entry for the engine.
 * Shape matches engine.sync_roster_context() + the crusade combat bridge:
 * the `crusade` block carries rank/xp/honours/scars so battle traits with a
 * combat `flag` auto-apply to the math.
 */
export function buildCrusadeUnit(unit, faction) {
  return {
    name:        unit.unit_name,
    faction:     faction || unit.faction || "",
    models:      unit.models || 1,
    weapons:     unit.loadout || [],
    is_leader:   !!unit.is_leader,
    points:      unit.points || 0,
    attached_to: unit.attached_to || null,
    nickname:    unit.nickname || null,
    crusade: {
      rank:    unit.rank || "Fresh",
      xp:      unit.xp || 0,
      honours: unit.honours || [],
      scars:   unit.scars || [],
    },
  };
}

/**
 * Start a battle: push the selected, crusade-enriched units into the engine's
 * player roster and set the session faction. Subsequent combat/spec commands
 * in the terminal then use the enriched data automatically.
 *
 * @param {string} engineId
 * @param {Array}  units     stored CrusadeUnits to muster
 * @param {string} faction   campaign faction slug
 */
export async function startBattle(engineId, units, faction) {
  const myUnits = units.map((u) => buildCrusadeUnit(u, faction));
  // `faction <name>` sets the session faction; hyphenated slugs → spaces so the
  // engine's fuzzy faction match resolves multi-word factions.
  const factionCmd = `faction ${(faction || "").replace(/-/g, " ")}`.trim();
  const res = await fetch(`/api/engines/${engineId}/exec`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input: factionCmd, roster_context: { my_units: myUnits } }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to start battle");
  }
  return res.json();
}
