// AI コーチング・レシピ提案 API endpoint (v0.4.0-alpha → v0.4.2)
//
// POST /api/coach
//   Request: CoachRequest (lib/coach.ts 参照)
//   Response: CoachResponse on 200, CoachError on 400/429/500
//
// Vercel maxDuration 45 秒以内 (実測 5-15 秒)。
//
// v0.4.2: D1 ベースのレート制限を追加。
//   - 1 IP あたり 1 時間に COACH_RATE_LIMIT 回（デフォルト 10）まで。
//   - 全リクエストを request_log に記録（429 含む）→ telemetry first。
//   - D1 環境変数が無い環境（local dev 等）では rate limit を無効化。

import { NextResponse } from "next/server";
import {
  validateCoachBody,
  generateCoachRecipes,
  getCoachErrorCode,
  type CoachError,
} from "@/lib/coach";
import { checkRateLimit, getClientIp, hashIp, logRequest } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 45;

const ENDPOINT = "/api/coach";
const RATE_LIMIT = Number(process.env.COACH_RATE_LIMIT ?? "10"); // req / window
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

/** D1 が設定されているか（local dev で disable するため） */
function isD1Configured(): boolean {
  return Boolean(
    process.env.CLOUDFLARE_ACCOUNT_ID &&
      process.env.CLOUDFLARE_D1_DATABASE_ID &&
      process.env.CLOUDFLARE_API_TOKEN
  );
}

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const ipHash = hashIp(ip);
  const rateLimitEnabled = isD1Configured();

  // ---------- Rate limit (D1 設定時のみ) ----------
  if (rateLimitEnabled) {
    try {
      const rl = await checkRateLimit({
        endpoint: ENDPOINT,
        ipHash,
        limit: RATE_LIMIT,
        windowMs: RATE_WINDOW_MS,
      });
      if (!rl.allowed) {
        await logRequest({ endpoint: ENDPOINT, ipHash, status: 429 });
        return NextResponse.json<CoachError>(
          {
            // v0.4.3: メッセージは UI 側の「魚啓蒙」表示に置き換わるので、
            // ここでは fallback 用の中立な文言のみ返す。Retry-After は引き続き設定。
            error: `リクエスト過多です。${rl.retryAfterSec} 秒後に再試行してください。`,
            code: "RATE_LIMITED",
          },
          {
            status: 429,
            headers: {
              "Retry-After": String(rl.retryAfterSec),
              "X-RateLimit-Limit": String(RATE_LIMIT),
              "X-RateLimit-Remaining": "0",
            },
          }
        );
      }
    } catch (e) {
      // rate-limit DB 不調でも本番ロジックは止めない（telemetry 失敗で
      // ユーザー体験を壊さない方針）。次回 logRequest も同様に try/catch 内。
      console.warn("rate-limit check failed:", e instanceof Error ? e.message : e);
    }
  }

  // ---------- 本処理 ----------
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    if (rateLimitEnabled) {
      await logRequest({ endpoint: ENDPOINT, ipHash, status: 400 });
    }
    return NextResponse.json<CoachError>(
      { error: "リクエストの形式が不正です。", code: "INVALID_REQUEST" },
      { status: 400 }
    );
  }

  const validation = validateCoachBody(body);
  if (!validation.ok) {
    if (rateLimitEnabled) {
      await logRequest({ endpoint: ENDPOINT, ipHash, status: 400 });
    }
    return NextResponse.json<CoachError>(
      { error: `リクエストの形式が不正です (${validation.reason})`, code: "INVALID_REQUEST" },
      { status: 400 }
    );
  }

  try {
    const result = await generateCoachRecipes(validation.body);
    if (result.recipes.length === 0) {
      if (rateLimitEnabled) {
        await logRequest({ endpoint: ENDPOINT, ipHash, status: 500 });
      }
      return NextResponse.json<CoachError>(
        { error: "レシピを生成できませんでした。再度お試しください。", code: "LLM_ERROR" },
        { status: 500 }
      );
    }
    if (rateLimitEnabled) {
      await logRequest({ endpoint: ENDPOINT, ipHash, status: 200 });
    }
    return NextResponse.json(result);
  } catch (err) {
    const code = getCoachErrorCode(err);
    // Gemini quota は 503 (upstream 不調)、それ以外は 500。自前 rate limit (429) と
    // 区別するため上流 quota は 503 を選択。
    const httpStatus = code === "QUOTA_EXCEEDED" ? 503 : 500;
    if (rateLimitEnabled) {
      await logRequest({ endpoint: ENDPOINT, ipHash, status: httpStatus });
    }
    if (code === "TIMEOUT") {
      return NextResponse.json<CoachError>(
        { error: "提案の生成に時間がかかりすぎました。もう一度お試しください。", code: "TIMEOUT" },
        { status: 500 }
      );
    }
    if (code === "QUOTA_EXCEEDED") {
      // 文言は UI 側 (CoachSection の quota_exceeded state) で出すので、ここの
      // error フィールドは fallback テキストのみ。
      console.warn("Gemini quota exceeded:", err instanceof Error ? err.message : err);
      return NextResponse.json<CoachError>(
        {
          error: "AI 提案の本日分の枠が尽きました。明日また試してください。",
          code: "QUOTA_EXCEEDED",
        },
        { status: 503 }
      );
    }
    console.error("Coach API error:", err);
    return NextResponse.json<CoachError>(
      { error: "提案の生成中にエラーが発生しました。もう一度お試しください。", code: "LLM_ERROR" },
      { status: 500 }
    );
  }
}
