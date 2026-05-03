-- v0.4.2: API レート制限のための request_log テーブル
--
-- 目的:
--   1. Telemetry: どのエンドポイントが、どの IP (ハッシュ) から、いつ叩かれたか記録
--   2. Rate limit: 直近 N 分の同 IP リクエスト数で 429 判定
--
-- IP は SHA-256 + secret でハッシュ化したものを保存（生 IP は保存しない）。
-- secret は IP_HASH_SECRET 環境変数（未設定時は固定 fallback）。
--
-- 容量: 1 リクエストあたり ~80 bytes、月 100k 件で 8 MB 程度。
-- D1 無料枠 (5 GB) に対して十分余裕あり。
-- 古い row は将来 cron で TRUNCATE 予定（v0.4.x の cleanup は不要）。
--
-- マイグレーションは scripts/migrate-d1.ts で適用。冪等。

CREATE TABLE IF NOT EXISTS request_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint TEXT NOT NULL,           -- "/api/coach" など
  ip_hash TEXT NOT NULL,            -- SHA-256(secret + ":" + ip) の先頭 16 hex
  status INTEGER NOT NULL,          -- 返した HTTP status (200/429/500 等)
  created_at INTEGER NOT NULL       -- unix epoch ミリ秒
);

-- レート制限クエリ: WHERE endpoint = ? AND ip_hash = ? AND created_at > ?
-- 上記 3 列の複合 index で COUNT(*) を高速化。
CREATE INDEX IF NOT EXISTS idx_request_log_lookup
  ON request_log(endpoint, ip_hash, created_at);

-- Telemetry 集計用 (admin 等で「過去 1h で何件 429 出たか」を見るため)。
CREATE INDEX IF NOT EXISTS idx_request_log_status_ts
  ON request_log(status, created_at);
