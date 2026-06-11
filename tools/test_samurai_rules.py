#!/usr/bin/env python3
"""Tests for the Samurai Stats PowerBI/DAX rule implementation."""
from __future__ import annotations

import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("build_data", ROOT / "build_data.py")
build_data = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(build_data)


def row(**kwargs):
    base = {
        "ActionName": "",
        "ActionTypeName": "",
        "ActionResultName": "",
        "Qualifier3Name": "",
        "Qualifier4Name": "",
    }
    base.update(kwargs)
    return base


def assert_positive_rule(rule_name: str, event_row: dict[str, str]):
    breakdown = build_data.count_positive_action_breakdown(event_row)
    assert rule_name in breakdown, f"Unknown positive rule: {rule_name}"
    assert breakdown[rule_name] == 1, f"{rule_name} did not count for {event_row}; got {breakdown}"


def assert_negative_rule(rule_name: str, event_row: dict[str, str]):
    breakdown = build_data.count_negative_action_breakdown(event_row)
    assert rule_name in breakdown, f"Unknown negative rule: {rule_name}"
    assert breakdown[rule_name] == 1, f"{rule_name} did not count for {event_row}; got {breakdown}"


def test_powerbi_positive_rules_are_present():
    assert build_data.POSITIVE_RULE_NAMES == [
        "PassPositive",
        "BallCarryOffload",
        "Linebreaks",
        "AttackingQualities",
        "DefenderBeaten",
        "KicksInPlay",
        "PenaltyKick",
        "KickRetain",
        "SpecialKick",
        "GoalKick",
        "LineoutWon",
        "BallCarries",
        "BallCarriesDetail",
        "TacklesMade",
        "Restart",
        "TackleTurnoverWon",
        "DominantTackle",
        "DominantCarry",
        "HandlingSuccess",
        "OOAAttackEffective",
        "LineoutOppositionSteal",
        "OOADefenceEffective",
    ]


def test_powerbi_negative_rules_are_present():
    assert build_data.NEGATIVE_RULE_NAMES == [
        "OffloadAllowed",
        "TacklesMissed",
        "TacklePassive",
        "PenaltyConcededFull",
        "PenaltyConcededFreeKick",
        "PenaltyConcededYellowCard",
        "PenaltyConcededRedCard",
        "IneffectiveCarry",
        "OOAAttackIneffective",
        "OOADefenceIneffective",
        "HandlingFail",
        "OffloadNegative",
        "ErrorOnDefence",
        "ErrorOnAttack",
        "GoalKickMissed",
    ]


def test_each_powerbi_positive_rule_counts():
    cases = {
        "PassPositive": row(ActionName="Pass", ActionTypeName="Complete"),
        "BallCarryOffload": row(ActionTypeName="Offload"),
        "Linebreaks": row(ActionTypeName="Initial Break"),
        "AttackingQualities": row(ActionTypeName="Try Assist"),
        "DefenderBeaten": row(ActionTypeName="Defender Beaten"),
        "KicksInPlay": row(Qualifier3Name="Kick in Play"),
        "PenaltyKick": row(Qualifier3Name="Penalty Kick", ActionResultName="Kick In Touch (Full)"),
        "KickRetain": row(ActionName="Kick", ActionResultName="Own Player - Collected"),
        "SpecialKick": row(ActionName="Kick", Qualifier4Name="50/22"),
        "GoalKick": row(ActionName="Goal Kick", ActionResultName="Goal Kicked"),
        "LineoutWon": row(ActionName="Lineout Throw", ActionResultName="Won Clean Catch"),
        "BallCarries": row(ActionName="Carry"),
        "BallCarriesDetail": row(ActionName="Carry", ActionResultName="Try Scored"),
        "TacklesMade": row(ActionResultName="Complete"),
        "Restart": row(ActionResultName="Restart Retained"),
        "TackleTurnoverWon": row(ActionName="Tackle", ActionResultName="Turnover Won"),
        "DominantTackle": row(ActionName="Tackle", Qualifier4Name="Dominant Tackle"),
        "DominantCarry": row(Qualifier4Name="Dominant Contact"),
        "HandlingSuccess": row(ActionName="Collection", ActionResultName="Success"),
        "OOAAttackEffective": row(ActionName="Ruck OOA", Qualifier4Name="Attacking OOA", ActionTypeName="Cleaned Out"),
        "LineoutOppositionSteal": row(ActionName="Lineout Take", ActionTypeName="Lineout Steal Front"),
        "OOADefenceEffective": row(ActionName="Ruck OOA", Qualifier4Name="Defensive OOA", ActionTypeName="Nuisance"),
    }
    for rule_name, event_row in cases.items():
        assert_positive_rule(rule_name, event_row)


