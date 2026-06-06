"""
FastAPI Server — Rendering layer web backend.

Responsibilities:
  - Load engines from config.json at startup
  - Expose a clean REST API the React frontend calls
  - Serve the built React dist/ as static files in production

Engine registry:
  - primary:  one main engine (e.g. combat_terminal)
  - support:  zero or more smaller engines loaded alongside

Routes:
  GET  /api/engines                   → list all loaded engines + status
  GET  /api/engines/{name}            → single engine status
  GET  /api/engines/{name}/schema     → engine schema
  POST /api/engines/{name}/query      → execute a query
  POST /api/engines/{name}/exec       → execute raw input string (web console)
  GET  /api/engines/{name}/commands   → all command tokens (for autocomplete)
  GET  /api/version                    → git commit hash + server start time
"""

from __future__ import annotations

import importlib
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from data._base import EngineBase
from render.web.profiles import list_profiles, create_profile, login as profile_login, save_state, delete_profile
from render.web.shared_rosters import (
    list_all_rosters, list_rosters_grouped, get_roster as get_shared_roster,
    find_roster_by_name as find_shared_roster, save_roster as save_shared_roster,
    delete_roster as delete_shared_roster, update_roster_content,
)
from render.web import crusade_store
from render.web import reports as reports_store


# ─── Engine registry ───────────────────────────────────────────────────────────

class EngineRegistry:
    """Loads and holds all engines. Single source of truth for the server."""

    def __init__(self):
        self._engines: dict[str, EngineBase] = {}
        self._primary: str | None = None

    def load(self, config: dict):
        primary_name  = config.get("primary_engine")
        support_names = config.get("support_engines", [])

        all_names = []
        if primary_name:
            all_names.append(primary_name)
        all_names.extend(support_names)

        for name in all_names:
            engine = self._load_engine(name)
            if engine:
                self._engines[name] = engine
                if name == primary_name:
                    self._primary = name

    def _load_engine(self, name: str) -> EngineBase | None:
        try:
            module = importlib.import_module(f"data.{name}")
            engine_cls = None
            for attr_name in dir(module):
                attr = getattr(module, attr_name)
                if (
                    isinstance(attr, type)
                    and issubclass(attr, EngineBase)
                    and attr is not EngineBase
                ):
                    engine_cls = attr
                    break

            if not engine_cls:
                print(f"[server] WARNING: No EngineBase subclass found in data.{name}")
                return None

            print(f"[server] Loading engine: {name}")
            instance = engine_cls()
            print(f"[server] Loaded: {instance.name()}")
            return instance

        except Exception as e:
            print(f"[server] ERROR loading engine '{name}': {e}")
            return None

    def get(self, name: str) -> EngineBase | None:
        return self._engines.get(name)

    def list_all(self) -> list[dict]:
        result = []
        for name, engine in self._engines.items():
            result.append({
                "id":      name,
                "primary": name == self._primary,
                **engine.status()
            })
        return result

    @property
    def primary(self) -> str | None:
        return self._primary


# ─── Request body models ───────────────────────────────────────────────────────

class QueryBody(BaseModel):
    command: str = ""
    params:  dict = {}
    session_id: str | None = None   # opaque per-client token (P0-2 isolation)

class ExecBody(BaseModel):
    input: str = ""
    roster_context: dict | None = None
    session_id: str | None = None   # opaque per-client token (P0-2 isolation)

class ProfileDeleteBody(BaseModel):
    pin: str | None = None          # in the body, never the URL (kept out of logs)

class ProfileCreateBody(BaseModel):
    name: str
    pin:  str | None = None

class ProfileLoginBody(BaseModel):
    name: str
    pin:  str | None = None

class ProfileStateBody(BaseModel):
    name:  str
    state: dict

class RosterUploadBody(BaseModel):
    name:        str
    faction:     str
    content:     str
    uploaded_by: str

class CampaignCreateBody(BaseModel):
    name:         str
    faction:      str
    rp:           int = 5
    supply_limit: int = 1000
    owner:        str = "unknown"

class CampaignUpdateBody(BaseModel):
    updates: dict = {}

class UnitCreateBody(BaseModel):
    unit_name: str
    nickname:  str = ""
    points:    int = 0
    models:    int = 1
    is_leader: bool = False
    loadout:   list = []

