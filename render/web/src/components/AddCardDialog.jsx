/**
 * AddCardDialog
 *
 * Shadcn Dialog for the final step of the `add card --bass` CLI flow.
 * Accepts title + details captured in-terminal, adds an optional file
 * attachment (PDF or image), then submits to Airtable.
 *
 * Props:
 *   open      boolean           — controlled open state
 *   title     string            — card name from CLI step 1
 *   details   string            — description from CLI step 2
 *   skill     string | null     — pre-filled Projects/Skills value (e.g. "Bass Guitar")
 *   onClose   () → void         — called on cancel or after submit
 *   onSuccess () → void         — called on successful submit (before onClose)
 *   cliMode   string            — tagging prop; "full" = core CLI functionality
 */

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useFileUpload } from "@/hooks/use-file-upload";

// ─── Airtable stub ────────────────────────────────────────────────────────────
//
// Replace AIRTABLE_TOKEN, AIRTABLE_BASE_ID, and AIRTABLE_TABLE_NAME with real
// values. File attachments require a publicly accessible URL — upload the file
// to a storage service first and pass the resulting URL as the attachment href.
//
// Field names match the Cards table schema:
//   "Card Name"       → string
//   "Description"     → string
//   "Projects/Skills" → array of linked record IDs (stub uses name strings)
//   "File"            → array of attachment objects { url, filename }

const AIRTABLE_TOKEN     = "REPLACE_WITH_TOKEN";
const AIRTABLE_BASE_ID   = "REPLACE_WITH_BASE_ID";
const AIRTABLE_TABLE_NAME = "Cards";

async function submitToAirtable({ title, details, skill, file }) {
  // ── Stub guard — remove this block when real credentials are set ───────────
  if (AIRTABLE_TOKEN === "REPLACE_WITH_TOKEN") {
    console.log("[AddCard] Airtable stub — would submit:", { title, details, skill, file: file?.name });
    // Simulate network latency
    await new Promise(r => setTimeout(r, 600));
    return { ok: true };
  }

  // ── Real submission ────────────────────────────────────────────────────────
  const fields = {
    "Card Name": title,
  };

  if (details)   fields["Description"]     = details;
  if (skill)     fields["Projects/Skills"] = [skill]; // linked record stub

  // Attachments: Airtable expects [{ url, filename }]
  // File must be uploaded to a public host first; swap null for the real URL.
  if (file) {
    fields["File"] = [{ url: null, filename: file.name }]; // TODO: upload first
  }

  const res = await fetch(
    `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}`,
    {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${AIRTABLE_TOKEN}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({ fields }),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Airtable error ${res.status}`);
  }
  return res.json();
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AddCardDialog({
  open,
  title     = "",
  details   = "",
  skill     = null,
  onClose,
  onSuccess,
  cliMode,   // "full" — tagging only, no behaviour change
}) {
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const [
    { files, isDragging, errors: fileErrors },
    { handleDragEnter, handleDragLeave, handleDragOver, handleDrop, openFileDialog, getInputProps },
  ] = useFileUpload({ accept: ".pdf,image/*", maxFiles: 1 });

  const file = files[0]?.file ?? null;

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await submitToAirtable({ title, details, skill, file });
      onSuccess?.();
      onClose?.();
    } catch (err) {
      setSubmitError(err.message || "Submission failed. Check the console.");
    } finally {
      setSubmitting(false);
    }
  }

  // Shared mono style helpers
  const mono   = { fontFamily: "monospace" };
  const dimTxt = { ...mono, color: "var(--ct-primary-dim)",   fontSize: "12px" };
  const errTxt = { ...mono, color: "#ff3b3b",                  fontSize: "12px" };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose?.(); }}>
      <DialogContent
        className="sm:max-w-md"
        style={{
          backgroundColor: "var(--ct-bg-panel)",
          border:          "1px solid var(--ct-border)",
          color:           "var(--ct-primary-label)",
        }}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <DialogHeader>
          <DialogTitle style={{ ...mono, color: "var(--ct-primary)", fontSize: "15px", letterSpacing: "0.05em" }}>
            ADD CARD
          </DialogTitle>
        </DialogHeader>

        {/* ── Summary of CLI-captured fields ──────────────────────────────── */}
        <div className="space-y-1 mt-1">
          <div style={{ ...mono, fontSize: "13px" }}>
            <span style={{ color: "var(--ct-primary-dim)" }}>name    </span>
            <span style={{ color: "var(--ct-primary-label)" }}>{title || "—"}</span>
          </div>
          <div style={{ ...mono, fontSize: "13px" }}>
            <span style={{ color: "var(--ct-primary-dim)" }}>desc    </span>
            <span style={{ color: "var(--ct-primary-label)" }}>{details || "—"}</span>
          </div>
          {skill && (
            <div style={{ ...mono, fontSize: "13px" }}>
              <span style={{ color: "var(--ct-primary-dim)" }}>skill   </span>
              <span style={{ color: "var(--ct-primary-label)" }}>{skill}</span>
            </div>
          )}
        </div>

        {/* ── File dropzone ───────────────────────────────────────────────── */}
        <div
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={openFileDialog}
          className="mt-3 cursor-pointer rounded transition-colors"
          style={{
            border:          `2px dashed ${isDragging ? "var(--ct-primary)" : "var(--ct-border)"}`,
            backgroundColor: isDragging ? "rgba(57,255,20,0.04)" : "transparent",
            padding:         "28px 16px",
            textAlign:       "center",
          }}
        >
          <input {...getInputProps()} />

          {file ? (
            <span style={{ ...mono, color: "var(--ct-primary-label)", fontSize: "13px" }}>
              📎 {file.name}
            </span>
          ) : (
            <span style={{ ...dimTxt, fontSize: "13px" }}>
              Drop PDF or image here — or click to browse
            </span>
          )}
        </div>

        {/* ── Validation / submit errors ──────────────────────────────────── */}
        {fileErrors.length > 0 && (
          <p style={errTxt} className="mt-1">{fileErrors[0]}</p>
        )}
        {submitError && (
          <p style={errTxt} className="mt-1">{submitError}</p>
        )}

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <DialogFooter className="mt-3 gap-2">
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={submitting}
            style={{ ...mono, color: "var(--ct-primary-dim)", fontSize: "13px" }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !title}
            style={{
              ...mono,
              backgroundColor: "var(--ct-primary)",
              color:           "var(--ct-bg-dark)",
              fontWeight:      "bold",
              fontSize:        "13px",
            }}
          >
            {submitting ? "Submitting…" : "Submit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
