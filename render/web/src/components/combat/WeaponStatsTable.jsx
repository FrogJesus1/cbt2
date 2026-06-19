/**
 * WeaponStatsTable
 *
 * Weapon spec table for the [unit] vs [unit] combat view.
 * Columns: Weapon name (+ keyword badges) | A | BS | S | WR | AP | D
 *
 * "A" shows "2 (4)" when shots_total is set — attacks-per-model (total across squad).
 * "BS" and "WR" are colour-coded when a modifier shifts them from their baseline:
 *   green  = improved  (lower roll needed)
 *   red    = degraded  (higher roll needed)
 *
 * Weapons can be toggled off by clicking their row.  Disabled weapons are
 * struck through and dimmed.  This calls onToggleWeapon(weaponName) so the
 * parent can adjust aggregate damage totals.
 *
 * Props:
 *   weapons          — full weapons array from combat engine response
 *   disabledWeapons  — Set<string> of weapon names currently disabled
 *   onToggleWeapon   — (name: string) => void  called when a row is clicked
 */

import { Card, CardContent } from "@/components/ui/card";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { C, CARD_STYLE, CARD_PAD, SectionTitle } from "./shared";

// ─── Keyword badge abbreviations ───────────────────────────────────────────

const KW_ABBREV = {
  "DEVASTATING WOUNDS":  "DW",
  "TWIN-LINKED":         "TL",
  "LETHAL HITS":         "LH",
  "TORRENT":             "TO",
  "RAPID FIRE":          "RF",
  "SUSTAINED HITS":      "SH",
  "BLAST":               "BL",
  "HEAVY":               "HV",
  "LANCE":               "LC",
  "ONE SHOT":            "OS",
  "INDIRECT FIRE":       "IF",
  "ANTI-":               "AN",
  "MELTA":               "ML",
};

function kwAbbrev(kw) {
  const upper = kw.toUpperCase();
  // Exact match
  if (KW_ABBREV[upper]) return KW_ABBREV[upper];
  // Prefix match for parameterised keywords (e.g. RAPID FIRE 1, ANTI-INFANTRY 4+)
  for (const [key, abbr] of Object.entries(KW_ABBREV)) {
    if (upper.startsWith(key)) return abbr;
  }
  // Fallback: first two non-space chars
  return upper.replace(/\s+/g, "").slice(0, 2);
}

// ─── Conditional (situational) keywords ────────────────────────────────────
// These are parsed off the weapon but only apply when the player declares the
// situation (stationary / within half range / on the charge). They map to a
// flag the engine gates on. Rendered as click-to-apply chips: crossed-out when
// inactive, lit when active. Everything else (Lethal, Twin, Dev, Sustained,
// Torrent, Ignores Cover, Blast, Anti, …) is always-on and shown as a static
// lit badge — never clickable, so additive keywords like Sustained can't stack.

const CONDITIONAL_KW = [
  { needle: "RAPID FIRE", flag: "rf",    hint: "within half range" },
  { needle: "MELTA",      flag: "melta", hint: "within half range" },
  { needle: "HEAVY",      flag: "heavy", hint: "if you Remained Stationary" },
  { needle: "LANCE",      flag: "lance", hint: "on the charge" },
];

function conditionalFor(kw) {
  const u = kw.toUpperCase();
  for (const c of CONDITIONAL_KW) if (u.startsWith(c.needle)) return c;
  return null;
}

// ─── Keyword badge — static (always-on) or interactive (conditional) ────────

