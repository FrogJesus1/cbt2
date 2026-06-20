/**
 * useCountUp / CountUp — result-reveal number motion (Phase 7).
 *
 * Animates a number from 0 → target with an easeOut curve when a result first
 * renders. Fully skipped under prefers-reduced-motion (snaps to the final value)
 * and degrades to the final value if the target isn't a finite number.
 *
 * Central motion utility — wire into hero numbers (e.g. combat HeroTiles) so the
 * phosphor display "counts up" as a block reveals.
 */

import { useState, useEffect, useRef } from "react";

function prefersReducedMotion() {
  try { return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false; }
  catch { return false; }
}

const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);

/**
 * Returns the live animated value for `target`. Re-runs the count-up whenever
 * `target` changes. Returns the final value immediately under reduced motion.
 */
export function useCountUp(target, { duration = 900 } = {}) {
  const valid = typeof target === "number" && isFinite(target);
  const [val, setVal] = useState(valid ? target : 0);
  const rafRef = useRef(null);

  useEffect(() => {
    if (!valid) { setVal(0); return; }
    if (prefersReducedMotion()) { setVal(target); return; }

    const start = performance.now();
    const run = (now) => {
      const t = Math.min(1, (now - start) / duration);
      setVal(target * easeOutCubic(t));
      if (t < 1) rafRef.current = requestAnimationFrame(run);
    };
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(run);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration, valid]);

  return valid ? val : null;
}

/**
 * Renders a counting-up number. Falls back to `dash` when `value` is null/NaN.
 *   <CountUp value={6.8} decimals={1} />
 *   <CountUp value={44}  decimals={0} suffix="%" />
 */
export function CountUp({ value, decimals = 1, suffix = "", dash = "—", duration = 900 }) {
  const target = (typeof value === "number" && isFinite(value)) ? value : null;
  const n = useCountUp(target ?? 0, { duration });
  if (target === null) return dash;
  const shown = decimals === 0 ? String(Math.round(n)) : Number(n).toFixed(decimals);
  return `${shown}${suffix}`;
}
