# Changelog

All notable changes to this project will be documented in this file.

## [0.4.1] - 2026-05-03 — クリーンアップ

### Removed
- 後方互換 alias `ProteinCategory`（`lib/standards.ts`）を削除。v0.3.7 で
  `FoodCategory` にリネーム後、参照ゼロを確認した上で完全撤去。
  新コードは `FoodCategory` を使用すること。

## [0.3.0] - 2026-05-03 — 脂質ベース計算移行

### ⚠ 破壊的変更
- **スコア計算が「魚タンパク質割合」から「魚由来脂質割合」に変更されました。**
  v0.2.0 と v0.3.0 でスコアの数値が異なります（同じ食事でも別の値）。
- API レスポンス: 旧 `fishProteinPct`, `proteinByCategory`, `totalProteinG`,
  `proteinCoverage`, `insufficientData` フィールド削除。
  新 `lipidPct`, `lipidRatio`, `epaMg`, `dhaMg`, `aaMg`, `lipidCoverage` 追加。
- 信号機 (`light`) に `"unknown"` 値追加（データ不足時、グレー表示）。

### Added
- 食材データベース (`data/foods.json`) の全 57 品目に脂肪酸成分追加
  (`epa_mg`, `dha_mg`, `aa_mg`, `total_lipid_g`)。
  データソース: MEXT 食品成分表 脂肪酸成分表編 2020 (可食部100g当たり)。
- 脂質ベース計算ロジック (`lib/scoring.ts` の `computeLipidScore`):
  - **lipidPct** = (EPA + DHA) / (EPA + DHA + AA) × 100 (share form, 主表示)
  - **lipidRatio** = (EPA + DHA) / AA (true ratio, 内部 + API)
  - **epaMg / dhaMg / aaMg** 集計値
  - **lipidCoverage** mass-weighted 信頼度
- 暫定信号機閾値: 緑 ≥30%、黄 15-29%、赤 <15%。エビデンス再評価は v0.4.0。
- データ不足ハンドリング: 全食材の脂肪酸データが null なら `signal="unknown"`、
  UI でグレー表示。
- D1 マイグレーションランナー (`scripts/migrate-d1.ts`):
  REST API ベース、PRAGMA による冪等性チェック。
- D1 feedback テーブルに `calculation_version` 列追加 (`migrations/0003_*.sql`):
  v0.2.0 レコード = `version=1`、v0.3.0+ = `version=2`。
- 新規コンポーネント `LipidSourceBar.tsx`: EPA/DHA/AA を色分けスタックドバー表示。

### Changed
- 信号機ラベル変更:
  - 旧 「魚タンパク中心」「やや魚少なめ」「魚不足」
  - 新 「魚由来 多め」「魚由来 やや少なめ」「魚由来 少ない」「判定不能」
- 結果カードの内訳表示: タンパク質 g 単位 → EPA/DHA/AA mg 単位 + (EPA+DHA)/AA 比。
- 集約表示 (複数食事) に EPA/DHA/AA 合計値追加。
- 説明文 (フッター) の判定方法解説を脂質ベースに刷新。

### Removed
- `lib/scoring.ts` の旧 `computeLight()` (タンパク質ベース)。
- `lib/standards.ts` の `FISH_RATIO_THRESHOLDS`, `MIN_TOTAL_PROTEIN_G`, `COVERAGE_THRESHOLD`。
- `lib/lipid-scoring.ts` ファイル (内容を `lib/scoring.ts` に統合)。
- `components/ProteinSourceBar.tsx` (`LipidSourceBar.tsx` で置換)。
- `lib/scoring.test.ts` (旧 protein テスト、新規 lipid テストで置換)。

### Migration Notes
v0.2.0 から v0.3.0 へのデプロイ時、D1 マイグレーション実行が必須:
```bash
bun --env-file=.env.local run scripts/migrate-d1.ts
```
冪等なので既に適用済みなら SKIP される。

### Known Issues / 暫定事項
- 閾値 30%/15% は暫定値。「魚中心 80% が緑」検証で設定したが、
  WHO/AHA mg/日推奨値ベースの再評価は v0.4.0 で実施予定。
- 食材 DB は 57 品目のみ。MEXT 1,900 品目への拡張は v0.3.1 で予定。
- `feature-flags.ts` は dead code として残存。次回 cleanup PR で削除予定。

### Deferred to v0.4.0
- AI コーチング・レシピ提案機能（旧 v0.3.0 設計、脂質ベース完了後に着手）
- 設計ドキュメント: `~/.gstack/projects/kimymt-epa-aa-balance/likemike-main-design-20260502-145712.md`
- プロトタイプ: `designs/coach-section-20260502/finalized.html`
- 文化圏比較機能（イヌイット食、地中海食 vs ユーザー）
- WHO/AHA エビデンスベース閾値

---

## [0.2.0] - 2026-05-02 [LOCKED & RELEASED]

### Added
- Vision API accuracy feedback on each meal result card (正確 / 誤り-修正 buttons).
  Users can confirm predictions or submit corrections with the actual food list.
- `/admin` dashboard (token-gated) showing total feedback, accuracy %, per-meal-type
  breakdown, and recent 20 corrections with original predictions.
- HTTP Basic Auth on `/admin` route via Next.js 16 proxy. Browser shows native
  password dialog before page HTML is served.
- Cloudflare D1 storage for feedback (eaa-scorer-feedback, APAC region) accessed
  via REST API from Vercel. Indexed on meal_type, accurate, created_at.
- Unit tests for Basic Auth check (9 cases) and feedback validation (12 cases).

### Changed
- `MealAnalysis.foods` type corrected from `string[]` to `VisionFood[]` to match
  what the analyzer actually returns ({name, grams} objects).
- POST `/api/feedback` now validates the request body in a dedicated module
  (`lib/feedback-validation.ts`) — rejects unknown meal types with 400 instead of
  silently passing through.
- `/admin` page reverts to thank-you confirmation after feedback submit instead
  of showing the buttons again immediately.
