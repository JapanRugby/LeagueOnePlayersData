# Contributing

## 新しい試合データを追加する流れ

1. 元XMLを `data/raw/LO/` に置く
2. `python3 tools/build_data.py --input data/raw/LO --output docs/data` を実行する
3. `docs/data/manifest.json` とシーズン別JSONの差分を確認する
4. ローカルサーバーで表示確認する
5. Pull Requestを作成する

## データ品質チェック

- `match_id` が重複していないか
- `date` が正しいか
- `team_id` と `team_name` が対応しているか
- 背番号24以上など例外的な登録がある場合にルールが妥当か
- 同一選手IDで別表記の名前がないか
