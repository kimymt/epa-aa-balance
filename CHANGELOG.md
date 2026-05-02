# Changelog

All notable changes to this project will be documented in this file.

## [0.3.0] - Unreleased

### Planned
- TBD: Discuss with product

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
