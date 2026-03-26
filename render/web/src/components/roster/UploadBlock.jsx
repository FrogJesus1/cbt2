/**
 * UploadBlock
 *
 * Inline upload widget rendered in the terminal stream when the user types
 * one of: upload roster / upload enemy roster / upload campaign.
 *
 * Shows the Pattern file-upload component plus a "paste below" cue.
 * When a file is selected or dropped, calls onUpload(content, filename).
 * Paste input is handled by Terminal.jsx's submit() intercept.
 *
 * result_type: "upload_block"
 * data: { mode: "roster" | "enemy" | "campaign" }
 */

import { useState } from "react";
import { Pattern } from "@/components/ui/file-upload";

// ─── Colour palette (matches rest of roster components) ───────────────────────
const C = {
  green:  "var(--ct-primary)",
  mid:    "var(--ct-primary-mid)",
  label:  "var(--ct-primary-label)",
  dim:    "var(--ct-primary-dim)",
  amber:  "#ffa328",
  border: "var(--ct-border)",
};

// ─── Label helpers ────────────────────────────────────────────────────────────

const MODE_LABELS = {
  roster:   "Upload Roster",
  enemy:    "Upload Enemy Roster",
  campaign: "Upload Campaign",
};

const MODE_HINT = {
  roster:   "Accepted: .roz  .rozs  .json",
  enemy:    "Accepted: .roz  .rozs  .json  ·  Will be auto-assigned as enemy",
  campaign: "Accepted: .roz  .rozs  .json",
};

// ─── Component ────────────────────────────────────────────────────────────────

export function UploadBlock({ data, onUpload }) {
  const { mode = "roster" } = data || {};
  const [done, setDone] = useState(false);

  const title = MODE_LABELS[mode] ?? "Upload File";
  const hint  = MODE_HINT[mode]  ?? "";

  function handleFiles(files) {
    if (!files.length || done) return;

    const fileItem = files[0];
    const reader   = new FileReader();

    reader.onload = (e) => {
      const content = e.target?.result;
      if (typeof content !== "string") return;
      setDone(true);
      onUpload?.(content, fileItem.file.name);
    };

    reader.onerror = () => {
      // Let the Pattern error UI handle it — no special action needed here
    };

    reader.readAsText(fileItem.file);
  }

  return (
    <div
      className="font-mono"
      style={{
        paddingLeft: "18px",
        fontSize:    "14px",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
        <span style={{ color: C.amber }}>▶</span>
        <span style={{ color: C.label, fontWeight: 700, letterSpacing: "0.05em" }}>
          {title.toUpperCase()}
        </span>
      </div>

      {/* Hint line */}
      <div style={{ color: C.dim, fontSize: "12px", marginBottom: "12px", paddingLeft: "16px" }}>
        {hint}
      </div>

      {/* Pattern component */}
      {!done ? (
        <div style={{ paddingLeft: "16px" }}>
          <Pattern
            accept=".roz,.rozs,.json"
            multiple={false}
            maxFiles={1}
            onFilesChange={handleFiles}
          />
        </div>
      ) : (
        <div
          style={{
            paddingLeft:  "16px",
            color:        C.green,
            fontSize:     "13px",
          }}
        >
          ✓ File loaded — waiting for details…
        </div>
      )}

      {/* Paste divider */}
      {!done && (
        <div style={{ paddingLeft: "16px", marginTop: "14px" }}>
          <div style={{ color: C.dim, fontSize: "12px", marginBottom: "4px" }}>
            — or —
          </div>
          <div style={{ color: C.mid, fontSize: "13px" }}>
            Paste roster text and press Enter:
          </div>
          <div style={{ color: C.green, marginTop: "4px", fontSize: "13px" }}>
            &gt;
          </div>
        </div>
      )}
    </div>
  );
}
