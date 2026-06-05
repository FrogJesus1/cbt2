"""
Reports store — Airtable-backed problem reports.

Any logged-in user can file a report (e.g. "this unit is missing from the
dossier"). Only the data owner can actually fix the underlying data, so reports
collect in one place for them to work through later via the `reports` command.

Mirrors the shape and conventions of shared_rosters.py / crusade_store.py:
server-side storage, tagged with the reporter's profile name and a timestamp,
addressed by a stable string id.

Schema self-provisioning:
  On first use this module attempts to create the Reports table via the Airtable
  metadata API (requires the PAT to carry the `schema.bases:write` scope). If
  that scope is absent the call fails quietly and the table must be created by
  hand — see REPORTS_TABLE_SPEC below for the exact field list.

Required env vars (same as the other stores):
  AIRTABLE_TOKEN     Airtable Personal Access Token
  AIRTABLE_BASE_ID   Base ID (e.g. appfOqXB5mLMgXFKp)
"""

from __future__ import annotations

import os
import re
import time
from datetime import datetime, timezone

from pyairtable import Api


REPORTS_TABLE = "Reports"

# Field list — used for self-provisioning and as the manual-setup reference.
REPORTS_TABLE_SPEC = [
    {"name": "ReportId", "type": "singleLineText"},
    {"name": "Category", "type": "singleLineText"},   # missing-unit | missing-weapon | general
    {"name": "Subject", "type": "singleLineText"},    # short label, e.g. the unit name
    {"name": "Body", "type": "multilineText"},        # the report text
    {"name": "Command", "type": "singleLineText"},    # originating command/context (optional)
    {"name": "Faction", "type": "singleLineText"},    # optional
    {"name": "ReportedBy", "type": "singleLineText"},
    {"name": "Status", "type": "singleLineText"},     # open | resolved
    {"name": "CreatedAt", "type": "singleLineText"},
    {"name": "ResolvedAt", "type": "singleLineText"},
]


# ─── Airtable connection + lazy schema provisioning ────────────────────────────

_schema_checked = False


def _get_base():
    token = os.environ.get("AIRTABLE_TOKEN", "")
    base_id = os.environ.get("AIRTABLE_BASE_ID", "")
    if not token or not base_id:
        raise RuntimeError(
            "AIRTABLE_TOKEN and AIRTABLE_BASE_ID must be set. "
            "Reports cannot be stored without an Airtable connection."
        )
    return Api(token).base(base_id)


def _ensure_schema(base) -> None:
    """Best-effort: create the Reports table if it's missing.

    Idempotent and cheap to call once per process. Failures (e.g. the PAT lacks
    schema.bases:write) are swallowed — the table may already exist or must be
    created by hand from REPORTS_TABLE_SPEC.
    """
    global _schema_checked
    if _schema_checked:
        return
    _schema_checked = True
    try:
        existing = {t.name for t in base.schema().tables}
    except Exception as exc:  # noqa: BLE001 — schema read not permitted, skip
        print(f"[reports] schema check skipped: {exc}")
        return
    if REPORTS_TABLE in existing:
        return
    try:
        base.create_table(REPORTS_TABLE, REPORTS_TABLE_SPEC)
        print(f"[reports] created table {REPORTS_TABLE}")
    except Exception as exc:  # noqa: BLE001
        print(f"[reports] could not create {REPORTS_TABLE}: {exc}")


def _table():
    base = _get_base()
    _ensure_schema(base)
    return base.table(REPORTS_TABLE)


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _slugify(s: str) -> str:
    return re.sub(r"[^a-z0-9-]", "", s.lower().strip().replace(" ", "-"))


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _make_id(subject: str) -> str:
    base = _slugify(subject) or "report"
    return f"{base}-{int(time.time() * 1000)}"


def _find_by_report_id(table, report_id: str) -> dict | None:
    safe = report_id.replace("'", r"\'")
    records = table.all(formula=f"{{ReportId}} = '{safe}'")
    return records[0] if records else None


def _record_to_report(record: dict) -> dict:
    f = record["fields"]
    return {
        "id":          f.get("ReportId", ""),
        "category":    f.get("Category", "general"),
        "subject":     f.get("Subject", ""),
        "body":        f.get("Body", ""),
        "command":     f.get("Command", ""),
        "faction":     f.get("Faction", ""),
        "reported_by": f.get("ReportedBy", "unknown"),
        "status":      f.get("Status", "open"),
        "created_at":  f.get("CreatedAt"),
        "resolved_at": f.get("ResolvedAt"),
        "_record_id":  record["id"],
    }


# ─── Public API ───────────────────────────────────────────────────────────────

def create_report(
    body: str,
    *,
    category: str = "general",
    subject: str = "",
    command: str = "",
    faction: str = "",
    reported_by: str = "unknown",
) -> dict:
    """File a new report. Returns the saved report dict.

    `body` is the free-text description. `subject` is a short label (often the
    unit name); if omitted it's derived from the first few words of the body.
    """
    body = (body or "").strip()
    if not body and not subject:
        raise ValueError("A report needs some text.")
    if not subject:
        subject = " ".join(body.split()[:6])

    report_id = _make_id(subject)
    now = _now()

    fields = {
        "ReportId":   report_id,
        "Category":   category or "general",
        "Subject":    subject,
        "Body":       body or subject,
        "Command":    command or "",
        "Faction":    faction or "",
        "ReportedBy": reported_by or "unknown",
        "Status":     "open",
        "CreatedAt":  now,
        "ResolvedAt": "",
    }
    _table().create(fields)

    return {
        "id":          report_id,
        "category":    fields["Category"],
        "subject":     subject,
        "body":        fields["Body"],
        "command":     fields["Command"],
        "faction":     fields["Faction"],
        "reported_by": fields["ReportedBy"],
        "status":      "open",
        "created_at":  now,
        "resolved_at": "",
    }


def list_reports(status: str | None = "open") -> list[dict]:
    """Return reports, newest first. Pass status="open"/"resolved" to filter,
    or status=None for all."""
    records = _table().all()
    reports = [_record_to_report(r) for r in records]
    if status:
        reports = [r for r in reports if (r["status"] or "open") == status]
    reports.sort(key=lambda r: r.get("created_at") or "", reverse=True)
    return reports


def resolve_report(report_id: str) -> dict | None:
    """Mark a report resolved. Returns the updated report, or None if not found."""
    table = _table()
    record = _find_by_report_id(table, report_id)
    if not record:
        return None
    now = _now()
    table.update(record["id"], {"Status": "resolved", "ResolvedAt": now})
    report = _record_to_report(record)
    report["status"] = "resolved"
    report["resolved_at"] = now
    return report


def delete_report(report_id: str) -> bool:
    """Delete a report by id. Returns True if it existed."""
    table = _table()
    record = _find_by_report_id(table, report_id)
    if not record:
        return False
    table.delete(record["id"])
    return True
