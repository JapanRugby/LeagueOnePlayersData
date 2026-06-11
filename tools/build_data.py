#!/usr/bin/env python3
"""Build static JSON data for the GitHub Pages site.

Usage:
  python tools/build_data.py --input data/raw/LO --output docs/data

The raw XML/CSV files are intentionally not committed by default. Put your
`*_advanced_superscout.xml` files under data/raw/LO, then run this script.
"""
from __future__ import annotations

import argparse
import json
import shutil
import xml.etree.ElementTree as ET
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

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


def safe_int(value, default=None):
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


def build(input_dir: Path, output_dir: Path):
    if output_dir.exists():
        shutil.rmtree(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    seasons = {}
    teams_global = {}
    players_global = {}
    season_payloads = defaultdict(lambda: {"matches": [], "appearances": [], "teams": {}, "players": {}})

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
                "ball_in_play_minutes": safe_int(a.get("BallInPlayMins"), 0) or 0,
                "started": role == "starter",
                "reserve_selected": role == "reserve",
                "bench_appearance": role == "reserve" and mins > 0,
                "played": mins > 0,
                "lineup_role": role,
                "team_name": a.get("TEAMNAME"),
                "player_name": display_name,
            }
            season_payloads[season_id]["appearances"].append(appearance)

    manifest = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "schema_version": "1.0.0",
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
            "team_count": len(teams),
            "player_count": len(players),
        }
        for name, obj in [("metadata", season_meta), ("matches", matches), ("appearances", appearances), ("teams", teams), ("players", players)]:
            (season_dir / f"{name}.json").write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        season_meta["paths"] = {
            "metadata": f"data/{COMPETITION_ID}/{season_id}/metadata.json",
            "matches": f"data/{COMPETITION_ID}/{season_id}/matches.json",
            "appearances": f"data/{COMPETITION_ID}/{season_id}/appearances.json",
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
