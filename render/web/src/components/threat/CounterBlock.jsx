/**
 * CounterBlock
 *
 * Top-3 counter unit picks — solid GREEN bars with match score (0–100).
 * Displayed alongside MetricBars in the main two-column row.
 * Hidden when show_counters is false.
 *
 * Props:
 *   counters     — array of { name, score, reason? }
 *   onInject     — (cmd: string) => void  (optional — animate-types spec lookup into bar)
 *   onSubmit     — (cmd: string) => void  (optional — legacy fallback)
 */

import { Card, CardContent, C, CARD_STYLE, CARD_PAD, Bar, SectionTitle } from "./shared";

function CounterRow({ counter, onInject, onSubmit, isLast }) {
  const { name = "Unknown", score = 0, reason = "" } = counter;
  const pct = Math.min(100, Math.max(0, Number(score)));
  // Prefer onInject (animate-type) over onSubmit (silent submit)
  const handleClick = onInject
    ? () => onInject(`spec ${name}`)
    : onSubmit
    ? () => onSubmit(`spec ${name}`)
    : null;
  const clickable = Boolean(handleClick);

  return (
    <div style={{
      paddingBottom: isLast ? 0 : "12px",
    }}>

      {/* Name + score */}
      <div style={{
        display:        "flex",
        justifyContent: "space-between",
        alignItems:     "baseline",
        marginBottom:   "4px",
        gap:            "8px",
      }}>
        <span
          onClick={handleClick ?? undefined}
          style={{
            color:        clickable ? C.green : C.mid,
            fontWeight:   600,
            fontSize:     "12px",
            cursor:       clickable ? "pointer" : "default",
            userSelect:   "none",
            flex:         1,
            overflow:     "hidden",
            textOverflow: "ellipsis",
            whiteSpace:   "nowrap",
          }}
          title={clickable ? `Look up: spec ${name}` : undefined}
        >
          {name}
        </span>
        <span style={{
          color:      C.green,
          fontSize:   "12px",
          fontWeight: 700,
          fontFamily: "monospace",
          flexShrink: 0,
        }}>
          {pct}
        </span>
      </div>

      {/* Green bar */}
      <Bar pct={pct} color={C.green} height={5} />

      {/* Optional reason */}
      {reason && (
        <div style={{
          color:      C.dim,
          fontSize:   "11px",
          marginTop:  "4px",
          lineHeight: "1.4",
        }}>
          {reason}
        </div>
      )}

    </div>
  );
}

export function CounterBlock({ counters = [], onInject, onSubmit }) {
  return (
    <Card style={CARD_STYLE}>
      <CardContent style={CARD_PAD}>
        <SectionTitle>Counter Picks</SectionTitle>

        {counters.length === 0 ? (
          <div style={{ color: C.dim, fontSize: "12px" }}>
            No counters available. Load a roster for personalized picks.
          </div>
        ) : (
          <div>
            {counters.slice(0, 3).map((c, i) => (
              <CounterRow
                key={i}
                counter={c}
                onInject={onInject}
                onSubmit={onSubmit}
                isLast={i === Math.min(counters.length, 3) - 1}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
