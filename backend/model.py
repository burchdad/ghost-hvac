from __future__ import annotations


def analyze_anomaly(
    pressure: float,
    prev_pressure: float,
    runtime: float,
    baseline_runtime: float,
) -> dict:
    """Evaluate simulated telemetry and produce alerts + severity."""
    alerts: list[str] = []
    flags = 0

    pressure_drop = prev_pressure - pressure
    if pressure_drop > 5:
        flags += 1
        alerts.append(
            f"Pressure dropped by {pressure_drop:.2f} units compared to previous reading."
        )

    runtime_threshold = baseline_runtime * 1.3
    if runtime > runtime_threshold:
        flags += 1
        alerts.append(
            f"Runtime {runtime:.2f} exceeded threshold {runtime_threshold:.2f}."
        )

    if flags == 0:
        severity = "NORMAL"
    elif flags == 1:
        severity = "WARNING"
    else:
        severity = "CRITICAL"

    return {
        "alerts": alerts,
        "severity": severity,
    }
