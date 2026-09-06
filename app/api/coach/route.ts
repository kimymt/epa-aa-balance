import { NextResponse } from "next/server";
import {
  validateCoachBody,
  generateCoachRecipesStream,
  getCoachErrorCode,
  type CoachError,
} from "@/lib/coach";
import { enforceRateLimit } from "@/lib/rate-limit";
import { readLimitedJson, bodyErrorResponse } from "@/lib/request-body";

export const runtime = "nodejs";
export const maxDuration = 45;

const ENDPOINT = "/api/coach";
const RATE_LIMIT = Number(process.env.COACH_RATE_LIMIT ?? "5"); // req / window (v0.5.5: 10 → 5)
export async function POST(req: Request) {
  const denied = await enforceRateLimit(req, {
    endpoint: ENDPOINT, limit: RATE_LIMIT,
    globalLimit: Number(process.env.COACH_GLOBAL_LIMIT ?? "100"), burstLimit: 20,
  });
  if (denied) return denied;
  // ---------- 本処理 ----------
  let body: unknown;
  try {
    body = await readLimitedJson(req);
  } catch (error) {
    return bodyErrorResponse(error);
  }

  const validation = validateCoachBody(body);
  if (!validation.ok) {
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
  const abort = new AbortController();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let recipeCount = 0;

      try {
        for await (const event of generateCoachRecipesStream(validation.body, AbortSignal.any([req.signal, abort.signal]))) {
          if (event.type === "recipe") recipeCount++;
          if (!abort.signal.aborted) controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        }
        if (recipeCount === 0 && !abort.signal.aborted) {
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
        }
      } catch (err) {
        if (abort.signal.aborted) return;
        const code = getCoachErrorCode(err);
        let evMessage: string;
        if (code === "QUOTA_EXCEEDED") {
          console.warn("Gemini quota exceeded");
          evMessage = "AI 提案の本日分の枠が尽きました。明日また試してください。";
        } else if (code === "TIMEOUT") {
          evMessage = "提案の生成に時間がかかりすぎました。もう一度お試しください。";
        } else {
          console.error("Coach API streaming error");
          evMessage = "提案の生成中にエラーが発生しました。もう一度お試しください。";
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
        if (!abort.signal.aborted) controller.close();
      }
    },
    cancel() { abort.abort(); },
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
