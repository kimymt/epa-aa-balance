import { NextResponse } from "next/server";
import {
  analyzePhoto,
  VisionError,
  userMessageForCode,
  type VisionErrorCode,
} from "@/lib/vision";
import { analyze } from "@/lib/analyzer";
import {
  type AnalysisSessionResult,
  type MealTypeValue,
  computeAggregate,
} from "@/lib/session";
// D1 の単一 SQL で処理前に利用枠を確保する。
// 1 リクエスト最大 9 並列 Vision 呼び出しなので、エンドポイントとしては coach より重い。
import { enforceRateLimit } from "@/lib/rate-limit";
import { readLimitedBody, bodyErrorResponse } from "@/lib/request-body";
import { createFeedbackReceipt, feedbackSigningSecret } from "@/lib/feedback-receipt";

export const runtime = "nodejs";
export const maxDuration = 45;

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB per image
const MAX_IMAGES = 9;
const ALLOWED_MIMES = ["image/jpeg", "image/png", "image/webp"];

const ENDPOINT = "/api/analyze";
// 正当ユーザーの実需要 ≒ 3〜5 req/h (1 ヶ月分まとめ入れの outlier でも 10 req)。
// 10/h なら平均使用の 2〜3 倍バッファ。env で変更可。/api/coach (10/h) と整合。
const RATE_LIMIT = Number(process.env.ANALYZE_RATE_LIMIT ?? "10");

/**
 * v0.8.6 (F-012): per-photo の VisionErrorCode 一覧から代表 code を選ぶ。
 *
 * 規則 (優先度順、上から順に判定):
 *   1. 全部同じ code → その code
 *   2. CONFIG_ERROR / AUTH_FAILED が 1 件でもあれば → それ (= サーバー設定問題、
 *      他の原因より先に伝えるべき)
 *   3. QUOTA_EXHAUSTED が過半 → QUOTA_EXHAUSTED
 *   4. SERVER_ERROR / RATE_LIMITED / TIMEOUT / NETWORK のいずれかが過半 → それ
 *   5. NO_FOOD が過半 → NO_FOOD (写真の質問題)
 *   6. それ以外 (混在) → UNKNOWN (汎用文言で「複数原因で失敗」を示す)
 *
 * 「過半」は「半数を超える」(strict majority)。同数の場合は次の規則に進む。
 */
export function pickDominantCode(codes: VisionErrorCode[]): VisionErrorCode {
  if (codes.length === 0) return "UNKNOWN";
  if (codes.every((c) => c === codes[0])) return codes[0];

  const has = (c: VisionErrorCode) => codes.includes(c);
  if (has("CONFIG_ERROR")) return "CONFIG_ERROR";
  if (has("AUTH_FAILED")) return "AUTH_FAILED";

  const count = (c: VisionErrorCode) => codes.filter((x) => x === c).length;
  const half = codes.length / 2;
  const candidates: VisionErrorCode[] = [
    "QUOTA_EXHAUSTED",
    "SERVER_ERROR",
    "RATE_LIMITED",
    "TIMEOUT",
    "NETWORK",
    "NO_FOOD",
  ];
  for (const c of candidates) {
    if (count(c) > half) return c;
  }
  return "UNKNOWN";
}

export async function POST(req: Request) {
  const denied = await enforceRateLimit(req, {
    endpoint: ENDPOINT, limit: RATE_LIMIT, units: MAX_IMAGES,
    globalLimit: Number(process.env.ANALYZE_GLOBAL_LIMIT ?? "900"), burstLimit: 90,
  });
  if (denied) return denied;
  try { feedbackSigningSecret(); } catch {
    return NextResponse.json({ error: "解析サービスの設定が完了していません。" }, { status: 503 });
  }

  let formData: FormData;
  try {
    const bytes = await readLimitedBody(req, 10 * 1024 * 1024);
    formData = await new Response(bytes, { headers: { "Content-Type": req.headers.get("content-type") ?? "" } }).formData();
  } catch (error) {
    return bodyErrorResponse(error);
  }

  // Get all photos and meal types
  const files = formData.getAll("photo") as Blob[];
  const mealTypes = formData.getAll("mealType") as string[];

  // Validate file count
  if (files.length === 0) {
    return NextResponse.json(
      { error: "写真がアップロードされていません。" },
      { status: 400 },
    );
  }

  if (files.length > MAX_IMAGES) {
    return NextResponse.json(
      { error: `最大${MAX_IMAGES}枚までアップロードできます。` },
      { status: 400 },
    );
  }

  // Validate meal types array length matches files
  if (mealTypes.length !== files.length) {
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
      return NextResponse.json(
        { error: `写真${i + 1}: ファイルが不正です。` },
        { status: 400 },
      );
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `写真${i + 1}: ファイルサイズが10MBを超えています。` },
        { status: 400 },
      );
    }

    const mime = file.type;
    if (!ALLOWED_MIMES.includes(mime)) {

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
          // v0.8.6: 「食材を認識できませんでした」を VisionError(NO_FOOD) に格上げ。
          // 従来は素の Error で投げていたため per-photo の code が取れず、集約も
          // 「明るい場所で…」の汎用文言に丸められていた (design audit F-012)。
          throw new VisionError(
            "No foods detected by Vision API",
            userMessageForCode("NO_FOOD"),
            "NO_FOOD",
          );
        }
        const result = analyze(foods);
        return { index, mealType: file.mealType, result, foods, success: true as const };
      })
      .catch((err) => {
        if (err instanceof VisionError) {
          return {
            index,
            mealType: file.mealType,
            code: err.code,
            userMessage: err.userMessage,
            success: false as const,
          };
        }
        return {
          index,
          mealType: file.mealType,
          code: "UNKNOWN" as VisionErrorCode,
          userMessage: userMessageForCode("UNKNOWN"),
          success: false as const,
        };
      })
  );

  const settledResults = await Promise.allSettled(analysisPromises);

  // Separate successful and failed analyses
  const meals = [];
  const failed: Array<{
    index: number;
    mealType: MealTypeValue;
    code: VisionErrorCode;
    userMessage: string;
  }> = [];
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
          feedbackToken: createFeedbackReceipt(value.mealType, value.foods),
        });
        successfulResults.push(value.result);
      } else {
        failed.push({
          index: value.index,
          mealType: value.mealType,
          code: value.code,
          userMessage: value.userMessage,
        });
      }
    } else {
      // Promise.allSettled rejection (.catch の外で throw された場合のみ。本来到達しない)
      const index = settledResults.indexOf(result);
      failed.push({
        index,
        mealType: validatedFiles[index].mealType,
        code: "UNKNOWN",
        userMessage: userMessageForCode("UNKNOWN"),
      });
    }
  }

  // If no successful analyses, return error with aggregated code (v0.8.6, F-012)
  if (successfulResults.length === 0) {
    const aggregateCode = pickDominantCode(failed.map((f) => f.code));

    return NextResponse.json(
      {
        error: userMessageForCode(aggregateCode),
        code: aggregateCode,
        // 後方互換のため failed[] も含める。サポート問い合わせ時の DevTools 確認や
        // 将来のフロントエンド per-photo 表示で参照可能。
        failed: failed.map((f) => ({
          index: f.index,
          mealType: f.mealType,
          code: f.code,
          message: f.userMessage,
        })),
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

  return NextResponse.json({ ok: true, result: sessionResult });
}
