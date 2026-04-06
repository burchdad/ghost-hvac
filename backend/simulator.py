from __future__ import annotations

from datetime import datetime, timezone

import numpy as np


def generate_data(leak: bool) -> dict:
    """Generate simulated HVAC telemetry for pressure and runtime."""
    pressure = float(np.random.normal(loc=120.0, scale=2.0))
    runtime = float(np.random.normal(loc=10.0, scale=1.0))

    if leak:
        # Leak mode pushes pressure down and runtime up to mimic system stress.
        pressure -= abs(float(np.random.normal(loc=8.0, scale=1.5)))
        runtime += abs(float(np.random.normal(loc=4.0, scale=1.0)))

    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "pressure": round(max(0.0, pressure), 2),
        "runtime": round(max(0.0, runtime), 2),
    }