function KeywordBadge({ kw, activeFlags, onToggleFlag }) {
  const cond  = conditionalFor(kw);
  const label = kwAbbrev(kw);

  // Always-on keyword (or no toggle handler available) → static lit badge.
  if (!cond || !onToggleFlag) {
    return (
      <span
        title={cond ? `${kw} — situational (apply via the modifier bar)` : `${kw} — applied automatically`}
        onClick={(e) => e.stopPropagation()}
        style={{
          fontSize:      "9px",
          color:         C.amber,
          border:        `1px solid ${C.bordermid}`,
          background:    `${C.amber}14`,
          padding:       "0 3px",
          letterSpacing: "0.04em",
          flexShrink:    0,
          lineHeight:    "14px",
        }}
      >
        {label}
      </span>
    );
  }

  const active = !!activeFlags && activeFlags.has(cond.flag);

  return (
    <span
      title={active
        ? `${kw} — applied. Click to remove (${cond.hint})`
        : `${kw} — situational. Click to apply ${cond.hint}`}
      onClick={(e) => { e.stopPropagation(); onToggleFlag(cond.flag, !active); }}
      style={{
        fontSize:       "9px",
        color:          active ? C.cyan : C.dim,
        border:         `1px ${active ? "solid" : "dashed"} ${active ? C.cyan : C.border}`,
        background:     active ? `${C.cyan}1f` : "transparent",
        padding:        "0 3px",
        letterSpacing:  "0.04em",
        flexShrink:     0,
        lineHeight:     "14px",
        cursor:         "pointer",
        opacity:        active ? 1 : 0.55,
        textDecoration: active ? "none" : "line-through",
        userSelect:     "none",
      }}
    >
      {label}
    </span>
  );
}

// ─── AP delta helper ───────────────────────────────────────────────────────
// In 40K, more-negative AP is better.  Red is only correct when a modifier has
// degraded AP from its base (ap_delta: "worse").  For raw values, derive a
// positive-or-neutral signal: AP-3 or better = "better" (green), else neutral.
// Falls back to engine-provided ap_delta when present.

function resolveApDelta(w) {
  if (w.ap_delta) return w.ap_delta;                 // engine-computed delta wins
  const n = parseInt(String(w.ap ?? ""), 10);
  if (isNaN(n) || n === 0) return null;              // AP 0 = neutral
  if (n <= -3) return "better";                      // AP-3+ = strong, highlight green
  return null;                                        // AP-1/-2 = moderate, leave neutral
}

// ─── Modifier-reason popover ───────────────────────────────────────────────
// Rendered on hover over a coloured BS / WR cell.  `reason` is the engine-built
// object: { stat, from, to, delta, via, direction, text }.

function ReasonPopover({ reason }) {
  const dirColor = reason.direction === "worse" ? C.red : C.green;
  return (
    <TooltipContent
      side="top"
      sideOffset={6}
      className="rounded-none border px-0 py-0"
      style={{
        background:    C.bgDark,
        border:        `1px solid ${dirColor}`,
        boxShadow:     `0 0 10px ${dirColor}55`,
        color:         C.mid,
        fontFamily:    "inherit",
        maxWidth:      "240px",
        padding:       0,
      }}
    >
      <div style={{ padding: "7px 10px" }}>
        {/* Stat change headline */}
        <div style={{
          color:         dirColor,
          fontWeight:    700,
          fontSize:      "13px",
          letterSpacing: "0.02em",
          textShadow:    `0 0 6px ${dirColor}70`,
          whiteSpace:    "nowrap",
        }}>
          {reason.stat} {reason.from} → {reason.to}
        </div>
        {/* Modifier attribution */}
        <div style={{
          marginTop: "3px",
          fontSize:  "11px",
          color:     C.label,
          lineHeight: 1.35,
        }}>
          {reason.delta && (
            <span style={{ color: C.amber, fontWeight: 600 }}>{reason.delta}</span>
          )}
          {reason.delta && reason.via && (
            <span style={{ color: C.dim }}>{"  ·  "}</span>
          )}
          {reason.via
            ? <span>via {reason.via}</span>
            : (!reason.delta && <span>modified from baseline</span>)}
        </div>
      </div>
    </TooltipContent>
  );
}

// ─── Stat cell — optionally coloured by delta, hoverable when reason present ──

