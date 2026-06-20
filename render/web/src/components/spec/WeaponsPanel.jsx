/**
 * WeaponsPanel
 *
 * 10th edition weapon tables — ranged and melee sections with stat columns.
 * Handles weapons as raw dicts from the engine (field names may vary).
 *
 * Weapon keywords are displayed as [KW] abbreviation tags inline in the name
 * column. Hovering a tag shows a tooltip with the full keyword name and effect.
 *
 * Exports:
 *   WeaponsPanel         — full standalone card (used in demo)
 *   WeaponsPanelContent  — inner table only, no Card shell (for nesting in StatLine)
 *   normalizeWeapon      — field normalisation helper (used by StatLine)
 *
 * Props:
 *   weapons — array of weapon objects (raw from engine)
 */

import { Card, CardContent, C, CARD_STYLE, CARD_PAD, SectionTitle } from "./shared";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { resolveKeyword } from "./keywords";

// ─── Field normalisation ───────────────────────────────────────────────────
// Engine dossiers use varying field names — check multiple candidates.

function pick(obj, ...keys) {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return obj[k];
  }
  return "—";
}

export function normalizeWeapon(w) {
  if (typeof w === "string") {
    return { name: w, range: "—", A: "—", skill: "—", S: "—", AP: "—", D: "—", keywords: [], type: "ranged" };
  }

  const rawRange = pick(w, "range", "Range");
  const isM      = String(rawRange).toLowerCase() === "melee";
  const typeStr  = w.type || (isM ? "melee" : "ranged");

  return {
    name:     pick(w, "name", "Name"),
    range:    rawRange,
    A:        pick(w, "attacks", "A", "a"),
    skill:    pick(w, "skill", "bs_ws", "BS", "WS", "bs", "ws"),
    S:        pick(w, "strength", "S", "s"),
    AP:       pick(w, "ap", "AP"),
    D:        pick(w, "damage", "D", "d"),
    keywords: w.keywords || w.special_rules || w.abilities || [],
    type:     typeStr,
    _drone:   w._drone || false,   // true → cyan name tint
  };
}

// ─── Column grid ───────────────────────────────────────────────────────────
// Stat columns widened for breathing room; name column stays 1fr (flexible).

// Compact fixed stat columns (~262px) so the table fits the narrower datasheet
// column (the 190px ★ rail eats horizontal space). Name stays 1fr + can wrap.
const GRID = "minmax(0,1fr) 46px 46px 48px 34px 40px 48px";
const COLS = ["Weapon", "Range", "A", "BS/WS", "S", "AP", "D"];

// AP color — in 40K any armour penetration is good (more-negative is better).
// Mockup: any negative AP renders green; AP 0 neutral; never red (red is for
// modifiers that degrade a stat, handled elsewhere).
function apColor(cell) {
  const n = parseInt(String(cell ?? ""), 10);
  if (isNaN(n))  return C.bodyDim;
  if (n < 0)     return C.improved;  // armour pierce → green
  if (n === 0)   return C.label;     // AP 0 = neutral
  return C.bodyDim;                  // positive (rare)
}

// Columns (1-indexed): 1 Range · 2 A · 3 BS/WS · 4 S · 5 AP · 6 D
function cellColor(i, cell) {
  if (i === 1) return C.label;        // Range — muted
  if (i === 5) return apColor(cell);  // AP
  if (i === 6) return C.cyan;         // Damage
  return C.bodyDim;                   // A / skill / S
}

function TableHeader() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: GRID, marginBottom: "5px", paddingBottom: "5px", borderBottom: `1px solid ${C.border}` }}>
      {COLS.map((col, i) => (
        <div key={col} style={{
          color:         C.dim,
          fontSize:      "9px",
          fontWeight:    700,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          textAlign:     i === 0 ? "left" : "center",
          paddingRight:  i === 0 ? "12px" : "0",
        }}>
          {col}
        </div>
      ))}
    </div>
  );
}

// ─── Keyword tag with tooltip ──────────────────────────────────────────────

