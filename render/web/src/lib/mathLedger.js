/**
 * mathLedger.js
 *
 * Execution-scoped mathematical event ledger.
 *
 * A new ledger is created per command execution via clearLedger().
 * All logMath() calls during execution append to the active ledger.
 * After the command completes, getLedger() returns the finalized snapshot,
 * which is passed to the MathModeBlock replay renderer.
 *
 * This module is the JavaScript counterpart to math_ledger.py (Python).
 * The event schema is identical on both sides of the server boundary.
 *
 * Usage:
 *   import { clearLedger, logMath, startMathGroup, endMathGroup, getLedger } from "@/lib/mathLedger";
 *
 *   // At start of command execution:
 *   clearLedger();
 *
 *   startMathGroup("targeting");
 *   logMath({
 *     system: "targeting",
 *     label:  "distance",
 *     formula: "sqrt((x2−x1)^2 + (y2−y1)^2)",
 *     inputs: { x1: 0, y1: 0, x2: 24, y2: 0 },
 *     result: 24.0,
 *   });
 *   endMathGroup();
 *
 *   // After execution:
 *   const ledger = getLedger();
 *   // → pass to MathModeBlock as data.ledger
 */

// ─── Module-scoped state ────────────────────────────────────────────────────
// One ledger at a time.  Cleared at the start of each command execution.

/** @type {Array<LedgerEntry>} */
let _ledger = [];

/** @type {GroupEntry | null} */
let _currentGroup = null;

// ─── Types (JSDoc) ──────────────────────────────────────────────────────────

/**
 * @typedef {Object} MathEvent
 * @property {"event"}   type
 * @property {string}    system      — Computation domain: "ballistics" | "targeting" | "simulation" | …
 * @property {string}    label       — Snake_case identifier, e.g. "p_hit"
 * @property {string}    formula     — Human-readable formula string, e.g. "(7 − hit_target) / 6"
 * @property {Object}    inputs      — Named inputs map, e.g. { hit_target: 3 }
 * @property {*}         result      — Computed result (number, string, etc.)
 * @property {string}    importance  — "high" | "normal" | "low"
 * @property {number}    timestamp   — Unix ms (Date.now())
 */

/**
 * @typedef {Object} GroupEntry
 * @property {"group"}  type
 * @property {string}   label
 * @property {MathEvent[]} events
 */

/** @typedef {MathEvent | GroupEntry} LedgerEntry */

// ─── API ────────────────────────────────────────────────────────────────────

/**
 * Clear the ledger and reset group state.
 * Must be called at the start of each command execution.
 */
export function clearLedger() {
  _ledger = [];
  _currentGroup = null;
}

/**
 * Record a single mathematical event.
 *
 * Should only be called for meaningful, named computations — not for every
 * internal arithmetic operation.  The developer decides what belongs here.
 *
 * @param {Object}  opts
 * @param {string}  opts.system      — Computation domain
 * @param {string}  opts.label       — Snake_case event identifier
 * @param {string}  opts.formula     — Readable formula string
 * @param {Object}  [opts.inputs]    — Named inputs (default: {})
 * @param {*}       opts.result      — The computed result
 * @param {string}  [opts.importance] — "high" | "normal" | "low" (default: "normal")
 * @param {number}  [opts.timestamp]  — Epoch ms (default: Date.now())
 */
export function logMath({
  system,
  label,
  formula,
  inputs = {},
  result,
  importance = "normal",
  timestamp = Date.now(),
}) {
  const event = {
    type: "event",
    system,
    label,
    formula,
    inputs,
    result,
    importance,
    timestamp,
  };

  if (_currentGroup !== null) {
    _currentGroup.events.push(event);
  } else {
    _ledger.push(event);
  }
}

/**
 * Begin a named event group.
 *
 * All logMath() calls after this will be nested inside this group until
 * endMathGroup() is called.  Groups cannot be nested.
 *
 * @param {string} label — Display label for the group, e.g. "targeting"
 */
export function startMathGroup(label) {
  const group = {
    type: "group",
    label,
    events: [],
  };
  _ledger.push(group);
  _currentGroup = group;
}

/**
 * Close the current group.
 * Subsequent logMath() calls return to the root ledger.
 */
export function endMathGroup() {
  _currentGroup = null;
}

/**
 * Return a deep copy of the current ledger.
 *
 * This is the finalized snapshot passed to the MathModeBlock replay renderer.
 * The copy ensures the returned value is immutable relative to future clears.
 *
 * @returns {LedgerEntry[]}
 */
export function getLedger() {
  return JSON.parse(JSON.stringify(_ledger));
}

/**
 * Return the total number of math events in the current ledger
 * (counting into groups).
 *
 * @returns {number}
 */
export function getLedgerEventCount() {
  let count = 0;
  for (const entry of _ledger) {
    if (entry.type === "group") {
      count += entry.events.length;
    } else {
      count += 1;
    }
  }
  return count;
}
