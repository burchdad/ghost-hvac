from __future__ import annotations


def analyze_anomaly(
    pressure: float,
    prev_pressure: float,
    runtime: float,
    baseline_runtime: float,
    superheat: float = 10.0,
    subcooling: float = 10.0,
    delta_t: float = 20.0,
    ambient_temp: float = 85.0,  # noqa: ARG001 — reserved for dynamic baseline
) -> dict:
    """Evaluate HVAC telemetry and produce alerts, health score, leak probability, and AI explanation."""
    alerts: list[str] = []
    flags = 0
    health_deductions: list[int] = []
    explanation_lines: list[str] = []

    # ── Pressure ──────────────────────────────────────────────────────────────
    pressure_drop = prev_pressure - pressure
    pressure_drop_pct = (pressure_drop / prev_pressure * 100) if prev_pressure > 0 else 0
    if pressure_drop > 5:
        flags += 1
        alerts.append(
            f"Pressure dropped {pressure_drop:.1f} PSI ({pressure_drop_pct:.0f}%) from previous reading."
        )
        health_deductions.append(20)
        explanation_lines.append(
            f"Pressure drop of {pressure_drop_pct:.0f}% (primary refrigerant loss signal)"
        )

    # ── Runtime ───────────────────────────────────────────────────────────────
    runtime_threshold = baseline_runtime * 1.3
    runtime_excess_pct = (
        (runtime - baseline_runtime) / baseline_runtime * 100
        if runtime > baseline_runtime
        else 0
    )
    if runtime > runtime_threshold:
        flags += 1
        alerts.append(
            f"Compressor runtime {runtime:.1f} min exceeds threshold ({runtime_threshold:.1f} min)."
        )
        health_deductions.append(15)
        explanation_lines.append(
            f"Extended compressor runtime (+{runtime_excess_pct:.0f}%) indicates increased workload"
        )

    # ── Superheat ─────────────────────────────────────────────────────────────
    SUPERHEAT_HIGH = 18.0
    SUPERHEAT_LOW  =  4.0
    if superheat > SUPERHEAT_HIGH:
        flags += 1
        alerts.append(
            f"Superheat {superheat:.1f}°F elevated (normal 5–15°F) — low refrigerant suspected."
        )
        health_deductions.append(25)
        explanation_lines.append(
            f"Elevated superheat ({superheat:.1f}°F) is a primary indicator of low refrigerant charge"
        )
    elif superheat < SUPERHEAT_LOW:
        flags += 1
        alerts.append(f"Superheat {superheat:.1f}°F too low — risk of liquid slugging.")
        health_deductions.append(20)
        explanation_lines.append(
            f"Low superheat ({superheat:.1f}°F) risks compressor liquid slugging"
        )

    # ── Subcooling ────────────────────────────────────────────────────────────
    SUBCOOLING_LOW = 4.0
    if subcooling < SUBCOOLING_LOW:
        flags += 1
        alerts.append(
            f"Subcooling {subcooling:.1f}°F below threshold — possible refrigerant loss."
        )
        health_deductions.append(20)
        explanation_lines.append(
            f"Low subcooling ({subcooling:.1f}°F) confirms likely refrigerant deficit"
        )

    # ── Delta-T ───────────────────────────────────────────────────────────────
    DELTA_T_MIN = 12.0
    if delta_t < DELTA_T_MIN:
        flags += 1
        alerts.append(
            f"Cooling delta-T only {delta_t:.1f}°F (normal ≥14°F) — reduced cooling efficiency."
        )
        health_deductions.append(20)
        explanation_lines.append(
            f"Low temperature differential ({delta_t:.1f}°F) indicates degraded cooling capacity"
        )

    # ── Health Score ──────────────────────────────────────────────────────────
    health_score = max(0, 100 - sum(health_deductions))

    # ── Leak Probability ──────────────────────────────────────────────────────
    # Weight each signal by its diagnostic value for refrigerant leaks
    leak_signals = 0
    leak_signals += 2 if pressure_drop > 5 else (1 if pressure_drop > 2 else 0)
    leak_signals += 2 if superheat > SUPERHEAT_HIGH else 0
    leak_signals += 2 if subcooling < SUBCOOLING_LOW else 0
    leak_signals += 1 if delta_t < DELTA_T_MIN else 0
    leak_signals += 1 if runtime > runtime_threshold else 0
    MAX_LEAK_SIGNALS = 8
    leak_probability = round(min(100, (leak_signals / MAX_LEAK_SIGNALS) * 100))
    if leak_probability >= 60:
        leak_label = "HIGH"
    elif leak_probability >= 30:
        leak_label = "MEDIUM"
    else:
        leak_label = "LOW"

    # ── Severity ──────────────────────────────────────────────────────────────
    if flags == 0:
        severity = "NORMAL"
    elif flags <= 2:
        severity = "WARNING"
    else:
        severity = "CRITICAL"

    # ── AI Explanation ────────────────────────────────────────────────────────
    if not explanation_lines:
        ai_explanation = (
            "All systems nominal. Pressure, superheat, subcooling, and temperature "
            "differential are within specification."
        )
    else:
        trigger = (
            "flagged CRITICAL" if severity == "CRITICAL"
            else "flagged WARNING" if severity == "WARNING"
            else "reporting NORMAL"
        )
        ai_explanation = f"System {trigger} due to:\n" + "\n".join(
            f"• {line}" for line in explanation_lines
        )

    return {
        "alerts":           alerts,
        "severity":         severity,
        "health_score":     health_score,
        "leak_probability": leak_probability,
        "leak_label":       leak_label,
        "ai_explanation":   ai_explanation,
    }
