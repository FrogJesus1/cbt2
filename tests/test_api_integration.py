"""
tests/test_api_integration.py

Integration tests for the FastAPI web layer (render/web/server.py) via Starlette's
TestClient — the 33 routes had zero coverage. These exercise the engine
query/exec routes end-to-end (real engine, real dossiers) plus the meta and
reports routes, so a wiring regression is caught before prod.

Airtable-backed routes (reports/crusade/rosters/profiles) are not configured in
CI, so those are asserted only to *degrade gracefully* (503 JSON, never a 500
stacktrace).

Run from the project root:
    python -m pytest tests/test_api_integration.py -v
    # or without pytest:
    python tests/test_api_integration.py

Requires the project deps (fastapi, httpx) — see requirements.txt.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))

from fastapi.testclient import TestClient
from render.web.server import create_app

CONFIG = json.loads((ROOT / "config.json").read_text())
ENGINE = CONFIG.get("primary_engine", "combat_terminal")

# One client/app for the whole module (engine load is the expensive part).
_client = TestClient(create_app(CONFIG))


def test_list_engines():
    r = _client.get("/api/engines")
    assert r.status_code == 200
    assert r.json().get("primary") == ENGINE


def test_engine_schema_has_queries():
    r = _client.get(f"/api/engines/{ENGINE}/schema")
    assert r.status_code == 200
    assert "queries" in r.json()


def test_engine_commands_include_spec():
    r = _client.get(f"/api/engines/{ENGINE}/commands")
    assert r.status_code == 200
    assert "spec" in r.json().get("commands", [])


def test_query_route_runs_a_command():
    r = _client.post(f"/api/engines/{ENGINE}/query",
                     json={"command": "legend", "params": {}})
    assert r.status_code == 200
    assert r.json().get("ok") is True


def test_exec_route_runs_a_combat():
    r = _client.post(f"/api/engines/{ENGINE}/exec",
                     json={"input": "intercessors vs intercessors"})
    assert r.status_code == 200
    body = r.json()
    assert body.get("ok") is True, f"combat exec should succeed: {body}"


def test_exec_route_with_roster_context():
    """The exec route accepts an optional roster_context payload and must not
    error when it is present (the roster-sync wiring)."""
    r = _client.post(f"/api/engines/{ENGINE}/exec",
                     json={"input": "spec intercessor squad",
                           "roster_context": {"my_units": [], "opponent_units": []}})
    assert r.status_code == 200
    assert r.json().get("ok") is True


def test_unknown_engine_returns_404():
    r = _client.post("/api/engines/does-not-exist/exec", json={"input": "x"})
    assert r.status_code == 404


def test_health_route():
    assert _client.get("/health").status_code == 200


def test_version_route():
    r = _client.get("/api/version")
    assert r.status_code == 200
    assert isinstance(r.json(), dict)


def test_reports_route_degrades_gracefully():
    """Without Airtable configured the reports route must return a controlled
    503 with JSON — not an unhandled 500 stacktrace."""
    r = _client.get("/api/reports")
    assert r.status_code in (200, 503), f"unexpected status {r.status_code}"
    # Body must be valid JSON either way (list of reports, or an error detail).
    assert isinstance(r.json(), (list, dict))


# ── self-runner (mirrors the other suites) ──────────────────────────────────────

def _run_all() -> None:
    import traceback
    tests = [v for k, v in sorted(globals().items())
             if k.startswith("test_") and callable(v)]
    passed = failed = 0
    for t in tests:
        try:
            t()
            print(f"  ✓  {t.__name__}")
            passed += 1
        except Exception as e:
            print(f"  ✗  {t.__name__}: {e}")
            traceback.print_exc()
            failed += 1
    print(f"\n{passed} passed, {failed} failed")
    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    print("\nCombat Terminal — API Integration Tests")
    print("─" * 60)
    _run_all()
