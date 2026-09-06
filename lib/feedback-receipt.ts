import { createHmac, createHash, randomUUID } from "node:crypto";
import { constantTimeStringEqual } from "./timing-safe";

export function feedbackSigningSecret(): string {
  const secret = process.env.FEEDBACK_SIGNING_SECRET;
  if (!secret || secret.length < 32) throw new Error("FEEDBACK_SIGNING_SECRET must contain at least 32 characters");
  return secret;
}
function digest(mealType: string, foods: unknown): string {
  return createHash("sha256").update(JSON.stringify([mealType, foods])).digest("hex");
}
function signature(payload: string): string {
  return createHmac("sha256", feedbackSigningSecret()).update(payload).digest("base64url");
}
export function createFeedbackReceipt(mealType: string, foods: unknown, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ id: randomUUID(), exp: now + 3600000, digest: digest(mealType, foods) })).toString("base64url");
  return `${payload}.${signature(payload)}`;
}
export function verifyFeedbackReceipt(token: unknown, mealType: string, foods: unknown, now = Date.now()): string | null {
  if (typeof token !== "string" || token.length > 1024) return null;
  const parts = token.split(".");
  if (parts.length !== 2 || !constantTimeStringEqual(parts[1], signature(parts[0]))) return null;
  try {
    const value = JSON.parse(Buffer.from(parts[0], "base64url").toString());
    if (typeof value.id !== "string" || !/^[0-9a-f-]{36}$/.test(value.id) ||
        !Number.isSafeInteger(value.exp) || value.exp <= now || value.exp > now + 3600000 ||
        value.digest !== digest(mealType, foods)) return null;
    return `feedback-${value.id}`;
  } catch { return null; }
}