function KeywordTag({ keyword }) {
  const { abbr, name, desc } = resolveKeyword(keyword);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          style={{
            color:         C.dim,
            fontSize:      "11px",
            letterSpacing: "0.03em",
            cursor:        "default",
            userSelect:    "none",
            display:       "inline-block",
            lineHeight:    "1",
          }}
          onMouseEnter={e => { e.currentTarget.style.color = C.label; }}
          onMouseLeave={e => { e.currentTarget.style.color = C.dim;   }}
        >
          [{abbr}]
        </span>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={6}
        style={{
          background:   "#0d1a0c",
          border:       `1px solid ${C.bordermid}`,
          borderRadius: "0",
          padding:      "8px 10px",
          maxWidth:     "240px",
          fontFamily:   "inherit",
        }}
      >
        <div style={{
          color:         C.amber,
          fontSize:      "10px",
          fontWeight:    700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          marginBottom:  "4px",
        }}>
          {name}
        </div>
        <div style={{
          color:      C.mid,
          fontSize:   "11px",
          lineHeight: "1.5",
        }}>
          {desc}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

// ─── Weapon row ────────────────────────────────────────────────────────────

function WeaponRow({ w }) {
  const keywords = Array.isArray(w.keywords)
    ? w.keywords.filter(Boolean)
    : (w.keywords ? String(w.keywords).split(",").map(k => k.trim()).filter(Boolean) : []);

  const statCells = [w.range, w.A, w.skill, w.S, w.AP, w.D];

  return (
    <div style={{
      display:              "grid",
      gridTemplateColumns:  GRID,
      alignItems:           "center",
      minHeight:            "42px",
      paddingTop:           "6px",
      paddingBottom:        "6px",
    }}>

      {/* Name + keyword tags — wraps freely, no truncation */}
      <div style={{
        display:     "flex",
        flexWrap:    "wrap",
        alignItems:  "center",
        gap:         "4px",
        paddingRight: "12px",
      }}>
        <span style={{ color: w._drone ? C.cyan : C.textMid, fontSize: "13px", lineHeight: "1.4" }}>
          {w.name === null || w.name === undefined ? "—" : String(w.name)}
        </span>
        {keywords.map((kw, i) => (
          <KeywordTag key={i} keyword={kw} />
        ))}
      </div>

      {/* Stat cells */}
      {statCells.map((cell, i) => (
        <div key={i} style={{
          color:      cellColor(i + 1, cell),
          fontSize:   "13px",
          textAlign:  "center",
          whiteSpace: "nowrap",
          overflow:   "hidden",
          textOverflow: "ellipsis",
        }}>
          {cell === null || cell === undefined ? "—" : String(cell)}
        </div>
      ))}
    </div>
  );
}

export function WeaponSection({ title, weapons, color = C.green }) {
  if (!weapons.length) return null;
  return (
    <div>
      <div className="ct-display" style={{ color, fontSize: "9px", letterSpacing: "0.14em", marginBottom: "6px" }}>
        ▸ {title}
      </div>
      <TableHeader />
      <div>
        {weapons.map((w, i) => (
          <div key={i} style={{ borderBottom: i < weapons.length - 1 ? `1px solid ${C.hairline}` : "none" }}>
            <WeaponRow w={w} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Inner content (no Card shell) ────────────────────────────────────────

export function WeaponsPanelContent({ weapons = [] }) {
  if (!weapons.length) return null;

  const normalized = weapons.map(normalizeWeapon);
  const ranged     = normalized.filter(w => w.type !== "melee");
  const melee      = normalized.filter(w => w.type === "melee");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <WeaponSection title="Ranged" weapons={ranged} color={C.green}  />
      <WeaponSection title="Melee"  weapons={melee}  color={C.accent} />
    </div>
  );
}

// ─── WeaponsPanel — standalone with Card shell ────────────────────────────

export function WeaponsPanel({ weapons = [] }) {
  if (!weapons.length) return null;

  return (
    <Card style={CARD_STYLE}>
      <CardContent style={CARD_PAD}>
        <WeaponsPanelContent weapons={weapons} />
      </CardContent>
    </Card>
  );
}
