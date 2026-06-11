# Session Prompt — Math Engine Round 3 (MED rules fixes)

Copy everything below this line into a new chat.

---

You are continuing a math-correctness workstream on the Combat Terminal 2 project (Warhammer 40k 10th-edition combat calculator). Two prior rounds (2026-06-10) fixed the CRITICAL and HIGH items; this round is the well-specified MEDIUM items. Work in the project folder; follow the instructions exactly — every fix below includes the precise file, the 10e rule, and the test to add. Do not redesign anything.

## Before you start

1. Read `BACKLOG.md` (project protocol). Find the open MED row: "10e rules-fidelity cluster (see CT2_Project_Scan_2026-06-10.md §MATH MED for detail)".
2. Run the baseline suite and confirm **118 passed, 0 failed**:
   `python3 tests/test_combat_math.py`
   (If sandbox modules are missing: `pip install pyairtable fastapi httpx --break-system-packages`.)
3. Key files: `data/combat_terminal/combat_math_engine.py` (core math: EV in `compute_attack_result`, MC in `monte_carlo_attack`), `data/combat_terminal/math_adapter.py` (dossier→engine translation; `_apply_flags`; the three passes `_run_ev` / `_run_mc` / `_run_total`), `data/combat_terminal/flags.py` (flag registry — notes/legend text), `tests/test_combat_math.py`.

## Ground rules

- EV and MC must model the same universe — every behavioural fix goes into BOTH `compute_attack_result` and `monte_carlo_attack` (and the sensitivity `_run_total` where it applies flags).
- `expected_dmg` is rounded to 2dp in summaries. For exact-ratio tests use the clean-numbers trick the existing tests use: BS4+, S4 vs T4, Sv4+ → 0.125 dmg/attack; set weapon damage=4 → 0.5/attack.
- `TestFlagRegistrySync` asserts every flag produces a real change in `_apply_flags` — when you re-gate a flag, have `_apply_flags` set a boolean (mirror how `heavy`/`use_heavy` works) so the sync test still passes.
- If an existing test asserts the OLD (wrong) behaviour, update it to the 10e rule and say so in a comment.
- Run the full suite after every numbered fix, not just at the end. Also run `python3 tests/test_loader_smoke.py` and `python3 tests/test_api_integration.py` once at the end.
- Do NOT touch: the Blast +1-per-5-models logic, `anti_entries`/`resolve_anti_threshold`, the keyword normaliser, `_merge_mods` ordering, or anything in `engine.py` beyond what a fix explicitly names.

## The fixes (do in this order)

### 1. ±1 net modifier cap on hit and wound rolls (MM1)
10e rule: cumulative modifiers to a hit roll or wound roll are capped at net +1/−1.
Current: `hit_target = clamp(raw_hit - mods.hit_bonus + mods.hit_penalty, 2, 6)` (and same shape for wound) — `ml + heavy + hitplus1` on BS5+ gives 2+ (legal answer: 4+).
Fix in BOTH `compute_attack_result` and `monte_carlo_attack`:
`net = clamp(mods.hit_bonus - mods.hit_penalty, -1, 1)` then `hit_target = clamp(raw_hit - net, 2, 6)`; identical pattern for the wound roll (`wound_bonus`/`wound_penalty`).
Test: BS5+ with `hit_bonus=3` → `hit_target == 4`; wound side equivalent; and a flag-level test via `compute_combat` with flags `["ml","heavy","hitplus1"]` (use a HEAVY-keyword weapon) asserting damage equals the single-+1 case.

