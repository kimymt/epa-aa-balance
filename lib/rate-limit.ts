// API レート制限 + リクエスト telemetry (v0.4.2)
//
// 設計方針:
//   - "telemetry first": 全リクエストを request_log に記録（429 含む）。
//     後で集計クエリで abuse パターンを見られるように。
//   - 実装は D1 ベース（KV/Upstash 不要、既存依存だけで完結）。
//   - IP は SHA-256 でハッシュ化して保存（生 IP は保存しない）。
//   - Sliding window: 直近 windowMs ミリ秒内の同 IP リクエスト数を COUNT。
//
// パフォーマンス想定:
//   - D1 round-trip ~50-100ms × 2 (check + log) = 100-200ms 追加。
//   - /api/coach は元々 5-15 秒なので体感影響なし。
//   - /api/feedback は薄い endpoint だが今回は適用しない（abuse 価値が低い）。
//
// 将来:
//   - v0.4.x の cron で 30 日以上前の log を TRUNCATE。
//   - admin 画面で「直近 1h の 429 件数」を可視化（v0.4.3 候補）。

import { createHash } from "node:crypto";
import { d1Query, firstRow } from "./d1";

const DEFAULT_HASH_SECRET = "eaa-scorer-default-no-secret-set";

/**
 * `x-forwarded-for` から最初の IP を取り出す。Vercel は左端が client IP。
 * ヘッダがなければ `"unknown"` を返す（local dev、curl 等）。
 */
export function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

/**
 * IP を SHA-256 + secret でハッシュ化、先頭 16 hex を返す。
 * secret は IP_HASH_SECRET 環境変数（未設定時は固定 fallback、本番では設定推奨）。
 */
export function hashIp(ip: string, secret?: string): string {
  const s = secret ?? process.env.IP_HASH_SECRET ?? DEFAULT_HASH_SECRET;
  return createHash("sha256").update(`${s}:${ip}`).digest("hex").slice(0, 16);
}

export interface RateLimitResult {
  /** 直近 window 内の同 IP リクエスト数（今回のリクエストを含まない事前カウント） */
  count: number;
  /** limit 未満なら true (= 通してよい) */
  allowed: boolean;
  /** あと何件まで送れるか（最低 0） */
  remaining: number;
  /** Retry-After ヘッダに入れる秒数（最も古い該当 row が window 外に出るまで） */
  retryAfterSec: number;
}

/**
 * 直近 windowMs 内の同 (endpoint, ipHash) リクエスト数を D1 から取得し、
 * limit と比較して結果を返す。**まだログには書き込まない**（呼び出し側が
 * 最終 status を渡して logRequest する）。
 */
export async function checkRateLimit(params: {
  endpoint: string;
  ipHash: string;
  limit: number;
  windowMs: number;
  now?: number;
}): Promise<RateLimitResult> {
  const now = params.now ?? Date.now();
  const since = now - params.windowMs;

  const resp = await d1Query<{ cnt: number; oldest: number | null }>(
    `SELECT COUNT(*) AS cnt, MIN(created_at) AS oldest
     FROM request_log
     WHERE endpoint = ? AND ip_hash = ? AND created_at > ?`,
    [params.endpoint, params.ipHash, since]
  );
  const row = firstRow(resp) ?? { cnt: 0, oldest: null };
  const count = Number(row.cnt) || 0;
  const allowed = count < params.limit;
  const remaining = Math.max(0, params.limit - count - (allowed ? 1 : 0));
  // 最古 row が window から抜けるまでの秒数。limit 未到達なら 0。
  const retryAfterSec = allowed
    ? 0
    : row.oldest
      ? Math.max(1, Math.ceil((Number(row.oldest) + params.windowMs - now) / 1000))
      : 60;

  return { count, allowed, remaining, retryAfterSec };
}

/**
 * リクエスト 1 件を request_log に記録。429 含めて全件入れる。
 * 失敗しても呼び出し側に throw せず console.warn のみ（telemetry のために
 * 本番ロジックを止めたくない）。
 */
export async function logRequest(params: {
  endpoint: string;
  ipHash: string;
  status: number;
  now?: number;
}): Promise<void> {
  try {
    await d1Query(
      `INSERT INTO request_log (endpoint, ip_hash, status, created_at)
       VALUES (?, ?, ?, ?)`,
      [params.endpoint, params.ipHash, params.status, params.now ?? Date.now()]
    );
  } catch (e) {
    console.warn("rate-limit: logRequest failed:", e instanceof Error ? e.message : e);
  }
}
