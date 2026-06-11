#!/usr/bin/env python3
"""Build static JSON data for the GitHub Pages site.

Usage:
  python tools/build_data.py --input data/raw --output docs/data

Put `*_advanced_superscout.xml` and matching `*_BI.csv` files anywhere under
data/raw. The script scans the raw directory recursively, so both of these work:
  data/raw/LO/948799_HEATvSHBR_BI.csv
  data/raw/2026-27/round-01/948799_HEATvSHBR_BI.csv
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import shutil
import unicodedata
import xml.etree.ElementTree as ET
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

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


def slugify(value: str, fallback: str = "competition") -> str:
    """Create a deterministic URL-safe id from raw competition text."""
    value = unicodedata.normalize("NFKD", value or "")
    value = value.encode("ascii", "ignore").decode("ascii")
    value = re.sub(r"[^a-zA-Z0-9]+", "-", value).strip("-").lower()
    return value or fallback


def infer_country_from_competition_name(name: str | None) -> str | None:
    text = (name or "").lower()
    if "japan" in text or "league one" in text:
        return "Japan"
    return None


def make_competition_record(source_id: str | None, name: str | None, used_ids: dict[str, str]) -> dict[str, Any]:
    """Build a public competition record from raw CSV/XML values.

    Priority:
    1. CSV competitionName + competitionID when available.
    2. XML FixData/Data FxTID when BI CSV is not available.

    No manually-maintained competition list is required.
    """
    source_id = str(source_id or "unknown").strip() or "unknown"
    display_name = (name or "").strip() or f"Competition {source_id}"
    base_id = slugify(display_name, fallback=f"competition-{source_id}")
    competition_id = base_id
    if competition_id in used_ids and used_ids[competition_id] != source_id:
        competition_id = f"{base_id}-{slugify(source_id, fallback='unknown')}"
    used_ids[competition_id] = source_id
    return {
        "competition_id": competition_id,
        "source_competition_id": source_id,
        "name": display_name,
        "country": infer_country_from_competition_name(display_name),
        "sport": SPORT,
        "seasons": [],
    }


def scan_competitions_from_bi_csv(input_dir: Path) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
    """Return (competition_by_source_id, match_competition_lookup).

    BI CSV has competitionID / competitionName, so it is the richest source.
    XML advanced_superscout files usually expose only FixData/Data FxTID, which
    appears to match competitionID. XML-only competitions still work, but their
    display name falls back to `Competition {FxTID}`.
    """
    competition_by_source_id: dict[str, dict[str, Any]] = {}
    match_competition_lookup: dict[str, dict[str, Any]] = {}
    used_ids: dict[str, str] = {}
    csv_files = sorted(path for path in input_dir.rglob("*_BI.csv") if is_real_raw_file(path))

    for path in csv_files:
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                source_id = field(row, "competitionID", "CompetitionID", "competition_id")
                name = field(row, "competitionName", "CompetitionName", "competition_name")
                match_id = field(row, "FXID") or path.name.split("_")[0]
                if not source_id and not name:
                    continue
                key = source_id or slugify(name)
                if key not in competition_by_source_id:
                    competition_by_source_id[key] = make_competition_record(source_id or key, name, used_ids)
                if match_id:
                    match_competition_lookup[match_id] = competition_by_source_id[key]
                # One row is enough for this file because competition metadata is match-level.
                break

    return competition_by_source_id, match_competition_lookup


def competition_from_xml_fixdata(d: dict[str, str], competition_by_source_id: dict[str, dict[str, Any]]) -> dict[str, Any]:
    source_id = d.get("competitionID") or d.get("FxTID") or "unknown"
    key = str(source_id)
    if key not in competition_by_source_id:
        used_ids = {c["competition_id"]: c.get("source_competition_id", "") for c in competition_by_source_id.values()}
        competition_by_source_id[key] = make_competition_record(key, d.get("competitionName"), used_ids)
    return competition_by_source_id[key]


def role_from_shirt(shirt_no):
    if shirt_no is None:
        return "unknown"
    if 1 <= shirt_no <= 15:
        return "starter"
    if shirt_no >= 16:
        return "reserve"
    return "unknown"




def is_real_raw_file(path: Path) -> bool:
    """Ignore macOS resource-fork files and extracted archive metadata."""
    parts = set(path.parts)
    if "__MACOSX" in parts:
        return False
    if path.name.startswith("._"):
        return False
    return True

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


def parse_xml_files(
    input_dir: Path,
    season_payloads,
    seasons,
    teams_global,
    players_global,
    competition_by_source_id,
    match_competition_lookup,
):
    match_lookup = {}
    appearance_lookup = {}

    xml_files = sorted(path for path in input_dir.rglob("*_advanced_superscout.xml") if is_real_raw_file(path))
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
        competition = match_competition_lookup.get(match_id) or competition_from_xml_fixdata(d, competition_by_source_id)
        competition_id = competition["competition_id"]
        match_date = parse_date(d.get("FxDate"))
        date_iso = match_date.isoformat()
        season_id = season_label_for(match_date)
        season_key = (competition_id, season_id)
        seasons.setdefault(season_key, {
            "season_id": season_id,
            "competition_id": competition_id,
            "label": season_id,
            "start_year": int(season_id[:4]),
            "end_year": int(season_id[:4]) + 1,
        })
        match_lookup[match_id] = {"competition_id": competition_id, "season_id": season_id, "date": date_iso}
        home_id, away_id = d.get("FxHTID"), d.get("FxATID")
        home_name, away_name = d.get("hometeam"), d.get("awayteam")
        for tid, name, hex_color in [(home_id, home_name, d.get("homeHEX")), (away_id, away_name, d.get("awayHEX"))]:
            team = {
                "team_id": tid,
                "competition_id": competition_id,
                "name": name,
                "short_name": None,
                "primary_color": hex_color or None,
                "country": competition.get("country"),
            }
            teams_global[(competition_id, tid)] = {**teams_global.get((competition_id, tid), {}), **team}
            season_payloads[season_key]["teams"][tid] = team
        match = {
            "match_id": match_id,
            "competition_id": competition_id,
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
        season_payloads[season_key]["matches"].append(match)

        for player_el in team_data.findall("Player"):
            a = player_el.attrib
            player_id = a.get("PLID")
            team_id = a.get("Club")
            shirt_no = safe_int(a.get("ShirtNo"))
            pos_id = safe_int(a.get("PosID"))
            mins = safe_int(a.get("MINS"), 0) or 0
            # IMPORTANT: Samurai Stats denominator is the player's own Playing Ball-in-Play minutes.
            # In the XML this is stored on each TeamData/Player row as BallInPlayMins.
            # It is not the match total BIP, team BIP, or BI-event duration.
            playing_bip_mins = safe_int(a.get("BallInPlayMins"), 0) or 0
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
                season_payloads[season_key]["players"][player_id] = players_global[player_id]
            appearance = {
                "appearance_id": f"{match_id}:{team_id}:{player_id}:{shirt_no}",
                "match_id": match_id,
                "competition_id": competition_id,
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
                "playing_ball_in_play_minutes": playing_bip_mins,
                # Backward-compatible alias used by older front-end/export code.
                "ball_in_play_minutes": playing_bip_mins,
                "started": role == "starter",
                "reserve_selected": role == "reserve",
                "bench_appearance": role == "reserve" and mins > 0,
                "played": mins > 0,
                "lineup_role": role,
                "team_name": a.get("TEAMNAME"),
                "player_name": display_name,
            }
            season_payloads[season_key]["appearances"].append(appearance)
            if match_id and team_id and player_id:
                appearance_lookup[(match_id, team_id, player_id)] = appearance

    return match_lookup, appearance_lookup

def parse_samurai_csv_files(input_dir: Path, season_payloads, match_lookup, appearance_lookup, competition_by_source_id, match_competition_lookup):
    csv_files = sorted(path for path in input_dir.rglob("*_BI.csv") if is_real_raw_file(path))
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
                competition = match_competition_lookup.get(match_id)
                if match_meta:
                    competition_id = match_meta["competition_id"]
                    season_id = match_meta["season_id"]
                    date_iso = match_meta["date"]
                else:
                    source_id = field(row, "competitionID", "CompetitionID", "competition_id")
                    if source_id and source_id in competition_by_source_id:
                        competition = competition_by_source_id[source_id]
                    if competition is None:
                        name = field(row, "competitionName", "CompetitionName", "competition_name")
                        source_key = source_id or slugify(name)
                        used_ids = {c["competition_id"]: c.get("source_competition_id", "") for c in competition_by_source_id.values()}
                        competition_by_source_id[source_key] = make_competition_record(source_id or source_key, name, used_ids)
                        competition = competition_by_source_id[source_key]
                    competition_id = competition["competition_id"]
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
                        "competition_id": competition_id,
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
                        "playing_ball_in_play_minutes": app.get("playing_ball_in_play_minutes", app.get("ball_in_play_minutes", 0)),
                        # Backward-compatible alias. This must always equal playing_ball_in_play_minutes.
                        "ball_in_play_minutes": app.get("playing_ball_in_play_minutes", app.get("ball_in_play_minutes", 0)),
                        "samurai_stats": 0,
                        "source_file": path.name,
                    }
                stat = samurai_groups[key]
                stat["positive_actions"] += positive
                stat["negative_actions"] += negative
                stat["net_actions"] += positive - negative
                stat["event_rows_with_score"] += 1

    for stat in samurai_groups.values():
        denominator = stat.get("playing_ball_in_play_minutes", stat.get("ball_in_play_minutes", 0)) or 0
        stat["samurai_stats"] = stat["net_actions"] / denominator if denominator > 0 else 0
        season_key = (stat["competition_id"], stat["season_id"])
        season_payloads[season_key]["samurai_match_stats"].append(stat)

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

    # Competitions are generated from raw files. BI CSV provides competitionID +
    # competitionName; XML FixData/Data FxTID is used as a fallback when CSV is
    # not present yet.
    competition_by_source_id, match_competition_lookup = scan_competitions_from_bi_csv(input_dir)

    match_lookup, appearance_lookup = parse_xml_files(
        input_dir,
        season_payloads,
        seasons,
        teams_global,
        players_global,
        competition_by_source_id,
        match_competition_lookup,
    )
    parse_samurai_csv_files(
        input_dir,
        season_payloads,
        match_lookup,
        appearance_lookup,
        competition_by_source_id,
        match_competition_lookup,
    )

    manifest = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "schema_version": "1.2.0",
        "metric_definitions": {
            "samurai_stats": "(positive_actions - negative_actions) / playing_ball_in_play_minutes",
            "important_notes": [
                "Competitions are generated automatically from raw CSV/XML metadata. CSV competitionID/competitionName is preferred; XML FixData/Data FxTID is used as fallback.",
                "One event row may count more than once if it satisfies multiple Positive/Negative rules.",
                "The denominator is the player's own Playing Ball-in-Play minutes from TeamData/Player BallInPlayMins.",
                "Samurai Stats is already a Playing Ball-in-Play Minutes rate, so Total / Per Game / Per80 display modes must not change the Samurai Stats value.",
            ],
        },
        "competitions": [],
        "positions": [{"position_id": k, **v} for k, v in POSITION_NAMES.items()],
    }

    competition_manifest: dict[str, dict[str, Any]] = {}
    for competition in competition_by_source_id.values():
        competition_manifest[competition["competition_id"]] = {**competition, "seasons": []}

    for competition_id, season_id in sorted(season_payloads.keys(), key=lambda x: (x[0], x[1])):
        payload = season_payloads[(competition_id, season_id)]
        matches = sorted(payload["matches"], key=lambda x: (x["date"], x["match_id"]))
        appearances = sorted(payload["appearances"], key=lambda x: (x["date"], x["match_id"], x["team_id"] or "", x["shirt_no"] or 0))
        samurai_match_stats = sorted(payload["samurai_match_stats"], key=lambda x: (x["date"], x["match_id"], x["team_id"] or "", x["player_name"] or ""))
        teams = sorted(payload["teams"].values(), key=lambda x: x["name"] or "")
        players = sorted(payload["players"].values(), key=lambda x: x["display_name"] or "")
        dates = [m["date"] for m in matches]
        season_dir = output_dir / competition_id / season_id
        season_dir.mkdir(parents=True, exist_ok=True)
        season_meta = {
            **seasons.get((competition_id, season_id), {
                "season_id": season_id,
                "competition_id": competition_id,
                "label": season_id,
                "start_year": int(season_id[:4]),
                "end_year": int(season_id[:4]) + 1,
            }),
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
            "metadata": f"data/{competition_id}/{season_id}/metadata.json",
            "matches": f"data/{competition_id}/{season_id}/matches.json",
            "appearances": f"data/{competition_id}/{season_id}/appearances.json",
            "samurai_match_stats": f"data/{competition_id}/{season_id}/samurai_match_stats.json",
            "teams": f"data/{competition_id}/{season_id}/teams.json",
            "players": f"data/{competition_id}/{season_id}/players.json",
        }
        if competition_id not in competition_manifest:
            competition_manifest[competition_id] = {
                "competition_id": competition_id,
                "source_competition_id": None,
                "name": competition_id.replace("-", " ").title(),
                "country": None,
                "sport": SPORT,
                "seasons": [],
            }
        competition_manifest[competition_id]["seasons"].append(season_meta)

    manifest["competitions"] = sorted(
        competition_manifest.values(),
        key=lambda c: ((c.get("country") or ""), c.get("name") or c["competition_id"]),
    )
    for competition in manifest["competitions"]:
        competition["seasons"] = sorted(competition["seasons"], key=lambda s: s["season_id"])

    (output_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default="data/raw", type=Path)
    parser.add_argument("--output", default="docs/data", type=Path)
    args = parser.parse_args()
    build(args.input, args.output)


if __name__ == "__main__":
    main()
