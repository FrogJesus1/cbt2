/**
 * RulesContext — Rules & keyword browser (Phase 6, Rules.dc.html).
 *
 * Rewritten from a thin Terminal wrapper into a real browser, fed by the
 * live engine dataset via GET /api/rules + /api/keywords (Decision G1 — single
 * source of truth, never bundled/stale). The two sources are merged + deduped
 * into one categorised entry list: a keyword that defines/echoes a rule is
 * enriched with that rule's effect text, while keeping its class (→ category)
 * and `math_relevant` flag (→ the ✓/~ SIM badge).
 *
 * Surfaces: title + search, category rail with live counts, a dynamic Source
 * filter (shown when the current view spans ≥2 sources), a "Sim-relevant only"
 * toggle, and expandable cards. No router / no `?param`. A typed `rule <term>`
 * from the global command bar (App routes it here) seeds the search and
 * auto-opens the best match — so typed lookups live in the browser. The legacy
 * `TerminalRuleBlock` + engine `rule_block` path are left intact for any
 * terminal context that still consumes a `rule` command.
 */

import { useState, useEffect, useMemo, useRef } from "react";
import { C } from "./shared/colors";

const PURPLE = "#a78bdb";
const SLATE  = "#8fb0c4";
const ORANGE = "#e08a5a";
const STEEL  = "#6fb1c9";

// Canonical category → { label, color }. Order drives the rail.
const CATS = [
  ["all",        "All Rules",        C.text],
  ["weapon",     "Weapon Abilities", C.accent],
  ["keyword",    "Keywords",         C.green],
  ["phase",      "Phase & Timing",   C.cyan],
  ["unit",       "Unit Types",       SLATE],
  ["core",       "Core Rules",       PURPLE],
  ["stratagem",  "Stratagems",       C.factionSM],
  ["detachment", "Detachments",      ORANGE],
  ["mission",    "Missions",         STEEL],
];
const CAT_META = Object.fromEntries(CATS.map(([k, label, color]) => [k, { label, color }]));

const SOURCE_LABELS = {
  core_rules:           "Core",
  faction_specific:     "Faction",
  pariah_nexus:         "Pariah Nexus",
  chapter_approved_2526: "Chapter Approved",
};

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const titleCase = (s) =>
  String(s || "").toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());
const clean = (s) => String(s || "").replace(/_/g, " ");

function classToCat(cls) {
  switch (cls) {
    case "weapon_ability": return "weapon";
    case "ability_keyword":
    case "faction_keyword": return "keyword";
    case "unit_type":      return "unit";
    case "phase_keyword":  return "phase";
    default:               return "keyword";
  }
}
function ruleCategory(r) {
  if (r.mechanic === "stratagems")                                       return "stratagem";
  if (r.category === "detachment" || r.mechanic === "detachment_rules")  return "detachment";
  if (r.category === "missions")                                         return "mission";
  return "core";
}
function normMath(m) {
  if (m === true) return "yes";
  if (m === "conditional") return "cond";
  return null;
}

// ─── Merge rules.json + keyword_dictionary.json → one entry list ────────────────