def test_each_powerbi_negative_rule_counts():
    cases = {
        "OffloadAllowed": row(ActionResultName="Offload Allowed"),
        "TacklesMissed": row(ActionName="Missed Tackle"),
        "TacklePassive": row(ActionName="Tackle", ActionResultName="Passive"),
        "PenaltyConcededFull": row(ActionName="Penalty Conceded", Qualifier4Name="Full Penalty"),
        "PenaltyConcededFreeKick": row(ActionName="Penalty Conceded", Qualifier4Name="Free Kick"),
        "PenaltyConcededYellowCard": row(ActionName="Penalty Conceded", ActionResultName="Yellow Card"),
        "PenaltyConcededRedCard": row(ActionName="Penalty Conceded", ActionResultName="Red Card"),
        "IneffectiveCarry": row(Qualifier4Name="Ineffective Contact"),
        "OOAAttackIneffective": row(ActionName="Ruck OOA", Qualifier4Name="Attacking OOA", ActionTypeName="Failed Cleanout"),
        "OOADefenceIneffective": row(ActionName="Ruck OOA", Qualifier4Name="Defensive OOA", ActionTypeName="Not Clearing"),
        "HandlingFail": row(ActionName="Collection", ActionResultName="Fail"),
        "OffloadNegative": row(ActionTypeName="Offload", ActionResultName="To Ground"),
        "ErrorOnDefence": row(ActionResultName="Error On Defence"),
        "ErrorOnAttack": row(ActionResultName="Error On Attack"),
        "GoalKickMissed": row(ActionName="Goal Kick", ActionResultName="Goal Missed"),
    }
    for rule_name, event_row in cases.items():
        assert_negative_rule(rule_name, event_row)


def test_pass_complete_counts_twice():
    # Pass Complete matches PassPositive and the broad TacklesMade/DAX result rule.
    event_row = row(ActionName="Pass", ActionTypeName="Complete", ActionResultName="Complete")
    assert build_data.count_positive_action_breakdown(event_row)["PassPositive"] == 1
    assert build_data.count_positive_action_breakdown(event_row)["TacklesMade"] == 1
    assert build_data.count_positive_actions(event_row) == 2
    assert build_data.count_negative_actions(event_row) == 0


def test_tackle_passive_can_be_positive_and_negative():
    # Passive is positive in Actions Positive JRFU, while Tackle + Passive is negative.
    event_row = row(ActionName="Tackle", ActionResultName="Passive", Qualifier4Name="Dominant Tackle")
    assert build_data.count_positive_action_breakdown(event_row)["TacklesMade"] == 1
    assert build_data.count_positive_action_breakdown(event_row)["DominantTackle"] == 1
    assert build_data.count_positive_actions(event_row) == 2
    assert build_data.count_negative_action_breakdown(event_row)["TacklePassive"] == 1
    assert build_data.count_negative_actions(event_row) == 1


def test_ruck_ooa_multi_count():
    event_row = row(
        ActionName="Ruck OOA",
        ActionTypeName="Penalty Conceded",
        ActionResultName="Error On Defence",
        Qualifier4Name="Defensive OOA",
    )
    assert build_data.count_positive_actions(event_row) == 0
    assert build_data.count_negative_action_breakdown(event_row)["OOADefenceIneffective"] == 1
    assert build_data.count_negative_action_breakdown(event_row)["ErrorOnDefence"] == 1
    assert build_data.count_negative_actions(event_row) == 2


def main():
    test_powerbi_positive_rules_are_present()
    test_powerbi_negative_rules_are_present()
    test_each_powerbi_positive_rule_counts()
    test_each_powerbi_negative_rule_counts()
    test_pass_complete_counts_twice()
    test_tackle_passive_can_be_positive_and_negative()
    test_ruck_ooa_multi_count()
    print("Samurai PowerBI/DAX rule tests OK")


if __name__ == "__main__":
    main()
