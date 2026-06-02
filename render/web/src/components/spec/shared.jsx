/**
 * spec/shared.jsx
 *
 * Design tokens and primitives for spec block components.
 * Re-exports shared constants; wraps Bar with spec defaults (5px height).
 */

import { Card, CardContent } from "@/components/ui/card";
import { C } from "../shared/colors";
import { CARD_STYLE, CARD_PAD, SectionTitle, Bar as SharedBar } from "../shared/constants";

export { C, CARD_STYLE, CARD_PAD, SectionTitle };

// ─── Helpers ───────────────────────────────────────────────────────────────

export function fmt(v, dec = 2) {
  if (v === null || v === undefined) return "—";
  return Number(v).toFixed(dec);
}

// ─── Bar (spec default: 5px height) ───────────────────────────────────────

export function Bar({ height = 5, ...rest }) {
  return <SharedBar height={height} {...rest} />;
}

// Thin re-export so spec components can use the same Card shell
export { Card, CardContent };
