#!/usr/bin/env python3
"""Smoke tests for the Samurai Stats rule implementation."""
from __future__ import annotations

import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("build_data", ROOT / "build_data.py")
build_data = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(build_data)


def test_pass_complete_counts_twice():
    # Pass Complete matches the explicit Pass rule and the broad Complete result rule.
    row = {
        "ActionName": "Pass",
        "ActionTypeName": "Complete",
        "ActionResultName": "Complete",
        "Qualifier3Name": "",
        "Qualifier4Name": "",
    }
    assert build_data.count_positive_actions(row) == 2
    assert build_data.count_negative_actions(row) == 0


def test_tackle_passive_can_be_positive_and_negative():
    # Passive is a Positive result in the supplied definition, while Tackle + Passive is Negative.
    row = {
        "ActionName": "Tackle",
        "ActionTypeName": "",
        "ActionResultName": "Passive",
        "Qualifier3Name": "",
        "Qualifier4Name": "Dominant Tackle",
    }
    assert build_data.count_positive_actions(row) == 2
    assert build_data.count_negative_actions(row) == 1


def test_ruck_ooa_multi_count():
    row = {
        "ActionName": "Ruck OOA",
        "ActionTypeName": "Penalty Conceded",
        "ActionResultName": "Error On Defence",
        "Qualifier3Name": "",
        "Qualifier4Name": "Defensive OOA",
    }
    assert build_data.count_positive_actions(row) == 0
    assert build_data.count_negative_actions(row) == 2


def main():
    test_pass_complete_counts_twice()
    test_tackle_passive_can_be_positive_and_negative()
    test_ruck_ooa_multi_count()
    print("Samurai rule tests OK")


if __name__ == "__main__":
    main()
