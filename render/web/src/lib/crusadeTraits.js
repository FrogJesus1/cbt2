/**
 * crusadeTraits.js — starter battle-trait & battle-scar tables.
 *
 * Each entry maps a Crusade honour/scar to an engine combat flag (or null when
 * it's a stat-only effect with no combat-math equivalent). The flags here are
 * exactly the tokens the math engine understands (see math_adapter `_apply_flags`
 * / KNOWN_FLAG_BASES), so when a unit is mustered for battle these auto-apply to
 * the combat math via the crusade bridge.
 *
 * Full faction-specific trait tables + relics arrive in Session 5.
 */

// flag === null  → descriptive only (shows in notes/abilities, no math effect)

export const BATTLE_TRAITS_INFANTRY = [
  { name: "Expert Marksmen",  effect: "+1 to Hit (ranged)",        flag: "hitplus:1" },
  { name: "Seasoned Warriors", effect: "+1 to Hit (melee)",        flag: "hitplus:1" },
  { name: "Vengeful",         effect: "Re-roll Wound rolls of 1",  flag: "rrwound1" },
  { name: "Resilient",        effect: "6+ Feel No Pain",           flag: "fnp:6" },
  { name: "Grizzled",         effect: "+1 Leadership, +1 OC",      flag: null },
  { name: "Swift",            effect: "+1\" Move",                 flag: null },
];

export const BATTLE_TRAITS_VEHICLE = [
  { name: "Expert Gunners",   effect: "+1 to Hit (ranged)",        flag: "hitplus:1" },
  { name: "Reliable",         effect: "6+ Feel No Pain",           flag: "fnp:6" },
  { name: "Deadly Payload",   effect: "+1 to Wound (one weapon)",  flag: "wndplus:1" },
  { name: "Armour Plating",   effect: "-1 Damage suffered (min 1)", flag: null },
  { name: "Mobile",           effect: "+2\" Move",                 flag: null },
  { name: "Reinforced Hull",  effect: "+1 Wound",                  flag: null },
];

// A few generic, broadly useful honours (relic-like / weapon enhancements).
export const HONOUR_EXTRAS = [
  { name: "Lethal Strikes",   effect: "Lethal Hits",               flag: "lethal" },
  { name: "Devastating Aim",  effect: "Devastating Wounds",        flag: "dev" },
  { name: "Sustained Fire",   effect: "Sustained Hits 1",          flag: "sustained:1" },
  { name: "Artificer Armour", effect: "5+ invulnerable save",      flag: "invuln:5" },
];

// Generic Battle Scars (CRUSADE_SPEC §3.3). Most are stat penalties the combat
// math doesn't model directly (flag: null); the two that do map are included.
export const BATTLE_SCARS = [
  { name: "Deep Scars",    effect: "-1 Leadership, -1 OC",                flag: null },
  { name: "Battle Weary",  effect: "Cannot use Fire Overwatch",          flag: null },
  { name: "Disgraced",     effect: "-1 to Hit rolls",                    flag: "hitplus:-1" },
  { name: "Fatigued",      effect: "-1 to Advance and Charge rolls",     flag: null },
  { name: "Shell Shocked", effect: "-1 to Save vs ranged",               flag: null },
  { name: "Mark of Shame", effect: "Cannot be marked, -1 OC",            flag: null },
];

export const ALL_HONOUR_PRESETS = [
  ...BATTLE_TRAITS_INFANTRY,
  ...BATTLE_TRAITS_VEHICLE,
  ...HONOUR_EXTRAS,
];
