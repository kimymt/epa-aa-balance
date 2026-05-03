// HTTP Basic Auth helpers (extracted for testability).
//
// v0.4.6: 認証文字列比較を constant-time 化（lib/timing-safe.ts）。
// 旧 `provided !== expectedB64` だと早期 return でタイミング攻撃に脆弱。

import { constantTimeStringEqual } from "./timing-safe";

export type AuthCheckResult =
  | { ok: true }
  | { ok: false; reason: "missing-config" | "missing-header" | "wrong-creds" };

/**
 * Check whether an Authorization header satisfies Basic auth against
 * an expected "username:password" string.
 *
 * - Returns "missing-config" if no expected value is provided.
 * - Returns "missing-header" if the header is absent or not Basic.
 * - Returns "wrong-creds" if base64 doesn't match.
 * - Returns ok:true on a match.
 */
export function checkBasicAuth(
  authHeader: string | null,
  expected: string | undefined
): AuthCheckResult {
  if (!expected) {
    return { ok: false, reason: "missing-config" };
  }
  if (!authHeader || !authHeader.startsWith("Basic ")) {
    return { ok: false, reason: "missing-header" };
  }
  const provided = authHeader.slice(6).trim();
  const expectedB64 = btoa(expected);
  if (!constantTimeStringEqual(provided, expectedB64)) {
    return { ok: false, reason: "wrong-creds" };
  }
  return { ok: true };
}
