-- v0.8.4: コーチ提案を DB に保存しない方針確定 (2026-05-09)
--
-- v0.8.1 で coach_proposals テーブルを作成したが、その後
-- 「利用しないデータは取らない」原則に従い保存方針を撤回した。
-- スキーマ整合性のためテーブル自体を削除する。
--
-- 注意: DROP TABLE は破壊的操作。既存の row (誤って追加された 1 件含む) は
-- 完全に消える。この方針は意図的、ユーザー確認済 (2026-05-09)。
--
-- 関連 index (idx_proposals_user_date) は SQLite の DROP TABLE で自動削除される。

DROP TABLE IF EXISTS coach_proposals;
