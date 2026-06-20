/**
 * UnitListRich  (Phase 4 — Units Database)
 *
 * The interactive Units Database result block. Lifted out of TerminalBlock.jsx
 * and rebuilt to the `List Units.dc.html` mockup: a left filter rail
 * (UnitListFilters) + a results list with search, ★ Shortlist toggle, sort,
 * faction-tinted rows and the M/T/Sv/W/OC stat strip.
 *
 * This is the screen that shifts the Units context from "filter by typing
 * commands" to "filter with interactive controls". All filtering/sorting is
 * client-side over the `data` array the engine already returned for `list units`
 * — no new fetch for the unit corpus, no router, no `?unit=` (row click →
 * onInject("spec <name>"), matching the rest of the SPA).
 *
 * Star state binds to the shared `ct_starred_units` shortlist (string[]). When
 * rendered inside the Units context it uses the threaded starredUnits/
 * onToggleStar props (so the ★ MY UNITS rail stays in sync); elsewhere it
 * self-manages via localStorage + the `ct-state-changed` event.
 *
 * Props: { data:[], meta, onInject, starredUnits?, onToggleStar? }
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { C, factionColor } from "./shared/colors";
import { UnitListFilters } from "./UnitListFilters";
import { fetchRosters, fetchRoster } from "@/lib/shared-rosters";
import parseRosterUnits from "@/lib/rosterParse";

// ── helpers ────────────────────────────────────────────────────────────────

const CT_STARRED_KEY = "ct_starred_units";

function loadStarred() {
  try { return JSON.parse(localStorage.getItem(CT_STARRED_KEY) || "[]"); }
  catch { return []; }
}
function saveStarred(arr) {
  try {
    localStorage.setItem(CT_STARRED_KEY, JSON.stringify(arr));
    window.dispatchEvent(new CustomEvent("ct-state-changed", { detail: { key: CT_STARRED_KEY } }));
  } catch { /* storage unavailable */ }
}

/** Leading integer from a stat / points string ("80pts" → 80, "—" → null). */
function toNum(v) {
  if (v == null) return null;
  const m = String(v).match(/-?\d+/);
  return m ? parseInt(m[0], 10) : null;
}

/** Loose name key for roster membership matching. */
const nameKey = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

const FACTION_LABELS = {
  "tau": "T'au Empire", "t'au empire": "T'au Empire", "deathguard": "Death Guard",
  "death guard": "Death Guard", "space marines": "Space Marines",
};
function prettyFaction(slug) {
  if (!slug) return "";
  const key = String(slug).toLowerCase().trim();
  if (FACTION_LABELS[key]) return FACTION_LABELS[key];
  return key.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function prettyRole(role) {
  return String(role || "").replace(/[_-]+/g, " ")
    .toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/-(\w)/g, (_, c) => "-" + c.toUpperCase());
}

const ROW_KW_CAP = 6;

// Points slider tops out here (most units are 40–350pts; 3500-pt slider was
// unusable). The slider's max position means "no upper cap"; type a number in
// the editable max box for a precise cap (incl. > 500).
const POINTS_SLIDER_MAX = 500;

// ── component ────────────────────────────────────────────────────────────────

