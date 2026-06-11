#!/usr/bin/env python3
"""Build static JSON data for the GitHub Pages site.

Usage:
  python tools/build_data.py --input data/raw/LO --output docs/data

The raw XML/CSV files are intentionally not committed by default. Put your
`*_advanced_superscout.xml` and matching `*_BI.csv` files under data/raw/LO,
then run this script.
"""
from __future__ import annotations

import argparse
import csv
import json
import shutil
import xml.etree.ElementTree as ET
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

COMPETITION_ID = "japan-league-one-d1"
COMPETITION_NAME = "Japan Rugby League One D1"
COUNTRY = "Japan"
SPORT = "rugby_union"

POSITION_NAMES = {
    1: {"ja": "左PR", "en": "Loosehead Prop"},
    2: {"ja": "HO", "en": "Hooker"},
    3: {"ja": "右PR", "en": "Tighthead Prop"},
    4: {"ja": "LO", "en": "Lock"},
    5: {"ja": "LO", "en": "Lock"},
    6: {"ja": "FL", "en": "Blindside Flanker"},
    7: {"ja": "FL", "en": "Openside Flanker"},
    8: {"ja": "NO8", "en": "Number 8"},
    9: {"ja": "SH", "en": "Scrum-half"},
    10: {"ja": "SO", "en": "Fly-half"},
    11: {"ja": "WTB", "en": "Wing"},
    12: {"ja": "CTB", "en": "Inside Centre"},
    13: {"ja": "CTB", "en": "Outside Centre"},
    14: {"ja": "WTB", "en": "Wing"},
    15: {"ja": "FB", "en": "Fullback"},
}

PASS_POSITIVE_TYPES = {"Complete", "Break", "Key", "Off Target", "Try"}
BREAK_TYPES = {"Initial Break", "Supported Break"}
ASSIST_TYPES = {"Try Assist", "Break Assist", "Decoy", "Snake"}
KICK_QUALIFIER3 = {"Kick in Play", "Kick in Play (Own 22)"}
PENALTY_KICK_TOUCH_RESULTS = {"Kick In Touch (Bounce)", "Kick In Touch (Full)"}
KICK_POSITIVE_RESULTS = {
    "Own Player - Collected",
    "Pressure Error",
    "Try Kick",
    "Pressure in Touch",
    "Pressure Carried Over",
}
LINEOUT_THROW_WON_RESULTS = {
    "Won Clean Catch",
    "Won Clean Tap",
    "Won Free Kick",
    "Won Other",
    "Won Other From Scrappy Catch",
    "Won Penalty",
    "Won Tap (Scrappy)",
}
GENERAL_POSITIVE_RESULTS = {"Complete", "Forced in Touch", "Passive", "Sack", "Try Saver", "Turnover Won"}
RESTART_POSITIVE_RESULTS = {"Restart Retained", "Restart Opp Error", "Restart Opp Collection"}
TACKLE_EXTRA_POSITIVE_RESULTS = {"Forced in Touch", "Turnover Won"}
RUCK_ATTACKING_POSITIVE_TYPES = {"Cleaned Out", "Secured"}
LINEOUT_TAKE_POSITIVE_TYPES = {
    "Lineout Steal Front",
    "Lineout Steal Middle",
    "Lineout Steal Back",
    "Lineout Steal 15m+",
    "Lineout Steal Quick",
    "Lineout Win Front",
    "Lineout Win Middle",
    "Lineout Win Back",
    "Lineout Win 15m+",
    "Lineout Win Quick",
}
RUCK_DEFENSIVE_POSITIVE_TYPES = {"Nuisance", "Turnover Won", "Penalty Won"}
RUCK_ATTACKING_NEGATIVE_TYPES = {"Failed Cleanout", "Attended", "Penalty Conceded"}
RUCK_DEFENSIVE_NEGATIVE_TYPES = {"Not Clearing", "Got Cleaned Out", "Penalty Conceded"}


