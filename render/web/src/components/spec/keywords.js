/**
 * spec/keywords.js
 *
 * Warhammer 40K 10th edition weapon keyword definitions.
 * Each entry: { abbr, name, desc }
 *
 * resolveKeyword(rawString) handles exact matches + numeric-variant regex
 * (Rapid Fire 2, Melta 3, Sustained Hits 1, Anti-Infantry 4+, etc.)
 */

const KW_MAP = {
  "assault":              { abbr: "AS",   name: "Assault",              desc: "Can be used in the same turn the bearer Advances, without penalty." },
  "blast":                { abbr: "Bst",  name: "Blast",                desc: "Minimum 3 attacks vs units with 6+ models; minimum 6 attacks vs units with 11+ models." },
  "devastating wounds":   { abbr: "DW",   name: "Devastating Wounds",   desc: "Unmodified wound rolls of 6 inflict mortal wounds equal to the Damage characteristic instead of a normal wound." },
  "extra attacks":        { abbr: "EA",   name: "Extra Attacks",        desc: "Attacks are made in addition to any other attacks made by this model." },
  "fixed":                { abbr: "Fxd",  name: "Fixed",                desc: "Can only target the unit the bearer is within Engagement Range of." },
  "hazardous":            { abbr: "Haz",  name: "Hazardous",            desc: "After firing, roll one D6 per Hazardous weapon; on a 1, one model in the unit suffers 3 mortal wounds." },
  "heavy":                { abbr: "Hvy",  name: "Heavy",                desc: "Add +1 to hit rolls if the bearer's unit remained stationary this turn." },
  "ignores cover":        { abbr: "IC",   name: "Ignores Cover",        desc: "Target unit cannot benefit from cover bonuses against attacks from this weapon." },
  "indirect fire":        { abbr: "IF",   name: "Indirect Fire",        desc: "Can target units not visible to the bearer; -1 to hit when used this way." },
  "lance":                { abbr: "Lnc",  name: "Lance",                desc: "Each time an attack is made with this weapon, if the bearer made a Charge move this turn, add 1 to that attack's Wound roll." },
  "lethal hits":          { abbr: "LH",   name: "Lethal Hits",          desc: "Unmodified hit rolls of 6 automatically wound the target; no wound roll is made." },
  "one-shot":             { abbr: "OS",   name: "One Shot",             desc: "This weapon can only be used once per battle." },
  "one shot":             { abbr: "OS",   name: "One Shot",             desc: "This weapon can only be used once per battle." },
  "pistol":               { abbr: "Pst",  name: "Pistol",               desc: "Can be used while in Engagement Range; replaces all other ranged attacks made by the bearer." },
  "precision":            { abbr: "Prec", name: "Precision",            desc: "Unmodified hit rolls of 6 allow you to pick a Character model in the target unit to be the target." },
  "psychic":              { abbr: "Psy",  name: "Psychic",              desc: "Mortal wounds caused cannot be ignored unless a rule specifically mentions Psychic attacks." },
  "torrent":              { abbr: "Tor",  name: "Torrent",              desc: "Automatically hits the target — no hit rolls are made." },
  "twin-linked":          { abbr: "TL",   name: "Twin-Linked",          desc: "Re-roll all failed wound rolls made for this weapon." },
  "twin linked":          { abbr: "TL",   name: "Twin-Linked",          desc: "Re-roll all failed wound rolls made for this weapon." },
  "sustained hits 1":     { abbr: "SH1",  name: "Sustained Hits 1",     desc: "Unmodified hit rolls of 6 generate 1 additional hit." },
  "sustained hits 2":     { abbr: "SH2",  name: "Sustained Hits 2",     desc: "Unmodified hit rolls of 6 generate 2 additional hits." },
  "sustained hits 3":     { abbr: "SH3",  name: "Sustained Hits 3",     desc: "Unmodified hit rolls of 6 generate 3 additional hits." },
  "rapid fire 1":         { abbr: "RF1",  name: "Rapid Fire 1",         desc: "Make 1 additional attack if the target is within half range." },
  "rapid fire 2":         { abbr: "RF2",  name: "Rapid Fire 2",         desc: "Make 2 additional attacks if the target is within half range." },
  "rapid fire 3":         { abbr: "RF3",  name: "Rapid Fire 3",         desc: "Make 3 additional attacks if the target is within half range." },
  "melta 1":              { abbr: "Mlt1", name: "Melta 1",              desc: "Add 1 to Damage characteristic when targeting a unit within half range." },
  "melta 2":              { abbr: "Mlt2", name: "Melta 2",              desc: "Add 2 to Damage characteristic when targeting a unit within half range." },
  "melta 3":              { abbr: "Mlt3", name: "Melta 3",              desc: "Add 3 to Damage characteristic when targeting a unit within half range." },
  "melta 4":              { abbr: "Mlt4", name: "Melta 4",              desc: "Add 4 to Damage characteristic when targeting a unit within half range." },
};

/**
 * Resolve any weapon keyword string to { abbr, name, desc }.
 * Handles exact matches and variable-number patterns like:
 *   Rapid Fire 2, Sustained Hits 3, Melta 2, Anti-Infantry 4+
 */
export function resolveKeyword(rawKw) {
  if (!rawKw) return { abbr: "?", name: "Unknown", desc: "" };

  const kw    = String(rawKw).trim();
  const lower = kw.toLowerCase();

  // Direct lookup
  if (KW_MAP[lower]) return KW_MAP[lower];

  // Rapid Fire X
  const rf = lower.match(/^rapid[- ]?fire\s+(\d+)$/);
  if (rf) return {
    abbr: `RF${rf[1]}`,
    name: `Rapid Fire ${rf[1]}`,
    desc: `Make ${rf[1]} additional attack(s) if the target is within half range.`,
  };

  // Sustained Hits X
  const sh = lower.match(/^sustained[- ]?hits?\s+(\d+)$/);
  if (sh) return {
    abbr: `SH${sh[1]}`,
    name: `Sustained Hits ${sh[1]}`,
    desc: `Unmodified hit rolls of 6 generate ${sh[1]} additional hit(s).`,
  };

  // Melta X
  const melta = lower.match(/^melta\s+(\d+)$/);
  if (melta) return {
    abbr: `Mlt${melta[1]}`,
    name: `Melta ${melta[1]}`,
    desc: `Add ${melta[1]} to the Damage characteristic when targeting a unit within half range.`,
  };

  // Anti-<Keyword> <N>+
  const anti = lower.match(/^anti[- ](\w+)\s+(\d+)\+?$/);
  if (anti) {
    const target = anti[1].charAt(0).toUpperCase() + anti[1].slice(1);
    const short  = target.slice(0, 4);
    return {
      abbr: `A-${short}`,
      name: kw,
      desc: `Unmodified wound rolls of ${anti[2]}+ automatically wound when targeting ${target} units.`,
    };
  }

  // Fallback — use raw keyword truncated
  const safe = kw.replace(/\s+/g, "").slice(0, 5);
  return { abbr: safe, name: kw, desc: "Special weapon rule." };
}
