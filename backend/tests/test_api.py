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


def test_create_client_endpoint() -> None:
    response = client.post(
        "/clients?company_id=ghost-hvac-co",
        json={
            "name": "Demo Client",
            "address": "101 New St",
            "device_type": "residential",
            "system_type": "Residential Split",
            "portfolio_mode": "stable",
            "customer_profile": "budget_sensitive",
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["message"] == "Client created."
    assert payload["client"]["name"] == "Demo Client"


def test_create_ticket_and_list_tickets() -> None:
    create_response = client.post(
        "/clients/1/tickets?company_id=ghost-hvac-co",
        json={
            "issue": "Check anomaly trend",
            "priority": "HIGH",
            "notes": "Created from automated test",
            "assigned_to": "Mike",
        },
    )
    assert create_response.status_code == 200
    create_payload = create_response.json()
    assert create_payload["message"] == "Ticket created."
    assert create_payload["ticket"]["client_id"] == 1

    list_response = client.get("/tickets?company_id=ghost-hvac-co")
    assert list_response.status_code == 200
    tickets = list_response.json()
    assert isinstance(tickets, list)
    assert any(ticket["client_id"] == 1 for ticket in tickets)

    tech_view_response = client.get(
        "/tickets?company_id=ghost-hvac-co&role=tech&tech_name=Mike"
    )
    assert tech_view_response.status_code == 200
    tech_tickets = tech_view_response.json()
    assert all(ticket["assigned_to"] == "Mike" for ticket in tech_tickets)


def test_report_exports_csv_and_pdf() -> None:
    csv_response = client.get(
        "/clients/1/report?company_id=ghost-hvac-co&profile=retail&format=csv"
    )
    assert csv_response.status_code == 200
    assert csv_response.headers["content-type"].startswith("text/csv")
    assert "health_score" in csv_response.text

    pdf_response = client.get(
        "/clients/1/report?company_id=ghost-hvac-co&profile=retail&format=pdf"
    )
    assert pdf_response.status_code == 200
    assert pdf_response.headers["content-type"].startswith("application/pdf")
    assert pdf_response.content.startswith(b"%PDF")


def test_report_history_endpoint() -> None:
    response = client.get(
        "/clients/1/reports/history?company_id=ghost-hvac-co"
    )
    assert response.status_code == 200
    payload = response.json()
    assert isinstance(payload, list)
    if payload:
        assert {"format", "generated_at", "severity"}.issubset(payload[0].keys())


def test_leak_simulation_queues_auto_ticket(monkeypatch) -> None:
    backend_main._tickets.clear()

    def fake_generate_data(*, leak: bool = False):
        return {
            "timestamp": "2026-01-01T00:00:00Z",
            "pressure": 90.0,
            "runtime": 12.0,
            "superheat": 34.0,
            "subcooling": 2.0,
            "delta_t": 9.0,
            "ambient_temp": 95.0,
        }

    def fake_analyze_anomaly(**kwargs):
        return {
            "alerts": ["Leak risk high"],
            "severity": "CRITICAL",
            "health_score": 62,
            "leak_probability": 88,
            "leak_label": "HIGH",
            "efficiency_score": 61,
            "cost_impact_low": 45,
            "cost_impact_high": 95,
            "failure_window": "3-7 days",
            "customer_profile": "retail",
            "ai_diagnosis": "Leak likely",
            "ai_explanation": "High leak probability",
        }

    monkeypatch.setattr(backend_main, "generate_data", fake_generate_data)
    monkeypatch.setattr(backend_main, "analyze_anomaly", fake_analyze_anomaly)

    response = client.get("/clients/1?company_id=ghost-hvac-co&profile=retail&leak=true")
    assert response.status_code == 200

    tickets_response = client.get("/tickets?company_id=ghost-hvac-co")
    assert tickets_response.status_code == 200
    tickets = tickets_response.json()
    assert any(
        ticket["client_id"] == 1
        and ticket["status"] == "OPEN"
        and ticket["source"] in {"AUTO_LEAK", "AUTO_LEAK_SIM"}
        for ticket in tickets
    )