def safe_int(value: Any, default=None):
    if value is None or value == "":
        return default
    try:
        return int(float(value))
    except Exception:
        return default


def parse_date(value: str):
    return datetime.strptime(value, "%d/%m/%Y").date()


def season_label_for(date):
    start_year = date.year if date.month >= 7 else date.year - 1
    return f"{start_year}-{str(start_year + 1)[-2:]}"


def role_from_shirt(shirt_no):
    if shirt_no is None:
        return "unknown"
    if 1 <= shirt_no <= 15:
        return "starter"
    if shirt_no >= 16:
        return "reserve"
    return "unknown"


def field(row: dict[str, str], *names: str) -> str:
    """Return the first matching CSV field.

    The BI files use `actionName` while the public pseudocode uses `ActionName`.
    This helper allows both without changing the Samurai definition.
    """
    for name in names:
        value = row.get(name)
        if value is not None:
            return value.strip()
    return ""


def count_positive_actions(row: dict[str, str]) -> int:
    action_name = field(row, "ActionName", "actionName")
    action_type = field(row, "ActionTypeName")
    action_result = field(row, "ActionResultName")
    qualifier3 = field(row, "Qualifier3Name", "qualifier3Name")
    qualifier4 = field(row, "Qualifier4Name", "qualifier4Name")

    count = 0

    # Important: do not use elif. One event row may satisfy multiple rules.
    if action_name == "Pass" and action_type in PASS_POSITIVE_TYPES:
        count += 1
    if action_type == "Offload":
        count += 1
    if action_type in BREAK_TYPES:
        count += 1
    if action_type in ASSIST_TYPES:
        count += 1
    if action_type == "Defender Beaten":
        count += 1

    if qualifier3 in KICK_QUALIFIER3:
        count += 1
    if qualifier3 == "Penalty Kick" and action_result in PENALTY_KICK_TOUCH_RESULTS:
        count += 1
    if action_name == "Kick" and action_result in KICK_POSITIVE_RESULTS:
        count += 1
    if action_name == "Kick" and qualifier4 == "50/22":
        count += 1
    if action_name == "Goal Kick" and action_result == "Goal Kicked":
        count += 1

    if action_name == "Lineout Throw" and action_result in LINEOUT_THROW_WON_RESULTS:
        count += 1
    if action_name == "Carry":
        count += 1
    if action_name == "Carry" and action_result == "Try Scored":
        count += 1

    if action_result in GENERAL_POSITIVE_RESULTS:
        count += 1
    if action_result in RESTART_POSITIVE_RESULTS:
        count += 1
    if action_name == "Tackle" and action_result in TACKLE_EXTRA_POSITIVE_RESULTS:
        count += 1
    if action_name == "Tackle" and qualifier4 == "Dominant Tackle":
        count += 1
    if qualifier4 == "Dominant Contact":
        count += 1
    if action_name == "Collection" and action_result == "Success":
        count += 1

    if action_name == "Ruck OOA" and qualifier4 == "Attacking OOA" and action_type in RUCK_ATTACKING_POSITIVE_TYPES:
        count += 1
    if action_name == "Lineout Take" and action_type in LINEOUT_TAKE_POSITIVE_TYPES:
        count += 1
    if action_name == "Ruck OOA" and qualifier4 == "Defensive OOA" and action_type in RUCK_DEFENSIVE_POSITIVE_TYPES:
        count += 1

    return count


