# Samurai Stats | JAPAN RUGBY PERFORMANCE REVIEW HUB

JAPAN RUGBY PERFORMANCE REVIEW HUB の **Samurai Stats** を閲覧するための静的Webサイトです。  
GitHub Pagesでそのまま公開できるように、公開サイト本体は `docs/` に入っています。

## Samurai Statsの定義

```text
Samurai Stats = (Positive Actions - Negative Actions) / Playing Ball-in-Play Minutes
```

重要な実装ルール:

- 1イベント行が複数条件に該当する場合、複数カウントします。
- Samurai Stats は、その選手の Playing Ball-in-Play Minutes あたりの rate として扱います。
- `Total / Per Game / Per80` を切り替えても、Samurai Stats のメイン値は変化しません。
- `Positive / Negative / Net` の件数表示は、`Total / Per Game / Per80` の対象です。

## できること

- コンペティション・シーズン選択
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
  - Playing Ball-in-Play Minutes
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
│       └── {competition_id}/
│           └── {season_id}/
├── tools/
│   ├── build_data.py      # XML/BI CSVから公開用JSONを生成
│   └── test_samurai_rules.py
├── data/
│   └── raw/               # 元CSV/XML置き場。GitHub Actionsの自動更新対象
├── .github/
│   └── workflows/
│       ├── update-data-from-raw.yml
│       └── validate-data.yml
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

## データ更新方法

この版は **A案: raw CSV/XMLもGitHubに置く運用** です。

`data/raw/` 配下にCSV/XMLを追加して `main` ブランチへpushすると、GitHub Actionsが自動で `docs/data/` を再生成し、更新されたJSONを自動コミットします。

```bash
git add data/raw
git commit -m "Add raw match files"
git push
```

GitHub Actionsの流れ:

```text
data/raw/**/*.csv または data/raw/**/*.xml が main にpushされる
↓
python3 tools/build_data.py --input data/raw --output docs/data
↓
python3 tools/test_samurai_rules.py
↓
python3 tools/validate_public_data.py
↓
docs/data に差分があれば自動コミット
↓
GitHub Pagesが更新
```

手元で事前確認する場合は以下を実行します。

```bash
python3 tools/build_data.py --input data/raw --output docs/data
python3 tools/test_samurai_rules.py
python3 tools/validate_public_data.py
```

期待する元ファイル名:

```text
*_advanced_superscout.xml
*_BI.csv
```

`tools/build_data.py` は `data/raw` 配下を再帰的に探すため、以下のようなフォルダ分けもできます。

```text
data/raw/LO/948799_HEATvSHBR_BI.csv
data/raw/2026-27/round-01/123456_TEAMvTEAM_BI.csv
```

### コンペティションの自動生成

コンペティション一覧は手動設定ファイルではなく、rawのCSV/XMLからビルド時に自動生成します。

優先順位:

1. BI CSVの `competitionID` / `competitionName`
2. advanced_superscout XMLの `FixData/Data@FxTID`

CSVに `competitionName` がある場合は、その名称から `competition_id` を自動生成します。例: `Japan Rugby League One D1` → `japan-rugby-league-one-d1`。
XMLだけが存在する場合は、名称が分からないため `Competition {FxTID}` という表示名になります。

新しいコンペティションのCSV/XMLを `data/raw/` に追加してpushすると、GitHub Actionsが `docs/data/manifest.json` の `competitions` 配列を更新します。サイト側はこのmanifestを読んでセレクトボックスを作るため、フロントエンドの修正なしで新しいコンペティションを選択できます。

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
| Playing Ball-in-Play Minutes | XML内の各選手行 `TeamData/Player@BallInPlayMins` の合計。試合全体・チーム全体のBIP分ではありません。 |
| Samurai Stats | `Net Actions / Playing Ball-in-Play Minutes` |
| 出場時間 | `sum(minutes)` |
| 出場試合数 | `count(played === true)` |
| 先発回数 | `count(started === true)` |
| リザーブ登録回数 | `count(reserve_selected === true)` |
| 途中出場回数 | `count(bench_appearance === true)` |
| 未出場リザーブ回数 | `count(reserve_selected === true && played === false)` |

背番号 `1〜15` を先発、`16以上` をリザーブ登録として扱っています。コンペティションによってルールが異なる場合は `tools/build_data.py` の `role_from_shirt()` を調整してください。

## Samuraiルールのテスト

```bash
python3 tools/test_samurai_rules.py
```

このテストでは、複数条件に該当する1イベント行が複数カウントされること、またPositiveとNegativeが同じイベント行で同時に発生しうることを確認します。

## 公開前の注意

この版では、`data/raw/` の元CSV/XMLもGitHubにコミットできる設定にしています。  
元データおよび派生データを公開してよい権利があるか、必ず確認してください。

GitHub Actionsによる自動コミットを使うため、リポジトリの **Settings → Actions → General → Workflow permissions** で、必要に応じて **Read and write permissions** を有効にしてください。

## 今後の拡張案

- 他コンペティション追加
- 大会設定ファイル化
- チーム名・選手名の別名管理
- Positive / Negative条件の設定ファイル化
- Parquet / DuckDB-Wasmへの移行
- 選手詳細ページのURL化
- チームページの追加
- 試合ごとのSamurai Stats比較
