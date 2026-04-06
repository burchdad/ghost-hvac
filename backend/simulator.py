from __future__ import annotations

from datetime import datetime, timezone

import numpy as np


def generate_data(leak: bool) -> dict:
    """Generate simulated HVAC telemetry including thermodynamic metrics."""
    ambient_temp = float(np.random.normal(loc=85.0, scale=3.0))   # °F outdoor
    pressure     = float(np.random.normal(loc=120.0, scale=2.0))  # psig
    runtime      = float(np.random.normal(loc=10.0, scale=1.0))   # minutes
    superheat    = float(np.random.normal(loc=10.0, scale=1.5))   # °F nominal 8–12
    subcooling   = float(np.random.normal(loc=10.0, scale=1.5))   # °F nominal 8–12
    delta_t      = float(np.random.normal(loc=20.0, scale=2.0))   # °F air temp drop

    if leak:
        # Refrigerant loss: pressure falls, runtime climbs,
        # superheat rises, subcooling collapses, delta-T drops
        pressure  -= abs(float(np.random.normal(loc=8.0, scale=1.5)))
        runtime   += abs(float(np.random.normal(loc=4.0, scale=1.0)))
        superheat += abs(float(np.random.normal(loc=8.0, scale=2.0)))
        subcooling -= abs(float(np.random.normal(loc=5.0, scale=1.5)))
        delta_t   -= abs(float(np.random.normal(loc=6.0, scale=1.5)))

    return {
        "timestamp":    datetime.now(timezone.utc).isoformat(),
        "pressure":     round(max(0.0, pressure), 2),
        "runtime":      round(max(0.0, runtime), 2),
        "superheat":    round(max(0.0, superheat), 2),
        "subcooling":   round(max(0.0, subcooling), 2),
        "delta_t":      round(max(0.0, delta_t), 2),
        "ambient_temp": round(ambient_temp, 2),
    }