def count_negative_actions(row: dict[str, str]) -> int:
    action_name = field(row, "ActionName", "actionName")
    action_type = field(row, "ActionTypeName")
    action_result = field(row, "ActionResultName")
    qualifier4 = field(row, "Qualifier4Name", "qualifier4Name")

    count = 0

    # Important: do not use elif. One event row may satisfy multiple rules.
    if action_result == "Offload Allowed":
        count += 1
    if action_name == "Missed Tackle":
        count += 1
    if action_name == "Tackle" and action_result == "Passive":
        count += 1

    if action_name == "Penalty Conceded" and qualifier4 == "Full Penalty":
        count += 1
    if action_name == "Penalty Conceded" and qualifier4 == "Free Kick":
        count += 1
    if action_name == "Penalty Conceded" and action_result == "Yellow Card":
        count += 1
    if action_name == "Penalty Conceded" and action_result == "Red Card":
        count += 1

    if qualifier4 == "Ineffective Contact":
        count += 1

    if action_name == "Ruck OOA" and qualifier4 == "Attacking OOA" and action_type in RUCK_ATTACKING_NEGATIVE_TYPES:
        count += 1
    if action_name == "Ruck OOA" and qualifier4 == "Defensive OOA" and action_type in RUCK_DEFENSIVE_NEGATIVE_TYPES:
        count += 1

    if action_name == "Collection" and action_result == "Fail":
        count += 1
    if action_type == "Offload" and action_result == "To Ground":
        count += 1

    if action_result == "Error On Defence":
        count += 1
    if action_result == "Error On Attack":
        count += 1
    if action_name == "Goal Kick" and action_result == "Goal Missed":
        count += 1

    return count


def parse_xml_files(input_dir: Path, season_payloads, seasons, teams_global, players_global):
    match_lookup = {}
    appearance_lookup = {}

    xml_files = sorted(input_dir.glob("*_advanced_superscout.xml"))
    if not xml_files:
        raise SystemExit(f"No *_advanced_superscout.xml files found in {input_dir}")

    for path in xml_files:
        root = ET.parse(path).getroot()
        fx = root.find("FXID")
        if fx is None:
            continue
        match_id = (fx.text or "").strip() or path.name.split("_")[0]
        fix_data = fx.find("FixData/Data")
        team_data = fx.find("TeamData")
        if fix_data is None or team_data is None:
            continue
        d = fix_data.attrib
        match_date = parse_date(d.get("FxDate"))
        date_iso = match_date.isoformat()
        season_id = season_label_for(match_date)
        seasons.setdefault(season_id, {
            "season_id": season_id,
            "competition_id": COMPETITION_ID,
            "label": season_id,
            "start_year": int(season_id[:4]),
            "end_year": int(season_id[:4]) + 1,
        })
        match_lookup[match_id] = {"season_id": season_id, "date": date_iso}
        home_id, away_id = d.get("FxHTID"), d.get("FxATID")
        home_name, away_name = d.get("hometeam"), d.get("awayteam")
        for tid, name, hex_color in [(home_id, home_name, d.get("homeHEX")), (away_id, away_name, d.get("awayHEX"))]:
            team = {
                "team_id": tid,
                "competition_id": COMPETITION_ID,
                "name": name,
                "short_name": None,
                "primary_color": hex_color or None,
                "country": COUNTRY,
            }
            teams_global[tid] = {**teams_global.get(tid, {}), **team}
            season_payloads[season_id]["teams"][tid] = team
        match = {
            "match_id": match_id,
            "competition_id": COMPETITION_ID,
            "season_id": season_id,
            "date": date_iso,
            "round": safe_int(d.get("FxWeek")),
            "fixture_team_id": d.get("FxTID"),
            "home_team_id": home_id,
            "away_team_id": away_id,
            "home_team_name": home_name,
            "away_team_name": away_name,
            "home_score": safe_int(d.get("HTFTSC")),
            "away_score": safe_int(d.get("ATFTSC")),
            "referee_id": d.get("REFID") or None,
            "referee_name": d.get("REFNAME") or None,
            "source_file": path.name,
        }
        season_payloads[season_id]["matches"].append(match)

        for player_el in team_data.findall("Player"):
            a = player_el.attrib
            player_id = a.get("PLID")
            team_id = a.get("Club")
            shirt_no = safe_int(a.get("ShirtNo"))
            pos_id = safe_int(a.get("PosID"))
            mins = safe_int(a.get("MINS"), 0) or 0
            bip_mins = safe_int(a.get("BallInPlayMins"), 0) or 0
            given = (a.get("PLFORN") or "").strip()
            family = (a.get("PLSURN") or "").strip()
            display_name = " ".join([part for part in [given, family] if part]).strip() or player_id
            role = role_from_shirt(shirt_no)
            player = {
                "player_id": player_id,
                "display_name": display_name,
                "given_name": given or None,
                "family_name": family or None,
            }
            if player_id:
                players_global.setdefault(player_id, player)
                season_payloads[season_id]["players"][player_id] = players_global[player_id]
            appearance = {
                "appearance_id": f"{match_id}:{team_id}:{player_id}:{shirt_no}",
                "match_id": match_id,
                "competition_id": COMPETITION_ID,
                "season_id": season_id,
                "date": date_iso,
                "team_id": team_id,
                "player_id": player_id,
                "shirt_no": shirt_no,
                "position_id": pos_id,
                "position_label_ja": POSITION_NAMES.get(pos_id, {}).get("ja"),
                "minutes": mins,
                "att_minutes": safe_int(a.get("AttMinutes"), 0) or 0,
                "def_minutes": safe_int(a.get("DefMinutes"), 0) or 0,
                "ball_in_play_minutes": bip_mins,
                "started": role == "starter",
                "reserve_selected": role == "reserve",
                "bench_appearance": role == "reserve" and mins > 0,
                "played": mins > 0,
                "lineup_role": role,
                "team_name": a.get("TEAMNAME"),
                "player_name": display_name,
            }
            season_payloads[season_id]["appearances"].append(appearance)
            if match_id and team_id and player_id:
                appearance_lookup[(match_id, team_id, player_id)] = appearance

    return match_lookup, appearance_lookup


