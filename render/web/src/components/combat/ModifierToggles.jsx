/**
 * ModifierToggles
 *
 * Inline modifier tokens rendered below the BannerCard title.
 * Displays attacker modifiers // vs // defender modifiers as clean readable text.
 * Clicking a token toggles it active/inactive (crossed out) and submits a rerun.
 *
 * UX contract:
 *   ACTIVE   → full-opacity label text
 *   INACTIVE → strikethrough + dim opacity, clearly "off" but still visible
 *   Hover    → cursor pointer, slight brightness change
 *
 * Active state is prop-driven (no local state) — the token reflects exactly
 * what the server says is active. This avoids sync issues on rerun.
 *
 * Props:
 *   attacker_flags     string[]  currently-active attacker-side flags
 *   defender_flags     string[]  currently-active defender-side flags
 *   all_attacker_flags string[]  full original attacker flag universe (incl. inactive)
 *   all_defender_flags string[]  full original defender flag universe (incl. inactive)
 *   onSubmit           (cmd: string) => void
 *   inline             bool      true when embedded inside BannerCard
 */

import { Fragment } from "react";
import { C } from "./shared";

// ─── Flag label map ────────────────────────────────────────────────────────────

const FLAG_LABELS = {
  ml:        "ml",
  cover:     "cover",
  dev:       "dev",
  lethal:    "lethal",
  rf:        "rf",
  melta:     "melta",
  blast:     "blast",
  twin:      "twin",
  sustained: "sustained",
  heavy:     "heavy",
  stealth:   "stealth",
  indirect:  "indirect",
  halfdmg:   "halfdmg",
  igncover:  "igncover",
  nocover:   "igncover",
  rrhit:     "rrhit",
  rrhit1:    "rrhit1",
  rrhits:    "rrhit",
  rrhits1:   "rrhit1",
  rrwound1:  "rrwound1",
  rrwounds1: "rrwound1",
  oath:      "oath",
  lance:     "lance",
  torrent:   "torrent",
};

/** Human-readable label for any flag string. */
function flagLabel(flag) {
  const key  = flag.split(":")[0].toLowerCase();
  const val  = flag.includes(":") ? flag.split(":")[1] : null;

  if (FLAG_LABELS[key]) return FLAG_LABELS[key];

  // Invuln: "invuln:4" → "invuln4"
  if (key.startsWith("invuln")) {
    const n = val ?? key.replace("invuln", "");
    return n ? `invuln${n}` : "invuln";
  }

  // Extra attacks: "ea1" → "ea1", "ea:2" → "ea2"
  if (key === "ea" || /^ea\d+$/.test(key)) {
    const n = val ?? key.replace("ea", "");
    return n ? `ea${n}` : "ea";
  }

  // Extra damage: "ed1" → "ed1", "ed:2" → "ed2"
  if (key === "ed" || key === "dmgplus" || /^ed\d+$/.test(key)) {
    const n = val ?? key.replace(/^(ed|dmgplus)/, "");
    return n ? `ed${n}` : "ed";
  }

  // FNP: "fnp:5" → "fnp5", "fnp5" → "fnp5"
  if (key.startsWith("fnp")) {
    const n = val ?? key.replace("fnp", "");
    return n ? `fnp${n}` : "fnp";
  }

  // Crit thresholds: "criton:5" → "crit5+", "critwound:5" → "critwound5+"
  if (key.startsWith("criton")) {
    const n = val ?? key.replace("criton", "");
    return n ? `crit${n}+` : "crit";
  }
  if (key.startsWith("critwound")) {
    const n = val ?? key.replace("critwound", "");
    return n ? `critwound${n}+` : "critwound";
  }

  // Melta with value: "melta2" → "melta2"
  if (/^melta\d+$/.test(key)) {
    return key;
  }

  // Fallback: lowercase key
  return key.toLowerCase();
}

/** Base flag name: "invuln:4" → "invuln" */
function flagBase(flag) {
  return flag.split(":")[0].toLowerCase();
}

// ─── Flag semantics ─────────────────────────────────────────────────────────────
// Beneficial flags improve attacker output (cyan).
// Penalty flags represent defensive modifiers on the target (red).