class UnitUpdateBody(BaseModel):
    updates: dict = {}

class BattleFinalizeBody(BaseModel):
    result:        str = "draw"       # win | loss | draw
    mission:       str = ""
    point_limit:   int = 0
    notes:         str = ""
    rp_gained:     int = 1
    unit_results:  list = []          # [{unit_id, kills, destroyed, xp_gained, scars?, honours?}]
    battle_token:  str | None = None  # idempotency key — retries with the same token are no-ops

class ReportCreateBody(BaseModel):
    body:        str                  # the report text
    category:    str = "general"      # missing-unit | missing-weapon | general
    subject:     str = ""             # short label (often the unit name)
    command:     str = ""             # originating command/context
    faction:     str = ""
    reported_by: str = "unknown"


# ─── App factory ──────────────────────────────────────────────────────────────

def create_app(config: dict) -> FastAPI:
    registry = EngineRegistry()
    registry.load(config)

    app = FastAPI()

    origins = os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(",")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Accept"],
    )

    dist_dir = Path(__file__).parent / "dist"

    # ── API routes ─────────────────────────────────────────────────────────────

    @app.get("/api/engines")
    def list_engines():
        return {"engines": registry.list_all(), "primary": registry.primary}

    @app.get("/api/engines/{name}/schema")
    def engine_schema(name: str):
        engine = registry.get(name)
        if not engine:
            raise HTTPException(status_code=404, detail=f"Engine '{name}' not loaded")
        return engine.schema()

    @app.post("/api/engines/{name}/query")
    def engine_query(name: str, body: QueryBody):
        engine = registry.get(name)
        if not engine:
            raise HTTPException(status_code=404, detail=f"Engine '{name}' not loaded")
        # Bind this request to its client's isolated session (P0-2).
        if hasattr(engine, "set_session"):
            engine.set_session(body.session_id)
        return engine.query(body.command, body.params)

    @app.post("/api/engines/{name}/exec")
    def engine_exec(name: str, body: ExecBody):
        """Execute a raw command string — used by the web console terminal."""
        engine = registry.get(name)
        if not engine:
            raise HTTPException(status_code=404, detail=f"Engine '{name}' not loaded")
        # Bind this request to its client's isolated session (P0-2) BEFORE any
        # session mutation, so roster_context lands in the right client's state.
        if hasattr(engine, "set_session"):
            engine.set_session(body.session_id)
        # Sync roster context into engine session before dispatching.
        # This keeps _session["roster_my"] / _session["roster_enemy"] in step
        # with whatever rosters the frontend has active, without requiring a
        # separate round-trip.
        if body.roster_context is not None and hasattr(engine, "sync_roster_context"):
            engine.sync_roster_context(body.roster_context)
        if hasattr(engine, "exec"):
            return engine.exec(body.input)
        return engine.query(body.input.strip(), {})

    @app.get("/api/engines/{name}/commands")
    def engine_commands(name: str):
        """Return all command names and aliases for terminal autocomplete."""
        engine = registry.get(name)
        if not engine:
            raise HTTPException(status_code=404, detail=f"Engine '{name}' not loaded")
        schema = engine.schema()
        tokens = []
        for cmd_name, defn in schema.get("queries", {}).items():
            tokens.append(cmd_name)
            tokens.extend(defn.get("aliases", []))
        return {"commands": sorted(set(tokens))}

    @app.get("/api/engines/{name}")
    def engine_status(name: str):
        engine = registry.get(name)
        if not engine:
            raise HTTPException(status_code=404, detail=f"Engine '{name}' not loaded")
        return engine.status()

    # ── Profile routes ─────────────────────────────────────────────────────────

    @app.get("/api/profiles")
    def api_list_profiles():
        return {"profiles": list_profiles()}

    @app.post("/api/profiles")
    def api_create_profile(body: ProfileCreateBody):
        try:
            profile = create_profile(body.name, body.pin)
            return profile
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

    @app.post("/api/profiles/login")
    def api_login(body: ProfileLoginBody):
        try:
            profile = profile_login(body.name, body.pin)
            return profile
        except ValueError as e:
            raise HTTPException(status_code=401, detail=str(e))

    @app.post("/api/profiles/state")
    def api_save_state(body: ProfileStateBody):
        try:
            profile = save_state(body.name, body.state)
            return profile
        except ValueError as e:
            raise HTTPException(status_code=404, detail=str(e))

    @app.delete("/api/profiles/{name}")
    def api_delete_profile(name: str, body: ProfileDeleteBody | None = None):
        # PIN travels in the request body, never the URL query string, so it
        # can't leak into access logs / browser history.
        pin = body.pin if body else None
        try:
            delete_profile(name, pin)
            return {"ok": True}
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

    # ── Shared roster routes ─────────────────────────────────────────────────

    @app.get("/api/rosters")
    def api_list_rosters(grouped: bool = False):
        if grouped:
            return {"rosters": list_rosters_grouped()}
        return {"rosters": list_all_rosters()}

    @app.get("/api/rosters/{roster_id}")
    def api_get_roster(roster_id: str):
        roster = get_shared_roster(roster_id)
        if not roster:
            raise HTTPException(status_code=404, detail="Roster not found")
        return roster

    @app.post("/api/rosters/find")
    def api_find_roster(body: dict):
        name = body.get("name", "")
        roster = find_shared_roster(name)
        if not roster:
            raise HTTPException(status_code=404, detail=f"Roster '{name}' not found")
        return roster

    @app.post("/api/rosters")
    def api_upload_roster(body: RosterUploadBody):
        roster = save_shared_roster(body.name, body.faction, body.content, body.uploaded_by)
        return roster

    @app.delete("/api/rosters/{roster_id}")
    def api_delete_roster(roster_id: str, requester: str | None = None):
        # `requester` is the caller's (non-secret) profile name. When the roster
        # has a known uploader, only that uploader may delete it.
        try:
            deleted = delete_shared_roster(roster_id, requester)
        except PermissionError as e:
            raise HTTPException(status_code=403, detail=str(e))
        if not deleted:
            raise HTTPException(status_code=404, detail="Roster not found")
        return {"ok": True}

    @app.post("/api/rosters/save-metadata")
    def api_save_roster_metadata(body: dict):
        """Update embedded metadata (nicknames, attachments) in roster content.

        Expects: { name: "roster name", metadata: "# @nickname:0:Railgun HH\\n..." }
        Finds the roster by name, strips old metadata, appends the new lines.
        """
        roster_name = body.get("name", "").strip()
        metadata = body.get("metadata", "").strip()
        if not roster_name:
            raise HTTPException(status_code=400, detail="Roster name required")

        roster = find_shared_roster(roster_name)
        if not roster:
            return {"ok": False, "detail": "Roster not found — metadata saved locally only"}

        # Strip existing metadata lines from content
        import re
        existing_lines = roster.get("content", "").split("\n")
        clean_lines = [l for l in existing_lines if not re.match(r'^#\s*@(nickname|attach):', l.strip())]

        # Append new metadata
        new_content = "\n".join(clean_lines).rstrip()
        if metadata:
            new_content += "\n" + metadata + "\n"

        updated = update_roster_content(roster["id"], new_content)
        if not updated:
            return {"ok": False, "detail": "Failed to update roster"}
        return {"ok": True}

    @app.get("/api/factions")
    def api_list_factions():
        """Return all known faction names from the primary engine."""
        engine = registry.get(registry.primary)
        if not engine or not hasattr(engine, "_loader"):
            return {"factions": []}
        factions = sorted(engine._loader._units.keys())
        return {"factions": factions}

    @app.post("/api/rosters/detect-faction")
    def api_detect_faction(body: dict):
        """Extract unit names from roster text and match against loaded faction data."""
        import re
        content = body.get("content", "")
        if not content.strip():
            return {"faction": None}

        # Parse unit names from roster text (same logic as frontend parseRosterUnits)
        unit_names = []
        for line in content.split("\n"):
            line = line.strip()
            if not line or line.startswith(("#", "+", "•", "-")):
                continue
            if line.lower().startswith("enhancement:"):
                continue
            stripped = re.sub(r"^Char\d+:\s*", "", line, flags=re.IGNORECASE)
            m = re.match(r"(\d+)[xX×]\s+([^(:\n]+)", stripped)
            if m:
                unit_names.append(m.group(2).strip().lower())

        if not unit_names:
            return {"faction": None}

        # Match against engine's unit index
        engine = registry.get(registry.primary)
        if not engine or not hasattr(engine, "_loader"):
            return {"faction": None}

        faction_scores = {}
        for faction, units in engine._loader._units.items():
            known_names = {u.get("name", "").lower() for u in units}
            hits = sum(1 for name in unit_names if name in known_names)
            if hits > 0:
                faction_scores[faction] = hits

        if not faction_scores:
            return {"faction": None}

        best = max(faction_scores, key=faction_scores.get)
        return {"faction": best}

    # ── Crusade routes ───────────────────────────────────────────────────────
    # Campaign + Order of Battle storage (Crusade Tracker, Session 1).

    @app.get("/api/crusade/campaigns")
    def api_list_campaigns(owner: str | None = None):
        try:
            return {"campaigns": crusade_store.list_campaigns(owner)}
        except Exception as e:
            raise HTTPException(status_code=503, detail=str(e))

    @app.get("/api/crusade/campaigns/{campaign_id}")
    def api_get_campaign(campaign_id: str):
        campaign = crusade_store.get_campaign(campaign_id)
        if not campaign:
            raise HTTPException(status_code=404, detail="Campaign not found")
        campaign["units"] = crusade_store.list_units(campaign_id)
        return campaign

    @app.post("/api/crusade/campaigns")
    def api_create_campaign(body: CampaignCreateBody):
        try:
            return crusade_store.create_campaign(
                body.name, body.faction, body.rp, body.supply_limit, body.owner)
        except Exception as e:
            raise HTTPException(status_code=503, detail=str(e))

    @app.put("/api/crusade/campaigns/{campaign_id}")
    def api_update_campaign(campaign_id: str, body: CampaignUpdateBody):
        campaign = crusade_store.update_campaign(campaign_id, body.updates)
        if not campaign:
            raise HTTPException(status_code=404, detail="Campaign not found")
        return campaign

    @app.delete("/api/crusade/campaigns/{campaign_id}")
    def api_delete_campaign(campaign_id: str):
        if not crusade_store.delete_campaign(campaign_id):
            raise HTTPException(status_code=404, detail="Campaign not found")
        return {"ok": True}

    # ── Order of Battle (units) ──

    @app.get("/api/crusade/campaigns/{campaign_id}/units")
    def api_list_units(campaign_id: str):
        return {"units": crusade_store.list_units(campaign_id)}

    @app.post("/api/crusade/campaigns/{campaign_id}/units")
    def api_create_unit(campaign_id: str, body: UnitCreateBody):
        if not crusade_store.get_campaign(campaign_id):
            raise HTTPException(status_code=404, detail="Campaign not found")
        return crusade_store.create_unit(
            campaign_id, body.unit_name, nickname=body.nickname,
            points=body.points, models=body.models,
            is_leader=body.is_leader, loadout=body.loadout)

    @app.put("/api/crusade/units/{unit_id}")
    def api_update_unit(unit_id: str, body: UnitUpdateBody):
        unit = crusade_store.update_unit(unit_id, body.updates)
        if not unit:
            raise HTTPException(status_code=404, detail="Unit not found")
        return unit

    @app.delete("/api/crusade/units/{unit_id}")
    def api_delete_unit(unit_id: str):
        if not crusade_store.delete_unit(unit_id):
            raise HTTPException(status_code=404, detail="Unit not found")
        return {"ok": True}

    # ── Battles (history + post-battle finalize) ──

    @app.get("/api/crusade/campaigns/{campaign_id}/battles")
    def api_list_battles(campaign_id: str):
        try:
            return {"battles": crusade_store.list_battles(campaign_id)}
        except Exception as e:
            raise HTTPException(status_code=503, detail=str(e))

    @app.post("/api/crusade/campaigns/{campaign_id}/battles")
    def api_finalize_battle(campaign_id: str, body: BattleFinalizeBody):
        try:
            campaign = crusade_store.finalize_battle(
                campaign_id,
                result=body.result, mission=body.mission,
                point_limit=body.point_limit, unit_results=body.unit_results,
                notes=body.notes, rp_gained=body.rp_gained,
                battle_token=body.battle_token)
        except Exception as e:
            raise HTTPException(status_code=503, detail=str(e))
        if not campaign:
            raise HTTPException(status_code=404, detail="Campaign not found")
        return campaign

    # ── Reports (user-filed problem reports) ───────────────────────────────────

    @app.get("/api/reports")
    def api_list_reports(status: str | None = "open"):
        # status="open" (default) | "resolved" | "all"
        try:
            filt = None if status == "all" else status
            return {"reports": reports_store.list_reports(filt)}
        except Exception as e:
            raise HTTPException(status_code=503, detail=str(e))

    @app.post("/api/reports")
    def api_create_report(body: ReportCreateBody):
        try:
            return reports_store.create_report(
                body.body, category=body.category, subject=body.subject,
                command=body.command, faction=body.faction,
                reported_by=body.reported_by)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=503, detail=str(e))

    @app.post("/api/reports/{report_id}/resolve")
    def api_resolve_report(report_id: str):
        try:
            report = reports_store.resolve_report(report_id)
        except Exception as e:
            raise HTTPException(status_code=503, detail=str(e))
        if not report:
            raise HTTPException(status_code=404, detail="Report not found")
        return report

    @app.delete("/api/reports/{report_id}")
    def api_delete_report(report_id: str):
        try:
            ok = reports_store.delete_report(report_id)
        except Exception as e:
            raise HTTPException(status_code=503, detail=str(e))
        if not ok:
            raise HTTPException(status_code=404, detail="Report not found")
        return {"ok": True}

    # ── Health check ─────────────────────────────────────────────────────────

    @app.get("/health")
    def health():
        return JSONResponse({"status": "ok"})

    # ── Version ───────────────────────────────────────────────────────────────
    # Captured once at startup so it's fast and doesn't shell out per request.

    def _get_git_info() -> dict:
        """Read git short hash + commit timestamp at startup.

        Inside Docker the .git directory isn't present, so fall back to
        GIT_COMMIT / GIT_TIMESTAMP env vars baked in at build time.
        """
        # Try live git first (works in dev)
        try:
            commit = subprocess.check_output(
                ["git", "rev-parse", "--short", "HEAD"],
                cwd=str(Path(__file__).resolve().parent.parent.parent),
                stderr=subprocess.DEVNULL,
            ).decode().strip()
            ts = subprocess.check_output(
                ["git", "log", "-1", "--format=%cI"],
                cwd=str(Path(__file__).resolve().parent.parent.parent),
                stderr=subprocess.DEVNULL,
            ).decode().strip()
            return {"commit": commit, "committed": ts}
        except Exception:
            pass
        # Fall back to build-time env vars (Docker)
        return {
            "commit":    os.environ.get("GIT_COMMIT", "unknown"),
            "committed": os.environ.get("GIT_TIMESTAMP", "unknown"),
        }

    _version_info = {
        **_get_git_info(),
        "started": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }

    @app.get("/api/version")
    def version():
        return JSONResponse(_version_info)

    # ── Static file serving + SPA fallback ────────────────────────────────────

    if (dist_dir / "assets").exists():
        app.mount("/assets", StaticFiles(directory=str(dist_dir / "assets")), name="assets")

    dist_root = dist_dir.resolve()

    @app.get("/{full_path:path}")
    def spa_fallback(full_path: str):
        # Serve root-level static files (favicon, manifest, etc.) directly.
        # Resolve the candidate and confirm it stays inside dist/ before serving
        # so a crafted path (e.g. "../../etc/passwd") can't escape the web root.
        if full_path:
            candidate = (dist_dir / full_path).resolve()
            if (
                candidate.is_file()
                and candidate.is_relative_to(dist_root)
            ):
                return FileResponse(str(candidate))
        # Everything else → SPA index
        index = dist_dir / "index.html"
        if index.exists():
            return FileResponse(str(index))
        return PlainTextResponse(
            "React app not built yet.\n"
            "Run:  python main.py --build\n"
            "Then restart the server.",
            status_code=503,
        )

    return app


# ─── Module-level app instance (used by Docker CMD / uvicorn import) ─────────

_config = json.loads((Path(__file__).parent.parent.parent / "config.json").read_text())
app_instance = create_app(_config)
