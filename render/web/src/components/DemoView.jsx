/**
 * DemoView
 *
 * Two sections:
 *   1. Individual components — every exported component shown independently
 *      with sample data, numbered and labelled.
 *   2. Group Blocks — full composed block layouts as they appear in the
 *      terminal (CombatBlock, SpecBlock, ThreatCard, ThreatBlock).
 */

import { TerminalBlock } from "./TerminalBlock";

// Combat sub-components (re-exported from CombatBlock.jsx)
import {
  BannerCard,
  WarningBlock,
  TotalUnitOutputRanged,
  TotalUnitOutputMelee,
  WeaponPlatformTotals,
  ModifierImpact,
  SimulationConfidence,
  AbilitiesBlock,
} from "./CombatBlock";

// CombatBlock composer (named export on the same file)
import { CombatBlock } from "./CombatBlock";

// Spec sub-components + block (re-exported from SpecBlock.jsx)
import {
  SpecBannerCard,
  KeywordsBar,
  StatLine,
  WeaponsPanel,
  SpecAbilitiesBlock,
  SpecBlock,
} from "./SpecBlock";

// Threat sub-components (re-exported from ThreatCard.jsx)
import {
  ThreatBanner,
  MetricBars,
  CounterBlock,
  ThreatCard,
} from "./ThreatCard";

// Threat sub-components (direct imports from threat/)
import { ThreatSummary }   from "./threat/ThreatSummary";
import { ThreatCardRow }   from "./threat/ThreatCardRow";
import { DetachmentBlock } from "./threat/DetachmentBlock";
import { StratagemList }   from "./threat/StratagemList";
import { StrategicNotes }  from "./threat/StrategicNotes";

// ThreatBlock group-block composer
import { ThreatBlock } from "./ThreatBlock";

// ─── Colour palette ───────────────────────────────────────────────────────

const C = {
  green:     "var(--ct-primary)",
  mid:       "var(--ct-primary-mid)",
  label:     "var(--ct-primary-label)",
  dim:       "var(--ct-primary-dim)",
  amber:     "#ffa328",
  border:    "var(--ct-border)",
  bordermid: "var(--ct-border-bright)",
  panel:     "var(--ct-bg-panel)",
};

// ═══════════════════════════════════════════════════════════════════════════
// SAMPLE DATA — Combat
// ═══════════════════════════════════════════════════════════════════════════

const SAMPLE_FLAGS = ["ml"];

const SAMPLE_FLAG_NOTES = [
  { icon: "lightning", text: "Heavy — +1 to BS if this model didn't move this turn" },
  { icon: "skull",     text: "Devastating Wounds — critical wounds bypass saves entirely" },
  { icon: "diamond",   text: "One-Shot — this weapon can only be fired once per game" },
  { icon: "target",    text: "Markerlights — Ignores Cover applied" },
];

const SAMPLE_RANGED = {
  expected_dmg:       6.39,
  expected_kills:     0.40,
  kill_chance_pct:    33,
  avg_dmg_per_attack: 0.64,
  overkill_waste_pct: 12,
  swinginess:         0.70,
  swinginess_label:   "Reliable",
  squad_wipe_pct:     8,
};

const SAMPLE_MELEE = {
  expected_dmg:       0.08,
  expected_kills:     0.01,
  kill_chance_pct:    2,
  avg_dmg_per_attack: 0.03,
  overkill_waste_pct: 0,
  swinginess:         3.49,
  swinginess_label:   "Moderate",
  squad_wipe_pct:     0,
};

const SAMPLE_WEAPONS = [
  { name: "Heavy rail rifle",        type: "ranged", shots: 2,    dmg: 3.50, kills: 0.22 },
  { name: "Seeker missile",          type: "ranged", shots: 1,    dmg: 1.33, kills: 0.08 },
  { name: "High-yield missile pods", type: "ranged", shots: 6,    dmg: 1.04, kills: 0.06 },
  { name: "Twin plasma rifle",       type: "ranged", shots: null, dmg: 0.52, kills: 0.03 },
  { name: "Crushing bulk",           type: "melee",  shots: 3,    dmg: 0.08, kills: 0.01 },
];

const SAMPLE_MODIFIERS = [
  { label: "+1 Attack",   value: 59 },
  { label: "+1 Damage",   value: 29 },
  { label: "+1 AP",       value: 27 },
  { label: "+1 Strength", value: 26 },
  { label: "+1 Hit",      value: 25 },
];

