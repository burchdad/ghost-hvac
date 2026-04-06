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
    assert {
        "timestamp",
        "pressure",
        "runtime",
        "superheat",
        "subcooling",
        "delta_t",
        "ambient_temp",
    }.issubset(payload["data"].keys())
    assert {
        "alerts",
        "severity",
        "health_score",
        "leak_probability",
        "customer_profile",
    }.issubset(payload["analysis"].keys())
    assert payload["analysis"]["severity"] in {"NORMAL", "WARNING", "CRITICAL"}


def test_reset_endpoint_restores_previous_pressure_baseline() -> None:
    backend_main._previous_pressure = 101.0

    response = client.post("/reset")
    assert response.status_code == 200
    payload = response.json()

    assert payload["previous_pressure"] == 120.0
    assert backend_main._previous_pressure == 120.0


def test_clients_list_for_company() -> None:
    response = client.get("/clients?company_id=ghost-hvac-co&profile=enterprise")
    assert response.status_code == 200

    payload = response.json()
    assert isinstance(payload, list)
    assert len(payload) >= 1
    first = payload[0]
    assert {
        "client_id",
        "name",
        "status",
        "health_score",
        "leak_risk",
        "last_update",
    }.issubset(first.keys())


def test_client_detail_and_reset() -> None:
    detail_response = client.get("/clients/1?company_id=ghost-hvac-co&profile=retail")
    assert detail_response.status_code == 200
    detail = detail_response.json()
    assert detail["client"]["client_id"] == 1
    assert "data" in detail
    assert "analysis" in detail

    reset_response = client.post("/clients/1/reset?company_id=ghost-hvac-co")
    assert reset_response.status_code == 200
    reset_payload = reset_response.json()
    assert reset_payload["client_id"] == 1
    assert reset_payload["previous_pressure"] == 120.0
