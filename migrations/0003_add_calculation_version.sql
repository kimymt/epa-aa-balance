-- v0.3.0-beta: feedback テーブルに calculation_version 列追加
--
-- v0.2.0 (タンパク質ベース計算) と v0.3.0+ (脂質ベース計算) を区別する。
-- 既存レコードは backfill で全て version=1 (タンパク質) になる。
-- 新規レコード (v0.3.0-beta 以降) は app/api/feedback/route.ts で version=2 を明示。
--
-- このマイグレーションは scripts/migrate-d1.ts で適用。
-- PRAGMA table_info(feedback) で列存在確認 → 既存ならスキップ (idempotent)。
--
-- D1 (SQLite) は IF NOT EXISTS を ALTER TABLE ADD COLUMN でサポートしないため、
-- 列存在チェックは scripts/migrate-d1.ts のロジック側で行う。

ALTER TABLE feedback ADD COLUMN calculation_version INTEGER NOT NULL DEFAULT 1;

-- DEFAULT 1 が ALTER TABLE 時点で既存全行に適用される (SQLite 仕様)。
-- 念のため明示的に backfill も実施 (既に 1 が入っているはずだが冪等)。
UPDATE feedback SET calculation_version = 1 WHERE calculation_version IS NULL;
