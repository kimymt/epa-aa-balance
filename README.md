# EPA/AAバランス

[![Deployed on Vercel](https://img.shields.io/badge/Vercel-deployed-black?logo=vercel)](https://eaa-scorer.vercel.app)

食事の写真から、**魚由来脂質（EPA + DHA）と肉由来脂質（AA）の比率**を信号機で判定するWebアプリ。
EPA/AA比（血中脂肪酸の指標）の食事面の目安として活用できます。

**v0.3.0 (2026-05-03):** タンパク質ベースの proxy 計算から、実際の脂肪酸成分
（MEXT 食品成分表 脂肪酸成分表編 2020 由来）を使った計算にメジャーアップグレード。

## なにを測るか

EPA・DHAは主に魚由来の omega-3 脂肪酸（抗炎症性）、AA（アラキドン酸）は主に肉・卵・乳由来の omega-6 脂肪酸。
本来のEPA/AA比は血液検査でしか分かりませんが、食事写真からの食事面の目安として
**(EPA + DHA) / (EPA + DHA + AA) の割合**を計算しています（share form）。

| 信号 | 魚由来脂質割合 | 意味 |
|---|---|---|
| 🟢 緑 | ≥ 30% | 魚由来脂肪酸が多め（EPA/DHA リッチ） |
| 🟡 黄 | 15-29% | 混在 |
| 🔴 赤 | < 15% | 魚由来脂肪酸が少ない |
| ⚪ 灰 | データ不足 | 全食材で脂肪酸データ欠損、判定不能 |

閾値は v0.3.0 暫定値（MVP）。WHO/AHA 推奨の EPA+DHA 摂取量ベースのエビデンス再評価は v0.4.0 で予定。
`lib/standards.ts` の `LIPID_RATIO_THRESHOLDS` を差し替えればすべての判定に反映されます。

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

スコア計算ロジック (`lib/scoring.test.ts`)、食材データ schema (`data/foods.test.ts`)、D1 マイグレーションランナー (`scripts/migrate-d1.test.ts`) にユニットテスト計 49 件。

## アーキテクチャ

```
app/
  page.tsx                  # アップロードUI（client）
  api/analyze/route.ts      # メインパイプライン（maxDuration: 45）
  api/feedback/route.ts     # 精度フィードバック収集（D1 保存、calculation_version 付与）
  admin/page.tsx            # フィードバック閲覧 (HTTP Basic Auth)
lib/
  vision.ts                 # Google Gemini 2.5 Flash で食材抽出
  food-db.ts                # data/foods.json ルックアップ（exact → substring → category fallback）
  analyzer.ts               # 食材リスト → AnalysisResult (lipidPct/lipidRatio/EPA/DHA/AA mg)
  scoring.ts                # 脂質ベース計算 + 信号機判定（純関数）
  scoring.test.ts           # 12 ケースの単体テスト (5 fixture meals + edge cases)
  standards.ts              # 閾値・カテゴリ定義
  session.ts                # 複数食事 aggregate
data/
  foods.json                # 食品DB（57品目、各品目に protein_g + epa_mg/dha_mg/aa_mg/total_lipid_g）
  foods.test.ts             # schema 検証 (8 ケース)
components/
  TrafficLight.tsx          # 信号機UI（中央に lipidPct% 表示、unknown グレー対応）
  LipidSourceBar.tsx        # スタックドバー（EPA/DHA/AA mg 内訳）
  ResultPanel.tsx           # 結果まとめ
  UploadZone.tsx            # 画像アップロード（HEIC自動変換対応）
migrations/
  0003_add_calculation_version.sql  # D1 schema migration
scripts/
  migrate-d1.ts             # REST API ベースの migration ランナー
  migrate-d1.test.ts        # PRAGMA mock テスト (6 ケース)
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
       (fallback は脂肪酸データ無し扱いで除外)

[4] 脂肪酸集計
    └─ 各食材 epa_mg × grams/100 を合計 → meal 全体の EPA / DHA / AA mg

[5] 信号機判定
    └─ lipidPct = (EPA+DHA) / (EPA+DHA+AA) × 100
       ≥ 30% → 緑 / 15-29% → 黄 / < 15% → 赤 / 全食材 null → unknown
```

## 食品データベース

`data/foods.json` に57品目を収録。各エントリは：

```json
{
  "name": "サバ",
  "aliases": ["鯖", "さば", "塩サバ", "焼きサバ"],
  "protein_g": 20.7,
  "category": "fish",
  "epa_mg": 690,
  "dha_mg": 970,
  "aa_mg": 180,
  "total_lipid_g": 16.8,
  "_mext_row": 1026,
  "_mext_name": "＜魚類＞　（さば類）　まさば　生"
}
```

脂肪酸値の出典: MEXT 食品成分表 脂肪酸成分表編 2020 (可食部100g当たり)。
`Tr` (検出限界以下) → `0 mg`、`—` / 空欄 → `null` (no data) として保存。

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
