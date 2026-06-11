# Combat Terminal 2 — Project Scan

**Date:** 2026-06-10
**Scope:** math engine correctness, faction data completeness, inefficiencies, duplicates
**Method:** three parallel deep audits (math, data, efficiency); all CRITICAL claims verified against source; existing test suite run (89/89 pass — every finding below slips through it)

Everything in the 2026-06-05 scan that was fixed is excluded. These are **new** findings. The headline: the math engine's keyword normaliser silently drops ~500 weapon-ability instances, Rapid Fire is computed per-squad instead of per-model, and 81% of all units have no points value.

---

## MATH ENGINE — errors and gaps

### CRITICAL

**MC1. Underscore keyword variants silently ignored (~500 weapon instances).**
`math_adapter._normalise_keywords` (:141) only uppercases; the keyword ladder (:167–205) matches space/hyphen forms (`"DEVASTATING WOUNDS"`, `"TWIN-LINKED"`). Dossiers contain underscore forms: `DEVASTATING_WOUNDS` ×145, `RAPID_FIRE` ×149, `TWIN_LINKED` ×68, `IGNORES_COVER` ×58, `SUSTAINED_HITS` ×55, `MELTA_N` ×33, `LETHAL_HITS` ×12, plus dice-valued forms the `\d+` regexes can't parse (`SUSTAINED HITS D3` ×19, `RAPID FIRE D6` ×7). These weapons compute as plain guns — no error, no degraded flag. Verified: `_weapon_to_profile({"keywords":["DEVASTATING_WOUNDS"]})` → `devastating_wounds=False`.
*Fix:* `k.replace("_", " ")` + whitespace collapse in `_normalise_keywords`; extend Sustained/RF/Melta regexes to accept `D\d(\+\d)?` via `_expected_dice`.

**MC2. Rapid Fire N applied once per squad, not per model.**
`math_adapter.py:742, 867, 1003`: `extra_attacks += rf_value` happens once; squad multiplication is separate. 10e: RF N raises the weapon's Attacks characteristic — every firing model gets it. Verified: 10-model A1 RF1 squad with `--rf` → 11 attacks computed; correct is 20 (45% of damage missing).
*Fix:* scale `rf_value` by `att_models` (respecting `_no_multiply`) before adding.

**MC3. MC-offline fallback crashes the whole combat.**
`set_mc_trials(0)` (documented "0 = disabled") → div-by-zero in `monte_carlo_attack` (combat_math_engine.py:613–618) and `round(None)` TypeError at math_adapter.py:813 → engine reports "combat math failed outright", discarding valid EV numbers.
*Fix:* early-return for `trials<=0`; `round(kill_chance,1) if kill_chance is not None else None`.

### HIGH

**MH1. Anti-X applies vs every target.** No check that the defender has the matching keyword (`TargetProfile` carries no keywords). `ANTI-FLY 2+` wounds a ground tank on 2+. ~200 weapon instances overstated. *Fix:* pass defender keywords; gate `anti_wound_target`.

**MH2. Anti-X doesn't lower the crit-wound threshold.** 10e: unmodified wound roll of N+ is a Critical Wound — the Anti + Devastating Wounds combo should bypass saves on every N+, code only does it on 6s. Massive understatement for Anti-X/Dev weapons.

**MH3. `--ea` display/math disagree.** Display multiplies extra attacks per model (engine.py:2117–2123); math adds once after squad scaling. 5-model A2 `--ea1` → table shows 15 attacks, math computes 11.

**MH4. Blast is the 9th-ed rule.** Min-3-attacks-vs-6+-models implemented; 10e is +1 Attack per 5 models in target (no min). vs 10 models a D6 blast should avg 5.5 attacks, code gives 3.5. The 2026-04-02 "blast min-3" fix codified the wrong edition.

**MH5. `criton:N` below hit target: EV and MC diverge 100%.** `success_probability` never uses `crit_on` (crits auto-hit in 10e); MC checks crit only after hit success. BS6+ criton:5 lethal → EV 2.0 dmg, MC mean 1.0.

### MEDIUM

