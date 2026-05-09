-- v0.8.5: Passkey/暗号化機能のロールバックに伴うテーブル削除
--
-- v0.8.1 で migration 0005 が作成した 4 テーブルを削除する。
-- いずれも実利用前の段階 (production deploy 後にユーザーへ UI 露出する
-- 前) で機能ごと撤去したため、データ移行は不要。
--
-- 削除対象:
--   - coach_proposals     (AI コーチ提案履歴、v0.8.1 で追加、未使用)
--   - analyses            (E2E 暗号化解析履歴、v0.8.1 で追加、v0.8.4 で
--                          初めて利用予定だった)
--   - user_credentials    (Passkey 公開鍵 / counter、v0.8.1 で追加)
--   - users               (Passkey ユーザー、v0.8.1 で追加)
--
-- 削除順序: FK 制約の親側 (users / analyses) を後にする。
--   coach_proposals は users / analyses 両方に FK を持つので最初に DROP。
--   analyses は users に FK を持つので user_credentials の前後どちらでも可。
--   users は他から参照されない状態にしてから最後に DROP。
--
-- 注意: DROP TABLE は破壊的操作。idempotent にするため IF EXISTS を付ける。
-- 関連 index は SQLite の DROP TABLE で自動削除される。

DROP TABLE IF EXISTS coach_proposals;
DROP TABLE IF EXISTS analyses;
DROP TABLE IF EXISTS user_credentials;
DROP TABLE IF EXISTS users;