export function UnitListRich({ data = [], meta, onInject, starredUnits, onToggleStar, initialFaction }) {
  // ── star state (prop-driven in Units ctx, else localStorage) ──
  const [localStarred, setLocalStarred] = useState(loadStarred);
  useEffect(() => {
    if (starredUnits) return;          // prop is the source of truth here
    const h = () => setLocalStarred(loadStarred());
    window.addEventListener("ct-state-changed", h);
    window.addEventListener("storage", h);
    return () => {
      window.removeEventListener("ct-state-changed", h);
      window.removeEventListener("storage", h);
    };
  }, [starredUnits]);

  const starredList = starredUnits ?? localStarred;
  const starredSet = useMemo(() => new Set(starredList), [starredList]);
  const toggleStar = useCallback((name) => {
    if (onToggleStar) { onToggleStar(name); return; }
    setLocalStarred((prev) => {
      const next = prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name];
      saveStarred(next);
      return next;
    });
  }, [onToggleStar]);

  // ── derived universes (faction / role / keyword / points bounds) ──
  const { factionOptions, roleUniverse, kwUniverse, ptsLo, ptsHi } = useMemo(() => {
    const fset = new Map();   // slug → label
    const rset = new Set();
    const kset = new Set();
    let hi = 0;
    for (const u of data) {
      if (u.faction) fset.set(u.faction, prettyFaction(u.faction));
      const r = String(u.role || "").toUpperCase();
      if (r && r !== "UNKNOWN") rset.add(u.role);
      for (const k of (u.keywords || [])) kset.add(k);
      const p = toNum(u.points);
      if (p != null && p > hi) hi = p;
    }
    const factionOptions = [{ value: "All", label: "All Factions" },
      ...[...fset.entries()].sort((a, b) => a[1].localeCompare(b[1]))
        .map(([value, label]) => ({ value, label }))];
    return {
      factionOptions,
      roleUniverse: [...rset].sort((a, b) => String(a).toLowerCase().localeCompare(String(b).toLowerCase())),
      kwUniverse:   [...kset].sort((a, b) => String(a).toLowerCase().localeCompare(String(b).toLowerCase())),
      ptsLo: 0,
      ptsHi: hi > 0 ? Math.max(5, Math.ceil(hi / 5) * 5) : 260,
    };
  }, [data]);

  // ── filter state ──
  const [faction, setFaction] = useState("All");
  const [roster, setRoster] = useState("all");
  const [kw, setKw] = useState({});
  const [role, setRole] = useState({});
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("pts-desc");
  const [shortlistOnly, setShortlistOnly] = useState(false);
  const [costMin, setCostMin] = useState(0);
  const [costMax, setCostMax] = useState(null);  // null = no upper cap

  // Seed filters from a `list units <args>` command (the static UNITS page
  // consumes such commands as filters, not a new feed). Splits args into a
  // faction (non-flag tokens) and keyword flags (e.g. `--blast` → the Blast
  // chip), so `list units tau --blast` filters T'au AND selects Blast.
  useEffect(() => {
    if (initialFaction == null) return;
    const raw = String(initialFaction).trim();
    if (!raw || /^all$/i.test(raw)) { setFaction("All"); setKw({}); setSearch(""); return; }
    const tokens  = raw.split(/\s+/).filter(Boolean);
    const flags   = tokens.filter((t) => t.startsWith("--")).map((t) => t.replace(/^-+/, ""));
    const factTok = tokens.filter((t) => !t.startsWith("--"));

    // faction (joined non-flag tokens)
    const fkey = nameKey(factTok.join(""));
    const fMatch = fkey && factionOptions.find((o) =>
      o.value !== "All" && (nameKey(o.value) === fkey || nameKey(o.label) === fkey
        || nameKey(o.label).includes(fkey) || nameKey(o.value).includes(fkey)));
    setFaction(fMatch ? fMatch.value : "All");

    // keyword flags → matching chips (case/space-insensitive)
    const nextKw = {};
    for (const f of flags) {
      const fk = nameKey(f);
      if (!fk) continue;
      const kMatch = kwUniverse.find((k) => {
        const kk = nameKey(k);
        return kk === fk || kk.includes(fk) || fk.includes(kk);
      });
      if (kMatch) nextKw[kMatch] = true;
    }
    setKw(nextKw);

    // unmatched faction text → search; otherwise clear it
    setSearch(fMatch || !factTok.length ? "" : factTok.join(" "));
  }, [initialFaction, factionOptions, kwUniverse]);

  // ── roster filter (real saved rosters; defensive, fails to no-op) ──
  const [rosterList, setRosterList] = useState([]);     // [{id,name,faction}]
  const [rosterNames, setRosterNames] = useState(null); // Set<nameKey> | null
  const [rosterBusy, setRosterBusy] = useState(false);
  const [rosterHint, setRosterHint] = useState("");
  useEffect(() => {
    let alive = true;
    fetchRosters()
      .then((rs) => { if (alive) setRosterList(Array.isArray(rs) ? rs : []); })
      .catch(() => { /* no rosters / store offline → roster filter stays "All units" */ });
    return () => { alive = false; };
  }, []);
  const onRoster = useCallback(async (e) => {
    const id = e.target.value;
    setRoster(id);
    if (id === "all") { setRosterNames(null); setRosterHint(""); return; }
    setRosterBusy(true); setRosterHint("");
    try {
      const r = await fetchRoster(id);
      const units = parseRosterUnits(r?.roster ?? r) || [];
      const names = new Set(units.map((u) => nameKey(u.name)).filter(Boolean));
      setRosterNames(names);
      const m = rosterList.find((x) => x.id === id);
      setRosterHint(`${m ? prettyFaction(m.faction) + " · " : ""}${names.size} units`);
    } catch {
      setRosterNames(new Set());
      setRosterHint("could not load roster");
    } finally { setRosterBusy(false); }
  }, [rosterList]);

  const rosterOptions = useMemo(() => [
    { value: "all", label: "All units" },
    ...rosterList.map((r) => ({ value: r.id, label: `${r.name}${r.faction ? " · " + prettyFaction(r.faction) : ""}` })),
  ], [rosterList]);

  // ── derived chip view-models ──
  const selKw = useMemo(() => Object.keys(kw).filter((k) => kw[k]), [kw]);
  const selRole = useMemo(() => Object.keys(role).filter((r) => role[r]), [role]);

  const keywordChips = kwUniverse.map((k) => ({
    label: k, active: !!kw[k],
    onToggle: () => setKw((st) => ({ ...st, [k]: !st[k] })),
  }));
  const roleChips = roleUniverse.map((r) => ({
    label: prettyRole(r), active: !!role[r],
    onToggle: () => setRole((st) => ({ ...st, [r]: !st[r] })),
  }));

  // ── filter + sort ──
  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = data.filter((u) => {
      if (shortlistOnly) return starredSet.has(u.name);
      if (faction !== "All" && u.faction !== faction) return false;
      if (roster !== "all" && rosterNames && !rosterNames.has(nameKey(u.name))) return false;
      const p = toNum(u.points);  // null-points units always pass; costMax null = no upper cap
      if (p != null && (p < costMin || (costMax != null && p > costMax))) return false;
      if (selKw.length && !selKw.every((k) => (u.keywords || []).includes(k))) return false;
      if (selRole.length && !selRole.includes(u.role)) return false;
      if (q && !u.name.toLowerCase().includes(q)) return false;
      return true;
    });
    const pAsc = (u) => { const n = toNum(u.points); return n == null ? Infinity : n; };
    const pDesc = (u) => { const n = toNum(u.points); return n == null ? -Infinity : n; };
    list = [...list].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "pts-asc") return pAsc(a) - pAsc(b);
      if (sort === "w-desc") return (toNum(b.W) ?? -1) - (toNum(a.W) ?? -1);
      return pDesc(b) - pDesc(a);  // pts-desc
    });
    return list;
  }, [data, shortlistOnly, starredSet, faction, roster, rosterNames, costMin, costMax, selKw, selRole, search, sort]);

  const onReset = useCallback(() => {
    setFaction("All"); setRoster("all"); setRosterNames(null); setRosterHint("");
    setKw({}); setRole({}); setSearch(""); setShortlistOnly(false);
    setCostMin(0); setCostMax(null);
  }, []);

  const goldBorder = `color-mix(in srgb, ${C.accent} 34%, transparent)`;

  return (
    <div style={{ margin: "2px 18px 10px 0" }}>
      <div style={{
        border: `1px solid ${C.border}`, borderRadius: "5px",
        background: C.panel, overflow: "hidden",
      }}>
        {/* ── title + search + shortlist ── */}
        <div style={{
          display: "flex", alignItems: "center", gap: "14px",
          padding: "14px 18px", borderBottom: `1px solid ${C.hairline}`,
        }}>
          <span className="ct-display" style={{ color: C.text, fontSize: "16px", letterSpacing: "0.04em" }}>
            UNIT DATABASE
          </span>
          <div style={{
            flex: 1, display: "flex", alignItems: "center", gap: "9px",
            background: "var(--ct-bg)", border: `1px solid ${C.border}`,
            borderRadius: "4px", padding: "8px 12px",
          }}>
            <span style={{ color: C.dim, fontSize: "13px" }}>⌕</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search units…"
              style={{
                flex: 1, background: "transparent", border: "none", outline: "none",
                color: C.textMid, fontFamily: "inherit", fontSize: "13px",
              }}
            />
          </div>
          <button
            onClick={() => setShortlistOnly((v) => !v)}
            style={{
              fontFamily: "inherit", fontSize: "11px", letterSpacing: "0.06em",
              cursor: "pointer", padding: "8px 13px", borderRadius: "4px", flexShrink: 0,
              color: shortlistOnly ? C.bg : C.accent,
              background: shortlistOnly ? C.accent : "transparent",
              border: `1px solid ${shortlistOnly ? C.accent : goldBorder}`,
              fontWeight: shortlistOnly ? 700 : 400,
            }}
          >
            ★ Shortlist ({starredList.length})
          </button>
        </div>

        {/* ── body: filter rail + results ── */}
        <div style={{ display: "grid", gridTemplateColumns: "236px 1fr", alignItems: "start" }}>
          <UnitListFilters
            factionSel={faction}
            onFaction={(e) => setFaction(e.target.value)}
            factionOptions={factionOptions}
            rosterSel={roster}
            onRoster={onRoster}
            rosterOptions={rosterOptions}
            rosterHint={rosterHint}
            rosterBusy={rosterBusy}
            costMin={costMin}
            costMax={costMax}
            sliderMax={POINTS_SLIDER_MAX}
            costStep={5}
            onCostMin={(n) => setCostMin(Math.max(0, Math.min(Number(n) || 0, costMax == null ? Infinity : costMax)))}
            onCostMax={(n) => setCostMax(n == null ? null : Math.max(Number(n) || 0, costMin))}
            keywords={keywordChips}
            roles={roleChips}
            onReset={onReset}
          />

          {/* results */}
          <div style={{ padding: "14px 18px 18px", minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
              <span style={{ fontSize: "12px", color: C.textMid }}>
                <span style={{ color: C.green, fontWeight: 700 }}>{results.length}</span>
                <span style={{ color: C.label }}> of {data.length} units</span>
              </span>
              {shortlistOnly && (
                <span style={{
                  fontSize: "9px", color: C.accent, letterSpacing: "0.1em",
                  border: `1px solid ${goldBorder}`, background: `color-mix(in srgb, ${C.accent} 8%, transparent)`,
                  padding: "2px 7px", borderRadius: "3px",
                }}>★ SHORTLIST VIEW</span>
              )}
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "7px" }}>
                <span style={{ fontSize: "9px", color: C.dim, letterSpacing: "0.08em" }}>SORT</span>
                <div style={{ position: "relative" }}>
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                    style={{
                      background: C.panel, border: `1px solid ${C.border}`, color: C.bodyDim,
                      fontFamily: "inherit", fontSize: "11px", padding: "5px 22px 5px 9px",
                      borderRadius: "4px", outline: "none", cursor: "pointer",
                      appearance: "none", WebkitAppearance: "none", MozAppearance: "none",
                    }}
                  >
                    <option value="pts-desc">Points ↓</option>
                    <option value="pts-asc">Points ↑</option>
                    <option value="name">Name A–Z</option>
                    <option value="w-desc">Wounds ↓</option>
                  </select>
                  <span style={{ position: "absolute", right: "8px", top: "6px", color: C.dim, fontSize: "8px", pointerEvents: "none" }}>▼</span>
                </div>
              </div>
            </div>

            {results.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 20px", color: C.dim, fontSize: "13px" }}>
                <div style={{ fontSize: "26px", marginBottom: "10px", opacity: 0.5 }}>⊘</div>
                No units match these filters.<br />
                <span style={{ fontSize: "11px" }}>Widen the points range or clear keywords.</span>
              </div>
            ) : (
              <div style={{ maxHeight: "560px", overflowY: "auto", scrollbarWidth: "thin" }}>
                {results.map((u) => (
                  <UnitRow
                    key={`${u.faction}/${u.name}`}
                    unit={u}
                    starred={starredSet.has(u.name)}
                    onStar={() => toggleStar(u.name)}
                    onOpen={() => onInject?.(`spec ${u.name}`)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── row ──────────────────────────────────────────────────────────────────────

const STAT_KEYS = ["M", "T", "Sv", "W", "OC"];

function UnitRow({ unit, starred, onStar, onOpen }) {
  const fcol = factionColor(unit.faction);
  const kws = unit.keywords || [];
  const shown = kws.slice(0, ROW_KW_CAP);
  const extra = kws.length - shown.length;

  return (
    <div
      onClick={onOpen}
      style={{
        display: "flex", alignItems: "center", gap: "12px",
        padding: "11px 14px", border: `1px solid ${C.border}`, borderRadius: "5px",
        background: C.panel, marginBottom: "6px", cursor: "pointer",
        transition: "border-color .12s, background .12s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = C.bordermid; e.currentTarget.style.background = "var(--ct-bg-dark)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = C.panel; }}
    >
      {/* star */}
      <button
        onClick={(e) => { e.stopPropagation(); onStar(); }}
        title={starred ? "Remove from shortlist" : "Add to shortlist"}
        style={{
          background: "transparent", border: "none", cursor: "pointer", fontSize: "16px",
          color: starred ? C.accent : C.ghost, flexShrink: 0, padding: "0 2px",
          textShadow: starred ? `0 0 8px color-mix(in srgb, ${C.accent} 50%, transparent)` : "none",
        }}
      >
        {starred ? "★" : "☆"}
      </button>

      {/* name + tags + keywords */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "9px", flexWrap: "wrap" }}>
          <span style={{ fontSize: "13px", color: C.text, fontWeight: 600 }}>{unit.name}</span>
          <span style={{
            fontSize: "8px", letterSpacing: "0.06em", color: fcol,
            border: `1px solid color-mix(in srgb, ${fcol} 33%, transparent)`,
            background: `color-mix(in srgb, ${fcol} 8%, transparent)`,
            padding: "1px 6px", borderRadius: "2px", whiteSpace: "nowrap",
          }}>{prettyFaction(unit.faction)}</span>
          {unit.role && String(unit.role).toUpperCase() !== "UNKNOWN" && (
            <span style={{ fontSize: "9px", color: C.label, letterSpacing: "0.1em", textTransform: "uppercase" }}>
              {prettyRole(unit.role)}
            </span>
          )}
          {unit.legends && <Tag label="LEGENDS" color={C.accent} />}
          {unit.forgeworld && <Tag label="FORGE WORLD" color={C.cyan} />}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "6px" }}>
          {shown.map((k) => (
            <span key={k} style={{
              fontSize: "8px", color: C.cyan,
              border: `1px solid color-mix(in srgb, ${C.cyan} 32%, transparent)`,
              background: `color-mix(in srgb, ${C.cyan} 5%, transparent)`,
              padding: "1px 5px", borderRadius: "2px", letterSpacing: "0.04em",
            }}>{k}</span>
          ))}
          {extra > 0 && (
            <span style={{ fontSize: "8px", color: C.dim, padding: "1px 4px", letterSpacing: "0.04em" }}>+{extra}</span>
          )}
          {kws.length === 0 && (
            <span style={{ fontSize: "9px", color: C.ghost, fontStyle: "italic" }}>no special rules</span>
          )}
        </div>
      </div>

      {/* stats + points */}
      <div style={{ display: "flex", alignItems: "center", gap: "18px", flexShrink: 0 }}>
        <div style={{ display: "flex", gap: "9px" }}>
          {STAT_KEYS.map((k) => (
            <div key={k} style={{ textAlign: "center", minWidth: "22px" }}>
              <div style={{ fontSize: "8px", color: C.dim, letterSpacing: "0.06em" }}>{k}</div>
              <div style={{ fontSize: "12px", color: C.bodyDim, marginTop: "2px" }}>{fmtStat(unit[k])}</div>
            </div>
          ))}
        </div>
        <div style={{ textAlign: "right", minWidth: "54px" }}>
          <div className="ct-display" style={{ fontSize: "18px", color: C.green, lineHeight: 1 }}>
            {fmtPts(unit.points)}
          </div>
          <div style={{ fontSize: "8px", color: C.dim, letterSpacing: "0.1em", marginTop: "2px" }}>POINTS</div>
        </div>
      </div>
    </div>
  );
}

function Tag({ label, color }) {
  return (
    <span style={{
      color, fontSize: "8px", fontWeight: 700, letterSpacing: "0.08em",
      border: `1px solid ${color}`, borderRadius: "3px", padding: "0 4px", opacity: 0.85,
    }}>{label}</span>
  );
}

function fmtStat(v) {
  if (v == null || v === "") return "—";
  return String(v);
}
function fmtPts(v) {
  if (v == null || v === "" || v === "—") return "—";
  const s = String(v).replace(/pts?/i, "").trim();
  return s || "—";
}

export default UnitListRich;
