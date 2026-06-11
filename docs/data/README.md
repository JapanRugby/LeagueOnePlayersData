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
