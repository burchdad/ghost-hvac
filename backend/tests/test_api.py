from __future__ import annotations

import sys
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from main import app
import main as backend_main


client = TestClient(app)


def test_simulate_endpoint_structure_and_severity() -> None:
    response = client.get("/simulate?leak=false")
    assert response.status_code == 200

    payload = response.json()
    assert "data" in payload
    assert "analysis" in payload
    assert {"timestamp", "pressure", "runtime"}.issubset(payload["data"].keys())
    assert {"alerts", "severity"}.issubset(payload["analysis"].keys())
    assert payload["analysis"]["severity"] in {"NORMAL", "WARNING", "CRITICAL"}


def test_reset_endpoint_restores_previous_pressure_baseline() -> None:
    backend_main._previous_pressure = 101.0

    response = client.post("/reset")
    assert response.status_code == 200
    payload = response.json()

    assert payload["previous_pressure"] == 120.0
    assert backend_main._previous_pressure == 120.0
