# CT2 Manual QA Checklist — P0 Fixes
Generated: 2026-04-02

Run through every item before marking the session closed. Each item has: the exact command to type, what you're checking, and the pass/fail signal.

Start the server before testing: `python main.py`

---

## 1 — Rapid Fire: attacks should NOT double without --rf

**What was broken:** RAPID FIRE N was unconditionally added to the attack count at weapon-parse time. A Storm Bolter (A2, RF2) would always show 4 attacks regardless of range.

**What's fixed:** RF N is stored separately and only applied when `--rf` flag is present.

### Test 1a — RF absent (standard range)
```
deathwing command squad vs tactical squad
```
- Open the result. Find the **Storm Bolter** row in the weapons table.
- **Pass:** Attacks column shows `2` (or `2 (N)` where N = squad total). No RF bonus applied.
- **Fail:** Attacks column shows `4` or `2 + RF 2` — the RF bonus is being added unconditionally.

### Test 1b — RF present (within half range)
```
deathwing command squad vs tactical squad --rf
```
- Find the **Storm Bolter** row again.
- **Pass:** Attacks column shows `4` (or squad-scaled equivalent). The `[rf]` flag note should appear somewhere in the result.
- **Fail:** Attacks are still `2`, same as without `--rf` — the flag is not being applied.

### Test 1c — Smoke-test a non-RF weapon is unaffected
```
deathwing command squad vs tactical squad --rf
```
- Find any weapon in the result that does NOT have Rapid Fire in its keywords (e.g. melee weapons, bolt pistols).
- **Pass:** That weapon's attack count is identical to what you'd see without `--rf`.
- **Fail:** Non-RF weapons also gain extra attacks when `--rf` is passed.

---

## 2 — Blast: minimum 3 attacks only vs 6+ model units

**What was broken:** BLAST minimum-3-attacks rule was never applied — the flag was detected but no math change occurred. Additionally, Blast requires knowing the defender's squad size, which wasn't being passed through.

**What's fixed:** `def_models` is now computed from the defender's `unit_composition` and threaded into `compute_combat()`. Min-3 is applied only when `use_blast=True` AND `def_models >= 6`.

### Test 2a — Blast vs small unit (should NOT trigger min-3)
```
impulsor vs tactical sergeant --blast
```
- Tactical Sergeant is a 1-model unit.
- Find **Bellicatus missile array – frag** (has D6 attacks, BLAST keyword).
- **Pass:** Attacks shows `D6` (unchanged). The Blast rule does not force 3 minimum vs a 1-model target.
- **Fail:** Attacks shows `3` or `3.0` — min-3 is being applied regardless of squad size.

### Test 2b — Blast vs large unit (SHOULD trigger min-3)
```
impulsor vs tactical squad --blast
```
- Tactical Squad is a 10-model unit.
- Find **Bellicatus missile array – frag** (D6 attacks).
- **Pass:** Expected damage is higher than in Test 2a, consistent with a minimum of 3 attacks (EV of D6 clamped to ≥ 3 = ~4.17, vs unclamped EV 3.5). The increase should be visible in Dmg and Kills numbers.
- **Fail:** Numbers are identical to Test 2a — the min-3 rule is not firing.

### Test 2c — Blast without flag (should be ignored)
```
impulsor vs tactical squad
```
- Same attacker/defender pair, no `--blast` flag.
- **Pass:** Bellicatus missile array – frag shows its normal D6 EV (3.5), no min-3 applied.
- **Fail:** Min-3 applies anyway even without the flag.

---

## 3 — Kill%: must show P(≥1 kill), not the save fail rate

**What was broken:** The Kill% column in the combat output was pulling `fail_save_pct` — the probability that a single attack in the chain fails the save step (~33–80% for typical weapons). This is a chain probability, not a kill probability. A weapon with 1 expected kill might have shown "67% kill chance" which is actually the per-attack save-fail rate.

**What's fixed:** Kill% now sources `kill_chance_pct`, computed from the Monte Carlo kill-bucket distribution as `1 − P(0 kills)`. This is the true probability of killing at least one model.

### Test 3a — Kill% is in a believable range
```
deathwing command squad vs tactical marine
```
- A Tactical Marine has 2 wounds, Sv 3+.
- Run the combat and look at Kill% for each weapon.
- **Pass:** Kill% values are below 100% and reflect the realistic probability of at least one kill. For a weapon doing ~1 expected kill, Kill% should be somewhere in the 50–80% range (accounting for variance), NOT identical to the save fail rate.
- **Fail:** Kill% values look like save-fail percentages (e.g. 66.7% for an AP-1 weapon against Sv3+ regardless of how many attacks there are). If Kill% and the save-fail chain number look suspiciously identical across many weapons, the old logic is still live.

### Test 3b — Kill% vs save% are distinct numbers
```
beastboss vs space marine --rf
```
- Run the combat. In the per-weapon breakdown (probability chain panel or weapon row tooltips):
- **Pass:** `Kill%` and `fail_save_pct` (or however the UI labels the save-fail chain) show different values for the same weapon. They should agree only by coincidence, not structurally.
- **Fail:** Every weapon's Kill% is exactly equal to its save-fail probability — the old `pw.get("fail_save_pct")` assignment is still in place.

### Test 3c — Kill% is `null` / absent when MC is unavailable
- If you have a way to force MC off or if you see any weapon return without MC data:
- **Pass:** Kill% column shows `—` or is empty rather than crashing or showing 0%.
- **Fail:** TypeError or blank white space indicating an unhandled `None`.