const SAMPLE_SIMULATION = {
  iterations:   10000,
  error_margin: 0.7,
  confidence:   "Very High",
  covers:       ["Overkill", "Swinginess", "Distribution"],
};

const SAMPLE_ABILITIES = [
  { name: "Advanced Armour", text: "Models in this unit have the Feel No Pain 4+ ability against mortal wounds", color: "cyan" },
  { name: "One Shot",        text: "The bearer can only shoot this weapon once per battle", color: "amber" },
];

const SAMPLE_FOOTER = "4 ranged · 1 melee · single model output · ranked by kills";

const SAMPLE_COMBAT_DATA = {
  attacker_name:   "Broadside Battlesuits",
  defender_name:   "Tervigon",
  flags:           SAMPLE_FLAGS,
  ranged:          SAMPLE_RANGED,
  melee:           SAMPLE_MELEE,
  weapons:         SAMPLE_WEAPONS,
  modifier_impact: SAMPLE_MODIFIERS,
  simulation:      SAMPLE_SIMULATION,
  flag_notes:      SAMPLE_FLAG_NOTES,
  abilities:       SAMPLE_ABILITIES,
  footer:          SAMPLE_FOOTER,
};

// ═══════════════════════════════════════════════════════════════════════════
// SAMPLE DATA — Spec
// ═══════════════════════════════════════════════════════════════════════════

const SAMPLE_STATS = { M: "6\"", T: 6, Sv: "2+", W: 6, Ld: "7+", OC: 2 };

const SAMPLE_RATINGS = {
  durability:   { score: 0.78, label: "T6 2+ 6W" },
  mobility:     { score: 0.45, label: "6\"" },
  obj_control:  { score: 0.40, label: "OC 2" },
  firepower:    { score: 0.82, label: "6.4 est" },
  melee_threat: { score: 0.12, label: "0.1 est" },
};

const SAMPLE_SPEC_WEAPONS = [
  { name: "Heavy rail rifle",        type: "ranged", range: "72\"", attacks: "2", skill: "4+", strength: "10", ap: "-4", damage: "D6+3", keywords: ["Heavy"] },
  { name: "High-yield missile pods", type: "ranged", range: "36\"", attacks: "6", skill: "4+", strength: "7",  ap: "-1", damage: "2",     keywords: [] },
  { name: "Seeker missile",          type: "ranged", range: "72\"", attacks: "1", skill: "4+", strength: "9",  ap: "-2", damage: "D6",    keywords: ["One Shot"] },
  { name: "Twin plasma rifle",       type: "ranged", range: "24\"", attacks: "2", skill: "4+", strength: "7",  ap: "-3", damage: "1",     keywords: ["Rapid Fire 1"] },
  { name: "Crushing bulk",           type: "melee",  range: "Melee",attacks: "3", skill: "4+", strength: "8",  ap: "-2", damage: "2",     keywords: [] },
];

const SAMPLE_SPEC_ABILITIES = [
  { name: "Advanced Armour",      text: "Models in this unit have the Feel No Pain 4+ ability against mortal wounds." },
  { name: "One Shot",             text: "The bearer can only shoot the Seeker Missile once per battle." },
  { name: "Stabilised Footing",   text: "This model does not suffer the penalty for moving and firing Heavy weapons." },
];

const SAMPLE_KEYWORDS = ["Infantry", "Battlesuit", "T'au Empire", "Sept", "Broadside Battlesuits"];

const SAMPLE_SPEC_DATA = {
  title:     "Broadside Battlesuits",
  subtitle:  "T'au Empire  ·  100pts",
  stats:     SAMPLE_STATS,
  weapons:   SAMPLE_SPEC_WEAPONS,
  abilities: SAMPLE_SPEC_ABILITIES,
  keywords:  SAMPLE_KEYWORDS,
  ratings:   SAMPLE_RATINGS,
  _stub:     false,
};

// ═══════════════════════════════════════════════════════════════════════════
// SAMPLE DATA — Threat
// ═══════════════════════════════════════════════════════════════════════════

const SAMPLE_METRICS_HIGH   = { threat: 82, dur: 75, dmg: 70, mob: 60, buff: 45 };
const SAMPLE_METRICS_MEDIUM = { threat: 48, dur: 42, dmg: 55, mob: 80, buff: 12 };
const SAMPLE_METRICS_LOW    = { threat: 22, dur: 25, dmg: 28, mob: 65, buff: 10 };

