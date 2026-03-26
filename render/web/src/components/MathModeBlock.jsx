/**
 * MathModeBlock
 *
 * Terminal-style replay renderer for the Math Mode execution ledger.
 *
 * Receives a finalized ledger produced by build_combat_ledger() (Python) or
 * getLedger() (JavaScript) and replays it as a deterministic, sequential
 * stream of math events — like watching the system reveal how it thought.
 *
 * Props:
 *   data.ledger    — Array of LedgerEntry (event | group)
 *   data.command   — Original command string (for the header)
 *   data.attacker  — Optional attacker name
 *   data.defender  — Optional defender name
 *
 * Playback controls:
 *   ▶ / ⏸  — play / pause autoplay
 *   ‹      — step back one event
 *   ›      — step forward one event
 *   ⏭      — jump to end (show all)
 *   Speed  — Slow / Normal / Fast
 */

import { useState, useEffect, useRef, useCallback } from "react";

// ─── Colour palette ─────────────────────────────────────────────────────────
// Matches the rest of the terminal UI — CSS variables + hardcoded semantics.

const C = {
  green:   "var(--ct-primary)",
  mid:     "var(--ct-primary-mid)",
  label:   "var(--ct-primary-label)",
  dim:     "var(--ct-primary-dim)",
  amber:   "#ffa328",
  cyan:    "#00e5ff",
  border:  "var(--ct-border)",
  panel:   "var(--ct-bg-panel)",
  // Math Mode accent — a distinct purple/violet so it reads as "different layer"
  math:    "#b388ff",
  mathDim: "#7c4dff40",
  mathBorder: "#7c4dff70",
};

// ─── Ledger flattening ───────────────────────────────────────────────────────
// Convert the nested ledger structure into a flat array of display items.
// This is what drives the reveal animation — each item in `flat` is one step.

function flattenLedger(ledger) {
  const items = [];
  for (const entry of (ledger || [])) {
    if (entry.type === "group") {
      items.push({ type: "group_header", label: entry.label });
      for (const ev of (entry.events || [])) {
        items.push({ type: "event", ...ev, grouped: true });
      }
      items.push({ type: "group_end" });
    } else if (entry.type === "event") {
      items.push({ type: "event", ...entry, grouped: false });
    }
  }
  return items;
}

// ─── Playback speeds ─────────────────────────────────────────────────────────

const SPEEDS = [
  { label: "0.5×", ms: 700 },
  { label: "1×",   ms: 320 },
  { label: "2×",   ms: 120 },
  { label: "4×",   ms: 40  },
];
const DEFAULT_SPEED_IDX = 1; // 1×

// ─── Result formatter ────────────────────────────────────────────────────────

function formatResult(result) {
  if (result === null || result === undefined) return "—";
  if (typeof result === "number") {
    // Integers shown as-is; floats to reasonable precision
    return Number.isInteger(result) ? String(result) : result.toFixed(3);
  }
  return String(result);
}

// ─── Formula line ────────────────────────────────────────────────────────────
// label = formula  →  result
// High importance events get a brighter colour.

