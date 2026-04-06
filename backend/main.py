from __future__ import annotations

import os

from fastapi import FastAPI, Query
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

BASELINE_RUNTIME = 10.0
_previous_pressure = 120.0
_previous_severity = "NORMAL"
_subscribers: list[dict] = []


class SubscribeRequest(BaseModel):
    phone: str = ""
    email: str = ""


def reset_state() -> dict:
    global _previous_pressure, _previous_severity
    _previous_pressure = 120.0
    _previous_severity = "NORMAL"
    return {
        "message": "Backend simulation state reset.",
        "previous_pressure": _previous_pressure,
    }


@app.get("/simulate")
def simulate(leak: bool = Query(False)) -> dict:
    global _previous_pressure, _previous_severity

    data = generate_data(leak=leak)
    analysis = analyze_anomaly(
        pressure=float(data["pressure"]),
        prev_pressure=_previous_pressure,
        runtime=float(data["runtime"]),
        baseline_runtime=BASELINE_RUNTIME,
        superheat=float(data["superheat"]),
        subcooling=float(data["subcooling"]),
        delta_t=float(data["delta_t"]),
        ambient_temp=float(data["ambient_temp"]),
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
