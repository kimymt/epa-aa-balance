// AI コーチング・レシピ提案 API endpoint (v0.4.0-alpha)
//
// POST /api/coach
//   Request: CoachRequest (lib/coach.ts 参照)
//   Response: CoachResponse on 200, CoachError on 400/500
//
// Vercel maxDuration 45 秒以内 (実測 5-15 秒)。Rate limit は v0.4.0-alpha では未実装。

import { NextResponse } from "next/server";
import {
  validateCoachBody,
  generateCoachRecipes,
  getCoachErrorCode,
  type CoachError,
} from "@/lib/coach";

export const runtime = "nodejs";
export const maxDuration = 45;

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json<CoachError>(
      { error: "リクエストの形式が不正です。", code: "INVALID_REQUEST" },
      { status: 400 }
    );
  }

  const validation = validateCoachBody(body);
  if (!validation.ok) {
    return NextResponse.json<CoachError>(
      { error: `リクエストの形式が不正です (${validation.reason})`, code: "INVALID_REQUEST" },
      { status: 400 }
    );
  }

  try {
    const result = await generateCoachRecipes(validation.body);
    if (result.recipes.length === 0) {
      return NextResponse.json<CoachError>(
        { error: "レシピを生成できませんでした。再度お試しください。", code: "LLM_ERROR" },
        { status: 500 }
      );
    }
    return NextResponse.json(result);
  } catch (err) {
    const code = getCoachErrorCode(err);
    if (code === "TIMEOUT") {
      return NextResponse.json<CoachError>(
        { error: "提案の生成に時間がかかりすぎました。もう一度お試しください。", code: "TIMEOUT" },
        { status: 500 }
      );
    }
    console.error("Coach API error:", err);
    return NextResponse.json<CoachError>(
      { error: "提案の生成中にエラーが発生しました。もう一度お試しください。", code: "LLM_ERROR" },
      { status: 500 }
    );
  }
}
