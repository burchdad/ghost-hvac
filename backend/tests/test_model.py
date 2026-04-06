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
    assert "Runtime" in result["alerts"][0]


def test_critical_when_both_rules_trigger() -> None:
    result = analyze_anomaly(
        pressure=112.0,
        prev_pressure=120.0,
        runtime=14.5,
        baseline_runtime=10.0,
    )
    assert result["severity"] == "CRITICAL"
    assert len(result["alerts"]) == 2
