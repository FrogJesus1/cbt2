/**
 * reports.js — Problem-report API client.
 *
 * Any logged-in user can file a report (e.g. a missing unit). Reports are
 * stored server-side so the data owner can work through them later via the
 * `reports` command.
 */

const API = "/api";

/**
 * File a new report.
 * @param {{body:string, category?:string, subject?:string, command?:string, faction?:string, reportedBy?:string}} opts
 */
export async function createReport({
  body,
  category = "general",
  subject = "",
  command = "",
  faction = "",
  reportedBy = "unknown",
}) {
  const res = await fetch(`${API}/reports`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body, category, subject, command, faction, reported_by: reportedBy }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to file report");
  }
  return res.json();
}

/**
 * List reports. status = "open" (default) | "resolved" | "all".
 * Returns an array of { id, category, subject, body, reported_by, status, created_at, ... }.
 */
export async function listReports(status = "open") {
  const res = await fetch(`${API}/reports?status=${encodeURIComponent(status)}`);
  if (!res.ok) throw new Error("Failed to load reports");
  const data = await res.json();
  return data.reports || [];
}

/** Mark a report resolved by id. Returns the updated report. */
export async function resolveReport(id) {
  const res = await fetch(`${API}/reports/${encodeURIComponent(id)}/resolve`, { method: "POST" });
  if (!res.ok) throw new Error("Failed to resolve report");
  return res.json();
}