def parse_samurai_csv_files(input_dir: Path, season_payloads, match_lookup, appearance_lookup):
    csv_files = sorted(input_dir.glob("*_BI.csv"))
    samurai_groups: dict[tuple[str, str, str], dict[str, Any]] = {}

    for path in csv_files:
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                positive = count_positive_actions(row)
                negative = count_negative_actions(row)
                if positive == 0 and negative == 0:
                    continue

                match_id = field(row, "FXID") or path.name.split("_")[0]
                player_id = field(row, "PLID")
                team_id = field(row, "team_id", "TeamID")
                player_name = field(row, "playerName", "PlayerName")
                team_name = field(row, "teamName", "TeamName")

                # Some BI rows describe team-level events. Keep Samurai Stats player-scoped.
                if not player_id or not team_id or not player_name:
                    continue

                match_meta = match_lookup.get(match_id)
                if match_meta:
                    season_id = match_meta["season_id"]
                    date_iso = match_meta["date"]
                else:
                    date_raw = field(row, "datePlayed")
                    if not date_raw:
                        continue
                    match_date = parse_date(date_raw)
                    date_iso = match_date.isoformat()
                    season_id = season_label_for(match_date)

                key = (match_id, team_id, player_id)
                if key not in samurai_groups:
                    app = appearance_lookup.get(key, {})
                    samurai_groups[key] = {
                        "samurai_match_stat_id": f"{match_id}:{team_id}:{player_id}",
                        "match_id": match_id,
                        "competition_id": COMPETITION_ID,
                        "season_id": season_id,
                        "date": date_iso,
                        "team_id": team_id,
                        "player_id": player_id,
                        "team_name": team_name or app.get("team_name"),
                        "player_name": player_name or app.get("player_name"),
                        "positive_actions": 0,
                        "negative_actions": 0,
                        "net_actions": 0,
                        "event_rows_with_score": 0,
                        "minutes": app.get("minutes", 0),
                        "ball_in_play_minutes": app.get("ball_in_play_minutes", 0),
                        "source_file": path.name,
                    }
                stat = samurai_groups[key]
                stat["positive_actions"] += positive
                stat["negative_actions"] += negative
                stat["net_actions"] += positive - negative
                stat["event_rows_with_score"] += 1

    for stat in samurai_groups.values():
        season_payloads[stat["season_id"]]["samurai_match_stats"].append(stat)