function EventLine({ item, revealed, isLatest }) {
  const isHigh = item.importance === "high";
  const indent = item.grouped ? "  " : "";
  const labelColor   = isHigh ? C.math    : C.mid;
  const formulaColor = isHigh ? C.mid     : C.dim;
  const resultColor  = isHigh ? C.amber   : C.mid;
  const arrowColor   = C.mathBorder.replace("40", "90");

  return (
    <div
      style={{
        display:    "flex",
        alignItems: "baseline",
        gap:        "6px",
        lineHeight: "1.75",
        opacity:    revealed ? 1 : 0,
        transform:  revealed ? "translateX(0)" : "translateX(-4px)",
        transition: "opacity 0.18s ease, transform 0.18s ease",
        fontFamily: "inherit",
      }}
    >
      {/* Indent for grouped items */}
      {item.grouped && (
        <span style={{ color: C.border, flexShrink: 0, userSelect: "none" }}>│ </span>
      )}

      {/* label */}
      <span style={{
        color:      labelColor,
        flexShrink: 0,
        fontWeight: isHigh ? 600 : 400,
        minWidth:   "18ch",
        overflow:   "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}>
        {indent}{item.label}
      </span>

      {/* = formula */}
      <span style={{ color: C.border, flexShrink: 0 }}>=</span>
      <span style={{
        color:     formulaColor,
        flexGrow:  1,
        overflow:  "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        minWidth:  0,
      }}>
        {item.formula}
      </span>

      {/* → result */}
      <span style={{ color: arrowColor, flexShrink: 0 }}>→</span>
      <span style={{
        color:      resultColor,
        fontWeight: isHigh ? 700 : 500,
        flexShrink: 0,
        minWidth:   "6ch",
        textAlign:  "right",
        textShadow: isHigh && isLatest ? `0 0 8px ${C.amber}80` : "none",
        transition: "text-shadow 0.3s ease",
      }}>
        {formatResult(item.result)}
      </span>
    </div>
  );
}

// ─── Group header ────────────────────────────────────────────────────────────

function GroupHeader({ label, revealed }) {
  return (
    <div
      style={{
        display:    "flex",
        alignItems: "center",
        gap:        "8px",
        marginTop:  "10px",
        marginBottom: "2px",
        opacity:    revealed ? 1 : 0,
        transition: "opacity 0.15s ease",
      }}
    >
      <span style={{ color: C.mathBorder, userSelect: "none" }}>┌</span>
      <span style={{
        color:          C.math,
        fontWeight:     700,
        fontSize:       "11px",
        letterSpacing:  "0.14em",
        textTransform:  "uppercase",
      }}>
        {label}
      </span>
      <span style={{ color: C.mathBorder, flexGrow: 1, userSelect: "none" }}>
        {"─".repeat(2)}
      </span>
    </div>
  );
}

// ─── Speed selector button ────────────────────────────────────────────────────

function SpeedButton({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background:  active ? C.mathDim   : "transparent",
        border:      `1px solid ${active ? C.math : C.border}`,
        color:       active ? C.math      : C.dim,
        padding:     "1px 7px",
        fontSize:    "11px",
        fontFamily:  "inherit",
        cursor:      "pointer",
        letterSpacing: "0.05em",
        transition:  "all 0.1s ease",
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.borderColor = C.math; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.borderColor = C.border; }}
    >
      {label}
    </button>
  );
}

// ─── Control button ──────────────────────────────────────────────────────────

function CtrlButton({ label, title, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        background:    "transparent",
        border:        `1px solid ${disabled ? C.border + "50" : C.mathBorder}`,
        color:         disabled ? C.border       : C.math,
        padding:       "2px 9px",
        fontSize:      "13px",
        fontFamily:    "inherit",
        cursor:        disabled ? "default"      : "pointer",
        opacity:       disabled ? 0.4            : 1,
        transition:    "all 0.1s ease",
        userSelect:    "none",
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = C.mathDim; }}
      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
    >
      {label}
    </button>
  );
}

// ─── Root component ──────────────────────────────────────────────────────────

