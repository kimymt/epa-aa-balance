# Changelog

All notable changes to this project will be documented in this file.

## [0.3.0] - Unreleased

### Planned (新方針 — 2026-05-02)
- **計算ロジックを脂質ベースに移行**：現状「魚タンパク質 / 総タンパク質」を
  プロキシとして使っているが、本来の EPA/AA 比は脂肪酸（脂質）の比率。
  食材データに脂肪酸成分を追加し、計算式を実 EPA/AA 比に変更する。
- データソース：MEXT 食品成分表 脂肪酸成分表編 2020 ed.
- 全 57 品目に `epa_mg`, `dha_mg`, `aa_mg`, `total_lipid_g` 追加
- `lib/analyzer.ts` の計算式更新
- `lib/standards.ts` の閾値再検討（脂質比での妥当な閾値を栄養学エビデンスから設定）
- UI 文言の「タンパク質」表記を「脂質」「EPA」に全置換
- README, CHANGELOG 説明文の刷新

### Deferred to v0.4.0
- AI コーチング・レシピ提案機能（脂質ベース計算が完了してから着手）
- 設計ドキュメント: `~/.gstack/projects/kimymt-epa-aa-balance/likemike-main-design-20260502-145712.md`
- プロトタイプ: `designs/coach-section-20260502/finalized.html`

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
