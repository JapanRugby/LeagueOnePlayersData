# Public data

このフォルダはGitHub Pagesで配信される公開データです。

- `manifest.json`: リーグ・シーズン一覧、スキーマバージョン、指標定義
- `{competition_id}/{season_id}/matches.json`: 試合情報
- `{competition_id}/{season_id}/appearances.json`: 1試合×1選手の出場情報
- `{competition_id}/{season_id}/samurai_match_stats.json`: 1試合×1選手のSamurai Stats用集計
- `{competition_id}/{season_id}/teams.json`: チーム情報
- `{competition_id}/{season_id}/players.json`: 選手情報

`samurai_match_stats.json` はBI CSVのイベント行を1試合×1選手に圧縮したデータです。  
Raw BI CSVは公開データに含めない前提です。
