# Changelog

All notable changes to this project will be documented in this file.

## [0.4.7] - 2026-05-03 — /design-review クイックウィン

### Changed
- **F-002**: シグナルラベル（良好/中程度/改善推奨/判定不能）を **チップスタイル**に変更
  - 旧: `bg-{color}-500 + rounded-full + text-white` = ボタン状ピル
  - 新: `bg-{color}-50 + text-{color}-700 + border + rounded-md` = ステータスチップ
  - 「改善推奨」が clickable CTA に見える false affordance を解消
  - 4 色（green/yellow/red/unknown）すべてに dark mode 対応
- **F-007**: 結果ページの「別の写真で試す」リセットボタンを可視化
  - 旧: outline-only border + text-sm
  - 新: subtle filled (bg-slate-100) + text-base + 矢印サフィックス
  - スクロール後の見落とし軽減

### Accessibility
- **F-004**: 「個別の食事結果」を `<div>` から `<h2>` へ昇格（セマンティック構造）
- **F-006**: 判定方法フッターのコントラスト改善
  - text-xs (12px) text-slate-500 → text-sm (14px) text-slate-600
  - WCAG コントラスト要件への準拠を強化

### Background
`/design-review` 監査結果より、CSS-only の最小リスク 4 件をまとめて修正。
スコア: B− → B（推定、再監査で最終確認予定）。
保留した HIGH 級項目（home page 60% empty space, "what's next" preview,
🍱 emoji ブランディング）は別 PR / design-consultation 案件として TODOS.md 記録。

## [0.4.6] - 2026-05-03 — セキュリティ hardening パッケージ (/cso 監査 informational 対応)

### Security
- **Constant-time credential comparison** (`lib/timing-safe.ts` 新規):
  - `lib/auth.ts:28` の Basic Auth 比較を `!==` → `constantTimeStringEqual` に変更
  - `app/api/feedback/route.ts:81` の admin token 比較も同様
  - 内部で Node 標準 `crypto.timingSafeEqual` を使用
  - 実害は理論的だがセキュリティ慣習に準拠
- **`/api/feedback` GET (admin) endpoint に rate limit を追加**:
  - デフォルト **30 req/h/IP**、`FEEDBACK_ADMIN_RATE_LIMIT` env で変更可
  - `request_log` テーブルに `endpoint = "/api/feedback-admin"` で記録（POST と区別）
  - 401 連発（brute-force 試行）も telemetry で可視化される
  - 超過時 429 + `Retry-After`

### Documentation
- `scripts/ingest-mext-foods.ts` のヘッダに xlsx CVE の **受容根拠**を明記:
  - xlsx@0.18.5 には HIGH 級 CVE 2 件存在
  - 修正版 (0.19.3+) は SheetJS が npm 配布停止、CDN のみ
  - 本プロジェクトでは devDep + build-only + 信頼入力 (MEXT) のみで実害ゼロと判断、受容
  - 将来的な exceljs 置換は TODOS.md に記録
- `.env.example` に `FEEDBACK_ADMIN_RATE_LIMIT` を追記

### Tests
- `lib/timing-safe.test.ts` 5 ケース新規（同一/異長/UTF-8/トークン形式）
- 121 → 126 pass

## [0.4.5] - 2026-05-03 — `/api/analyze` レート制限 + 環境変数ドキュメント整備

### Security
- **`/api/analyze` に D1 ベースのレート制限を追加**（`/cso` 監査の Finding 1 対応）。
  デフォルト 10 req/h/IP、`ANALYZE_RATE_LIMIT` env で変更可。1 リクエストで最大 9 並列
  Vision 呼び出しが走るため、未保護のままだと攻撃者が 1 IP で free-tier quota を
  数分で枯渇可能だった。
- 制限超過時は **429 + Retry-After** ヘッダ。telemetry は `request_log` テーブルに
  全リクエスト記録（v0.4.2 と同パターン、同テーブル共有）。
- D1 環境変数が無い環境（local dev）では rate limit を自動 disable。

### Added
- `.env.example` に `IP_HASH_SECRET`, `COACH_RATE_LIMIT`, `ANALYZE_RATE_LIMIT` を
  ドキュメント化。新規 contributor が rate limit / IP hash の存在を発見可能に。

### Background
v0.4.2 で `/api/coach` のみ守ったが、`/cso --infra` 監査で「`/api/analyze` の方が
9 倍重い」ことが判明。同 D1 テーブル `request_log` を共有することでマイグレーション不要、
コード変更のみでデプロイ可能。

