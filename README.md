# League Player Stats

リーグワンの選手別出場データを閲覧するための静的Webサイトです。  
GitHub Pagesでそのまま公開できるように、公開サイト本体は `docs/` に入っています。

## できること

- リーグ・シーズン選択
- チーム絞り込み
- ポジション絞り込み
- 選手名検索
- 日付範囲指定
- プリセット期間
  - 全期間
  - 最新30日
  - 最新5開催日
  - 最新10開催日
- 選手別ランキング
  - 出場時間
  - 出場試合数
  - 先発回数
  - リザーブ登録回数
  - 途中出場回数
  - 未出場リザーブ回数
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
│   └── build_data.py      # XMLから公開用JSONを生成
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

元XMLを `data/raw/LO/` に置いてから実行します。

```bash
python3 tools/build_data.py --input data/raw/LO --output docs/data
```

## データ設計

公開サイトは、以下のJSONを読み込みます。

```text
docs/data/manifest.json
docs/data/{competition_id}/{season_id}/matches.json
docs/data/{competition_id}/{season_id}/appearances.json
docs/data/{competition_id}/{season_id}/teams.json
docs/data/{competition_id}/{season_id}/players.json
```

日付範囲指定は `appearances.date` を使ってフロントエンドで動的集計しています。  
このため、シーズン全体だけでなく、任意期間、最新30日、最新5開催日などの集計が可能です。

## 指標定義

| 指標 | 定義 |
|---|---|
| 出場時間 | `sum(minutes)` |
| 出場試合数 | `count(played === true)` |
| 先発回数 | `count(started === true)` |
| リザーブ登録回数 | `count(reserve_selected === true)` |
| 途中出場回数 | `count(bench_appearance === true)` |
| 未出場リザーブ回数 | `count(reserve_selected === true && played === false)` |

背番号 `1〜15` を先発、`16以上` をリザーブ登録として扱っています。リーグや大会によってルールが異なる場合は `tools/build_data.py` の `role_from_shirt()` を調整してください。

## 公開前の注意

元データや派生データを公開してよい権利があるか確認してください。  
このテンプレートでは、元XML/CSVをリポジトリに含めない前提で `data/raw/` を `.gitignore` に入れています。

## 今後の拡張案

- 他リーグ追加
- 大会設定ファイル化
- チーム名・選手名の別名管理
- Parquet / DuckDB-Wasmへの移行
- 選手詳細ページのURL化
- チームページの追加
- 試合ごとの登録メンバー比較