def build(input_dir: Path, output_dir: Path):
    if output_dir.exists():
        shutil.rmtree(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    seasons = {}
    teams_global = {}
    players_global = {}
    season_payloads = defaultdict(lambda: {
        "matches": [],
        "appearances": [],
        "samurai_match_stats": [],
        "teams": {},
        "players": {},
    })

    match_lookup, appearance_lookup = parse_xml_files(input_dir, season_payloads, seasons, teams_global, players_global)
    parse_samurai_csv_files(input_dir, season_payloads, match_lookup, appearance_lookup)

    manifest = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "schema_version": "1.1.0",
        "metric_definitions": {
            "samurai_stats": "(positive_actions - negative_actions) / ball_in_play_minutes",
            "important_notes": [
                "One event row may count more than once if it satisfies multiple Positive/Negative rules.",
                "Samurai Stats is already a Ball-in-Play Minutes rate, so Total / Per Game / Per80 display modes must not change the Samurai Stats value.",
            ],
        },
        "competitions": [{
            "competition_id": COMPETITION_ID,
            "name": COMPETITION_NAME,
            "country": COUNTRY,
            "sport": SPORT,
            "seasons": [],
        }],
        "positions": [{"position_id": k, **v} for k, v in POSITION_NAMES.items()],
    }

    for season_id in sorted(season_payloads):
        payload = season_payloads[season_id]
        matches = sorted(payload["matches"], key=lambda x: (x["date"], x["match_id"]))
        appearances = sorted(payload["appearances"], key=lambda x: (x["date"], x["match_id"], x["team_id"] or "", x["shirt_no"] or 0))
        samurai_match_stats = sorted(payload["samurai_match_stats"], key=lambda x: (x["date"], x["match_id"], x["team_id"] or "", x["player_name"] or ""))
        teams = sorted(payload["teams"].values(), key=lambda x: x["name"] or "")
        players = sorted(payload["players"].values(), key=lambda x: x["display_name"] or "")
        dates = [m["date"] for m in matches]
        season_dir = output_dir / COMPETITION_ID / season_id
        season_dir.mkdir(parents=True, exist_ok=True)
        season_meta = {
            **seasons[season_id],
            "date_min": min(dates) if dates else None,
            "date_max": max(dates) if dates else None,
            "match_count": len(matches),
            "appearance_count": len(appearances),
            "samurai_match_stat_count": len(samurai_match_stats),
            "team_count": len(teams),
            "player_count": len(players),
        }
        for name, obj in [
            ("metadata", season_meta),
            ("matches", matches),
            ("appearances", appearances),
            ("samurai_match_stats", samurai_match_stats),
            ("teams", teams),
            ("players", players),
        ]:
            (season_dir / f"{name}.json").write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        season_meta["paths"] = {
            "metadata": f"data/{COMPETITION_ID}/{season_id}/metadata.json",
            "matches": f"data/{COMPETITION_ID}/{season_id}/matches.json",
            "appearances": f"data/{COMPETITION_ID}/{season_id}/appearances.json",
            "samurai_match_stats": f"data/{COMPETITION_ID}/{season_id}/samurai_match_stats.json",
            "teams": f"data/{COMPETITION_ID}/{season_id}/teams.json",
            "players": f"data/{COMPETITION_ID}/{season_id}/players.json",
        }
        manifest["competitions"][0]["seasons"].append(season_meta)

    (output_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default="data/raw/LO", type=Path)
    parser.add_argument("--output", default="docs/data", type=Path)
    args = parser.parse_args()
    build(args.input, args.output)


if __name__ == "__main__":
    main()
