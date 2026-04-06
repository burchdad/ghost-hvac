from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from model import analyze_anomaly


def test_normal_when_no_rules_triggered() -> None:
    result = analyze_anomaly(
        pressure=119.5,
        prev_pressure=120.0,
        runtime=10.8,
        baseline_runtime=10.0,
    )
    assert result["severity"] == "NORMAL"
    assert result["alerts"] == []
    assert result["health_score"] >= 80
    assert result["customer_profile"] == "retail"


def test_warning_when_only_pressure_drop_rule_triggers() -> None:
    result = analyze_anomaly(
        pressure=113.5,
        prev_pressure=120.0,
        runtime=11.0,
        baseline_runtime=10.0,
    )
    assert result["severity"] == "WARNING"
    assert len(result["alerts"]) == 1
    assert "Pressure dropped" in result["alerts"][0]


def test_warning_when_only_runtime_rule_triggers() -> None:
    result = analyze_anomaly(
        pressure=119.0,
        prev_pressure=120.0,
        runtime=14.0,
        baseline_runtime=10.0,
    )
    assert result["severity"] == "WARNING"
    assert len(result["alerts"]) == 1
    assert "runtime" in result["alerts"][0].lower()


def test_critical_when_both_rules_trigger() -> None:
    result = analyze_anomaly(
        pressure=112.0,
        prev_pressure=120.0,
        runtime=16.0,
        baseline_runtime=10.0,
        superheat=22.0,
        subcooling=3.0,
        delta_t=9.0,
    )
    assert result["severity"] == "CRITICAL"
    assert len(result["alerts"]) >= 2


def test_profile_defaults_to_retail_for_unknown_values() -> None:
    result = analyze_anomaly(
        pressure=120.0,
        prev_pressure=120.0,
        runtime=10.0,
        baseline_runtime=10.0,
        customer_profile="unknown",
    )
    assert result["customer_profile"] == "retail"
