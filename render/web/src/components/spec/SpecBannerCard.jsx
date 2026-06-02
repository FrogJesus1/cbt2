/**
 * SpecBannerCard
 *
 * Unit name header — full-width, displayed at the top of every spec result.
 * Same visual language as combat/BannerCard but for a single unit.
 *
 * Props:
 *   title    — string  (unit name)
 *   subtitle — string  (e.g. "T'au Empire  ·  125pts")
 *   onInject — (cmd: string) => void  (optional — makes title re-runnable)
 */

import { Card, CardContent, C, CARD_STYLE, CARD_PAD } from "./shared";

export function SpecBannerCard({ title = "", subtitle = "", onInject, isStarred, onToggleStar }) {
  return (
    <Card style={{ ...CARD_STYLE, border: `1px solid ${C.bordermid}`, boxShadow: `inset 0 0 0 1px ${C.border}` }}>
      <CardContent style={{ ...CARD_PAD, fontSize: "20px", lineHeight: "1.3", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <span
            onClick={() => onInject?.(`spec ${title}`)}
            style={{
              color:      C.amber,
              textShadow: `0 0 10px ${C.amber}60`,
              fontWeight: 600,
              cursor:     onInject ? "pointer" : "default",
              userSelect: "none",
            }}
            title={onInject ? `Re-run: spec ${title}` : undefined}
          >
            {(title || "—").toUpperCase()}
          </span>
          {subtitle && (
            <span style={{ color: C.label, fontSize: "13px", marginLeft: "14px", fontWeight: 400 }}>
              {subtitle}
            </span>
          )}
        </div>
        {onToggleStar && (
          <span
            onClick={() => onToggleStar(title)}
            style={{
              color:      isStarred ? C.amber : C.dim,
              fontSize:   "18px",
              cursor:     "pointer",
              userSelect: "none",
              padding:    "2px 6px",
              transition: "color 0.15s",
              flexShrink: 0,
            }}
            onMouseEnter={e => { if (!isStarred) e.currentTarget.style.color = C.label; }}
            onMouseLeave={e => { if (!isStarred) e.currentTarget.style.color = C.dim; }}
            title={isStarred ? "Remove from starred" : "Star this unit"}
          >
            {isStarred ? "★" : "☆"}
          </span>
        )}
      </CardContent>
    </Card>
  );
}
