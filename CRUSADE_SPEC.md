# Crusade Tracker — Architecture Spec

## Overview

A CRUSADE tab in Combat Terminal for managing Warhammer 40K Crusade campaigns. Tracks an Order of Battle, unit progression (XP, ranks, battle honours, scars), requisition points, and per-battle state. When a battle starts, the selected units become the active roster — all combat/spec/threat commands use crusade-enriched data (filtered loadouts, battle trait modifiers, relic abilities).

---

## 1. Navigation

Add `"crusade"` to `VISIBLE_CONTEXTS` in App.jsx. Nav command: `crusade` or `cr`.

```
TERMINAL | UNITS | ROSTERS | CRUSADE | RULES
```

The tab renders `<CrusadeContext>` — a new top-level component like `RostersContext`.

---

## 2. Airtable Schema

### Table: `CrusadeCampaigns`

| Field | Type | Description |
|-------|------|-------------|
| CampaignId | string | Unique slug (e.g., `siege-of-corfex-1717000000`) |
| Name | string | Display name |
| Faction | string | Faction slug |
| RP | int | Current requisition points |
| SupplyLimit | int | Max OOB points (starts 1000–3000) |
| BattleCount | int | Total battles played |
| Wins | int | |
| Losses | int | |
| Draws | int | |
| Owner | string | Profile name |
| CreatedAt | string | ISO timestamp |
| UpdatedAt | string | ISO timestamp |
| State | string | JSON blob for extensibility (notes, house rules, etc.) |

### Table: `CrusadeUnits`

Each row is one unit's Crusade Card.

| Field | Type | Description |
|-------|------|-------------|
| UnitId | string | Unique ID (`campaignId:index`) |
| CampaignId | string | FK to campaign |
| UnitName | string | Datasheet name (e.g., "Hammerhead Gunship") |
| Nickname | string | User-assigned label |
| Points | int | Point cost |
| Models | int | Squad size |
| IsLeader | bool | Character/leader unit |
| AttachedTo | string | Nickname or name of bodyguard unit |
| Loadout | string | JSON array of weapon names |
| XP | int | Experience points |
| Rank | string | Fresh / Blooded / Battle-hardened / Heroic / Legendary |
| BattlesFought | int | |
| BattlesSurvived | int | |
| EnemyKills | int | Lifetime kills |
| Honours | string | JSON array of battle honour objects |
| Scars | string | JSON array of battle scar objects |
| CrusadePoints | int | Honours.length - Scars.length |
| MarkedForGreatness | bool | Chosen for current/next battle |
| UpdatedAt | string | ISO timestamp |

### Table: `CrusadeBattles`

| Field | Type | Description |
|-------|------|-------------|
| BattleId | string | Unique ID |
| CampaignId | string | FK to campaign |
| Mission | string | Mission name |
| PointLimit | int | Battle size (e.g., 1000) |
| Result | string | win / loss / draw |
| RPGained | int | RP earned this battle |
| UnitResults | string | JSON: `[{ unitId, kills, destroyed, xpGained, scarRoll?, newHonour? }]` |
| Notes | string | Optional battle notes |
| PlayedAt | string | ISO timestamp |

---

## 3. Crusade Rules Data

### 3.1 Ranks & XP Thresholds

```json
{
  "ranks": [
    { "name": "Fresh",            "xp": 0,  "honours": 0 },
    { "name": "Blooded",          "xp": 6,  "honours": 1 },
    { "name": "Battle-hardened",  "xp": 16, "honours": 2 },
    { "name": "Heroic",           "xp": 31, "honours": 3 },
    { "name": "Legendary",        "xp": 51, "honours": 4 }
  ]
}
```

### 3.2 XP Awards (per battle)

| Condition | XP |
|-----------|-----|
| Participated in battle | +1 |
| On the winning side | +1 |
| Destroyed 1+ enemy unit | +1 |
| Destroyed 3+ enemy units | +1 (bonus) |
| Marked for Greatness | +1 |
| Achieved agenda objective | +1 to +3 (varies) |

### 3.3 Battle Scars (D6 roll when destroyed)

| Roll | Result |
|------|--------|
| 1–3 | No scar |
| 4–5 | Battle Scar (roll on scar table) |
| 6 | Devastating Blow (worse scar) |

#### Generic Scar Table (D6)