function StatCell({ value, delta, reason, dim = false }) {
  let color = dim ? C.label : C.mid;
  if (delta === "better") color = C.green;
  if (delta === "worse")  color = C.red;

  const cellStyle = {
    textAlign:  "center",
    padding:    "4px 8px",
    color,
    fontWeight: delta ? 700 : 400,
    textShadow: delta === "better" ? `0 0 6px ${C.green}80`
              : delta === "worse"  ? `0 0 6px ${C.red}80`
              : "none",
    whiteSpace: "nowrap",
  };

  // No explanation available → plain cell.
  if (!reason) {
    return <td style={cellStyle}>{value ?? "—"}</td>;
  }

  // Hoverable cell: dotted underline hints the popover, cursor = help.
  return (
    <td style={cellStyle}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            onClick={(e) => e.stopPropagation()}
            style={{
              cursor:           "help",
              borderBottom:     `1px dotted ${color}`,
              paddingBottom:    "1px",
            }}
          >
            {value ?? "—"}
          </span>
        </TooltipTrigger>
        <ReasonPopover reason={reason} />
      </Tooltip>
    </td>
  );
}

// ─── Single weapon row ─────────────────────────────────────────────────────

function WeaponRow({ w, disabled, onToggle, activeFlags, onToggleFlag }) {
  // Build the attacks display:  "2 (4)"  or just  "2"  or the raw string
  let attacksDisplay = w.shots ?? "—";
  if (w.shots_total != null) {
    attacksDisplay = `${w.shots} (${w.shots_total})`;
  }

  // WR: prefer computed wound_target, otherwise show "—"
  const wrDisplay = w.wound_target != null ? `${w.wound_target}+` : "—";

  // Format AP: show "-4" as "-4", "0" as "0"
  const apDisplay = w.ap != null && w.ap !== "—"
    ? (String(w.ap).startsWith("-") ? w.ap : (w.ap === "0" || w.ap === 0 ? "0" : w.ap))
    : "—";

  // Range display
  const rangeDisplay = w.range ?? "—";

  // Drone / supplement: cyan name if _drone flag set
  const baseNameColor = w._drone ? C.cyan : C.mid;
  const nameColor     = disabled ? C.dim : baseNameColor;

  return (
    <tr
      onClick={() => onToggle?.(w.name)}
      title={disabled ? `Click to enable: ${w.name}` : `Click to disable: ${w.name}`}
      style={{
        borderTop:  `1px solid ${C.border}`,
        cursor:     onToggle ? "pointer" : "default",
        opacity:    disabled ? 0.35 : 1,
        transition: "opacity 0.15s",
      }}
    >
      {/* Weapon name + keyword badges */}
      <td style={{ padding: "4px 8px 4px 2px", verticalAlign: "middle" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "5px", flexWrap: "wrap" }}>
          <span style={{
            color:          nameColor,
            fontSize:       "12px",
            whiteSpace:     "nowrap",
            textDecoration: disabled ? "line-through" : "none",
          }}>
            {w.name}
          </span>
          {!disabled && (w.keywords || []).map((kw, i) => (
            <KeywordBadge
              key={i}
              kw={kw}
              activeFlags={activeFlags}
              onToggleFlag={onToggleFlag}
            />
          ))}
          {disabled && (
            <span style={{
              fontSize:      "9px",
              color:         C.dim,
              border:        `1px solid ${C.border}`,
              padding:       "0 3px",
              letterSpacing: "0.06em",
              flexShrink:    0,
              lineHeight:    "14px",
            }}>
              OFF
            </span>
          )}
        </div>
      </td>

      {/* Rng — range */}
      <td style={{
        textAlign:  "center",
        padding:    "4px 8px",
        color:      C.label,
        whiteSpace: "nowrap",
        fontSize:   "12px",
      }}>
        {rangeDisplay}
      </td>

      {/* A — attacks per model (total) */}
      <td style={{
        textAlign:  "center",
        padding:    "4px 8px",
        color:      C.mid,
        whiteSpace: "nowrap",
        fontSize:   "12px",
      }}>
        {attacksDisplay}
      </td>

      {/* BS — show effective hit target when modifiers change it */}
      <StatCell
        value={w.hit_target != null ? `${w.hit_target}+` : (w.bs_ws ?? "—")}
        delta={w.bs_delta}
        reason={w.bs_reason}
      />

      {/* S */}
      <StatCell value={w.strength ?? "—"} />

      {/* WR — computed wound roll, coloured by wr_delta */}
      <StatCell
        value={wrDisplay}
        delta={w.wr_delta}
        reason={w.wr_reason}
      />

      {/* AP — modifier-aware: green when improved, red when worsened, with popover */}
      <StatCell value={apDisplay} delta={resolveApDelta(w)} reason={w.ap_reason} />

      {/* D */}
      <StatCell value={w.damage ?? "—"} />
    </tr>
  );
}

