/**
 * SpecBannerCard
 *
 * Unit name header — full-width, displayed at the top of every spec result.
 * Same visual language as combat/BannerCard but for a single unit.
 *
 * Props:
 *   title    — string  (unit name)
 *   subtitle — string  (e.g. "T'au Empire  ·  125pts")
 */

import { Card, CardContent, C, CARD_STYLE, CARD_PAD } from "./shared";

export function SpecBannerCard({ title = "", subtitle = "" }) {
  return (
    <Card style={{ ...CARD_STYLE, border: `1px solid ${C.bordermid}`, boxShadow: `inset 0 0 0 1px ${C.border}` }}>
      <CardContent style={{ ...CARD_PAD, fontSize: "20px", lineHeight: "1.3" }}>
        <span style={{ color: C.amber, textShadow: `0 0 10px ${C.amber}60`, fontWeight: 600 }}>
          {(title || "—").toUpperCase()}
        </span>
        {subtitle && (
          <span style={{ color: C.label, fontSize: "13px", marginLeft: "14px", fontWeight: 400 }}>
            {subtitle}
          </span>
        )}
      </CardContent>
    </Card>
  );
}
