# Contributing

## 新しい試合データを追加する流れ

このリポジトリは **A案: raw CSV/XMLもGitHubに置く運用** です。

1. 元XMLとBI CSVを `data/raw/` 配下に置く
2. ファイル名が以下のパターンになっているか確認する
   - `*_advanced_superscout.xml`
   - `*_BI.csv`
3. `main` ブランチへpushする
4. GitHub Actionsの `Update public data from raw files` が自動で `docs/data/` を再生成する
5. 自動コミット後、GitHub Pagesが更新される

手元で事前確認する場合:

```bash
python3 tools/build_data.py --input data/raw --output docs/data
python3 tools/test_samurai_rules.py
python3 tools/validate_public_data.py
python3 -m http.server 8000 --directory docs
```

## フォルダ分け

`tools/build_data.py` は `data/raw` 配下を再帰的に検索します。以下のような分け方ができます。

```text
data/raw/LO/948799_HEATvSHBR_BI.csv
data/raw/LO/948799_HEATvSHBR_advanced_superscout.xml
data/raw/2026-27/round-01/123456_TEAMvTEAM_BI.csv
data/raw/2026-27/round-01/123456_TEAMvTEAM_advanced_superscout.xml
```

## データ品質チェック

- `match_id` が重複していないか
- `date` が正しいか
- `team_id` と `team_name` が対応しているか
- 背番号24以上など例外的な登録がある場合にルールが妥当か
- 同一選手IDで別表記の名前がないか
- BI CSVに選手IDが入っていないチームイベントを、選手指標に含めていないか

## 注意

元データと派生データをGitHubで公開してよい権利があるか確認してください。
