/**
 * crusadeTraits.js — battle-trait, battle-scar, relic & agenda reference tables.
 *
 * Each trait/scar/relic maps to an engine combat flag (or null when it's a
 * stat-only effect with no combat-math equivalent). The flags here are exactly
 * the tokens the math engine understands (see math_adapter `_apply_flags` /
 * KNOWN_FLAG_BASES), so when a unit is mustered for battle these auto-apply to
 * the combat math via the crusade bridge — offensive flags when the unit attacks,
 * defensive flags (FNP, invuln, +Wounds, damage reduction, save mods) when it
 * defends.
 *
 * Battle traits in 10th-edition Crusade are universal and organised by unit
 * TYPE (Infantry / Mounted / Vehicle), not by faction — faction flavour comes
 * from Crusade Relics. The tables below cover the generic by-type traits, the
 * generic scar table, a generic Crusade Relics list, and the standard agendas.
 *
 *   flag === null  → descriptive only (shows in notes/abilities, no math effect)
 *
 * Defensive flags introduced for Session 5:
 *   fnp6 / fnp5     — N+ Feel No Pain (defender)
 *   invuln4/5/6     — N+ invulnerable save (defender)
 *   woundsplus1     — +1 to the Wounds characteristic (min 1)  (defender)
 *   dmgreduce1      — -1 Damage suffered per attack (min 1)     (defender)
 *   svminus1        — -1 to Save rolls (worse)                  (defender)
 *   stealth         — attacks targeting this unit get -1 to Hit (defender)
 */

// ─── Battle Traits — Infantry ────────────────────────────────────────────────
export const BATTLE_TRAITS_INFANTRY = [
  { name: "Expert Marksmen",   effect: "+1 to Hit (ranged)",                 flag: "hitplus1" },
  { name: "Seasoned Warriors", effect: "+1 to Hit (melee)",                  flag: "hitplus1" },
  { name: "Sniper Discipline", effect: "Re-roll Hit rolls of 1",            flag: "rrhit1" },
  { name: "Vengeful",          effect: "Re-roll Wound rolls of 1",          flag: "rrwound1" },
  { name: "Resilient",         effect: "6+ Feel No Pain",                    flag: "fnp6" },
  { name: "Hardened",          effect: "+1 Wound",                           flag: "woundsplus1" },
  { name: "Stealthy",          effect: "Attacks targeting this unit get -1 to Hit", flag: "stealth" },
  { name: "Grizzled",          effect: "+1 Leadership, +1 OC",               flag: null },
  { name: "Swift",             effect: "+1\" Move",                          flag: null },
];

// ─── Battle Traits — Mounted ─────────────────────────────────────────────────
export const BATTLE_TRAITS_MOUNTED = [
  { name: "Outriders",         effect: "+1 to Hit (melee)",                  flag: "hitplus1" },
  { name: "Thundering Charge", effect: "+1 to Wound (charged)",              flag: "wndplus1" },
  { name: "Hardy Steeds",      effect: "6+ Feel No Pain",                    flag: "fnp6" },
  { name: "Sure-footed",       effect: "Re-roll Wound rolls of 1",          flag: "rrwound1" },
  { name: "Swift Hooves",      effect: "+2\" Move",                          flag: null },
  { name: "Outflankers",       effect: "+1 OC",                              flag: null },
];

// ─── Battle Traits — Vehicle ─────────────────────────────────────────────────
export const BATTLE_TRAITS_VEHICLE = [
  { name: "Expert Gunners",    effect: "+1 to Hit (ranged)",                 flag: "hitplus1" },
  { name: "Reliable",          effect: "6+ Feel No Pain",                    flag: "fnp6" },
  { name: "Deadly Payload",    effect: "+1 to Wound (one weapon)",           flag: "wndplus1" },
  { name: "Armour Plating",    effect: "-1 Damage suffered (min 1)",         flag: "dmgreduce1" },
  { name: "Reinforced Hull",   effect: "+1 Wound",                           flag: "woundsplus1" },
  { name: "Targeting Relays",  effect: "Re-roll Hit rolls of 1",            flag: "rrhit1" },
  { name: "Mobile",            effect: "+2\" Move",                          flag: null },
];

