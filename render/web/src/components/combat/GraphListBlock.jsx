/**
 * GraphListBlock
 *
 * Shared primitive — reusable labelled bar list used by
 * TotalUnitOutput, WeaponPlatformTotals, and ModifierImpact.
 *
 * Props:
 *   title      — optional sub-heading string
 *   items      — array of { label, value, max, color?, displayValue?, note? }
 *   emptyMsg   — string shown when items is empty
 *
 * Note: secondary rows have been removed — callers should promote kills to its
 * own first-class item with a "Kills" label.
 */

import { C, fmt, Bar } from "./shared";

// Labels are now short ("Dmg", "Kills", "Kill Chance", etc.) so 80px is ample.
// Value column holds things like "10.95 dmg", "6.5 kills", "<1 kill".
const LABEL_W = "80px";
const VALUE_W = "72px";

export function GraphListBlock({ title, items = [], emptyMsg = "No data." }) {
  if (!items.length) return (
    <div>
      {title && (
        <div style={{ color: C.mid, fontSize: "13px", marginBottom: "10px", letterSpacing: "0.05em" }}>
          {title}
        </div>
      )}
      <div style={{ color: C.label, fontSize: "12px", fontStyle: "italic" }}>{emptyMsg}</div>
    </div>
  );

  return (
    <div style={{ marginBottom: "4px" }}>
      {title && (
        <div style={{ color: C.mid, fontSize: "13px", marginBottom: "8px", letterSpacing: "0.05em" }}>
          {title}
        </div>
      )}
      {items.map((item, i) => (
        <div key={i} style={{ marginBottom: "4px" }}>
          {/* Primary row: label | bar | value */}
          <div style={{
            display:             "grid",
            gridTemplateColumns: `${LABEL_W} 1fr ${VALUE_W}`,
            alignItems:          "center",
            gap:                 "6px",
            lineHeight:          "1",
          }}>
            <span style={{
              color:         C.dim,
              fontSize:      "10px",
              letterSpacing: "0.06em",
              textAlign:     "right",
              whiteSpace:    "nowrap",
              overflow:      "hidden",
              textOverflow:  "ellipsis",
            }}>
              {item.label}
            </span>
            <Bar value={item.value} max={item.max} color={item.color ?? C.green} segments={10} />
            <span style={{
              color:      item.color ?? C.green,
              fontSize:   "10px",
              fontWeight: 600,
              textAlign:  "right",
              whiteSpace: "nowrap",
            }}>
              {item.displayValue !== undefined ? item.displayValue : fmt(item.value)}
            </span>
          </div>

          {item.note && (
            <div style={{
              color:      C.label,
              fontSize:   "10px",
              marginTop:  "2px",
              fontStyle:  "italic",
              paddingLeft: `calc(${LABEL_W} + 12px)`,
            }}>
              {item.note}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