| Roll | Scar | Effect |
|------|------|--------|
| 1 | Deep Scars | -1 Leadership, -1 OC |
| 2 | Battle Weary | Cannot use Fire Overwatch stratagem |
| 3 | Disgraced | -1 to Hit rolls |
| 4 | Fatigued | -1 to Advance and Charge rolls |
| 5 | Shell Shocked | -1 to Save rolls against ranged |
| 6 | Mark of Shame | Cannot be marked for greatness, -1 OC |

### 3.4 Requisition Actions

| Action | RP Cost | Effect |
|--------|---------|--------|
| Fresh Recruits | 1 | Add a unit to the Order of Battle |
| Rearm and Resupply | 1 | Change a unit's weapon loadout |
| Repair and Recuperate | 1 | Remove a battle scar from a unit |
| Increase Supply Limit | 1 | +100 pts to OOB supply limit |
| Heroic Relic | 1 | Give a Heroic+ unit a Crusade Relic |

### 3.5 Battle Honours

Honours are slotted when a unit ranks up. Types:

- **Battle Trait** — persistent stat bonus (e.g., +1 BS, +1 T, 5+ FNP)
- **Weapon Enhancement** — upgrade a specific weapon (+1 S, +1 AP, etc.)
- **Relic** — character-only special item (replaces or augments a weapon)
- **Crusade Relic** — more powerful, requires Heroic+ rank and 1 RP

#### Generic Battle Traits (Infantry)

| Trait | Effect | Combat Flag |
|-------|--------|-------------|
| Expert Marksmen | +1 to Hit (ranged) | `rrhit_auto` / displayed as BS modifier |
| Grizzled | +1 Leadership, +1 OC | stat modifier |
| Seasoned Warriors | +1 to Hit (melee) | melee BS modifier |
| Resilient | 6+ Feel No Pain | `fnp:6` |
| Swift | +1" Move | stat modifier |
| Vengeful | Re-roll wound rolls of 1 | `rrwound1` |

#### Generic Battle Traits (Vehicle)

| Trait | Effect | Combat Flag |
|-------|--------|-------------|
| Armour Plating | -1 Damage (min 1) | `halfdmg`-like |
| Expert Gunners | +1 to Hit (ranged) | BS modifier |
| Reliable | 6+ Feel No Pain | `fnp:6` |
| Mobile | +2" Move | stat modifier |
| Reinforced Hull | +1 Wound | stat modifier |
| Deadly Payload | +1 AP on one weapon | weapon modifier |

---

## 4. Component Structure

```
render/web/src/components/
  CrusadeContext.jsx          ← top-level tab (like RostersContext)
  crusade/
    CampaignHeader.jsx        ← name, faction, RP, supply limit, W-L
    OrderOfBattle.jsx         ← full OOB list, add/remove units, point total
    CrusadeCard.jsx           ← per-unit detail (XP, honours, scars, loadout)
    MusterPanel.jsx           ← checkbox unit selector with point counter
    BattleTracker.jsx         ← in-battle kill/death tracking
    PostBattleFlow.jsx        ← XP calc, scar rolls, promotion prompts
    HonourPicker.jsx          ← select battle trait/relic when promoted
    RPActions.jsx             ← spend RP: add unit, rearm, heal scar, etc.
```

---

## 5. Crusade-to-Combat Bridge

This is the critical integration point. When the user clicks **"Start Battle"** in MusterPanel:

### 5.1 What Happens

1. The selected units are written to `_session["roster_my"]` via `sync_roster_context()` — same as today's roster system.
2. Each unit entry is **enriched** with crusade data:

```json
{
  "name": "Hammerhead Gunship",
  "nickname": "Railgun HH",
  "faction": "tau",
  "models": 1,
  "weapons": ["Railgun", "Seeker missile", "Twin smart missile system"],
  "is_leader": false,
  "points": 200,
  "attached_to": null,

  "crusade": {
    "rank": "Battle-hardened",
    "xp": 18,
    "honours": [
      { "type": "battle_trait", "name": "Expert Gunners", "effect": "+1 to Hit (ranged)", "flag": "hit_bonus:1" },
      { "type": "relic", "name": "Armour of Contempt", "effect": "4+ invulnerable save", "flag": "invuln:4" }
    ],
    "scars": [
      { "name": "Deep Scars", "effect": "-1 Leadership, -1 OC", "flag": null }
    ]
  }
}
```

### 5.2 Engine-Side: Applying Crusade Modifiers

In `_query_combat()`, after resolving the roster entry:

```python
# If roster entry has crusade data, apply as automatic flags
crusade = att_roster_entry.get("crusade", {})
auto_flags = []
for honour in crusade.get("honours", []):
    if honour.get("flag"):
        auto_flags.append(honour["flag"])
for scar in crusade.get("scars", []):
    if scar.get("flag"):
        auto_flags.append(scar["flag"])

# Merge auto_flags into the combat flags
flags = flags + auto_flags
```