- **MM1.** No ±1 modifier cap on hit/wound rolls (10e caps net modifiers at ±1). `ml`+`heavy`+`hitplus1` on BS5+ → 2+ instead of legal 4+. (combat_math_engine.py:295, 305)
- **MM2.** Torrent weapons score critical hits — 10e: no hit roll → no crits → sustained/lethal can never trigger. Verified: torrent+sus1 on 6 attacks → 7.0 expected hits. (:300–302, :543–545)
- **MM3.** Cover grants 2+ vs AP0 on 3+ armour — 10e denies the cover bonus vs AP0 when Sv≤3+. (`compute_save_target` :258–261)
- **MM4.** EV kill math treats FNP per-wound not per-damage-point: D3-dmg vs W3 FNP5+ → EV kills 2.78 vs MC 2.13 (+30%). (:367–373)
- **MM5.** `target.models` hardcoded to 1 (math_adapter.py:252) — kill buckets truncate at 1, expected_kills uncapped by squad size, `squad_wipe_pct` meaningless.
- **MM6.** LANCE keyword is dead code (`use_lance` set, never read); `--lance` flag buffs every weapon instead of LANCE-keyword ones. 31 LANCE weapons get nothing.
- **MM7.** `--melta:N` stacks with weapon Melta instead of overriding (`_merge_mods` sums numeric fields): Melta 2 + `melta:2` → melta 4.
- **MM8.** `IGNORES COVER` weapon keyword (299 instances incl. underscore form) never wired to `mods.ignore_cover`.
- **MM9.** Combat summary sums all melee profiles + pistols + main guns as fired together — strike/sweep profiles double-count melee EV; PISTOL/EXTRA ATTACKS keywords ignored.
- **MM10.** Math-ledger drift: cover note prints even when math ignores cover; save-target reconstruction ignores ability invulns/svplus/eap so the printed save target can contradict the fail_save% beside it; hit/wound formulas printed without reroll/torrent/anti terms. *Fix:* feed actual `AttackResult` values into the ledger instead of re-deriving.
- **MM11.** Defender-side attached leader resolved but unused in math — target profile is bodyguard-only (no leader wounds pool, invuln, mixed toughness).

### LOW

`use_overwatch` dead config; `D6+D3` expressions drop the second die; `squad_wipe_pct` is avg per-weapon P(≥1 kill), not wipe; `avg_dmg_per_attack` divides by weapon count; MC blast forces fixed attacks (small EV/MC drift); `per_weapon_dmg` keyed by name — same-named weapons collide; data typos defeating any parser (`DEVASTATIG WOUNDS`, `ANTI-VECHILE`, `IGNORES COVER. TORRENT`).

### Test gaps
Underscore keyword forms; RF/ea scaling with att_models>1; `set_mc_trials(0)`; anti+dev; anti vs non-matching target; torrent+sustained; modifier caps; cover-vs-AP0; 10e blast; kill caps vs squad size; ledger-vs-engine agreement.

---

## FACTION DATA — missing information

All 29 dossiers parse, identical schema, 1,300 units / 1,442 stratagems / 853 enhancements. In-faction duplicate names: 0 (the 2026-06-05 dedup held). Krootox Rampagers confirmed present in factions/tau.

### HIGH

1. **Points missing on 1,050/1,300 units (81%).** Complete: blood angels, space wolves, emperors children; near-complete: black templars (48/50), dark angels (51/57). Everything else — including the whole 216-unit SM megafile and tau (50/53 null) — is 100% null. MFM extraction never happened.
2. **Deathwatch has 2 units** (both legends). Its other datasheets sit in the SM megafile (4 kill teams — with empty unit_composition — plus Artemis, Cassius); Corvus Blackstar and Watch Master exist nowhere.
3. **Necrons: 4 detachments / 24 stratagems** — missing the codex core set (Awakened Dynasty, Canoptek Court, Hypercrypt Legion, Annihilation Legion, Obeisance Phalanx). Lowest of any major faction.
4. **SM megafile vs chapter files: 168 datasheets exist twice, 100% divergent.** Overlaps: SW 49, BA 41, DA 41, BT 36, DW 1. Chapter copies have points + `Inv` key but truncated weapon names ("Bolt", "Heavy bolt") and keyword leakage; megafile copies have full weapon names but no points. Neither side is authoritative.
5. **Dark angels: 4 hand-stubbed units** with only name+stats (Interrogator-Chaplain, Deathwing Knights, Ravenwing Black Knights, Inner Circle Companions) — no weapons/abilities/composition/points.
6. **main_faction/tau dossier is stale** (46–48 units vs 53, no Kroot fixes, no legends flags, metadata wrong) — and nothing in the codebase reads it. See Efficiency E4.

### MED

