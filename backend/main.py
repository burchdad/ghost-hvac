from __future__ import annotations

from datetime import datetime, timezone
import os

from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

try:
    from model import analyze_anomaly
    from notifier import dispatch_alerts, is_escalation
    from simulator import generate_data
except ModuleNotFoundError:
    from .model import analyze_anomaly
    from .notifier import dispatch_alerts, is_escalation
    from .simulator import generate_data

app = FastAPI(title="Ghost HVAC API", version="1.0.0")


def _cors_origins_from_env() -> list[str]:
    raw_origins = os.getenv("CORS_ORIGINS", "*")
    origins = [origin.strip() for origin in raw_origins.split(",") if origin.strip()]
    return origins or ["*"]


cors_origins = _cors_origins_from_env()
allow_all_origins = "*" in cors_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if allow_all_origins else cors_origins,
    allow_credentials=not allow_all_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

PROFILE_PRESETS: dict[str, dict[str, float]] = {
    "retail": {
        "baseline_runtime": 10.0,
        "ambient_sensitivity": 0.85,
    },
    "industrial": {
        "baseline_runtime": 12.5,
        "ambient_sensitivity": 1.1,
    },
    "enterprise": {
        "baseline_runtime": 14.0,
        "ambient_sensitivity": 1.25,
    },
}

DEFAULT_COMPANY_ID = "ghost-hvac-co"
CLIENTS = [
    {
        "client_id": 1,
        "company_id": "ghost-hvac-co",
        "name": "House 1",
        "address": "123 Main St",
        "device_type": "residential",
        "system_type": "Residential Split",
        "portfolio_mode": "review",
    },
    {
        "client_id": 2,
        "company_id": "ghost-hvac-co",
        "name": "House 2",
        "address": "490 Pine Ave",
        "device_type": "residential",
        "system_type": "Heat Pump Split",
        "portfolio_mode": "stable",
    },
    {
        "client_id": 3,
        "company_id": "ghost-hvac-co",
        "name": "Building A",
        "address": "77 Commerce Blvd",
        "device_type": "commercial",
        "system_type": "RTU (Rooftop Unit)",
        "portfolio_mode": "urgent",
    },
    {
        "client_id": 4,
        "company_id": "northwind-services",
        "name": "Warehouse 9",
        "address": "910 Harbor Way",
        "device_type": "industrial",
        "system_type": "Multi-zone Packaged",
        "portfolio_mode": "review",
    },
]

_previous_pressure = 120.0
_previous_severity = "NORMAL"
_subscribers: list[dict] = []
_tickets: list[dict] = []
_next_ticket_id = 1
_client_states: dict[int, dict[str, float | str]] = {
    int(client["client_id"]): {
        "previous_pressure": 120.0,
        "previous_severity": "NORMAL",
        "previous_health_score": 100.0,
    }
    for client in CLIENTS
}


class SubscribeRequest(BaseModel):
    phone: str = ""
    email: str = ""


class CreateClientRequest(BaseModel):
    name: str
    address: str
    device_type: str = "residential"
    system_type: str = "Residential Split"
    portfolio_mode: str = "stable"


class CreateTicketRequest(BaseModel):
    issue: str = "Automated anomaly review"
    priority: str = "MEDIUM"
    notes: str = ""


def _utc_iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _escape_pdf_text(text: str) -> str:
    return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _build_simple_pdf(lines: list[str]) -> bytes:
    escaped_lines = [_escape_pdf_text(line) for line in lines]
    stream_lines = ["BT", "/F1 12 Tf", "50 780 Td"]
    for idx, line in enumerate(escaped_lines):
        if idx > 0:
            stream_lines.append("T*")
        stream_lines.append(f"({line}) Tj")
    stream_lines.append("ET")
    stream_content = "\n".join(stream_lines)

    objects = [
        "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
        "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
        "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
        "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
        f"5 0 obj\n<< /Length {len(stream_content.encode('latin-1'))} >>\nstream\n{stream_content}\nendstream\nendobj\n",
    ]

    output = "%PDF-1.4\n"
    offsets = [0]
    for obj in objects:
        offsets.append(len(output.encode("latin-1")))
        output += obj

    xref_start = len(output.encode("latin-1"))
    output += f"xref\n0 {len(objects) + 1}\n"
    output += "0000000000 65535 f \n"
    for offset in offsets[1:]:
        output += f"{offset:010d} 00000 n \n"
    output += (
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
        f"startxref\n{xref_start}\n%%EOF"
    )

    return output.encode("latin-1")