This means battle traits that translate to combat flags (like +1 to Hit → `hit_bonus:1`) are automatically applied to the math. No manual `--` flags needed.

### 5.3 Display Integration

**Spec sheets** (`_build_spec_result`):
- Crusade honours appear in the abilities section, styled distinctly (amber/gold for honours, red for scars)
- Rank badge shown in subtitle: `"T'au · 200pts · Battle-hardened ◈"`

**Combat output** (`_query_combat`):
- Weapon table: if a battle trait modifies a weapon stat, the modified value is **bold + blue** (new `_crusade_modified` flag on the weapon entry)
- Flag notes section: auto-applied crusade modifiers show with a ◈ icon prefix instead of the standard modifier icons
- Abilities section: relics/special traits appear with gold styling

**Disambiguation**: when picking between roster entries, show rank + nickname: `"Hammerhead (Railgun HH)  [Battle-hardened · 18XP]  (200 pts)"`

---

## 6. UX Flow

### Phase 1: Campaign Setup
1. User clicks CRUSADE tab → sees "No campaigns" → "Create Campaign" button
2. Prompt: campaign name, faction, starting RP (default 5), supply limit
3. Campaign created in Airtable → header appears

### Phase 2: Build Order of Battle
1. User uploads roster text (same flow as rosters tab) → parsed into units
2. Each unit gets a Crusade Card row in `CrusadeUnits`
3. User can nickname units, assign leaders, set loadouts
4. OOB panel shows running point total vs supply limit

### Phase 3: Muster for Battle
1. User clicks "New Battle" → enters point limit (e.g., 1000)
2. Checkbox list of OOB units with running total
3. "Mark for Greatness" on one unit
4. "Start Battle" → selected units become active roster context
5. Terminal commands now filter to these units

### Phase 4: In-Battle
1. Battle tracker shows selected units with kill counters
2. Click +kill or type `kill hammerhead 2` to log kills
3. Click "destroyed" or type `destroyed strike team` to mark dead
4. Standard combat terminal commands work with crusade-enriched data

### Phase 5: Post-Battle
1. "End Battle" → set result (win/loss/draw)
2. Auto-calculate XP for each unit
3. Roll for scars on destroyed units (D6, show result)
4. Assign scars to units that rolled 4+
5. Flag promotions → prompt to pick battle honour
6. +1 RP awarded
7. Battle saved to `CrusadeBattles` table
8. All unit updates saved to `CrusadeUnits`

### Phase 6: Between Battles
1. Spend RP via actions panel
2. Add/remove units from OOB
3. Change loadouts (Rearm and Resupply)
4. Remove scars (Repair and Recuperate)
5. View battle history

---

## 7. Build Order

### Session 1: Foundation
- [ ] Airtable tables: `CrusadeCampaigns`, `CrusadeUnits`
- [ ] Backend: `crusade_store.py` (CRUD operations, mirroring `shared_rosters.py` pattern)
- [ ] Backend: API routes in `server.py`
- [ ] Frontend: `CrusadeContext.jsx` shell + campaign create/load
- [ ] App.jsx: add CRUSADE tab to navigation

### Session 2: Order of Battle
- [ ] OOB panel with unit list, point totals
- [ ] Import from roster text (reuse `parseRosterUnits`)
- [ ] CrusadeCard component (view/edit per unit)
- [ ] Nickname, leader attachment, loadout editing (reuse existing patterns)

### Session 3: Muster + Combat Bridge
- [ ] MusterPanel with checkbox selection + point counter
- [ ] "Start Battle" → sets enriched roster context
- [ ] Engine: apply crusade auto-flags in `_query_combat`
- [ ] Display: crusade-modified stats highlighted in combat output
- [ ] Display: honours/scars in spec sheets

### Session 4: Battle Tracking + Post-Battle
- [ ] BattleTracker: kill/death tracking UI
- [ ] PostBattleFlow: XP calculation, scar rolls, promotion
- [ ] HonourPicker: select battle traits/relics
- [ ] `CrusadeBattles` table + battle history view
- [ ] RP actions (add unit, rearm, heal scar, increase supply)

### Session 5: Rules Data + Polish
- [ ] Full battle traits/scars tables (faction-specific where available)
- [ ] Crusade relics
- [ ] Agenda system (mission-specific XP objectives)
- [ ] Campaign summary/stats dashboard