const SAMPLE_COUNTERS = [
  { name: "Broadside Battlesuits", score: 78, reason: "High dmg vs tough target" },
  { name: "Riptide Battlesuit",    score: 71, reason: "High damage output" },
  { name: "Hammerhead Gunship",    score: 65, reason: "Long-range shooters" },
];

const SAMPLE_THREAT_CARD_DATA = {
  name:          "Hive Tyrant",
  threat_level:  "high",
  metrics:       SAMPLE_METRICS_HIGH,
  profile:       { T: 9, Sv: "2+", W: 12, M: "10\"", OC: 3 },
  keywords:      ["Monster", "Character", "Psyker", "Fly", "Tyranids", "Hive Tyrant"],
  abilities: [
    { name: "Shadow in the Warp",   description: "Friendly Tyranids units within 12\" of this model can use this unit's Leadership characteristic." },
    { name: "Synaptic Imperatives", description: "Once per battle round, you can issue one of this model's Synaptic Imperatives to a friendly Tyranids unit." },
    { name: "Monstrous Hunger",     description: "Each time this model makes a melee attack, re-roll a wound roll of 1." },
  ],
  enhancement:   "Hypnotic Gaze",
  counters:      SAMPLE_COUNTERS,
  show_counters: true,
  _stub:         false,
};

const SAMPLE_THREAT_STATS = {
  unit_count:     14,
  skew_label:     "Infantry Skew",
  skew_breakdown: [
    { type: "Infantry", count: 7 },
    { type: "Monster",  count: 4 },
    { type: "Vehicle",  count: 2 },
    { type: "Other",    count: 1 },
  ],
  threat_dist: { high: 4, medium: 6, low: 4 },
};

const SAMPLE_DETACHMENTS = [
  {
    name:        "Invasion Fleet",
    description: "The swarm descends upon the enemy with relentless ferocity, overwhelming all resistance.",
    rules: [
      {
        name:        "Feeding Frenzy",
        description: "Each time a friendly Tyranids unit ends a charge move, it can make a bonus attack with one of its melee weapons.",
      },
      {
        name:        "Alien Cunning",
        description: "At the start of each player's Command phase, if your army contains any Hive Tyrant models, you may re-roll one hit roll.",
      },
      {
        name:        "Lurk and Pounce",
        description: "In each player's Shooting phase, when a friendly Infantry unit is selected to shoot, until the end of the phase it can Overwatch for free.",
      },
    ],
  },
  {
    name:        "Crusher Stampede",
    description: "Massive bio-organisms smash through enemy lines with crushing and unstoppable force.",
    rules: [
      {
        name:        "Smash and Maul",
        description: "Each time a Monster model in your army makes a melee attack, re-roll wound rolls of 1.",
      },
      {
        name:        "Crushing Bulk",
        description: "Each time a Monster model charges, it can immediately fight before the enemy can react.",
      },
    ],
  },
];

const SAMPLE_STRATAGEMS = [
  {
    name:       "Pheromone Trail",
    cost:       "1CP",
    detachment: "Invasion Fleet",
    when:       "Your Movement phase.",
    target:     "One Tyranids Troops unit from your army.",
    effect:     "Remove that unit from the battlefield. At the end of the phase, set it up anywhere on the battlefield that is more than 9\" from all enemy models.",
    phase:      "movement",
    _stub:      false,
  },
  {
    name:       "Onslaught",
    cost:       "2CP",
    detachment: "Invasion Fleet",
    when:       "Your Shooting phase.",
    target:     "One Tyranids unit from your army that is within Synapse range.",
    effect:     "Until the end of the phase, each time a model in that unit makes an attack, re-roll a hit roll of 1.",
    phase:      "shooting",
    _stub:      false,
  },
  {
    name:       "Trample",
    cost:       "1CP",
    detachment: "Crusher Stampede",
    when:       "Your Charge phase.",
    target:     "One Monster unit from your army.",
    effect:     "Until the end of the phase, each time that unit makes a charge move, it can move through enemy units, ignoring them for movement purposes.",
    phase:      "charge",
    _stub:      false,
  },
];

const SAMPLE_STRATEGIC_NOTES = [
  { type: "warning", text: "Hive Tyrant is your primary concern. Remove or neutralise it in rounds 1–2 before it can reach your lines." },
  { type: "warning", text: "High-durability units detected: Carnifex, Maleceptor. AP-2 or better weapons are required to crack their saves efficiently." },
  { type: "tip",     text: "Fast flankers detected (Hormagaunts, Genestealers). Deploy screening units to protect backfield objectives from turn 1." },
  { type: "tip",     text: "Multiple support units detected. Targeting their leader/character units early degrades the faction's overall efficiency." },
  { type: "focus",   text: "Priority target: Hive Tyrant (threat score 82). Concentrate fire early and do not let it consolidate into your lines." },
];

