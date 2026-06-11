# Public data

このフォルダはGitHub Pagesで配信される公開データです。

- `manifest.json`: コンペティション・シーズン一覧、スキーマバージョン、指標定義
- `{competition_id}/{season_id}/matches.json`: 試合情報
- `{competition_id}/{season_id}/appearances.json`: 1試合×1選手の出場情報
- `{competition_id}/{season_id}/samurai_match_stats.json`: 1試合×1選手のSamurai Stats用集計
- `{competition_id}/{season_id}/teams.json`: チーム情報
- `{competition_id}/{season_id}/players.json`: 選手情報

`samurai_match_stats.json` はBI CSVのイベント行を1試合×1選手に圧縮したデータです。

A案運用では、元CSV/XMLは `data/raw/` にコミットし、GitHub Actionsでこの `docs/data/` を自動再生成します。コンペティション一覧はraw CSV/XMLから自動生成され、フロントエンドは `manifest.json` の `competitions` 配列から選択肢を表示します。


## Samurai Stats denominator

`playing_ball_in_play_minutes` is the player-specific Playing Ball-in-Play minutes from `TeamData/Player@BallInPlayMins`. It is intentionally not match-level or team-level Ball-in-Play minutes. `ball_in_play_minutes` is kept as a backward-compatible alias and must equal `playing_ball_in_play_minutes`.

## Samurai Stats rule source

The Positive and Negative action rules mirror the supplied PowerBI/DAX measures:

- `Actions Positive JRFU`
- `Actions Negative JRFU`

Each PowerBI `VAR` is represented as an independent rule in `tools/build_data.py`, so one event row may be counted by multiple rules. The active rule version is stored in `manifest.json` at `metric_definitions.rule_version`.


## `player_action_stats.json`

Stats Comparison画面用の1試合×1選手の集計データです。Carry / Tackle / Ruck OOAの比較指標を事前集計しています。フロント側では日付・チーム・ポジションで絞った後、選手ごとに合算し、数量指標をper 80mins、割合指標を%として表示します。

主なフィールド:

- `minutes`
- `playing_ball_in_play_minutes`
- `positive_actions` / `negative_actions` / `net_actions`
- `ball_carry_attempts`
- `dominant_carries`
- `carry_metres`
- `post_contact_metres`
- `tackle_attempts`
- `tackles_made`
- `dominant_tackles`
- `ruck_ooa_attack_attempts`
- `ruck_ooa_attack_effective`