def _get_client_or_404(company_id: str, client_id: int) -> dict:
    for client in CLIENTS:
        if (
            int(client["client_id"]) == client_id
            and str(client["company_id"]) == company_id
        ):
            return client
    raise HTTPException(
        status_code=404,
        detail=f"Client {client_id} not found for company_id={company_id}",
    )


def _simulate_for_client(client_id: int, profile: str, leak: bool) -> dict:
    client_state = _client_states.setdefault(
        client_id,
        {
            "previous_pressure": 120.0,
            "previous_severity": "NORMAL",
            "previous_health_score": 100.0,
        },
    )
    previous_pressure = float(client_state["previous_pressure"])
    previous_severity = str(client_state["previous_severity"])
    profile_preset = PROFILE_PRESETS.get(profile, PROFILE_PRESETS["retail"])

    data = generate_data(leak=leak)
    analysis = analyze_anomaly(
        pressure=float(data["pressure"]),
        prev_pressure=previous_pressure,
        runtime=float(data["runtime"]),
        baseline_runtime=float(profile_preset["baseline_runtime"]),
        superheat=float(data["superheat"]),
        subcooling=float(data["subcooling"]),
        delta_t=float(data["delta_t"]),
        ambient_temp=float(data["ambient_temp"]),
        ambient_sensitivity=float(profile_preset["ambient_sensitivity"]),
        customer_profile=profile,
    )

    client_state["previous_pressure"] = float(data["pressure"])
    current_severity = str(analysis["severity"])

    if is_escalation(previous_severity, current_severity):
        dispatch_alerts(_subscribers, current_severity, analysis["alerts"])

    client_state["previous_severity"] = current_severity

    return {"data": data, "analysis": analysis}


def reset_state() -> dict:
    global _previous_pressure, _previous_severity
    _previous_pressure = 120.0
    _previous_severity = "NORMAL"
    return {
        "message": "Backend simulation state reset.",
        "previous_pressure": _previous_pressure,
    }


@app.get("/simulate")
def simulate(
    leak: bool = Query(False),
    profile: str = Query("retail", pattern="^(retail|industrial|enterprise)$"),
) -> dict:
    global _previous_pressure, _previous_severity

    profile_preset = PROFILE_PRESETS.get(profile, PROFILE_PRESETS["retail"])

    data = generate_data(leak=leak)
    analysis = analyze_anomaly(
        pressure=float(data["pressure"]),
        prev_pressure=_previous_pressure,
        runtime=float(data["runtime"]),
        baseline_runtime=float(profile_preset["baseline_runtime"]),
        superheat=float(data["superheat"]),
        subcooling=float(data["subcooling"]),
        delta_t=float(data["delta_t"]),
        ambient_temp=float(data["ambient_temp"]),
        ambient_sensitivity=float(profile_preset["ambient_sensitivity"]),
        customer_profile=profile,
    )

    _previous_pressure = float(data["pressure"])

    current_severity: str = analysis["severity"]
    if is_escalation(_previous_severity, current_severity):
        dispatch_alerts(_subscribers, current_severity, analysis["alerts"])
    _previous_severity = current_severity

    return {
        "data": data,
        "analysis": analysis,
    }