function buildEntries(rules, keywords) {
  const ruleByName = {};
  const ruleById   = {};
  rules.forEach((r) => { ruleByName[norm(r.name)] = r; ruleById[r.id] = r; });

  const consumed = new Set();
  const entries  = [];

  keywords.forEach((kw) => {
    const r = ruleByName[norm(kw.key)] || (kw.defined_by_rule ? ruleById[kw.defined_by_rule] : null);
    if (r) consumed.add(r.id);
    entries.push({
      id:          r ? `r:${r.id}` : `k:${kw.key}`,
      name:        r ? r.name : titleCase(kw.key),
      cat:         classToCat(kw.class),
      desc:        (r && r.effect) || kw.description || "",
      math:        normMath(kw.math_relevant),
      interactions: Array.isArray(kw.interactions) ? kw.interactions.map(clean) : [],
      param:       kw.parametric ? (kw.parameter_description || null) : null,
      timing:      (r && r.timing) || (Array.isArray(kw.applies_in) ? kw.applies_in.join(", ") : null),
      conditions:  (r && Array.isArray(r.conditions)) ? r.conditions.map(clean) : [],
      appliesTo:   clean(kw.applies_to || (r && Array.isArray(r.applies_to) ? r.applies_to.join(", ") : "")) || null,
      source:      (r && r.source) || null,
      cp:          r && (r.cp_cost ?? null),
      kw:          Array.isArray(kw.keywords) ? kw.keywords : [],
    });
  });

  rules.forEach((r) => {
    if (consumed.has(r.id)) return;
    entries.push({
      id:          `r:${r.id}`,
      name:        r.name,
      cat:         ruleCategory(r),
      desc:        r.effect || "",
      math:        null,
      interactions: [],
      param:       null,
      timing:      r.timing || null,
      conditions:  Array.isArray(r.conditions) ? r.conditions.map(clean) : [],
      appliesTo:   Array.isArray(r.applies_to) ? clean(r.applies_to.join(", ")) : null,
      source:      r.source || null,
      cp:          r.cp_cost ?? null,
      kw:          Array.isArray(r.keywords) ? r.keywords : [],
    });
  });

  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

// ─── SIM badge ──────────────────────────────────────────────────────────────────

function SimBadge({ math }) {
  if (math === "yes") {
    return <span title="Applied automatically by the combat simulator" style={{ fontSize: "8px", color: C.bgDark, background: C.green, fontWeight: 700, padding: "1px 5px", borderRadius: "2px", letterSpacing: "0.06em" }}>✓ SIM</span>;
  }
  if (math === "cond") {
    return <span title="Situational — you toggle it" style={{ fontSize: "8px", color: C.accent, border: `1px solid ${C.accent}55`, background: `${C.accent}1a`, padding: "0 5px", borderRadius: "2px", letterSpacing: "0.06em" }}>~ SIM</span>;
  }
  return null;
}

function Tag({ children, color }) {
  return <span style={{ fontSize: "8px", letterSpacing: "0.08em", color, border: `1px solid ${color}55`, background: `${color}1a`, padding: "1px 6px", borderRadius: "2px", textTransform: "uppercase" }}>{children}</span>;
}

// ─── Card ───────────────────────────────────────────────────────────────────────

function RuleCard({ e, open, onToggle }) {
  const meta = CAT_META[e.cat] || CAT_META.keyword;
  const hasDetail = e.interactions.length > 0 || !!e.param || (e.conditions.length > 0) || !!e.timing || !!e.appliesTo;

  return (
    <div style={{ border: `1px solid ${open ? C.bordermid : C.border}`, borderRadius: "5px", background: C.panel, marginBottom: "6px", overflow: "hidden", transition: "border-color .12s" }}>
      <div
        onClick={hasDetail ? onToggle : undefined}
        style={{ display: "flex", alignItems: "flex-start", gap: "12px", padding: "11px 14px", cursor: hasDetail ? "pointer" : "default" }}
      >
        <span style={{ width: "3px", alignSelf: "stretch", minHeight: "30px", background: meta.color, borderRadius: "1px", flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "13px", color: C.text, fontWeight: 600, letterSpacing: "0.03em" }}>{e.name}</span>
            <Tag color={meta.color}>{meta.label}</Tag>
            <SimBadge math={e.math} />
            {e.cp != null && <span style={{ fontSize: "8px", color: C.accent, border: `1px solid ${C.accent}66`, background: `${C.accent}1a`, padding: "1px 6px", borderRadius: "2px", fontWeight: 700, letterSpacing: "0.04em" }}>{e.cp} CP</span>}
            {e.source && SOURCE_LABELS[e.source] && e.source !== "core_rules" && <Tag color={C.dim}>{SOURCE_LABELS[e.source]}</Tag>}
          </div>
          {e.desc && <div style={{ fontSize: "11px", color: C.label, marginTop: "3px", lineHeight: 1.5 }}>{e.desc}</div>}
        </div>
        {hasDetail && <span style={{ color: C.dim, fontSize: "10px", flexShrink: 0, marginTop: "2px" }}>{open ? "▲" : "▼"}</span>}
      </div>

      {open && hasDetail && (
        <div style={{ borderTop: `1px solid ${C.hairline}`, padding: "11px 16px 13px 30px", display: "flex", flexDirection: "column", gap: "9px" }}>
          {e.param && (
            <div style={{ fontSize: "11px", color: C.bodyDim }}>
              <span style={{ color: C.dim, letterSpacing: "0.1em", textTransform: "uppercase", fontSize: "9px", marginRight: "6px" }}>Parameter</span>{e.param}
            </div>
          )}
          {e.timing && (
            <div style={{ fontSize: "11px", color: C.bodyDim }}>
              <span style={{ color: C.dim, letterSpacing: "0.1em", textTransform: "uppercase", fontSize: "9px", marginRight: "6px" }}>Timing</span>{clean(e.timing)}
            </div>
          )}
          {e.appliesTo && (
            <div style={{ fontSize: "11px", color: C.bodyDim }}>
              <span style={{ color: C.dim, letterSpacing: "0.1em", textTransform: "uppercase", fontSize: "9px", marginRight: "6px" }}>Applies to</span>{e.appliesTo}
            </div>
          )}
          {e.conditions.length > 0 && (
            <div style={{ fontSize: "11px", color: C.bodyDim }}>
              <span style={{ color: C.dim, letterSpacing: "0.1em", textTransform: "uppercase", fontSize: "9px", marginRight: "6px" }}>Conditions</span>{e.conditions.join(" · ")}
            </div>
          )}
          {e.interactions.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "9px", color: C.dim, letterSpacing: "0.1em", textTransform: "uppercase" }}>Interacts</span>
              {e.interactions.map((i, n) => (
                <span key={n} style={{ fontSize: "9px", color: C.cyan, border: `1px solid ${C.cyan}40`, background: `${C.cyan}0d`, padding: "1px 6px", borderRadius: "2px" }}>{i}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Browser ──────────────────────────────────────────────────────────────────────

export function RulesContext({ pendingCommand, onPendingCommandConsumed }) {
  const [rules,    setRules]    = useState(null);
  const [keywords, setKeywords] = useState(null);
  const [loadErr,  setLoadErr]  = useState(false);

  const [cls,    setCls]    = useState("all");
  const [search, setSearch] = useState("");
  const [mathOnly, setMathOnly] = useState(false);
  const [source, setSource] = useState("all");
  const [open,   setOpen]   = useState({});
  const searchRef = useRef(null);

  // ── Load the live dataset ──
  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch("/api/rules").then((r) => (r.ok ? r.json() : Promise.reject())),
      fetch("/api/keywords").then((r) => (r.ok ? r.json() : Promise.reject())),
    ])
      .then(([rd, kd]) => { if (!alive) return; setRules(rd.rules || []); setKeywords(kd.keywords || []); })
      .catch(() => { if (alive) setLoadErr(true); });
    return () => { alive = false; };
  }, []);

  const entries = useMemo(
    () => (rules && keywords ? buildEntries(rules, keywords) : []),
    [rules, keywords]
  );

  // ── A typed `rule <term>` (routed here by App) seeds search + opens top hit ──
  useEffect(() => {
    if (!pendingCommand) return;
    const m = pendingCommand.trim().match(/^rules?\b\s*(.*)$/i);
    const term = m ? m[1].trim() : "";
    if (term) {
      setCls("all"); setMathOnly(false); setSource("all"); setSearch(term);
    }
    onPendingCommandConsumed?.();
  }, [pendingCommand, onPendingCommandConsumed]);

  // ── Auto-open the single best match when a search narrows to a strong hit ──
  const q = search.trim().toLowerCase();
  const matchSearch = (e) => !q || e.name.toLowerCase().includes(q) || e.desc.toLowerCase().includes(q) || e.kw.some((k) => String(k).toLowerCase().includes(q));
  const matchMath   = (e) => !mathOnly || e.math === "yes" || e.math === "cond";

  // counts per category (respect search + sim, ignore category selection)
  const counts = useMemo(() => {
    const out = {};
    CATS.forEach(([k]) => {
      out[k] = entries.filter((e) => (k === "all" || e.cat === k) && matchSearch(e) && matchMath(e)).length;
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, q, mathOnly]);

  // sources present in the current (category+search+sim) view → dynamic filter
  const baseList = entries.filter((e) => (cls === "all" || e.cat === cls) && matchSearch(e) && matchMath(e));
  const sourcesPresent = [...new Set(baseList.map((e) => e.source).filter(Boolean))];
  const showSourceFilter = sourcesPresent.length >= 2;
  const list = baseList.filter((e) => !showSourceFilter || source === "all" || e.source === source);

  // exact-name auto-open
  useEffect(() => {
    if (!q) return;
    const exact = list.find((e) => e.name.toLowerCase() === q);
    const target = exact || (list.length === 1 ? list[0] : null);
    if (target) setOpen((o) => ({ ...o, [target.id]: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, entries]);

  const toggle = (id) => setOpen((o) => ({ ...o, [id]: !o[id] }));

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", backgroundColor: "var(--ct-bg)", overflow: "hidden" }}>
      {/* title + search */}
      <div className="shrink-0" style={{ display: "flex", alignItems: "center", gap: "14px", padding: "16px 20px 14px", borderBottom: `1px solid ${C.hairline}` }}>
        <span className="ct-display" style={{ fontSize: "18px", color: C.text, fontWeight: 700, letterSpacing: "0.04em", flexShrink: 0 }}>RULES REFERENCE</span>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: "9px", background: C.panel, border: `1px solid ${C.border}`, borderRadius: "4px", padding: "8px 12px" }}>
          <span style={{ color: C.dim, fontSize: "13px" }}>⌕</span>
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search rules & keywords…  e.g. devastating, fall back, blast"
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: C.text, fontFamily: "monospace", fontSize: "13px" }}
          />
          {search && <span onClick={() => setSearch("")} title="Clear" style={{ color: C.dim, cursor: "pointer", fontSize: "12px" }}>✕</span>}
        </div>
      </div>

      {/* body */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "222px 1fr", alignItems: "stretch", overflow: "hidden" }}>
        {/* rail */}
        <div style={{ borderRight: `1px solid ${C.hairline}`, padding: "16px", display: "flex", flexDirection: "column", gap: "8px", overflowY: "auto" }}>
          <div className="ct-display" style={{ fontSize: "9px", letterSpacing: "0.14em", color: C.dim, textTransform: "uppercase", fontWeight: 700, marginBottom: "2px" }}>Category</div>
          {CATS.map(([k, label, color]) => {
            const active = cls === k;
            return (
              <div
                key={k}
                onClick={() => { setCls(k); setSource("all"); }}
                style={{ display: "flex", alignItems: "center", gap: "9px", padding: "7px 9px", borderRadius: "4px", cursor: "pointer", background: active ? `${C.green}14` : "transparent", border: `1px solid ${active ? C.bordermid : "transparent"}` }}
              >
                <span style={{ width: "8px", height: "8px", borderRadius: "2px", background: color, flexShrink: 0 }} />
                <span style={{ fontSize: "12px", color: active ? C.text : C.bodyDim, fontWeight: active ? 600 : 400 }}>{label}</span>
                <span style={{ fontSize: "10px", color: C.dim, marginLeft: "auto" }}>{counts[k] ?? 0}</span>
              </div>
            );
          })}

          {showSourceFilter && (
            <div style={{ borderTop: `1px solid ${C.hairline}`, marginTop: "8px", paddingTop: "12px" }}>
              <div className="ct-display" style={{ fontSize: "9px", letterSpacing: "0.14em", color: C.dim, textTransform: "uppercase", fontWeight: 700, marginBottom: "7px" }}>Source</div>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value)}
                style={{ width: "100%", background: C.panel, border: `1px solid ${C.border}`, color: C.text, fontFamily: "monospace", fontSize: "12px", padding: "8px 10px", borderRadius: "4px", outline: "none", cursor: "pointer" }}
              >
                <option value="all">All Sources</option>
                {sourcesPresent.map((s) => <option key={s} value={s}>{SOURCE_LABELS[s] || titleCase(clean(s))}</option>)}
              </select>
            </div>
          )}

          <div style={{ borderTop: `1px solid ${C.hairline}`, marginTop: "8px", paddingTop: "12px" }}>
            <div onClick={() => setMathOnly((v) => !v)} style={{ display: "flex", alignItems: "center", gap: "9px", cursor: "pointer", userSelect: "none" }}>
              <span style={{ width: "14px", height: "14px", borderRadius: "3px", border: `1px solid ${mathOnly ? C.green : C.bordermid}`, background: mathOnly ? C.green : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "9px", color: C.bgDark, flexShrink: 0 }}>{mathOnly ? "✓" : ""}</span>
              <span style={{ fontSize: "11px", color: C.bodyDim }}>Sim-relevant only</span>
            </div>
            <div style={{ fontSize: "9px", color: C.ghost, lineHeight: 1.5, marginTop: "8px", paddingLeft: "2px" }}>
              ✓ = the combat simulator applies this automatically. ~ = situational, you toggle it.
            </div>
          </div>
        </div>

        {/* results */}
        <div style={{ padding: "14px 18px 18px", overflowY: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
            <span style={{ fontSize: "12px", color: C.text }}>
              <span style={{ color: C.green, fontWeight: 700 }}>{loadErr ? 0 : list.length}</span> <span style={{ color: C.label }}>entries</span>
            </span>
          </div>

          {loadErr && (
            <div style={{ textAlign: "center", padding: "60px 20px", color: C.dim, fontSize: "13px" }}>
              <div style={{ fontSize: "24px", marginBottom: "10px", opacity: 0.5 }}>⚠</div>
              Rules dataset unavailable — is the engine running?
            </div>
          )}

          {!loadErr && (rules == null || keywords == null) && (
            <div style={{ color: C.dim, fontSize: "12px", fontStyle: "italic" }}>Loading rules…</div>
          )}

          {!loadErr && rules != null && list.length === 0 && (
            <div style={{ textAlign: "center", padding: "60px 20px", color: C.dim, fontSize: "13px" }}>
              <div style={{ fontSize: "24px", marginBottom: "10px", opacity: 0.5 }}>⊘</div>No rules match.
            </div>
          )}

          {list.map((e) => <RuleCard key={e.id} e={e} open={!!open[e.id]} onToggle={() => toggle(e.id)} />)}
        </div>
      </div>
    </div>
  );
}
