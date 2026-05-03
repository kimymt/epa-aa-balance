import { NextResponse } from "next/server";
import { analyzePhoto, VisionError } from "@/lib/vision";
import { analyze } from "@/lib/analyzer";
import {
  type AnalysisSessionResult,
  type MealTypeValue,
  computeAggregate,
} from "@/lib/session";
// v0.4.5: D1 ベースのレート制限（/api/coach と同パターン、同 D1 テーブル `request_log` 共有）。
// 1 リクエスト最大 9 並列 Vision 呼び出しなので、エンドポイントとしては coach より重い。
import { checkRateLimit, getClientIp, hashIp, logRequest } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 45;

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB per image
const MAX_IMAGES = 9;
const ALLOWED_MIMES = ["image/jpeg", "image/png", "image/webp"];

const ENDPOINT = "/api/analyze";
// 正当ユーザーの実需要 ≒ 3〜5 req/h (1 ヶ月分まとめ入れの outlier でも 10 req)。
// 10/h なら平均使用の 2〜3 倍バッファ。env で変更可。/api/coach (10/h) と整合。
const RATE_LIMIT = Number(process.env.ANALYZE_RATE_LIMIT ?? "10");
const RATE_WINDOW_MS = 60 * 60 * 1000;

/** D1 が設定されているか（local dev で disable するため、coach と同じ判定） */
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

  // 各 return path で呼ぶ telemetry helper。disabled なら no-op。
  const logIfEnabled = (status: number): Promise<void> =>
    rateLimitEnabled
      ? logRequest({ endpoint: ENDPOINT, ipHash, status })
      : Promise.resolve();

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
        return NextResponse.json(
          {
            error: `画像解析の上限に達しました。${rl.retryAfterSec} 秒後に再試行してください。`,
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
      // rate-limit DB 不調でも本番ロジックは止めない (telemetry 失敗で UX を壊さない)
      console.warn("rate-limit check failed:", e instanceof Error ? e.message : e);
    }
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    await logIfEnabled(400);
    return NextResponse.json(
      { error: "リクエストの形式が不正です。" },
      { status: 400 },
    );
  }

  // Get all photos and meal types
  const files = formData.getAll("photo") as Blob[];
  const mealTypes = formData.getAll("mealType") as string[];

  // Validate file count
  if (files.length === 0) {
    await logIfEnabled(400);
    return NextResponse.json(
      { error: "写真がアップロードされていません。" },
      { status: 400 },
    );
  }

  if (files.length > MAX_IMAGES) {
    await logIfEnabled(400);
    return NextResponse.json(
      { error: `最大${MAX_IMAGES}枚までアップロードできます。` },
      { status: 400 },
    );
  }

  // Validate meal types array length matches files
  if (mealTypes.length !== files.length) {
    await logIfEnabled(400);
    return NextResponse.json(
      { error: "すべての写真に食事タイプを指定してください。" },
      { status: 400 },
    );
  }

  // Validate each file
  const validatedFiles: Array<{ bytes: ArrayBuffer; mime: string; mealType: MealTypeValue }> = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const mealType = mealTypes[i];

    if (!(file instanceof Blob)) {
      await logIfEnabled(400);
      return NextResponse.json(
        { error: `写真${i + 1}: ファイルが不正です。` },
        { status: 400 },
      );
    }

    if (file.size > MAX_BYTES) {
      await logIfEnabled(400);
      return NextResponse.json(
        { error: `写真${i + 1}: ファイルサイズが10MBを超えています。` },
        { status: 400 },
      );
    }

    const mime = file.type;
    if (!ALLOWED_MIMES.includes(mime)) {
      await logIfEnabled(400);
      if (mime === "image/heic" || mime === "image/heif") {
        return NextResponse.json(
          {
            error: `写真${i + 1}: iPhoneのHEIC形式はサポートしていません。設定で「最も互換性のある形式」を選択してください。`,
          },
          { status: 400 },
        );
      }
      return NextResponse.json(
        {
          error: `写真${i + 1}: 対応していない画像形式です。JPEG/PNG/WEBPで再アップロードしてください。`,
        },
        { status: 400 },
      );
    }

    if (!["breakfast", "lunch", "dinner"].includes(mealType)) {
      await logIfEnabled(400);
      return NextResponse.json(
        { error: `写真${i + 1}: 食事タイプが不正です。` },
        { status: 400 },
      );
    }

    const bytes = await file.arrayBuffer();
    validatedFiles.push({
      bytes,
      mime,
      mealType: mealType as MealTypeValue,
    });
  }

  // Process all images in parallel using Promise.allSettled()
  const analysisPromises = validatedFiles.map((file, index) =>
    analyzePhoto(file.bytes, file.mime, file.mealType)
      .then((foods) => {
        if (foods.length === 0) {
          throw new Error("食材を認識できませんでした。");
        }
        const result = analyze(foods);
        return { index, mealType: file.mealType, result, foods, success: true as const };
      })
      .catch((err) => {
        const errorMsg =
          err instanceof VisionError
            ? err.userMessage
            : "解析に失敗しました。";
        return { index, mealType: file.mealType, error: errorMsg, success: false as const };
      })
  );

  const settledResults = await Promise.allSettled(analysisPromises);

  // Separate successful and failed analyses
  const meals = [];
  const failed = [];
  const successfulResults = [];

  for (const result of settledResults) {
    if (result.status === "fulfilled") {
      const value = result.value;
      if (value.success) {
        meals.push({
          index: value.index,
          mealType: value.mealType,
          result: value.result,
          foods: value.foods,
        });
        successfulResults.push(value.result);
      } else {
        failed.push({
          index: value.index,
          mealType: value.mealType,
          error: value.error,
          userMessage: value.error,
        });
      }
    } else {
      // Promise.allSettled rejection
      const index = settledResults.indexOf(result);
      failed.push({
        index,
        mealType: validatedFiles[index].mealType,
        error: "未知のエラーが発生しました。",
        userMessage: "解析に失敗しました。",
      });
    }
  }

  // If no successful analyses, return error
  if (successfulResults.length === 0) {
    await logIfEnabled(422);
    return NextResponse.json(
      {
        error:
          "どの写真も解析できませんでした。明るい場所で撮影し直してください。",
      },
      { status: 422 },
    );
  }

  // Calculate aggregate
  const aggregateData = computeAggregate(successfulResults);
  const sessionResult: AnalysisSessionResult = {
    meals,
    failed,
    aggregate: {
      ...aggregateData,
      totalMeals: files.length,
      successfulMeals: successfulResults.length,
    },
  };

  await logIfEnabled(200);
  return NextResponse.json({ ok: true, result: sessionResult });
}