function flagSemantic(flag) {
  const key = flag.split(":")[0].toLowerCase();
  // Defensive modifiers that help the target (shown in penalty color)
  if (key === "cover" || key.startsWith("invuln") || key.startsWith("fnp")
      || key === "stealth" || key === "indirect" || key === "halfdmg") return "penalty";
  return "benefit";
}

// ─── Token ─────────────────────────────────────────────────────────────────────

function Token({ flag, isActive, onToggle }) {
  const label    = flagLabel(flag);
  const semantic = flagSemantic(flag);
  const activeColor = semantic === "penalty" ? C.red : C.cyan;

  return (
    <span
      onClick={() => onToggle(flag, !isActive)}
      title={isActive ? `Click to disable: ${label}` : `Click to enable: ${label}`}
      style={{
        color:               isActive ? activeColor : C.dim,
        fontSize:            "12px",
        fontFamily:          "monospace",
        letterSpacing:       "0.04em",
        cursor:              "pointer",
        userSelect:          "none",
        opacity:             isActive ? 1 : 0.4,
        textDecoration:      isActive ? "none" : "line-through",
        textDecorationColor: C.dim,
        transition:          "opacity 0.12s, color 0.12s",
        flexShrink:          0,
      }}
    >
      {label}
    </span>
  );
}

// ─── Pipe separator ────────────────────────────────────────────────────────────

function Pipe() {
  return (
    <span style={{
      color:      C.border,
      fontSize:   "12px",
      fontFamily: "monospace",
      userSelect: "none",
      flexShrink: 0,
      padding:    "0 4px",
    }}>
      //
    </span>
  );
}

// ─── VS divider ────────────────────────────────────────────────────────────────

function VsDivider() {
  return (
    <span style={{
      color:      C.border,
      fontSize:   "12px",
      fontFamily: "monospace",
      userSelect: "none",
      flexShrink: 0,
      padding:    "0 8px",
    }}>
      —
    </span>
  );
}

// ─── ModifierToggles ───────────────────────────────────────────────────────────

export function ModifierToggles({
  attacker_flags     = [],
  defender_flags     = [],
  all_attacker_flags = [],
  all_defender_flags = [],
  onSubmit,
  inline = false,
}) {
  const allAtt = all_attacker_flags.length ? all_attacker_flags : [...attacker_flags];
  const allDef = all_defender_flags.length ? all_defender_flags : [...defender_flags];

  if (!allAtt.length && !allDef.length) return null;

  // Active state is purely prop-derived — no local state that can drift.
  const activeAttSet = new Set((attacker_flags || []).map(flagBase));
  const activeDefSet = new Set((defender_flags || []).map(flagBase));

  const handleToggle = (flag, nowActive) => {
    const base = flagBase(flag);
    const cmd  = nowActive ? `rerun --${base}` : `rerun --${base} null`;
    onSubmit?.(cmd);
  };

  const hasAtt = allAtt.length > 0;
  const hasDef = allDef.length > 0;

  return (
    <div style={{
      display:      inline ? "inline-flex" : "flex",
      alignItems:   "center",
      flexWrap:     "wrap",
      gap:          "0px",
      paddingLeft:  inline ? "0" : "2px",
      marginTop:    inline ? "0" : "3px",
      lineHeight:   "1",
    }}>
      {/* Attacker flags */}
      {hasAtt && allAtt.map((flag, i) => (
        <Fragment key={flag}>
          {i > 0 && <Pipe />}
          <Token
            flag={flag}
            isActive={activeAttSet.has(flagBase(flag))}
            onToggle={handleToggle}
          />
        </Fragment>
      ))}

      {/* vs divider — only when both sides have flags */}
      {hasAtt && hasDef && <VsDivider />}

      {/* Defender flags */}
      {hasDef && allDef.map((flag, i) => (
        <Fragment key={flag}>
          {i > 0 && <Pipe />}
          <Token
            flag={flag}
            isActive={activeDefSet.has(flagBase(flag))}
            onToggle={handleToggle}
          />
        </Fragment>
      ))}
    </div>
  );
}