// ─── Weapon Enhancements / generic honours ───────────────────────────────────
export const HONOUR_EXTRAS = [
  { name: "Lethal Strikes",    effect: "Lethal Hits",                        flag: "lethal" },
  { name: "Devastating Aim",   effect: "Devastating Wounds",                 flag: "dev" },
  { name: "Sustained Fire",    effect: "Sustained Hits 1",                   flag: "sus1" },
  { name: "Master-Crafted",    effect: "+1 Damage (one weapon)",            flag: "ed1" },
  { name: "Honed Edge",        effect: "Improve AP by 1 (one weapon)",      flag: "eap1" },
  { name: "Precision Shot",    effect: "Re-roll all failed Hit rolls",      flag: "rrhit" },
  { name: "Artificer Armour",  effect: "5+ invulnerable save",              flag: "invuln5" },
];

// ─── Crusade Relics (generic; faction relics can be layered later) ───────────
// Character / Heroic-tier rewards. Single-flag each so they auto-apply cleanly.
export const CRUSADE_RELICS = [
  { name: "The Armour Indomitus", effect: "-1 Damage suffered (min 1)",      flag: "dmgreduce1" },
  { name: "Aegis Shroud",         effect: "4+ invulnerable save",            flag: "invuln4" },
  { name: "Talisman of Endurance",effect: "5+ Feel No Pain",                 flag: "fnp5" },
  { name: "Bane Weapon",          effect: "Devastating Wounds",              flag: "dev" },
  { name: "Digital Weapons",      effect: "Lethal Hits",                     flag: "lethal" },
  { name: "Master-Crafted Relic", effect: "+1 Damage (one weapon)",         flag: "ed1" },
  { name: "Sundering Edge",       effect: "Improve AP by 1 (one weapon)",    flag: "eap1" },
  { name: "Hexagrammic Wards",    effect: "+1 to Save rolls",                flag: "svplus1" },
];

// ─── Generic Battle Scars (CRUSADE_SPEC §3.3) ────────────────────────────────
export const BATTLE_SCARS = [
  { name: "Deep Scars",    effect: "-1 Leadership, -1 OC",               flag: null },
  { name: "Battle Weary",  effect: "Cannot use Fire Overwatch",          flag: null },
  { name: "Disgraced",     effect: "-1 to Hit rolls",                    flag: "hitplus-1" },
  { name: "Fatigued",      effect: "-1 to Advance and Charge rolls",     flag: null },
  { name: "Shell Shocked", effect: "-1 to Save rolls",                   flag: "svminus1" },
  { name: "Weakened",      effect: "-1 Wound (min 1)",                   flag: "woundsplus-1" },
  { name: "Mark of Shame", effect: "Cannot be marked, -1 OC",           flag: null },
];

// ─── Standard Agendas (mission XP objectives, CRUSADE_SPEC §3.2) ─────────────
// Display/reference only — agenda XP is entered manually in the post-battle flow
// (the autoXp() helper accepts an `agenda` passthrough). `xp` is the reward when
// the agenda is achieved by a unit in the battle.
export const AGENDAS = [
  { name: "Vital Ground",     xp: 1, how: "Hold an objective marker at the end of your turn" },
  { name: "Slay the Warlord", xp: 3, how: "Destroy the enemy WARLORD with this unit" },
  { name: "Priority Kill",    xp: 1, how: "Destroy an enemy CHARACTER, MONSTER, or VEHICLE" },
  { name: "Behind Enemy Lines", xp: 2, how: "End the battle wholly within the enemy deployment zone" },
  { name: "No Mercy",         xp: 1, how: "Destroy an enemy unit in the Fight phase" },
  { name: "Marked for the Hunt", xp: 1, how: "Destroy a unit you marked at the start of the battle" },
  { name: "First Blood",      xp: 1, how: "Be the first unit to destroy an enemy unit" },
];

export const ALL_HONOUR_PRESETS = [
  ...BATTLE_TRAITS_INFANTRY,
  ...BATTLE_TRAITS_MOUNTED,
  ...BATTLE_TRAITS_VEHICLE,
  ...HONOUR_EXTRAS,
  ...CRUSADE_RELICS,
];