@app.get("/clients")
def clients(
    company_id: str = Query(DEFAULT_COMPANY_ID),
    profile: str = Query("retail", pattern="^(retail|industrial|enterprise)$"),
) -> list[dict]:
    priority_rank = {"URGENT": 0, "REVIEW": 1, "STABLE": 2}

    def _priority_for(health_score: int, leak_risk: str) -> str:
        if health_score < 70 or leak_risk == "HIGH":
            return "URGENT"
        if health_score < 85:
            return "REVIEW"
        return "STABLE"

    def _ai_insight_for(analysis: dict) -> str:
        alerts = analysis.get("alerts", [])
        if not alerts:
            return "Thermodynamic profile stable"
        first = str(alerts[0]).lower()
        if "runtime" in first:
            return "Short cycling / runtime drift detected"
        if "superheat" in first:
            return "Possible refrigerant charge issue"
        if "delta" in first:
            return "Cooling efficiency trending down"
        return "Anomaly detected - review diagnostics"

    company_clients = [
        client for client in CLIENTS if str(client["company_id"]) == company_id
    ]
    summary: list[dict] = []
    for client in company_clients:
        client_id = int(client["client_id"])

        mode = str(client.get("portfolio_mode", "stable"))
        leak_mode = mode == "urgent"
        if mode == "review":
            # Intermittent anomalies create believable variance without constant criticals.
            prior = str(_client_states.get(client_id, {}).get("previous_severity", "NORMAL"))
            leak_mode = prior in {"WARNING", "CRITICAL"}

        simulated = _simulate_for_client(client_id=client_id, profile=profile, leak=leak_mode)
        analysis = simulated["analysis"]
        data = simulated["data"]
        health_score = int(analysis["health_score"])
        leak_risk = str(analysis["leak_label"])
        priority = _priority_for(health_score, leak_risk)

        previous_health = float(_client_states[client_id].get("previous_health_score", health_score))
        trend = "flat"
        if health_score > previous_health:
            trend = "up"
        elif health_score < previous_health:
            trend = "down"
        _client_states[client_id]["previous_health_score"] = float(health_score)

        alert_count = len(analysis.get("alerts", []))
        runtime = float(data["runtime"])

        summary.append(
            {
                "client_id": client_id,
                "name": client["name"],
                "address": client["address"],
                "device_type": client["device_type"],
                "system_type": client.get("system_type", client["device_type"]),
                "status": analysis["severity"],
                "priority": priority,
                "health_score": health_score,
                "trend": trend,
                "leak_risk": leak_risk,
                "alert_count": alert_count,
                "runtime": runtime,
                "last_update": data["timestamp"],
                "ai_insight": _ai_insight_for(analysis),
            }
        )

    summary.sort(key=lambda c: (priority_rank.get(c["priority"], 99), c["health_score"]))
    return summary


@app.post("/clients")
def create_client(
    request: CreateClientRequest,
    company_id: str = Query(DEFAULT_COMPANY_ID),
) -> dict:
    if request.portfolio_mode not in {"stable", "review", "urgent"}:
        raise HTTPException(
            status_code=400,
            detail="portfolio_mode must be one of: stable, review, urgent",
        )

    next_client_id = max((int(client["client_id"]) for client in CLIENTS), default=0) + 1
    client = {
        "client_id": next_client_id,
        "company_id": company_id,
        "name": request.name.strip(),
        "address": request.address.strip(),
        "device_type": request.device_type.strip() or "residential",
        "system_type": request.system_type.strip() or "Residential Split",
        "portfolio_mode": request.portfolio_mode,
    }
    CLIENTS.append(client)
    _client_states[next_client_id] = {
        "previous_pressure": 120.0,
        "previous_severity": "NORMAL",
        "previous_health_score": 100.0,
    }
    return {"message": "Client created.", "client": client}


@app.get("/clients/{client_id}")
def client_detail(
    client_id: int,
    company_id: str = Query(DEFAULT_COMPANY_ID),
    leak: bool = Query(False),
    profile: str = Query("retail", pattern="^(retail|industrial|enterprise)$"),
) -> dict:
    client = _get_client_or_404(company_id=company_id, client_id=client_id)
    simulated = _simulate_for_client(client_id=client_id, profile=profile, leak=leak)
    return {
        "client": client,
        "data": simulated["data"],
        "analysis": simulated["analysis"],
    }


