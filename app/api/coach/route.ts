// AI コーチング・レシピ提案 API endpoint (v0.4.0-alpha → v0.8.0)
//
// POST /api/coach
//   Request:  CoachRequest (lib/coach.ts 参照)
//   Response:
//     - 200 OK + Content-Type: application/x-ndjson (v0.8.0): NDJSON ストリーム。
//       1 行 = 1 イベント:
//         {"type":"recipe","index":N,"recipe":{...}}
//         {"type":"complete","retried":false}
//         {"type":"error","code":"TIMEOUT|LLM_ERROR|QUOTA_EXCEEDED","message":"..."}
//       (recipe イベントは Gemini ストリームから 1 件確定するたびに送信)
//     - 400 / 429 / 503: 従来通り JSON (CoachError shape) でエラー返却。
//
// v0.8.0: ストリーミング化 (体感 ~50% 短縮)。Gemini からの token streaming を
// partial-json で逐次パース、Recipe が完結するたびに NDJSON で client へ送る。
// fish-only / cookingMethod 検証はストリーム完結後の wrapper 側で実施 (途中 emit を
// 止めない方針、UX 体験優先)。
//
// Vercel maxDuration 45 秒以内 (出力 token 増で実測 ~10-25 秒、最初の recipe は ~6-10s)。
//
// v0.4.2: D1 ベースのレート制限を追加。
//   - 1 IP あたり 1 時間に COACH_RATE_LIMIT 回（デフォルト 5、v0.5.5 で 10 → 5 に引き下げ）まで。
//   - 全リクエストを request_log に記録（429 含む）→ telemetry first。
//   - D1 環境変数が無い環境（local dev 等）では rate limit を無効化。

import { NextResponse } from "next/server";
import {
  validateCoachBody,
  generateCoachRecipesStream,
  getCoachErrorCode,
  type CoachError,
} from "@/lib/coach";
import { checkRateLimit, getClientIp, hashIp, logRequest } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 45;

const ENDPOINT = "/api/coach";
const RATE_LIMIT = Number(process.env.COACH_RATE_LIMIT ?? "5"); // req / window (v0.5.5: 10 → 5)
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

  // ---------- v0.8.0: NDJSON streaming response ----------
  // Gemini からの token streaming を partial-json で逐次パースし、Recipe が
  // 1 件確定するたびに NDJSON で client へ送る。エラーはストリーム内 event として
  // 送る (200 で開始済の HTTP response status は変えられないため)。
  // ストリーム開始 *前* のエラー (validation / rate limit) は従来通り JSON 返却。
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let recipeCount = 0;
      let endStatus = 200;
      try {
        for await (const event of generateCoachRecipesStream(validation.body)) {
          if (event.type === "recipe") recipeCount++;
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        }
        if (recipeCount === 0) {
          // ストリーム完結したが 1 件も recipe が出なかった = LLM_ERROR 相当
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: "error",
                code: "LLM_ERROR",
                message: "レシピを生成できませんでした。再度お試しください。",
              }) + "\n"
            )
          );
          endStatus = 500;
        }
      } catch (err) {
        const code = getCoachErrorCode(err);
        let evMessage: string;
        if (code === "QUOTA_EXCEEDED") {
          console.warn("Gemini quota exceeded:", err instanceof Error ? err.message : err);
          evMessage = "AI 提案の本日分の枠が尽きました。明日また試してください。";
          endStatus = 503;
        } else if (code === "TIMEOUT") {
          evMessage = "提案の生成に時間がかかりすぎました。もう一度お試しください。";
          endStatus = 500;
        } else {
          console.error("Coach API streaming error:", err);
          evMessage = "提案の生成中にエラーが発生しました。もう一度お試しください。";
          endStatus = 500;
        }
        controller.enqueue(
          encoder.encode(
            JSON.stringify({
              type: "error",
              code: code ?? "LLM_ERROR",
              message: evMessage,
            }) + "\n"
          )
        );
      } finally {
        controller.close();
        // 後追い telemetry (close 後、待たない)
        if (rateLimitEnabled) {
          logRequest({ endpoint: ENDPOINT, ipHash, status: endStatus }).catch(() => {});
        }
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      // ストリーミング示唆 (Vercel / Cloudflare バッファ抑制を促す)
      "X-Accel-Buffering": "no",
    },
  });
}
