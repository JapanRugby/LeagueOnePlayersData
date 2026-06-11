#!/usr/bin/env python3
"""Validate generated public JSON files."""
from __future__ import annotations

import json
from pathlib import Path


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> None:
    manifest_path = Path("docs/data/manifest.json")
    assert manifest_path.exists(), "Missing docs/data/manifest.json"
    manifest = load_json(manifest_path)
    assert manifest.get("competitions"), "No competitions in manifest"

    metric_definitions = manifest.get("metric_definitions", {})
    assert metric_definitions.get("samurai_stats"), (
        "Missing metric_definitions.samurai_stats in docs/data/manifest.json. "
        "Regenerate data with: python3 tools/build_data.py --input data/raw --output docs/data"
    )

    required_files = [
        "metadata",
        "matches",
        "appearances",
        "samurai_match_stats",
        "teams",
        "players",
    ]

    for competition in manifest["competitions"]:
        competition_id = competition["competition_id"]
        for season in competition["seasons"]:
            season_id = season["season_id"]
            base = Path("docs/data") / competition_id / season_id
            loaded = {}
            for name in required_files:
                path = base / f"{name}.json"
                assert path.exists(), f"Missing {path}"
                loaded[name] = load_json(path)

            for appearance in loaded["appearances"]:
                assert "playing_ball_in_play_minutes" in appearance, (
                    f"Missing playing_ball_in_play_minutes in appearance {appearance.get('appearance_id')}"
                )
                assert appearance.get("ball_in_play_minutes") == appearance.get("playing_ball_in_play_minutes"), (
                    f"BIP alias mismatch in appearance {appearance.get('appearance_id')}"
                )

            for stat in loaded["samurai_match_stats"]:
                assert "playing_ball_in_play_minutes" in stat, (
                    f"Missing playing_ball_in_play_minutes in samurai stat {stat.get('samurai_match_stat_id')}"
                )
                assert stat.get("ball_in_play_minutes") == stat.get("playing_ball_in_play_minutes"), (
                    f"BIP alias mismatch in samurai stat {stat.get('samurai_match_stat_id')}"
                )
                denom = stat.get("playing_ball_in_play_minutes") or 0
                expected = (stat.get("net_actions", 0) / denom) if denom else 0
                assert abs((stat.get("samurai_stats") or 0) - expected) < 1e-12, (
                    f"Samurai Stats denominator mismatch in {stat.get('samurai_match_stat_id')}"
                )

    print("JSON OK")


if __name__ == "__main__":
    main()
