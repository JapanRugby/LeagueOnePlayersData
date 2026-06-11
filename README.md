# Samurai Stats | JAPAN RUGBY PERFORMANCE REVIEW HUB

JAPAN RUGBY PERFORMANCE REVIEW HUB の **Samurai Stats** を閲覧するための静的Webサイトです。  
GitHub Pagesでそのまま公開できるように、公開サイト本体は `docs/` に入っています。

## Samurai Statsの定義

```text
Samurai Stats = (Positive Actions - Negative Actions) / Ball-in-Play Minutes
```

重要な実装ルール:

- 1イベント行が複数条件に該当する場合、複数カウントします。
- Samurai Stats は Ball-in-Play Minutes あたりの rate として扱います。
- `Total / Per Game / Per80` を切り替えても、Samurai Stats のメイン値は変化しません。
- `Positive / Negative / Net` の件数表示は、`Total / Per Game / Per80` の対象です。

## できること

- リーグ・シーズン選択
- 全シーズン表示
- チーム絞り込み
- ポジション絞り込み
- 選手名検索
- 日付範囲指定
- プリセット期間
  - 全期間
  - 最新30日
  - 最新5開催日
  - 最新10開催日
- 表示モード切り替え
  - Total
  - Per Game
  - Per80
- Samurai Statsランキング
  - Samurai Stats
  - Positive Actions
  - Negative Actions
  - Net Actions
  - Ball-in-Play Minutes
  - 出場時間
  - 出場試合数
  - 先発回数
  - リザーブ登録回数
- 選手別マッチログ
- 現在の検索条件URLコピー
- フィルター結果のCSV出力

## リポジトリ構成

```text
.
├── docs/                  # GitHub Pages公開用サイト
│   ├── index.html
│   ├── assets/
│   │   ├── app.js
│   │   └── styles.css
│   └── data/
│       ├── manifest.json
│       └── japan-league-one-d1/
│           ├── 2024-25/
│           └── 2025-26/
├── tools/
│   ├── build_data.py      # XML/BI CSVから公開用JSONを生成
│   └── test_samurai_rules.py
├── data/
│   └── raw/               # 元データ置き場。gitignore対象
└── README.md
```

## GitHub Pagesで公開する方法

1. このフォルダの中身をGitHubリポジトリにpushする
2. GitHubでリポジトリの **Settings** を開く
3. **Pages** を開く
4. **Build and deployment** で **Deploy from a branch** を選ぶ
5. Branchを `main`、Folderを `/docs` にする
6. Saveする

GitHub Pagesでは、`/docs` フォルダを公開元にする場合、`docs/index.html` がエントリーファイルになります。

## ローカルで確認する方法

```bash
python3 -m http.server 8000 --directory docs
```

ブラウザで以下を開きます。

```text
http://localhost:8000
```

## データを再生成する方法

元XMLとBI CSVを `data/raw/LO/` に置いてから実行します。

```bash
python3 tools/build_data.py --input data/raw/LO --output docs/data
```

期待する元ファイル名:

```text
*_advanced_superscout.xml
*_BI.csv
```

## 公開データ設計

公開サイトは、以下のJSONを読み込みます。

```text
docs/data/manifest.json
docs/data/{competition_id}/{season_id}/matches.json
docs/data/{competition_id}/{season_id}/appearances.json
docs/data/{competition_id}/{season_id}/samurai_match_stats.json
docs/data/{competition_id}/{season_id}/teams.json
docs/data/{competition_id}/{season_id}/players.json
```

`samurai_match_stats.json` は、BI CSVの全イベント行をそのまま公開するのではなく、**1試合×1選手** に圧縮したSamurai Stats用の集計データです。  
日付範囲指定は `appearances.date` と `samurai_match_stats.date` を使ってフロントエンドで動的に再集計しています。

## 指標定義

| 指標 | 定義 |
|---|---|
| Positive Actions | JRFU定義のPositive条件に該当した件数。複数条件該当時は複数カウント |
| Negative Actions | JRFU定義のNegative条件に該当した件数。複数条件該当時は複数カウント |
| Net Actions | `Positive Actions - Negative Actions` |
| Ball-in-Play Minutes | XML内の `BallInPlayMins` の合計 |
| Samurai Stats | `Net Actions / Ball-in-Play Minutes` |
| 出場時間 | `sum(minutes)` |
| 出場試合数 | `count(played === true)` |
| 先発回数 | `count(started === true)` |
| リザーブ登録回数 | `count(reserve_selected === true)` |
| 途中出場回数 | `count(bench_appearance === true)` |
| 未出場リザーブ回数 | `count(reserve_selected === true && played === false)` |

背番号 `1〜15` を先発、`16以上` をリザーブ登録として扱っています。リーグや大会によってルールが異なる場合は `tools/build_data.py` の `role_from_shirt()` を調整してください。

## Samuraiルールのテスト

```bash
python3 tools/test_samurai_rules.py
```

このテストでは、複数条件に該当する1イベント行が複数カウントされること、またPositiveとNegativeが同じイベント行で同時に発生しうることを確認します。

## 公開前の注意

元データや派生データを公開してよい権利があるか確認してください。  
このテンプレートでは、元XML/CSVをリポジトリに含めない前提で `data/raw/` を `.gitignore` に入れています。

## 今後の拡張案

- 他リーグ追加
- 大会設定ファイル化
- チーム名・選手名の別名管理
- Positive / Negative条件の設定ファイル化
- Parquet / DuckDB-Wasmへの移行
- 選手詳細ページのURL化
- チームページの追加
- 試合ごとのSamurai Stats比較