// Unit rows for ThreatCardRow demo (3 units spanning all tiers)
const SAMPLE_THREAT_UNITS = [
  {
    name:          "Hive Tyrant",
    threat_level:  "high",
    metrics:       SAMPLE_METRICS_HIGH,
    profile:       { T: 9, Sv: "2+", W: 12, M: "10\"", OC: 3 },
    keywords:      ["Monster", "Character", "Psyker", "Fly"],
    abilities:     [
      { name: "Shadow in the Warp",   description: "Friendly units within 12\" can use this unit's Leadership." },
      { name: "Monstrous Hunger",     description: "Re-roll wound rolls of 1 on melee attacks." },
    ],
    enhancement:   "",
    counters:      [],
    show_counters: false,
    _stub:         false,
  },
  {
    name:          "Genestealers",
    threat_level:  "medium",
    metrics:       SAMPLE_METRICS_MEDIUM,
    profile:       { T: 4, Sv: "5+", W: 2, M: "8\"", OC: 2 },
    keywords:      ["Infantry", "Genestealers"],
    abilities:     [
      { name: "Rending Claws", description: "Critical hit auto-wounds." },
    ],
    enhancement:   "",
    counters:      [],
    show_counters: false,
    _stub:         false,
  },
  {
    name:          "Hormagaunts",
    threat_level:  "low",
    metrics:       SAMPLE_METRICS_LOW,
    profile:       { T: 3, Sv: "5+", W: 1, M: "8\"", OC: 1 },
    keywords:      ["Infantry", "Hormagaunts"],
    abilities:     [],
    enhancement:   "",
    counters:      [],
    show_counters: false,
    _stub:         false,
  },
];

// Full threat_view payload for ThreatBlock group block
const SAMPLE_THREAT_VIEW = {
  faction:           "tyranids",
  faction_label:     "Tyranids",
  units:             SAMPLE_THREAT_UNITS,
  stats:             SAMPLE_THREAT_STATS,
  detachments:       SAMPLE_DETACHMENTS,
  stratagems:        SAMPLE_STRATAGEMS,
  strategic_notes:   SAMPLE_STRATEGIC_NOTES,
  roster_loaded:     false,
  active_detachment: "Invasion Fleet",
  _stub:             false,
};

// ═══════════════════════════════════════════════════════════════════════════
// TERMINAL RESULT SAMPLES
// ═══════════════════════════════════════════════════════════════════════════

const TABLE_SAMPLE = {
  result_type: "table", ok: true,
  data: {
    columns: ["Unit", "Faction", "Points", "OC"],
    rows: [
      ["Broadside Battlesuits", "T'au Empire", "100", "2"],
      ["Crisis Battlesuits",    "T'au Empire", "75",  "0"],
      ["Riptide Battlesuit",    "T'au Empire", "185", "2"],
      ["Fire Warriors",         "T'au Empire", "80",  "2"],
      ["Hammerhead Gunship",    "T'au Empire", "145", "3"],
      ["Ethereal",              "T'au Empire", "55",  "0"],
    ],
  },
  meta: { type: "units", faction: "tau", count: 6 },
};

const CARD_SAMPLE = {
  result_type: "card", ok: true,
  data: {
    title: "Broadside Battlesuits",
    fields: [
      { label: "Stats",          value: { M: "6\"", T: "6", Sv: "2+", W: "6", Ld: "7+", OC: "2" } },
      { label: "Ranged Weapons", value: {
          columns: ["Weapon", "Rng", "A", "BS", "S", "AP", "D"],
          rows: [
            ["Heavy rail rifle",        "72\"", "2", "4+", "10", "-4", "D6+3"],
            ["High-yield missile pods", "36\"", "6", "4+",  "7", "-1",    "2"],
            ["Seeker missile",          "72\"", "1", "4+",  "9", "-2",   "D6"],
          ],
        },
      },
      { label: "Melee Weapons",  value: {
          columns: ["Weapon", "A", "WS", "S", "AP", "D"],
          rows: [["Crushing bulk", "3", "4+", "8", "-2", "2"]],
        },
      },
      { label: "Abilities",      value: [
          { name: "Advanced Armour", desc: "Feel No Pain 4+ against mortal wounds" },
          { name: "One Shot",        desc: "Seeker missile can only be fired once per battle" },
        ],
      },
      { label: "Keywords",  value: ["Infantry", "Battlesuit", "T'au Empire", "Broadside Battlesuits"] },
      { label: "Points",    value: "100 pts" },
    ],
  },
  meta: { faction: "tau_empire" },
};

