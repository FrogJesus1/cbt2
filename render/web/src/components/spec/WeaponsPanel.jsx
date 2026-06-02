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
    skill:    pick(w, "skill", "BS", "WS", "bs", "ws"),
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

const GRID = "1fr 72px 52px 72px 52px 52px 58px";
const COLS = ["Weapon", "Range", "A", "BS/WS", "S", "AP", "D"];

// AP color — in 40K more-negative AP is better (AP-4 > AP-1 > AP 0).
// Never use red for raw AP values; red is reserved for modifiers that degrade.
function apColor(cell) {
  const n = parseInt(String(cell ?? ""), 10);
  if (isNaN(n) || n === 0) return C.label;  // AP 0 = no penetration, neutral
  if (n <= -3) return C.green;              // AP -3 or better = strong armor pierce
  return C.mid;                             // AP -1 / -2 = moderate, positive-leaning
}

function cellColor(i, cell) {
  if (i === 0) return C.mid;
  if (i === 5) return apColor(cell);  // AP column — graduated positive
  if (i === 6) return C.cyan;         // D = cyan
  return C.label;
}

function TableHeader() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: GRID, marginBottom: "6px" }}>
      {COLS.map((col, i) => (
        <div key={col} style={{
          color:         C.label,
          fontSize:      "13px",
          fontWeight:    700,
          textTransform: "uppercase",
          letterSpacing: "0.09em",
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
        <span style={{ color: w._drone ? C.cyan : C.mid, fontSize: "14px", lineHeight: "1.4" }}>
          {w.name === null || w.name === undefined ? "—" : String(w.name)}
        </span>
        {keywords.map((kw, i) => (
          <KeywordTag key={i} keyword={kw} />
        ))}
      </div>

      {/* Stat cells */}
      {statCells.map((cell, i) => (
        <div key={i} style={{
          color:     cellColor(i + 1, cell),
          fontSize:  "14px",
          textAlign: "center",
        }}>
          {cell === null || cell === undefined ? "—" : String(cell)}
        </div>
      ))}
    </div>
  );
}

export function WeaponSection({ title, weapons }) {
  if (!weapons.length) return null;
  return (
    <div>
      <SectionTitle>{title}</SectionTitle>
      <TableHeader />
      <div style={{ borderTop: `1px solid ${C.border}` }}>
        {weapons.map((w, i) => (
          <div key={i} style={{ borderBottom: i < weapons.length - 1 ? `1px solid ${C.border}` : "none" }}>
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
      <WeaponSection title="Ranged Weapons" weapons={ranged} />
      <WeaponSection title="Melee Weapons"  weapons={melee}  />
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
