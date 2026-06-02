/**
 * WarningBlock
 *
 * Modifier / rule flag alerts — full-width. Renders one line per
 * flag_note. Text is expected in "Modifier Name — description" format;
 * the name is bolded and coloured amber, the description is mid-green.
 *
 * Props:
 *   flag_notes — array of { icon: string, text: string }
 *                icon keys: lightning | skull | diamond | target | shield | star
 */

import { C } from "./shared";

const FLAG_ICONS = {
  lightning: "⚡", skull: "💀", diamond: "🔷", target: "🎯", shield: "🛡", star: "★",
  zap: "⚡",  // alias for lightning
};

export function WarningBlock({ flag_notes = [] }) {
  if (!flag_notes.length) return null;

  return (
    <div
      style={{
        border:     `1px solid ${C.bordermid}`,
        background: "#060d06",
        padding:    "10px 14px",
      }}
    >
      {flag_notes.map((n, i) => {
        // Split "Modifier Name — description text" into name + desc
        const parts   = n.text ? n.text.split(" — ") : [""];
        const modName = parts[0];
        const modDesc = parts.slice(1).join(" — ");

        return (
          <div
            key={i}
            style={{ fontSize: "13px", lineHeight: "1.8", display: "flex", gap: "7px", alignItems: "baseline" }}
          >
            <span style={{ color: C.mid, flexShrink: 0 }}>{FLAG_ICONS[n.icon] ?? "·"}</span>
            <span>
              <span style={{ color: C.amber, fontWeight: 700 }}>{modName}</span>
              {modDesc && (
                <>
                  <span style={{ color: C.dim }}> — </span>
                  <span style={{ color: C.mid }}>{modDesc}</span>
                </>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