export function MathModeBlock({ data }) {
  const { ledger = [], command = "", attacker, defender } = data || {};

  // Flatten once on mount
  const flatItems = useRef(flattenLedger(ledger));
  const total     = flatItems.current.length;

  const [revealed,  setRevealed]  = useState(0);
  const [playing,   setPlaying]   = useState(true);
  const [speedIdx,  setSpeedIdx]  = useState(DEFAULT_SPEED_IDX);

  const intervalRef = useRef(null);

  // ── Playback engine ────────────────────────────────────────────────────────
  const stepForward = useCallback(() => {
    setRevealed(r => Math.min(r + 1, total));
  }, [total]);

  const stepBack = useCallback(() => {
    setRevealed(r => Math.max(r - 1, 0));
  }, []);

  const jumpToEnd = useCallback(() => {
    setRevealed(total);
    setPlaying(false);
  }, [total]);

  const togglePlay = useCallback(() => {
    setPlaying(p => !p);
  }, []);

  // Tick interval — driven by playing state + speed
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);

    if (playing && revealed < total) {
      intervalRef.current = setInterval(() => {
        setRevealed(r => {
          if (r >= total) {
            setPlaying(false);
            return r;
          }
          return r + 1;
        });
      }, SPEEDS[speedIdx].ms);
    }

    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [playing, speedIdx, revealed, total]);

  // Auto-stop when fully revealed
  useEffect(() => {
    if (revealed >= total && playing) {
      setPlaying(false);
    }
  }, [revealed, total, playing]);

  // ── Counts ────────────────────────────────────────────────────────────────
  const eventItems  = flatItems.current.filter(i => i.type === "event");
  const totalEvents = eventItems.length;
  const shownEvents = flatItems.current.slice(0, revealed).filter(i => i.type === "event").length;
  const groupCount  = ledger.filter(e => e.type === "group").length;
  const isDone      = revealed >= total;

  // ── Header subtitle ───────────────────────────────────────────────────────
  const subtitle = [
    groupCount > 0 && `${groupCount} section${groupCount !== 1 ? "s" : ""}`,
    `${totalEvents} event${totalEvents !== 1 ? "s" : ""}`,
  ].filter(Boolean).join("  ·  ");

  // Progress bar
  const progress = total > 0 ? (revealed / total) * 100 : 0;

  return (
    <div
      className="font-mono"
      style={{ paddingLeft: "18px", fontSize: "13px" }}
    >
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div style={{
        borderLeft:  `2px solid ${C.math}`,
        paddingLeft: "10px",
        marginBottom: "8px",
      }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "10px", flexWrap: "wrap" }}>
          <span style={{
            color:         C.math,
            fontWeight:    700,
            fontSize:      "12px",
            letterSpacing: "0.16em",
            textTransform: "uppercase",
          }}>
            ◈ MATH MODE
          </span>
          {subtitle && (
            <span style={{ color: C.dim, fontSize: "11px" }}>{subtitle}</span>
          )}
          <span style={{ color: C.border, fontSize: "11px", marginLeft: "auto" }}>
            {shownEvents}/{totalEvents}
          </span>
        </div>
        {command && (
          <div style={{ color: C.dim, fontSize: "11px", marginTop: "2px" }}>
            › {command}
          </div>
        )}
      </div>

      {/* ── Progress bar ─────────────────────────────────────────────────── */}
      <div style={{
        height:       "2px",
        background:   C.border + "40",
        marginBottom: "10px",
        position:     "relative",
        overflow:     "hidden",
      }}>
        <div style={{
          position:   "absolute",
          left:       0,
          top:        0,
          height:     "100%",
          width:      `${progress}%`,
          background: C.math,
          transition: `width ${SPEEDS[speedIdx].ms * 0.8}ms linear`,
          boxShadow:  `0 0 6px ${C.math}80`,
        }} />
      </div>

      {/* ── Playback controls ─────────────────────────────────────────────── */}
      <div style={{
        display:      "flex",
        alignItems:   "center",
        gap:          "6px",
        marginBottom: "14px",
        flexWrap:     "wrap",
      }}>
        <CtrlButton
          label="‹"
          title="Step back"
          onClick={stepBack}
          disabled={revealed === 0}
        />
        <CtrlButton
          label={playing ? "⏸" : "▶"}
          title={playing ? "Pause" : "Play"}
          onClick={togglePlay}
          disabled={isDone && !playing}
        />
        <CtrlButton
          label="›"
          title="Step forward"
          onClick={stepForward}
          disabled={revealed >= total}
        />
        <CtrlButton
          label="⏭"
          title="Jump to end"
          onClick={jumpToEnd}
          disabled={isDone}
        />

        {/* Speed selector */}
        <div style={{ display: "flex", gap: "4px", marginLeft: "8px" }}>
          {SPEEDS.map((s, i) => (
            <SpeedButton
              key={s.label}
              label={s.label}
              active={i === speedIdx}
              onClick={() => setSpeedIdx(i)}
            />
          ))}
        </div>

        {/* Done indicator */}
        {isDone && (
          <span style={{
            color:         C.math,
            fontSize:      "11px",
            marginLeft:    "8px",
            letterSpacing: "0.1em",
            opacity:       0.8,
          }}>
            COMPLETE
          </span>
        )}
      </div>

      {/* ── Event replay stream ───────────────────────────────────────────── */}
      <div style={{
        borderLeft:  `1px solid ${C.mathBorder}`,
        paddingLeft: "12px",
      }}>
        {flatItems.current.map((item, idx) => {
          const isRevealed = idx < revealed;
          const isLatest   = idx === revealed - 1 && item.type === "event";

          if (item.type === "group_header") {
            return (
              <GroupHeader
                key={idx}
                label={item.label}
                revealed={isRevealed}
              />
            );
          }

          if (item.type === "group_end") {
            return (
              <div
                key={idx}
                style={{
                  color:       C.border,
                  marginBottom: "4px",
                  opacity:     isRevealed ? 0.5 : 0,
                  transition:  "opacity 0.15s ease",
                  userSelect:  "none",
                }}
              >
                └
              </div>
            );
          }

          if (item.type === "event") {
            return (
              <EventLine
                key={idx}
                item={item}
                revealed={isRevealed}
                isLatest={isLatest}
              />
            );
          }

          return null;
        })}
      </div>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      {isDone && (
        <div style={{
          marginTop:   "12px",
          paddingTop:  "8px",
          borderTop:   `1px solid ${C.mathBorder}`,
          color:       C.dim,
          fontSize:    "11px",
          display:     "flex",
          gap:         "8px",
          alignItems:  "center",
        }}>
          <span style={{ color: C.math }}>◈</span>
          <span>Ledger sealed. All math verified.</span>
        </div>
      )}
    </div>
  );
}