---

## 4 — Legend renderer: tabbed UI in the browser

**What was broken:** `legend` command returned `result_type: "legend"` from the backend, but `TerminalBlock.jsx` had no matching case. The result fell through to the raw JSON dump (plain white text showing the full JSON object).

**What's fixed:** `TerminalLegendBlock` component added with 4 tabs; `case "legend":` wired into the dispatcher.

### Test 4a — Legend renders (not raw JSON)
```
legend
```
- **Pass:** A styled component renders with tab buttons at the top: **Stat Columns**, **Probability Chain**, **Modifier Flags**, **Swinginess**. The default tab (Stat Columns) is active and shows a table with abbreviations like A, BS, WS, S, AP, D, T, Sv, W.
- **Fail:** Raw JSON appears — a wall of `{`, `"abbrev"`, `"full"`, etc. The dispatcher case is missing or not saved.

### Test 4b — Tab switching works
```
legend
```
- Click each tab in turn: **Probability Chain**, **Modifier Flags**, **Swinginess**.
- **Pass (Prob Chain):** Shows Hit%, Wound%, Save%, Dmg, Kills entries with descriptions, example lines in amber italic.
- **Pass (Modifier Flags):** Shows a grid with flag column (e.g. `--ml`), description (e.g. "Markerlights / Guided"), effect text.
- **Pass (Swinginess):** Shows Stable, Moderate, Variable, Swingy labels with CV ranges.
- **Fail:** Tab click has no effect, or content of all tabs looks identical, or wrong data appears under a tab.

### Test 4c — Notes footer is always visible
```
legend
```
- Scroll to the bottom of the legend result without switching tabs.
- **Pass:** A "Notes" section appears at the bottom regardless of which tab is active. It lists bullet-point footnotes (e.g. "Hit%, Wound%, Save% are CONDITIONAL probabilities…").
- **Fail:** Notes section disappears when switching tabs, or is not present at all.

### Test 4d — Tabs are themed correctly
- **Pass:** Active tab border and text use the terminal primary colour (green / themed). Inactive tabs use the dim colour. Flag column in Modifier Flags tab uses monospace font. Example text in Probability Chain tab uses amber colour.
- **Fail:** All buttons same colour, or unstyled grey browser-default buttons.

---

## 5 — Regression: existing combat flow still works

Run these to confirm the P0 changes didn't break anything that was already working.

### Test 5a — Basic combat resolves
```
beastboss vs tactical marine
```
- **Pass:** Full combat result renders with WeaponStatsTable, TargetingOutcome bars, Probability Chain panel. No 500 error, no blank screen.

### Test 5b — Modifier flags still apply
```
beastboss vs tactical marine --ml --dev
```
- **Pass:** `[ml]` and `[dev]` flag notes appear. Hit% and damage numbers are higher than without flags. No crash.

### Test 5c — Multi-model attacker scales attacks
```
deathwing command squad vs tactical squad
```
- **Pass:** Attacks column shows a parenthetical total (e.g. `2 (10)` for a 5-model squad with 2 attacks each). Dmg reflects the full squad, not just 1 model.

### Test 5d — Sensitivity sweep renders
```
beastboss vs space marine
```
Then check the sensitivity panel (if visible in the combat result).
- **Pass:** Sensitivity bars show ±1 BS, ±1 AP, ±1 damage modifiers with delta values. No crash.

### Test 5e — Spec sheet still works
```
spec beastboss
```
- **Pass:** Full stat card renders with M/T/Sv/W/OC, weapon table, abilities.

### Test 5f — Rerun with flag toggle
After any combat result, type:
```
rerun --lethal
```
- **Pass:** Combat recalculates and the `[lethal]` note appears. Dmg values change (or a note explains no change if weapon has no crit hits).

---

## 6 — CLI smoke tests (if using `python main.py --cli`)

### Test 6a — Basic combat in CLI
```
beastboss vs tactical marine
```
- **Pass:** CLI prints weapon stats table and summary line with Dmg / Kills / Kill%.

### Test 6b — Legend in CLI
```
legend
```
- **Pass:** CLI prints the stat columns section as plain text. (Legend renderer is web-only tabs, but the backend still returns data; CLI should print it without crashing even if it just dumps the text sections.)

---

## Sign-off

| Fix | Tested | Result | Notes |
|-----|--------|--------|-------|
| RF: no extra attacks without --rf | ☐ | | |
| RF: correct extra attacks with --rf | ☐ | | |
| RF: non-RF weapons unaffected | ☐ | | |
| Blast: no min-3 vs small unit | ☐ | | |
| Blast: min-3 applied vs 6+ models | ☐ | | |
| Blast: no effect without --blast flag | ☐ | | |
| Kill%: realistic values (not save-fail%) | ☐ | | |
| Kill%: distinct from fail_save_pct | ☐ | | |
| Kill%: null-safe when MC absent | ☐ | | |
| Legend: renders component (not JSON) | ☐ | | |
| Legend: all 4 tabs switch correctly | ☐ | | |
| Legend: Notes footer always visible | ☐ | | |
| Legend: styled per theme | ☐ | | |
| Regression: basic combat | ☐ | | |
| Regression: flags apply | ☐ | | |
| Regression: multi-model scaling | ☐ | | |
| Regression: sensitivity sweep | ☐ | | |
| Regression: spec sheet | ☐ | | |
| Regression: rerun | ☐ | | |