## [0.4.4] - 2026-05-03 — Gemini モデル変更 (flash → flash-lite)

### Changed
- `lib/coach.ts` の `MODEL` を `gemini-2.5-flash` → `gemini-2.5-flash-lite` に変更。
  無料枠が **20 req/day → 1000 req/day** と 50 倍になり、実用的な運用が可能に。
- レシピ提案は 3 件 × 5 フィールドの構造化出力なので、lite モデルで品質は十分と判断。

### Background
v0.4.0-alpha のリリース直後、ローカル + 本番でテストを重ねて Gemini 2.5 Flash の
無料枠 20 req/day にすぐ到達。v0.4.3 で QUOTA_EXCEEDED 専用 UI を入れて
ユーザー体験は守ったが、根本的に枠が足りないので lite に切り替え。

## [0.4.3] - 2026-05-03 — エラー文言の細分化（魚啓蒙動画 + Gemini quota 専用 UI）

### Added
- **429 (自前 rate limit) 専用 UI**: `/api/coach` で 1 IP / 1 時間 10 回の上限に
  到達したとき、汎用エラー画面ではなく「魚を好きになれるよう、この洗脳動画を
  ご覧ください」という啓蒙メッセージと YouTube 動画 (youtube-nocookie 埋め込み)
  を表示。「上限に達するまで提案を求めるユーザーは、まだ魚を食べる意識が育って
  いない」という仮説に基づく啓蒙体験。
- **503 (Gemini quota 超過) 専用 UI**: Google Gemini API の本日の無料枠
  (gemini-2.5-flash は 20 req/day と非常に厳しい) に到達したとき、
  「本日分の AI 提案枠が尽きました。明日まで待つかしばらく時間を置いてください」
  と明示。アプリ側の問題ではなく Google 側の問題であることをユーザーに明確化。
- `lib/coach.ts` に `isGeminiQuotaError(message)` ヘルパ。SDK エラー文の
  `RESOURCE_EXHAUSTED` / `quota exceeded` / `exceeded your current quota` を検出。
  HTTP 429 単独では検出しない（自前 rate limit と紛らわしい）。
- `lib/coach.test.ts` に 8 ケース追加（quota 検出 5 + getCoachErrorCode 3）。

### Changed
- `CoachError.code` に `"RATE_LIMITED"` と `"QUOTA_EXCEEDED"` を追加
  （既存 INVALID_REQUEST / LLM_ERROR / TIMEOUT に加えて）。
- `app/api/coach/route.ts` の 429 レスポンスは `code: "RATE_LIMITED"` を返す。
- `app/api/coach/route.ts` の Gemini quota 検出時は **HTTP 503** + `code: "QUOTA_EXCEEDED"`
  を返す（自前 429 と区別、上流 API 不調の意味）。
- `components/CoachSection.tsx` に新 state `rate_limited` と `quota_exceeded` を追加。
  status / code どちらでも判定可能。
- `getCoachErrorCode` の戻り値型に `"QUOTA_EXCEEDED"` を追加。

## [0.4.2] - 2026-05-03 — レート制限 + リクエスト telemetry

### Added
- D1 ベースのレート制限を `/api/coach` に実装。1 IP / 1 時間で
  `COACH_RATE_LIMIT`（デフォルト 10）回まで。超過時は 429 + `Retry-After` ヘッダ。
- `request_log` テーブル (`migrations/0004_add_request_log.sql`)。全リクエストの
  endpoint / IP ハッシュ / status / timestamp を記録（429 含む）。
  telemetry first 設計 — abuse パターンを後で集計可能。
- `lib/d1.ts`: `d1Query`/`firstRow` を共有モジュールに抽出
  （`app/api/feedback/route.ts` から重複削除）。
- `lib/rate-limit.ts`: `getClientIp`, `hashIp`（SHA-256 + secret）,
  `checkRateLimit`, `logRequest`。
- `lib/rate-limit.test.ts`: 12 ケース（IP 抽出 6、ハッシュ決定性 6）。

### Security / Privacy
- IP は SHA-256 + `IP_HASH_SECRET`（環境変数）で 16 hex にハッシュ化して保存。
  生 IP は永続化しない。
- D1 環境変数が無い環境（local dev）では rate limit を自動 disable。

### Migration Notes
v0.4.2 デプロイ時、D1 マイグレーション実行が必須:
```bash
bun --env-file=.env.local run scripts/migrate-d1.ts
```
冪等。0003 がスキップ、0004 が APPLY される。

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