### 2. Torrent weapons cannot score Critical Hits (MM2)
10e rule: Torrent = no hit roll is made → no Critical Hits → Sustained/Lethal never trigger.
Current: EV sets `p_crit_hit = 1/6` under torrent; MC rolls a d6 for crit.
Fix: EV — under `mods.use_torrent`, `p_hit = 1.0; p_crit_hit = 0.0`. MC — under torrent set `crit_hit = False` (don't roll the crit die).
Test: torrent weapon, 6 attacks, `sustained_hits=1`, `lethal_hits=True` → `expected_hits == 6.0` exactly, and EV ≈ MC mean within 10%.

### 3. Cover gives no bonus vs AP0 on a 3+ or better save (MM3)
10e Benefit of Cover: no save improvement against AP0 attacks if the model's Save characteristic is 3+ or better.
Fix in `compute_save_target` (`combat_math_engine.py`): apply `cover_bonus` only when NOT (`effective_ap == 0 and target.save <= 3`).
Test: Sv3+ target with `cover=True` vs AP0 → `save_target == 3` (not 2); vs AP-1 → cover applies (`save_target == 3`); Sv4+ in cover vs AP0 → `save_target == 3`.

### 4. `target.models` must be the real defender size (MM5)
Current: `math_adapter.compute_combat` builds the target via `_unit_to_target` which hardcodes `models=1`, so MC kill buckets truncate at 1 and `expected_kills` is never capped by squad size.
Fix: in `compute_combat` (and `compute_sensitivity`), after building the target: `target.models = max(1, def_models)`. Then in the EV summary, cap `expected_kills` at `def_models`. Sanity-check `monte_carlo_attack`'s per-model HP tracking handles models>1 (it already tracks `current_model_hp`/kills; just confirm kill buckets now extend past "1").
Test: big weapon (A10, S8, AP-2, D3) vs 5-model W1 squad with `def_models=5` → `expected_kills <= 5` and MC `kill_bucket_probabilities` has keys beyond "1".

### 5. `--melta:N` flag must override, not stack (MM7)
Current: the flag sets `base_mods.melta_value = N`, but `_merge_mods` SUMS numeric fields → weapon Melta 2 + flag `melta2` = melta 4.
Fix: add `melta_override: Optional[int] = None` to `AttackModifiers` (Optional merges safely via the None branch of `_merge_mods`). `_apply_flags` sets `melta_override` (and still `use_melta=True`) instead of `melta_value`. At the three application sites in `math_adapter` use: `mv = merged.melta_override if merged.melta_override is not None else merged.melta_value`, then `flat_damage_bonus += mv` when `use_melta`.
Test: weapon with `MELTA 2` keyword + flag `melta2` → damage identical to the keyword-only `--melta` case (no doubling); bare `--melta` (no value) on a MELTA 2 weapon still applies 2.

### 6. Gate `--lance` on the LANCE keyword (MM6)
Current: keyword LANCE sets `use_lance` (read by nothing); the `--lance` flag adds `wound_bonus += 1` to EVERY weapon.
Fix — mirror the heavy pattern exactly (`use_heavy` flag + `is_heavy` keyword + gate at the three sites): add `is_lance: bool = False` to `AttackModifiers`; keyword LANCE sets `is_lance=True` (keep setting `use_lance` for back-compat or repurpose it as the flag bit); `_apply_flags` `--lance` sets the boolean only (NOT wound_bonus — boolean change keeps `TestFlagRegistrySync` green); in `_run_ev`/`_run_mc`/`_run_total` add: `if merged.use_lance and merged.is_lance: merged.wound_bonus += 1`. Update the lance note/legend text in `flags.py` to "+1 to Wound for LANCE weapons (on the charge)". Update any existing lance test asserting the old always-on behaviour.
Test: LANCE-keyword weapon + `--lance` → damage rises; non-lance weapon + `--lance` → damage unchanged.

### 7. STRETCH (only if 1–6 are green): ledger reads computed values (MM10)
`math_ledger.py` re-derives save/hit/wound targets and can contradict the engine's numbers (ignores ability-detected invulns, `svplus`/`eap`, prints the cover note even when cover is ignored). Fix minimally: `math_adapter` already stamps per-weapon `hit_target`/`wound_target`/`fail_save_pct` into `per_weapon_dmg` — also stamp the computed `save_target` (from `AttackResult.save_target`), and make `build_combat_ledger` read those stamped values instead of re-deriving; drop the cover line when `ml`/`igncover` is active. Add one test asserting the ledger's save event matches `AttackResult.save_target` for an invuln-ability unit.

## Do NOT attempt (needs design judgment — leave open in BACKLOG)
MM4 (EV FNP per-damage-point kill math), MM9 (melee strike/sweep profile summing), MM11 (defender-side leader merge).

## When done

1. Full suites green: `python3 tests/test_combat_math.py` (118 + your new tests), `tests/test_loader_smoke.py` (15), `tests/test_api_integration.py` (11), `tests/test_crusade_logic.py` (19).
2. Update `BACKLOG.md`: split the open MED cluster row — mark each item you fixed as `✅ FIXED 2026-06-XX` with a one-line note + test name; leave MM4/MM9/MM11 (and MM8-adjacent leftovers) open.
3. End your final message with exactly this (per the juzzie-deploy workflow):

```bash
cd ~/Desktop/Claude/Claude\ Vault/projects/combat_terminal_2\ 2
git add -A && git commit -m "<one-line summary of round-3 math fixes>" && git push origin production
```
Verify: `curl -s https://war.juzzie.xyz/api/version` (auto-deploy within ~60s; if stale: on Phil-2 `cd ~/CombatTerminal && git pull origin production && cd ~/JuzzieSite/deploy && docker compose up -d --build --no-deps warterminal`).