@app.post("/clients/{client_id}/tickets")
def create_ticket(
    client_id: int,
    request: CreateTicketRequest,
    company_id: str = Query(DEFAULT_COMPANY_ID),
) -> dict:
    global _next_ticket_id
    client = _get_client_or_404(company_id=company_id, client_id=client_id)
    ticket = {
        "ticket_id": _next_ticket_id,
        "company_id": company_id,
        "client_id": client_id,
        "client_name": client["name"],
        "issue": request.issue.strip() or "Automated anomaly review",
        "priority": request.priority.strip().upper() or "MEDIUM",
        "notes": request.notes.strip(),
        "status": "OPEN",
        "created_at": _utc_iso_now(),
    }
    _next_ticket_id += 1
    _tickets.append(ticket)
    return {"message": "Ticket created.", "ticket": ticket}


@app.get("/tickets")
def list_tickets(company_id: str = Query(DEFAULT_COMPANY_ID)) -> list[dict]:
    return [ticket for ticket in _tickets if ticket["company_id"] == company_id]


@app.get("/clients/{client_id}/report")
def generate_client_report(
    client_id: int,
    company_id: str = Query(DEFAULT_COMPANY_ID),
    profile: str = Query("retail", pattern="^(retail|industrial|enterprise)$"),
    format: str = Query("csv", pattern="^(csv|pdf)$"),
) -> Response:
    client = _get_client_or_404(company_id=company_id, client_id=client_id)
    simulated = _simulate_for_client(client_id=client_id, profile=profile, leak=False)
    data = simulated["data"]
    analysis = simulated["analysis"]

    if format == "csv":
        headers = [
            "client_id",
            "client_name",
            "address",
            "timestamp",
            "severity",
            "health_score",
            "leak_probability",
            "efficiency_score",
            "cost_impact_low",
            "cost_impact_high",
            "failure_window",
        ]
        row = [
            str(client_id),
            str(client["name"]),
            str(client["address"]),
            str(data["timestamp"]),
            str(analysis["severity"]),
            str(analysis["health_score"]),
            str(analysis["leak_probability"]),
            str(analysis["efficiency_score"]),
            str(analysis["cost_impact_low"]),
            str(analysis["cost_impact_high"]),
            str(analysis["failure_window"]),
        ]
        csv_body = ",".join(headers) + "\n" + ",".join(row) + "\n"
        return Response(
            content=csv_body,
            media_type="text/csv",
            headers={
                "Content-Disposition": f'attachment; filename="client_{client_id}_report.csv"'
            },
        )

    pdf_lines = [
        "Ghost HVAC Client Report",
        f"Client: {client['name']} (ID {client_id})",
        f"Address: {client['address']}",
        f"Timestamp: {data['timestamp']}",
        f"Severity: {analysis['severity']}",
        f"Health Score: {analysis['health_score']}%",
        f"Leak Probability: {analysis['leak_probability']}%",
        f"Efficiency Score: {analysis['efficiency_score']}%",
        f"Cost Impact: ${analysis['cost_impact_low']}-${analysis['cost_impact_high']} / month",
        f"Failure Window: {analysis['failure_window']}",
    ]
    pdf_content = _build_simple_pdf(pdf_lines)
    return Response(
        content=pdf_content,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="client_{client_id}_report.pdf"'
        },
    )


@app.post("/clients/{client_id}/reset")
def reset_client(client_id: int, company_id: str = Query(DEFAULT_COMPANY_ID)) -> dict:
    _get_client_or_404(company_id=company_id, client_id=client_id)
    _client_states[client_id] = {
        "previous_pressure": 120.0,
        "previous_severity": "NORMAL",
    }
    return {
        "message": "Client simulation state reset.",
        "client_id": client_id,
        "previous_pressure": 120.0,
    }


@app.post("/subscribe")
def subscribe(request: SubscribeRequest) -> dict:
    if not request.phone and not request.email:
        return {"message": "Provide at least a phone number or email address."}

    entry = {}
    if request.phone:
        entry["phone"] = request.phone.strip()
    if request.email:
        entry["email"] = request.email.strip()

    _subscribers.append(entry)
    return {"message": "Subscribed. You'll be notified when your system needs attention."}


@app.post("/reset")
def reset() -> dict:
    return reset_state()
