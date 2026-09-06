// Atomic admission reservations. Rejected requests never create log rows.
import { createHash, randomUUID } from "node:crypto";
import { d1Query } from "./d1";

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

export const RESERVE_SQL = `INSERT INTO rate_reservations (id, endpoint, ip_hash, units, created_at)
SELECT ?, ?, ?, ?, ?
WHERE (SELECT COUNT(*) FROM rate_reservations WHERE endpoint = ? AND ip_hash = ? AND created_at > ?) < ?
  AND (SELECT COALESCE(SUM(units), 0) FROM rate_reservations WHERE endpoint = ? AND created_at > ?) + ? <= ?
  AND (SELECT COALESCE(SUM(units), 0) FROM rate_reservations WHERE endpoint = ? AND created_at > ?) + ? <= ?
RETURNING id`;

export interface AdmissionPolicy {
  endpoint: string;
  limit: number;
  globalLimit: number;
  burstLimit: number;
  units?: number;
}

export async function reserveRateLimit(policy: AdmissionPolicy, ipHash: string, now = Date.now()): Promise<boolean> {
  const units = policy.units ?? 1;
  if (![policy.limit, policy.globalLimit, policy.burstLimit, units].every((n) => Number.isSafeInteger(n) && n > 0)) {
    throw new Error("Invalid rate limit configuration");
  }
  // D1 serializes writes; all three conditions and the insert are one statement.
  // The global 60s budget also bounds overlap for the 45s AI handlers.
  const resp = await d1Query<{ id: string }>(RESERVE_SQL, [
    randomUUID(), policy.endpoint, ipHash, units, now,
    policy.endpoint, ipHash, now - 3600000, policy.limit,
    policy.endpoint, now - 3600000, units, policy.globalLimit,
    policy.endpoint, now - 60000, units, policy.burstLimit,
  ]);
  return resp.result![0].results.length === 1;
}

export async function enforceRateLimit(req: Request, policy: AdmissionPolicy): Promise<Response | null> {
  try {
    if (await reserveRateLimit(policy, hashIp(getClientIp(req)))) return null;
    return Response.json({ error: "利用上限に達しました。時間をおいて再度お試しください。", code: "RATE_LIMITED" }, {
      status: 429, headers: { "Retry-After": "3600", "Cache-Control": "no-store" },
    });
  } catch {
    // Missing credentials, missing migration, transport and SQL errors all fail closed.
    console.warn("Rate limit admission unavailable");
    return Response.json({ error: "現在サービスを利用できません。時間をおいて再度お試しください。", code: "SERVICE_UNAVAILABLE" }, {
      status: 503, headers: { "Retry-After": "60", "Cache-Control": "no-store" },
    });
  }
}
