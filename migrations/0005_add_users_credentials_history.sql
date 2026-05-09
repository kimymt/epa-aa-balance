-- v0.8.1: Anonymous user + Passkey credential + 暗号化された履歴の基盤テーブル群
--
-- 設計原則:
--   * PII は一切持たない (氏名・メール・電話番号等は schema 上スキーマ無し)
--   * 履歴データは AES-GCM で暗号化された ciphertext のみ保存
--     (暗号鍵は WebAuthn PRF Extension でクライアント端末でのみ導出される)
--   * Cloudflare の at-rest 暗号化に加えてアプリケーション層 E2E 暗号化を実現
--
-- マイグレーションは scripts/migrate-d1.ts で適用、冪等。

-- ユーザー: 履歴機能を opt-in したユーザーのみ存在 (匿名解析だけのユーザーは行を持たない)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,                    -- UUID v7 (時系列ソート可)
  created_at INTEGER NOT NULL             -- unix epoch ms
  -- 個人情報フィールドは存在しない (今後も追加しない方針)
);

-- WebAuthn / Passkey credentials
-- 1 user 1 credential が現状仕様 (multi-credential は将来拡張)
-- iCloud / Google passkey 同期で実質的に複数端末で使えるが、登録は 1 回のみ
--
-- BLOB ではなく TEXT (base64) で保管: D1 REST API は params 型が
-- string|number|null のみで raw bytes を受け取れないため
CREATE TABLE IF NOT EXISTS user_credentials (
  user_id TEXT NOT NULL,
  credential_id TEXT NOT NULL,            -- base64url エンコード
  public_key TEXT NOT NULL,               -- COSE public key を base64
  counter INTEGER NOT NULL,               -- WebAuthn signature counter (replay 防止)
  device_label TEXT,                      -- "Device 1" 等の自動採番、編集不可
  prf_supported INTEGER NOT NULL DEFAULT 0,  -- 0/1: PRF Extension 使えたか (登録時に検出)
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, credential_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- credential_id 単独でも検索する (auth/login で credential が来たとき user_id を引く)
CREATE INDEX IF NOT EXISTS idx_credentials_credid ON user_credentials(credential_id);

-- 食事解析の履歴 (暗号化済み ciphertext のみ保存)
-- 平文での lipid_pct / epa_mg 等は持たない (philosophy: even 開発者が読めない)
-- グラフは client-side でデクリプト後に描画する
CREATE TABLE IF NOT EXISTS analyses (
  id TEXT PRIMARY KEY,                    -- UUID v7
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  cipher_blob TEXT NOT NULL,              -- AES-GCM(IV || ciphertext || auth_tag) を base64
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_analyses_user_date ON analyses(user_id, created_at DESC);

-- AI コーチ提案の履歴 (暗号化済み)
CREATE TABLE IF NOT EXISTS coach_proposals (
  id TEXT PRIMARY KEY,                    -- UUID v7
  user_id TEXT NOT NULL,
  analysis_id TEXT,                       -- 関連 analyses.id (null 可)
  created_at INTEGER NOT NULL,
  cipher_blob TEXT NOT NULL,              -- recipes_json + refinement_json を暗号化
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (analysis_id) REFERENCES analyses(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_proposals_user_date ON coach_proposals(user_id, created_at DESC);