7. **Legends/FW tagging incomplete:** tau 11 legends + 4 FW, orks 16, tyranids 3, deathwatch 2, DA 1 — the other 24 factions have `legends:false` everywhere and 28/29 have no `forgeworld` key at all (e.g. Drukhari Tantalus, AM Aegis Defence Line plausibly untagged Legends).
8. **65/299 detachments have placeholder names** `DETACHMENT (<rule name>)`, all with 0 enhancements; plus 2 garbage entries (astra militarum detachment named in Nepali; deathguard one named `3+\t6"`).
9. **Army rules: 11 factions have 0 entries** (papered over by loader's hardcoded descriptions); 11 of the 18 populated ones contain scraped Wahapedia nav garbage.
10. **Leagues of Votann: 12 units** — missing at least Hernkyn Yaegirs, Cthonian Earthshakers.
11. **Stale `metadata.unit_count` in 5 dossiers** (orks 85≠82, SM 221≠216, tau 46≠53, DA 56≠57, DG 32≠33).
12. **Keyword parse artifacts on 722/1,300 units (56%)** — `"KEYWORDS: "` prefix retained, last two tokens merged (`"Carnivores T'au Empire"`).

### LOW

3 units with fully empty stats dicts (Drukhari Incubi, GSC Jackal Alphus, Necron Lokhust Destroyers — real parse failures); ~20 torrent weapons with keywords spilled into the weapon name (`'Ministorum hand flamer [IGNORES COVER, PISTOL,'`); adeptus titanicus is 4 titans + garbage army_rules (not a playable faction — flag or drop); all dossiers dated 2026-03-19/20 — predate every post-March balance dataslate.

---

## INEFFICIENCIES & DUPLICATES

### HIGH

**E1. `threat <faction>` is O(enemy×roster×2×weapons), uncached.** 216-unit SM dossier × 10-unit roster ≈ 24,000 `compute_attack_result` calls per command; `_unit_to_target` rebuilt per pair (4,320× instead of ~226×); imports executed inside the hot loop (engine.py:4183–4191). *Fix:* memoize unit→target/weapon-profile conversion; hoist imports.

**E2. Airtable boilerplate quadruplicated** across profiles/shared_rosters/reports/crusade_store (~90 duplicated lines; `_slugify` byte-identical ×4). Drift already happened: `reports.py:113` escapes only quotes, the others also escape backslashes (the injection defence). Every operation builds a fresh `Api(token)` → new TLS handshake per Airtable call. *Fix:* one `airtable_common.py` with a cached `Api`.

**E3. ~28 of 31 shadcn `ui/` components dead** (only card + tooltip reachable), dragging 37MB lucide-react and 10 unused radix deps; 8 dead top-level components (DemoView, HabitTracker, chart-radar-default, ActionCard, StatCard, QueryPanel, ResultView, EngineStatus); `switch-block.jsx` imports files that don't exist; 3 dead ui files import radix packages not in package.json.

**E4. `data/main_faction/` (356KB) is orphaned + stale and ships to prod** via `COPY data/ data/`. Nothing reads it; the tau dossier inside is 2.5 months and 5+ units behind. *Fix:* delete or archive.

### MED

- **E5.** `dist/` serves the **March 25** vite bundle; the June 5 esbuild output sits orphaned as `assets/main.js`. Two parallel build pipelines (vite.config.js vs build.mjs); dead `recharts-mock.js` alias; `build:esbuild` sed is GNU-only.
- **E6.** Dead/stale tracked files: consumed session prompts + prior scan at root (~30KB), 2 .docx in git, `data/.../rosters/` (186KB, read by nothing — web rosters live in Airtable) shipped to prod, 0-byte `ct_config.json` referenced by nothing.
- **E7.** `loader.status()` calls `_ensure_all_loaded()` — first DIAG poll force-parses all 29 dossiers, defeating the 22× lazy-load win.
- **E8.** Per-client session store has no cap/TTL (engine.py:479) — memory grows per browser tab forever in the long-running container.
- **E9.** Dockerfile: `npm install` without the lockfile (`package-lock.json` not COPYed) → nondeterministic prod builds. Use `npm ci`.
- **E10.** Rank/XP mirror (crusade_store.py ↔ crusade.js) in sync today, zero guard rails — one cross-check test closes it.

### LOW

`_query_combat` repeats the disambiguate-or-pick block ~6×; ~95 `tmp_obj_*` junk files in `.git/objects` (run `git gc --prune=now`); TerminalBlock.jsx now 2,524 lines (bigger than Terminal.jsx); local `__pycache__`/`.pytest_cache` clutter (untracked).

Verified clean: requirements.txt (all deps used), config.json (all fields read), term_aliases json/py (code vs data, not duplication), CLI components (parallel by design), session threading (`threading.local`, no race).

---

## Suggested fix order

1. **MC1 + MC2** — two small `math_adapter.py` changes that fix ~500 silently-dead keywords and 45%-understated RF squads. Biggest correctness-per-line in the project.
2. **MC3, MH1–MH5** — crash path + the four rules errors (anti gating, anti-crit, blast 10e, ea scaling, criton).
3. **Data:** decide the SM-megafile-vs-chapter-files source of truth (168 conflicting datasheets), rebuild Deathwatch/Necrons/Votann, then MFM points extraction (81% null).
4. **Efficiency:** delete main_faction + dead frontend components, unify Airtable module, fix the stale dist/ build.
