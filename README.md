# EPA/AAバランス

[![Deployed on Vercel](https://img.shields.io/badge/Vercel-deployed-black?logo=vercel)](https://eaa-scorer.vercel.app)

食事の写真から、**魚タンパク質と非魚タンパク質の比率**を信号機で判定するWebアプリ。
EPA/AA比（血中脂肪酸の指標）の食事面の目安として活用できます。

## なにを測るか

EPAは主に魚由来、AA（アラキドン酸）は主に肉・卵・乳由来。
本来のEPA/AA比は血液検査でしか分かりませんが、食事写真からの実用的なプロキシとして
**「魚タンパク質 / 総タンパク質」の割合**を計算しています。

| 信号 | 魚タンパク質割合 | 意味 |
|---|---|---|
| 🟢 青 | ≥ 50% | 魚中心の食事 |
| 🟡 黄 | 25-49% | 混在 |
| 🔴 赤 | < 25% | 魚が少ない |

閾値は仮置き（MVP）。実証データが出たら `lib/standards.ts` の `FISH_RATIO_THRESHOLDS` を差し替えればすべての判定に反映されます。

## 動かし方

```bash
bun install
cp .env.example .env.local
# .env.local の GEMINI_API_KEY を埋める（https://aistudio.google.com/apikey で無料取得）
bun dev
```

## テスト

```bash
bun test
```

スコア判定ロジックにユニットテストがあります（`lib/scoring.test.ts`）。

## アーキテクチャ

```
app/
  page.tsx                  # アップロードUI（client）
  api/analyze/route.ts      # メインパイプライン（maxDuration: 45）
lib/
  vision.ts                 # Google Gemini 2.5 Flash で食材抽出
  food-db.ts                # data/foods.json ルックアップ（exact → substring → category fallback）
  analyzer.ts               # カテゴリ別タンパク質量を集計、魚タンパク質割合を計算
  scoring.ts                # 信号機判定（純関数）
  scoring.test.ts           # ユニットテスト
  standards.ts              # 閾値・カテゴリ定義
data/
  foods.json                # 食品DB（57品目 + 5カテゴリfallback）
components/
  TrafficLight.tsx          # 信号機UI（中央に魚％表示）
  ProteinSourceBar.tsx      # スタックドバー（魚/肉/卵乳/豆/その他の内訳）
  ResultPanel.tsx           # 結果まとめ
  UploadZone.tsx            # 画像アップロード（HEIC自動変換対応）
```

## パイプライン

```
[1] 写真アップロード
    ├─ HEIC → JPEG 自動変換（クライアント側、heic2any）
    └─ POST /api/analyze（multipart/form-data、最大10MB）

[2] 食材・分量の特定（Gemini 2.5 Flash）
    └─ JSON Schema強制出力で具体食材名を抽出
       例: [{"name":"サバ","grams":150}, {"name":"白米","grams":200}, ...]

[3] 食材ルックアップ
    └─ exact match → substring match → category fallback の3段階

[4] カテゴリ別集計
    └─ fish / meat / egg_dairy / plant_protein / other ごとにタンパク質を合算

[5] 信号機判定
    └─ 魚タンパク質割合(%) → 青/黄/赤
```

## 食品データベース

`data/foods.json` に57品目を収録。各エントリは：

```json
{
  "name": "サバ",
  "aliases": ["鯖", "さば", "塩サバ", "焼きサバ"],
  "protein_g": 20.7,
  "category": "fish"
}
```

カテゴリ：
- `fish` — 魚介類（EPA源、numerator）
- `meat` — 獣鳥肉類（AA寄与）
- `egg_dairy` — 卵・乳製品（AA寄与）
- `plant_protein` — 豆類・味噌
- `other` — 野菜・穀類・果物等

データ精度を上げたい場合は文部科学省「日本食品標準成分表」をパースして差し替えるのが本命の打ち手。

## 既知の限界

- **食品DBはサンプル**: 57品目。和食の典型的な家庭料理は概ねカバーするが、外食や複雑な料理は category_fallback に落ちる
- **画像認識の揺れ**: temperature=0 + JSON Schema で安定化済みだが、暗い・遠い写真では精度が落ちる
- **EPA/AA比そのものではない**: 魚タンパク質割合はあくまで実用プロキシ。本来の血中EPA/AA比はサプリメントや個人の代謝で変わる
- **MVPの閾値**: 50%/25%は仮置き。栄養学的エビデンスに基づく値が出れば差し替え可能

## デプロイ

Vercelに直接デプロイ。`maxDuration: 45` を指定しているためHobby tier（10秒上限）では不十分、Pro必須。

環境変数：
- `GEMINI_API_KEY` — Google AI Studio で無料取得

## 開発履歴・設計ドキュメント

このプロジェクトは [gstack](https://github.com/garrytan/gstack) の `/office-hours` スキルで設計されました。

- 📄 [`docs/design-v2-epa-aa.md`](./docs/design-v2-epa-aa.md) — **現在の実装の根拠**（EPA/AA比プロキシ、魚タンパク質割合）
- 📄 [`docs/design.md`](./docs/design.md) — 当初設計（EAAスコア）。仕様変更後に廃止、設計プロセスの記録として保存

## ライセンス

[Apache License 2.0](./LICENSE) で公開しています。

- 商用利用 OK
- 改変・再配布 OK
- 特許権の明示的許可を含む（Apache 2.0 セクション 3）
- 改変版を配布する場合は [`NOTICE`](./NOTICE) ファイルと変更履歴を含めてください

Copyright 2026 eaa-scorer contributors. See [`NOTICE`](./NOTICE) for details.
