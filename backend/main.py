from __future__ import annotations

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

try:
    from model import analyze_anomaly
    from simulator import generate_data
except ModuleNotFoundError:
    from .model import analyze_anomaly
    from .simulator import generate_data

app = FastAPI(title="Ghost HVAC API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASELINE_RUNTIME = 10.0
_previous_pressure = 120.0


def reset_state() -> dict:
    global _previous_pressure
    _previous_pressure = 120.0
    return {
        "message": "Backend simulation state reset.",
        "previous_pressure": _previous_pressure,
    }


@app.get("/simulate")
def simulate(leak: bool = Query(False)) -> dict:
    global _previous_pressure

    data = generate_data(leak=leak)
    analysis = analyze_anomaly(
        pressure=float(data["pressure"]),
        prev_pressure=_previous_pressure,
        runtime=float(data["runtime"]),
        baseline_runtime=BASELINE_RUNTIME,
    )

    _previous_pressure = float(data["pressure"])

    return {
        "data": data,
        "analysis": analysis,
    }


@app.post("/reset")
def reset() -> dict:
    return reset_state()
