// HTTP Basic Auth helpers (extracted for testability).

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
  if (provided !== expectedB64) {
    return { ok: false, reason: "wrong-creds" };
  }
  return { ok: true };
}
