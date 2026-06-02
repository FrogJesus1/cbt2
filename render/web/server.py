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
"""

from __future__ import annotations

import importlib
import json
import os
import sys
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from data._base import EngineBase


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

class ExecBody(BaseModel):
    input: str = ""
    roster_context: dict | None = None


# ─── App factory ──────────────────────────────────────────────────────────────

def create_app(config: dict) -> FastAPI:
    registry = EngineRegistry()
    registry.load(config)

    app = FastAPI()

    origins = os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(",")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_methods=["GET", "POST", "OPTIONS"],
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
        return engine.query(body.command, body.params)

    @app.post("/api/engines/{name}/exec")
    def engine_exec(name: str, body: ExecBody):
        """Execute a raw command string — used by the web console terminal."""
        engine = registry.get(name)
        if not engine:
            raise HTTPException(status_code=404, detail=f"Engine '{name}' not loaded")
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

    # ── Health check ─────────────────────────────────────────────────────────

    @app.get("/health")
    def health():
        return JSONResponse({"status": "ok"})

    # ── Static file serving + SPA fallback ────────────────────────────────────

    if (dist_dir / "assets").exists():
        app.mount("/assets", StaticFiles(directory=str(dist_dir / "assets")), name="assets")

    @app.get("/{full_path:path}")
    def spa_fallback(full_path: str):
        # Serve root-level static files (favicon, manifest, etc.) directly
        if full_path:
            candidate = dist_dir / full_path
            if candidate.exists() and candidate.is_file():
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