// ─── Section (Ranged or Melee) ─────────────────────────────────────────────

const HEADER_STYLE = {
  fontSize:      "10px",
  color:         C.dim,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  textAlign:     "center",
  padding:       "4px 8px",
  borderBottom:  `1px solid ${C.border}`,
  fontWeight:    600,
};

function WeaponSection({ title, weapons, disabledWeapons, onToggle, activeFlags, onToggleFlag }) {
  if (!weapons || weapons.length === 0) return null;

  return (
    <>
      {/* Section divider */}
      <tr>
        <td
          colSpan={8}
          className="ct-display"
          style={{
            padding:       "9px 2px 5px",
            color:         C.accent,
            fontSize:      "10px",
            letterSpacing: "0.14em",
            borderTop:     `1px solid ${C.border}`,
          }}
        >
          ▸ {title}
        </td>
      </tr>
      {weapons.map((w, i) => (
        <WeaponRow
          key={i}
          w={w}
          disabled={disabledWeapons?.has(w.name)}
          onToggle={onToggle}
          activeFlags={activeFlags}
          onToggleFlag={onToggleFlag}
        />
      ))}
    </>
  );
}

// ─── WeaponStatsTable ──────────────────────────────────────────────────────

export function WeaponStatsTable({ weapons = [], disabledWeapons, onToggleWeapon, activeFlags = [], onToggleFlag }) {
  const ranged = weapons.filter(w => w.type !== "melee");
  const melee  = weapons.filter(w => w.type === "melee");

  if (!weapons.length) return null;

  // Active flag base-names (e.g. "heavy") as a Set, for conditional chip state.
  const activeFlagSet = new Set(
    (activeFlags || []).map(f => String(f).split(":")[0].toLowerCase())
  );

  // Only show model-count note when > 1 model
  const models = weapons[0]?.models ?? 1;
  const modelNote = models > 1
    ? `${models} models · A shows per-model (squad total)`
    : null;

  const disabledCount = disabledWeapons ? disabledWeapons.size : 0;

  return (
    <TooltipProvider delayDuration={120} skipDelayDuration={300}>
    <Card style={CARD_STYLE}>
      <CardContent style={CARD_PAD}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "12px", marginBottom: "10px" }}>
          <span className="ct-display" style={{ color: C.accent, fontSize: "12px", letterSpacing: "0.14em" }}>
            Weapon Specs
          </span>
          {modelNote && (
            <span style={{ color: C.dim, fontSize: "10px", letterSpacing: "0.05em" }}>
              {modelNote}
            </span>
          )}
          {onToggleWeapon && (
            <span style={{ color: C.label, fontSize: "10px", letterSpacing: "0.04em", marginLeft: "auto" }}>
              click row to toggle
              {disabledCount > 0 && (
                <span style={{ color: C.amber, marginLeft: "6px" }}>
                  · {disabledCount} off
                </span>
              )}
            </span>
          )}
        </div>

        <table style={{
          width:           "100%",
          borderCollapse:  "collapse",
          fontSize:        "12px",
          fontFamily:      "inherit",
        }}>
          <thead>
            <tr>
              <th style={{ ...HEADER_STYLE, textAlign: "left", padding: "4px 8px 4px 2px" }}>
                Weapon
              </th>
              {["Rng", "A", "BS", "S", "WR", "AP", "D"].map(col => (
                <th key={col} style={HEADER_STYLE}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <WeaponSection
              title="Ranged"
              weapons={ranged}
              disabledWeapons={disabledWeapons}
              onToggle={onToggleWeapon}
              activeFlags={activeFlagSet}
              onToggleFlag={onToggleFlag}
            />
            <WeaponSection
              title="Melee"
              weapons={melee}
              disabledWeapons={disabledWeapons}
              onToggle={onToggleWeapon}
              activeFlags={activeFlagSet}
              onToggleFlag={onToggleFlag}
            />
          </tbody>
        </table>
      </CardContent>
    </Card>
    </TooltipProvider>
  );
}
