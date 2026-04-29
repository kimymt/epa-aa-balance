# EAAスコア

食事の写真から必須アミノ酸（EAA）バランスを信号機で判定するWebアプリ。

- 写真をアップロード → Claude Vision で食材と推定グラム数を抽出
- 食品成分DB（サンプル）からアミノ酸プロファイルを取得
- WHO/FAO/UNU 2007 のEAA基準と照らし合わせて充足率を計算
- 信号機（青/黄/赤）でひと目で判定

## 動かし方

```bash
bun install
cp .env.example .env.local
# .env.local の ANTHROPIC_API_KEY を埋める
bun dev
```

## テスト

```bash
bun test
```

スコアロジック（信号機判定）にユニットテストがあります。

## アーキテクチャ

```
app/
  page.tsx                  # アップロードUI（client）
  api/analyze/route.ts      # メインパイプライン
lib/
  vision.ts                 # Claude Vision呼び出し
  food-db.ts                # data/foods.json ルックアップ
  eaa-calculator.ts         # 食材合計→EAA摂取量→充足率
  scoring.ts                # 信号機判定（純関数）
  scoring.test.ts           # ユニットテスト
  standards.ts              # WHO/FAO/UNU 2007 EAA基準
data/
  foods.json                # サンプル食品DB（30品目超）
components/
  TrafficLight.tsx
  AminoAcidBar.tsx
  UploadZone.tsx
  ResultPanel.tsx
```

## 制約・既知の限界

- **食品DBはサンプル**: 30品目超の主要食材のみ。文科省「アミノ酸成分表2020年版」をパースして `data/foods.json` を差し替えると精度が上がる。
- **EAA基準はWHO/FAO**: 日本水産のEAA基準が入手できたら `lib/standards.ts` の数値を差し替える。
- **HEIC非対応**: iPhoneのデフォルト形式は事前にJPEG変換が必要。
- **体重60kg固定**: MVPはデフォルト固定。将来的にユーザー入力UIを追加する。

## Vercelへのデプロイ

1. このリポジトリをGitHubに push
2. https://vercel.com/new からImport
3. 環境変数 `ANTHROPIC_API_KEY` を設定
4. **Vercel Pro推奨**: Hobby tierのデフォルト10秒タイムアウトでは Claude Vision の応答が間に合わない。`app/api/analyze/route.ts` で `maxDuration: 45` を指定している
5. Deploy
