-- v0.8.5: Passkey/暗号化機能のロールバックに伴うテーブル削除
--
-- v0.8.1 で migration 0005 が作成した 3 テーブルを削除する。
-- いずれも実利用前の段階 (production deploy 後にユーザーへ UI 露出する
-- 前) で機能ごと撤去したため、データ移行は不要。row 数 0 を前提に DROP。
--
-- 削除対象:
--   - users               (Passkey ユーザー、v0.8.1 で追加)
--   - user_credentials    (Passkey 公開鍵 / counter、v0.8.1 で追加)
--   - analyses            (E2E 暗号化解析履歴、v0.8.1 で追加、v0.8.4 で
--                          初めて利用予定だった)
--
-- 注意: DROP TABLE は破壊的操作。idempotent にするため IF EXISTS を付ける。
-- 関連 index は SQLite の DROP TABLE で自動削除される。

DROP TABLE IF EXISTS analyses;
DROP TABLE IF EXISTS user_credentials;
DROP TABLE IF EXISTS users;