const LIST_SAMPLE = {
  result_type: "list", ok: true,
  data: ["Adeptus Custodes","Adepta Sororitas","Astra Militarum","Blood Angels","Dark Angels","Death Guard","Grey Knights","Space Marines","Space Wolves","T'au Empire","Thousand Sons","Tyranids","World Eaters"],
  meta: { type: "factions", count: 13 },
};

const TEXT_SAMPLE = {
  result_type: "text", ok: true,
  data: `Enemy faction set: Tyranids\nRun 'threat' to analyze threats, or 'spec <unit>' for enemy unit sheets.\n\nSession updated:\n  enemy_faction → Tyranids\n  Battle round  → 2`,
};

const HELP_FULL_SAMPLE = {
  result_type: "help", ok: true,
  data: {
    type: "full",
    groups: {
      math:     [{ name: "combat",   usage: "<attacker> vs <defender>",  description: "Run full Monte Carlo combat simulation", stub: false }],
      data:     [{ name: "spec",     usage: "spec <unit>",               description: "Display unit stat sheet", stub: false },
                 { name: "list",     usage: "list <units|factions|...>", description: "Browse loaded data", stub: false },
                 { name: "rule",     usage: "rule <term>",               description: "Look up a special rule", stub: false }],
      analysis: [{ name: "threat",   usage: "threat [faction]",          description: "Priority threat analysis for enemy faction", stub: false },
                 { name: "analyze",  usage: "analyze <unit>",            description: "Deep threat card for a specific unit", stub: false }],
      session:  [{ name: "enemy",    usage: "enemy <faction>",           description: "Set active enemy faction", stub: false },
                 { name: "nextturn", usage: "nextturn",                  description: "Advance to next battle round", stub: false },
                 { name: "session",  usage: "session",                   description: "Show session state", stub: false }],
      meta:     [{ name: "help",     usage: "help [command]",            description: "Show this help, or detail on a command", stub: false },
                 { name: "clear",    usage: "clear",                     description: "Clear terminal output", stub: false },
                 { name: "dice",     usage: "dice <NdN>",                description: "Roll dice", stub: true }],
    },
  },
};

const HELP_COMMAND_SAMPLE = {
  result_type: "help", ok: true,
  data: {
    type: "command", name: "combat",
    description: "Run a full Monte Carlo combat simulation between an attacker and a defender unit.",
    usage: "<attacker> [flags] vs <defender> [flags]",
    aliases: ["vs", "fight"],
    examples: ["broadside vs tervigon","broadside --ml vs tervigon","broadside --cover --invuln 4 vs intercessors"],
    stub: false,
  },
};

const ERROR_SAMPLE = {
  result_type: "error", ok: false,
  data: "No unit found matching 'braidside'. Did you mean: broadside battlesuits, crisis battlesuits, broadside commander?",
};

const makeEntry   = (input, result) => ({ id: Math.random(), input, result, pending: false });
const makePending = (input)         => ({ id: Math.random(), input, result: null, pending: true });

// ═══════════════════════════════════════════════════════════════════════════
// INDIVIDUAL COMPONENT SECTIONS
// ═══════════════════════════════════════════════════════════════════════════

