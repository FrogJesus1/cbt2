/**
 * crusade.js — Crusade Tracker API client
 *
 * Server-side storage of Crusade campaigns and Orders of Battle, mirroring
 * the shared-rosters client. Session 1 (Foundation): campaign create/load
 * plus unit CRUD scaffolding.
 */

import { getSessionId } from "@/lib/session";

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

/** Index of a rank in the RANKS ladder (0 = Fresh). */
export function rankIndex(rank) {
  const i = RANKS.findIndex((r) => r.name === rank);
  return i < 0 ? 0 : i;
}

/** True if a unit is Heroic or higher (gating for Crusade Relics, §3.4). */
export function isHeroicPlus(rank) {
  return rankIndex(rank) >= rankIndex("Heroic");
}

/** Rank tiers crossed going old→new XP — i.e. battle-honour slots earned (§3.5). */
export function promotionSlots(oldXp, newXp) {
  return Math.max(0, rankIndex(rankForXp(newXp)) - rankIndex(rankForXp(oldXp)));
}

// ─── Post-battle XP (CRUSADE_SPEC §3.2) ────────────────────────────────────────

/**
 * Auto-calculated XP for a unit that fought in a battle. Mirrors the server's
 * compute_auto_xp so the PostBattleFlow preview matches what finalize stores.
 *   +1 participated · +1 won · +1 killed 1+ · +1 killed 3+ · +1 marked · +agenda
 */
export function autoXp({ kills = 0, won = false, marked = false, agenda = 0 }) {
  let xp = 1;                       // participated
  if (won) xp += 1;
  if (kills >= 1) xp += 1;
  if (kills >= 3) xp += 1;
  if (marked) xp += 1;
  xp += agenda || 0;
  return xp;
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
    body: JSON.stringify({
      input: factionCmd,
      roster_context: { my_units: myUnits },
      // Same per-tab token the terminal uses, so the mustered crusade roster
      // lands in this client's session and terminal combat can see it (P0-2).
      session_id: getSessionId(),
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to start battle");
  }
  return res.json();
}

// ─── In-progress battle state (lives in campaign.state.active_battle) ────────────

/**
 * Build the active_battle blob that tracks an in-progress battle. Stored in the
 * campaign's State JSON (NOT a new table) so a mid-battle refresh restores it.
 */
export function buildActiveBattle({ mission = "", pointLimit = 0, units, markedId = null }) {
  return {
    mission,
    point_limit: pointLimit,
    started_at: new Date().toISOString(),
    // Stable idempotency key for this battle — sent on finalize so a retry /
    // double-submit can't apply the XP + counters twice (server dedupes on it).
    token: (typeof crypto !== "undefined" && crypto.randomUUID)
      ? crypto.randomUUID()
      : `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    units: units.map((u) => ({
      unit_id: u.id,
      unit_name: u.nickname || u.unit_name,
      kills: 0,
      destroyed: false,
      marked: u.id === markedId,
    })),
  };
}

/** Persist the active_battle blob into the campaign State (merges, doesn't clobber). */
export async function persistActiveBattle(campaign, activeBattle) {
  const state = { ...(campaign.state || {}), active_battle: activeBattle };
  return updateCampaign(campaign.id, { state });
}

// ─── Battles (history + post-battle finalize) ───────────────────────────────────

/** List a campaign's resolved battles, newest first. */
export async function listBattles(campaignId) {
  const data = await jsonOrThrow(
    await fetch(`${API}/campaigns/${campaignId}/battles`), "Failed to load battles");
  return data.battles;
}

/**
 * Finalize a battle: server applies per-unit XP/rank/honour/scar updates, writes
 * one CrusadeBattles row, bumps campaign RP + W/L/D + battle count, and clears
 * state.active_battle. Returns the refreshed campaign (with units).
 *
 * @param {string} campaignId
 * @param {Object} payload  { result, mission, point_limit, notes, rp_gained,
 *                            unit_results: [{unit_id, kills, destroyed, xp_gained, scars?, honours?}] }
 */
export async function finalizeBattle(campaignId, payload) {
  const res = await fetch(`${API}/campaigns/${campaignId}/battles`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return jsonOrThrow(res, "Failed to finalize battle");
}
