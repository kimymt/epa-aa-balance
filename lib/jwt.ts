// JWT 発行・検証 (v0.8.1)
//
// 用途:
//   - Passkey 認証成功時にユーザーへ session token を発行
//   - 後続 API リクエストの Authorization Bearer ヘッダで検証
//
// 設計:
//   - HMAC-SHA256 (HS256) 署名、stateless (server に session ストア不要)
//   - TTL 24h (定数、必要なら env で上書き)
//   - payload は user_id のみ (PII を含まない)
//
// セキュリティ:
//   - JWT_SECRET は 32 byte 以上のランダム値 (`openssl rand -hex 32` 等)
//   - 開発環境のみ test fallback を許容、本番は設定必須

import { SignJWT, jwtVerify, errors as joseErrors } from "jose";

const ALG = "HS256";
const ISSUER = "eaa-scorer";

/**
 * JWT 発行に使う秘密鍵を取得 (Uint8Array 化)。
 * 本番では JWT_SECRET 必須。dev/test では fallback を許容するが警告を出す。
 */
function getSecret(): Uint8Array {
  const raw = process.env.JWT_SECRET;
  if (!raw) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "JWT_SECRET is required in production. Set a 32+ byte random value."
      );
    }
    // dev/test の fallback (テストや local development 用)
    return new TextEncoder().encode(
      "dev-only-fallback-secret-do-not-use-in-production-32bytes"
    );
  }
  // hex / base64 / utf8 のいずれを許容するか — 単純化のため utf8 そのまま使う。
  // 32 bytes 以上を強く推奨 (短いと HS256 の鍵として弱い)。
  if (raw.length < 32) {
    console.warn(
      `JWT_SECRET is shorter than 32 chars (${raw.length}). Use a longer random value for production.`
    );
  }
  return new TextEncoder().encode(raw);
}

export interface SessionPayload {
  userId: string;
}

/** 24h TTL の session token を発行。 */
export async function issueSessionToken(userId: string): Promise<string> {
  const secret = getSecret();
  return await new SignJWT({ userId })
    .setProtectedHeader({ alg: ALG })
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(secret);
}

/**
 * 短命 (5min) の registration session token を発行。
 * `register/start` → `register/finish` の間で challenge と pending user_id を
 * 紐付けるためだけの一時 token。
 */
export async function issueRegistrationToken(payload: {
  userId: string;
  challenge: string;
}): Promise<string> {
  const secret = getSecret();
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: ALG })
    .setIssuer(ISSUER + ":registration")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(secret);
}

/** 短命 (5min) の login session token を発行 (login/start → login/finish 用) */
export async function issueLoginToken(payload: {
  challenge: string;
}): Promise<string> {
  const secret = getSecret();
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: ALG })
    .setIssuer(ISSUER + ":login")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(secret);
}

export type VerifyResult<T> =
  | { ok: true; payload: T }
  | { ok: false; reason: "expired" | "invalid" };

async function verifyTokenInternal<T>(
  token: string,
  expectedIssuer: string
): Promise<VerifyResult<T>> {
  const secret = getSecret();
  try {
    const { payload } = await jwtVerify(token, secret, {
      issuer: expectedIssuer,
      algorithms: [ALG],
    });
    return { ok: true, payload: payload as T };
  } catch (err) {
    if (err instanceof joseErrors.JWTExpired) {
      return { ok: false, reason: "expired" };
    }
    return { ok: false, reason: "invalid" };
  }
}

/** 24h session token の検証。 */
export function verifySessionToken(
  token: string
): Promise<VerifyResult<SessionPayload>> {
  return verifyTokenInternal<SessionPayload>(token, ISSUER);
}

/** registration token の検証 (5min)。 */
export function verifyRegistrationToken(
  token: string
): Promise<VerifyResult<{ userId: string; challenge: string }>> {
  return verifyTokenInternal(token, ISSUER + ":registration");
}

/** login token の検証 (5min)。 */
export function verifyLoginToken(
  token: string
): Promise<VerifyResult<{ challenge: string }>> {
  return verifyTokenInternal(token, ISSUER + ":login");
}

/**
 * Authorization: Bearer ヘッダから token を取り出す。
 * ない / 形式不正 / 検証失敗ならいずれも null。
 */
export async function readBearerSession(
  authHeader: string | null
): Promise<SessionPayload | null> {
  if (!authHeader) return null;
  const m = /^Bearer\s+(.+)$/i.exec(authHeader);
  if (!m) return null;
  const result = await verifySessionToken(m[1]);
  return result.ok ? result.payload : null;
}

/**
 * 保護されたルート用のヘルパ (v0.8.2):
 *   - リクエストの Authorization ヘッダを読んで session を返す
 *   - 認証されていない場合は 401 Response を返す
 *
 * 使い方:
 *   const auth = await requireSession(req);
 *   if ("response" in auth) return auth.response;
 *   const { userId } = auth.session;
 *   // 以降 userId 使った処理
 */
export async function requireSession(
  req: Request
): Promise<{ session: SessionPayload } | { response: Response }> {
  const session = await readBearerSession(req.headers.get("authorization"));
  if (!session) {
    return {
      response: new Response(
        JSON.stringify({
          error: "認証が必要です。",
          code: "UNAUTHORIZED",
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }
      ),
    };
  }
  return { session };
}