const DEMO_SECTIONS = [

  // ── Combat sub-components ─────────────────────────────────────────────

  {
    label: "Banner  —  attacker vs defender header",
    width: "full",
    render: () => (
      <BannerCard attacker_name="Broadside Battlesuits" defender_name="Tervigon" flags={SAMPLE_FLAGS} />
    ),
  },
  {
    label: "Modifier Alerts  —  active rule flag banners",
    width: "full",
    render: () => <WarningBlock flag_notes={SAMPLE_FLAG_NOTES} />,
  },
  {
    label: "Ranged Output  —  expected damage, kill chance, swinginess",
    width: "half",
    render: () => <TotalUnitOutputRanged data={SAMPLE_RANGED} maxDmg={10} />,
  },
  {
    label: "Melee Output  —  expected damage, kill chance, swinginess",
    width: "half",
    render: () => <TotalUnitOutputMelee data={SAMPLE_MELEE} maxDmg={10} />,
  },
  {
    label: "Weapon Platform Totals  —  per-weapon damage and kill bars",
    width: "half",
    render: () => <WeaponPlatformTotals weapons={SAMPLE_WEAPONS} footer={SAMPLE_FOOTER} />,
  },
  {
    label: "Modifier Impact  —  stat sensitivity ranking",
    width: "half",
    render: () => <ModifierImpact modifiers={SAMPLE_MODIFIERS} />,
  },
  {
    label: "Simulation Confidence  —  Monte Carlo metadata",
    width: "full",
    render: () => <SimulationConfidence sim={SAMPLE_SIMULATION} />,
  },
  {
    label: "Abilities  —  expandable accordion (combat)",
    width: "full",
    render: () => <AbilitiesBlock abilities={SAMPLE_ABILITIES} />,
  },

  // ── Spec sub-components ───────────────────────────────────────────────

  {
    label: "Spec Banner  —  unit name header",
    width: "full",
    render: () => <SpecBannerCard title="Broadside Battlesuits" subtitle="T'au Empire  ·  100pts" />,
  },
  {
    label: "Keywords Bar  —  hover for description, click to search",
    width: "full",
    render: () => <KeywordsBar keywords={SAMPLE_KEYWORDS} />,
  },
  {
    label: "Stat Line + Weapons  —  stat boxes, weapons table, combat ratings",
    width: "full",
    render: () => <StatLine stats={SAMPLE_STATS} ratings={SAMPLE_RATINGS} weapons={SAMPLE_SPEC_WEAPONS} />,
  },
  {
    label: "Weapons Panel  —  standalone (ranged + melee tables)",
    width: "full",
    render: () => <WeaponsPanel weapons={SAMPLE_SPEC_WEAPONS} />,
  },
  {
    label: "Spec Abilities  —  expandable accordion",
    width: "full",
    render: () => <SpecAbilitiesBlock abilities={SAMPLE_SPEC_ABILITIES} />,
  },

  // ── Threat sub-components ─────────────────────────────────────────────

  {
    label: "Threat Banner  —  unit name with threat level badge (HIGH)",
    width: "full",
    render: () => <ThreatBanner name="Hive Tyrant" threatLevel="high" />,
  },
  {
    label: "Threat Banner  —  MEDIUM and LOW variants",
    width: "half",
    render: () => (
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <ThreatBanner name="Genestealers" threatLevel="medium" />
        <ThreatBanner name="Hormagaunts"  threatLevel="low"    />
      </div>
    ),
  },
  {
    label: "Metric Bars  —  5-metric threat chart (Threat/Dur=red, Dmg/Mob/Buff=cyan)",
    width: "half",
    render: () => <MetricBars metrics={SAMPLE_METRICS_HIGH} />,
  },
  {
    label: "Counter Block  —  top-3 roster picks with match scores",
    width: "full",
    render: () => <CounterBlock counters={SAMPLE_COUNTERS} />,
  },
  {
    label: "Threat Summary  —  faction overview: unit count, skew, roster status",
    width: "full",
    render: () => (
      <ThreatSummary
        faction="tyranids"
        factionLabel="Tyranids"
        stats={SAMPLE_THREAT_STATS}
        rosterLoaded={false}
        detachment={null}
      />
    ),
  },
  {
    label: "Threat Summary  —  roster loaded variant (with active detachment)",
    width: "full",
    render: () => (
      <ThreatSummary
        faction="tyranids"
        factionLabel="Tyranids"
        stats={SAMPLE_THREAT_STATS}
        rosterLoaded={true}
        detachment="Invasion Fleet"
      />
    ),
  },
  {
    label: "Threat Card Rows  —  collapsible unit rows (HIGH auto-expands, MED/LOW collapsed)",
    width: "full",
    render: () => (
      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
        {SAMPLE_THREAT_UNITS.map((u, i) => (
          <ThreatCardRow key={u.name} unitData={u} index={i + 1} />
        ))}
      </div>
    ),
  },
  {
    label: "Detachment Block  —  rules accordion with active detachment highlighted",
    width: "full",
    render: () => (
      <DetachmentBlock
        detachments={SAMPLE_DETACHMENTS}
        activeDetachment="Invasion Fleet"
      />
    ),
  },
  {
    label: "Stratagem List  —  stratagem accordion (active detachment sorted first)",
    width: "full",
    render: () => (
      <StratagemList
        stratagems={SAMPLE_STRATAGEMS}
        activeDetachment="Invasion Fleet"
      />
    ),
  },
  {
    label: "Strategic Notes  —  tips/warnings/focus derived from threat analysis",
    width: "full",
    render: () => <StrategicNotes notes={SAMPLE_STRATEGIC_NOTES} />,
  },

  // ── Terminal output types ──────────────────────────────────────────────

  {
    label: "Table  —  multi-column data with row count and meta",
    width: "full",
    render: () => <TerminalBlock entry={makeEntry("list units --faction tau", TABLE_SAMPLE)} />,
  },
  {
    label: "Card  —  unit stat sheet with stats block and weapon list",
    width: "full",
    render: () => <TerminalBlock entry={makeEntry("spec broadside", CARD_SAMPLE)} />,
  },
  {
    label: "List  —  numbered results, enter index for full lookup",
    width: "full",
    render: () => <TerminalBlock entry={makeEntry("list factions", LIST_SAMPLE)} />,
  },
  {
    label: "Text  —  plain pre-wrapped multi-line output",
    width: "full",
    render: () => <TerminalBlock entry={makeEntry("enemy tyranids", TEXT_SAMPLE)} />,
  },
  {
    label: "Help (Full)  —  command reference grouped by category",
    width: "full",
    render: () => <TerminalBlock entry={makeEntry("help", HELP_FULL_SAMPLE)} />,
  },
  {
    label: "Help (Command)  —  single command with usage and examples",
    width: "full",
    render: () => <TerminalBlock entry={makeEntry("help combat", HELP_COMMAND_SAMPLE)} />,
  },
  {
    label: "Error  —  failure with numbered suggestions if multiple matches",
    width: "full",
    render: () => <TerminalBlock entry={makeEntry("spec braidside", ERROR_SAMPLE)} />,
  },
  {
    label: "Loading State  —  pending animation shown while engine computes",
    width: "full",
    render: () => <TerminalBlock entry={makePending("broadside vs termagants")} />,
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// GROUP BLOCK SECTIONS
// ═══════════════════════════════════════════════════════════════════════════

const GROUP_BLOCKS = [
  {
    label:       "Combat Simulation Block",
    command:     "broadside battlesuits --ml vs tervigon",
    description: "Banner · Modifier Alerts · [60%] Total Unit Output (Ranged + Melee + Calc List) · [40%] Weapon Platform Totals + Modifier Impact + Simulation Confidence · Abilities",
    render: () => (
      <TerminalBlock
        entry={makeEntry(
          "broadside battlesuits --ml vs tervigon",
          { result_type: "combat", ok: true, data: SAMPLE_COMBAT_DATA, meta: { attacker: "broadside", defender: "tervigon" } }
        )}
      />
    ),
  },
  {
    label:       "Spec Block",
    command:     "spec broadside battlesuits",
    description: "Banner · Keywords Bar · [left] Stat Line + Weapons Table · [right] Combat Ratings · Abilities",
    render: () => (
      <TerminalBlock
        entry={makeEntry(
          "spec broadside battlesuits",
          { result_type: "spec_sheet", ok: true, data: SAMPLE_SPEC_DATA, meta: { faction: "t'au_empire" } }
        )}
      />
    ),
  },
  {
    label:       "Threat Card Block",
    command:     "analyze hive tyrant",
    description: "Threat Banner · [60%] Metric Bars · [40%] Counter Block · Profile · Keywords · Abilities · Enhancement",
    render: () => (
      <TerminalBlock
        entry={makeEntry(
          "analyze hive tyrant",
          { result_type: "threat_card", ok: true, data: SAMPLE_THREAT_CARD_DATA, meta: { threat_level: "high" } }
        )}
      />
    ),
  },
  {
    label:       "Threat Block (Faction Report)",
    command:     "threat tyranids",
    description: "Faction Header · ThreatSummary (unit count + skew + roster status + distribution chart) · Threat Card Rows (HIGH→MED→LOW, HIGH auto-expands) · Detachment Accordion · Stratagem List · Strategic Notes",
    render: () => (
      <TerminalBlock
        entry={makeEntry(
          "threat tyranids",
          { result_type: "threat_view", ok: true, data: SAMPLE_THREAT_VIEW, meta: { enemy_faction: "tyranids", unit_count: 3 } }
        )}
      />
    ),
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// LAYOUT HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function buildRows(sections) {
  const rows = [];
  let i = 0;
  while (i < sections.length) {
    const cur  = sections[i];
    const next = sections[i + 1];
    if (cur.width === "half" && next?.width === "half") {
      rows.push({ type: "pair", left: { ...cur, idx: i }, right: { ...next, idx: i + 1 } });
      i += 2;
    } else {
      rows.push({ type: "single", section: { ...cur, idx: i } });
      i++;
    }
  }
  return rows;
}

function SectionHeader({ index, label }) {
  return (
    <div style={{
      borderTop: `1px solid ${C.bordermid}`, paddingTop: "10px",
      marginBottom: "12px", display: "flex", alignItems: "baseline", gap: "12px",
    }}>
      <span style={{ color: C.amber, fontSize: "11px", letterSpacing: "0.15em", flexShrink: 0, textTransform: "uppercase" }}>
        {String(index + 1).padStart(2, "0")}
      </span>
      <span style={{ color: C.mid, fontSize: "13px" }}>{label}</span>
    </div>
  );
}

function GroupBlockHeader({ index, label, command, description }) {
  return (
    <div style={{ borderTop: `2px solid ${C.bordermid}`, paddingTop: "14px", marginBottom: "14px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: "12px", marginBottom: "6px" }}>
        <span style={{ color: C.amber, fontSize: "11px", letterSpacing: "0.15em", flexShrink: 0, textTransform: "uppercase" }}>
          {String(index + 1).padStart(2, "0")}
        </span>
        <span style={{ color: C.amber, fontSize: "15px", fontWeight: 700, letterSpacing: "0.06em" }}>
          {label}
        </span>
      </div>
      <div style={{ paddingLeft: "32px", display: "flex", flexDirection: "column", gap: "3px" }}>
        <span style={{ color: C.dim, fontSize: "11px", fontStyle: "italic" }}>{description}</span>
        <span style={{ color: C.label, fontSize: "11px" }}>
          command: <span style={{ color: C.green }}>{command}</span>
        </span>
      </div>
    </div>
  );
}

function PageSectionDivider({ title }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "16px", margin: "48px 0 32px" }}>
      <div style={{ flex: 1, height: "1px", background: C.bordermid }} />
      <span style={{ color: C.amber, fontSize: "11px", letterSpacing: "0.25em", textTransform: "uppercase", flexShrink: 0 }}>
        {title}
      </span>
      <div style={{ flex: 1, height: "1px", background: C.bordermid }} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function DemoView() {
  const rows = buildRows(DEMO_SECTIONS);

  return (
    <div
      className="h-full overflow-y-auto font-mono"
      style={{ backgroundColor: "var(--ct-bg)", padding: "20px 24px" }}
    >
      {/* Page title */}
      <div style={{ marginBottom: "28px" }}>
        <div style={{
          color: C.amber, textShadow: `0 0 8px ${C.amber}80`,
          fontSize: "13px", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: "6px",
        }}>
          ── Component Demo ──
        </div>
        <div style={{ color: C.dim, fontSize: "12px" }}>
          Every UI component shown independently with realistic sample data. Scroll to see them all.
        </div>
      </div>

      {/* Individual components */}
      {rows.map((row, ri) => {
        if (row.type === "single") {
          const { section } = row;
          return (
            <section key={ri} style={{ marginBottom: "36px" }}>
              <SectionHeader index={section.idx} label={section.label} />
              {section.render()}
            </section>
          );
        }
        return (
          <div key={ri} style={{ marginBottom: "36px", display: "flex", gap: "14px", alignItems: "flex-start" }}>
            {[row.left, row.right].map(section => (
              <div key={section.idx} style={{ flex: 1, minWidth: 0 }}>
                <SectionHeader index={section.idx} label={section.label} />
                {section.render()}
              </div>
            ))}
          </div>
        );
      })}

      {/* Group blocks */}
      <PageSectionDivider title="Group Blocks" />
      <div style={{ color: C.dim, fontSize: "12px", marginBottom: "32px" }}>
        Full composed block layouts — each block is a cluster of components assembled by a single command.
      </div>

      {GROUP_BLOCKS.map((block, i) => (
        <section key={i} style={{ marginBottom: "48px" }}>
          <GroupBlockHeader index={i} label={block.label} command={block.command} description={block.description} />
          {block.render()}
        </section>
      ))}

      {/* Footer */}
      <div style={{
        color: C.dim, fontSize: "11px", letterSpacing: "0.1em",
        paddingTop: "12px", borderTop: `1px solid ${C.border}`, marginBottom: "32px",
      }}>
        END OF COMPONENT DEMO
      </div>
    </div>
  );
}
