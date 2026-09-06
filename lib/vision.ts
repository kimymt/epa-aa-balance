import { GoogleGenAI, Type } from "@google/genai";

export interface VisionFood {
  name: string;
  grams: number;
}

/**
 * Vision API 失敗の分類コード (v0.8.6)。
 *
 * 目的: 「どの写真も解析できませんでした。明るい場所で撮影し直してください。」
 * という汎用文言が原因に関係なく出る問題 (design audit F-012) を解消する。
 * route.ts 側で per-photo の code を集約し、原因に応じた message を返す。
 *
 * 各 code の意味:
 * - QUOTA_EXHAUSTED : Gemini API quota 上限到達 (429 + 通常 RESOURCE_EXHAUSTED)。
 *                     回復まで時間がかかる (最大 24h)。
 * - RATE_LIMITED    : 短期 rate limit (429 だが quota 文言が無い)。数分で回復見込み。
 * - AUTH_FAILED     : 401/403。サーバー側 API key 問題、ユーザーには再試行を促す
 *                     意味が無いので「サポートに連絡」系の文言になる。
 * - SERVER_ERROR    : 5xx。Gemini 側の問題、ユーザーは少し待ってから再試行。
 * - TIMEOUT         : 25 秒以内に応答が無かった (AbortError)。1 枚ずつ試すと改善する
 *                     ことがある。
 * - NETWORK         : fetch 失敗 (DNS / TLS / TCP 等)。ユーザーの回線問題の可能性大。
 * - NO_FOOD         : Vision API は応答したが foods が空だった (= モデルが食事を
 *                     検出できなかった)。**従来「明るい場所で撮影し直してください」
 *                     と言っていた条件はここだけ**。
 * - BAD_RESPONSE    : Gemini が JSON でない / 配列でない応答を返した。レア。
 * - CONFIG_ERROR    : GEMINI_API_KEY 未設定 (サーバー設定ミス、ユーザー側の対処不能)。
 * - UNKNOWN         : 上記いずれにも該当しない例外。
 */
export type VisionErrorCode =
  | "QUOTA_EXHAUSTED"
  | "RATE_LIMITED"
  | "AUTH_FAILED"
  | "SERVER_ERROR"
  | "TIMEOUT"
  | "NETWORK"
  | "NO_FOOD"
  | "BAD_RESPONSE"
  | "CONFIG_ERROR"
  | "UNKNOWN";

export class VisionError extends Error {
  constructor(
    message: string,
    public readonly userMessage: string,
    public readonly code: VisionErrorCode = "UNKNOWN",
  ) {
    super(message);
    this.name = "VisionError";
  }
}

/**
 * 任意の捕捉した error を VisionErrorCode に分類する。
 *
 * @google/genai の ApiError は `status` (HTTP status code) を持つのでそれで判定。
 * ApiError でない場合 (network error, TypeError 等) は message を見て fallback。
 *
 * 公開 (export) しているのは test から個別ケースを検証可能にするため。
 */
export function classifyVisionError(err: unknown): VisionErrorCode {
  // 1. AbortError → TIMEOUT (analyzePhoto 側で先に投げているので通常ここには来ないが防御)
  const e = err as { name?: string; message?: string; status?: number };
  if (e?.name === "AbortError") return "TIMEOUT";

  // 2. @google/genai ApiError は status を持つ
  if (typeof e?.status === "number") {
    if (e.status === 429) {
      // 429 のうち RESOURCE_EXHAUSTED / quota 文言を含むものは QUOTA、
      // それ以外は短期 RATE_LIMITED として扱う。
      const msg = (e.message ?? "").toUpperCase();
      if (msg.includes("RESOURCE_EXHAUSTED") || msg.includes("QUOTA")) {
        return "QUOTA_EXHAUSTED";
      }
      return "RATE_LIMITED";
    }
    if (e.status === 401 || e.status === 403) return "AUTH_FAILED";
    if (e.status >= 500 && e.status < 600) return "SERVER_ERROR";
    // 4xx で 429/401/403 以外 (400 invalid request 等) は BAD_RESPONSE 寄り
    if (e.status >= 400 && e.status < 500) return "BAD_RESPONSE";
  }

  // 3. message から network 系を推測 (fetch failed / network / ENOTFOUND / ECONNREFUSED)
  const msg = (e?.message ?? "").toLowerCase();
  if (
    msg.includes("fetch failed") ||
    msg.includes("network") ||
    msg.includes("enotfound") ||
    msg.includes("econnrefused") ||
    msg.includes("etimedout") ||
    msg.includes("socket hang up")
  ) {
    return "NETWORK";
  }

  return "UNKNOWN";
}

/**
 * VisionErrorCode → ユーザー向け文言。
 *
 * route.ts 側で per-photo の code を集約してから message を選ぶときに使う。
 * UI に直接出る文言なので、ユーザーが「自分のせいではない」と分かること、
 * 次の行動が明確であることを優先。
 */
export function userMessageForCode(code: VisionErrorCode): string {
  switch (code) {
    case "QUOTA_EXHAUSTED":
      return "解析サービスが一時的に上限に達しています。1 時間ほど時間をおいてから再度お試しください。";
    case "RATE_LIMITED":
      return "アクセスが集中しています。1〜2 分後にもう一度お試しください。";
    case "AUTH_FAILED":
      return "サーバーの認証設定に問題があります。お手数ですが GitHub の Issue でご連絡ください。";
    case "SERVER_ERROR":
      return "解析サーバーで一時的な問題が発生しました。しばらくしてから再度お試しください。";
    case "TIMEOUT":
      return "解析に時間がかかりすぎました。写真を 1 枚ずつ試すか、しばらくしてから再度お試しください。";
    case "NETWORK":
      return "通信に失敗しました。電波の良い場所で再度お試しください。";
    case "NO_FOOD":
      return "写真から食材を認識できませんでした。明るい場所で、食事がはっきり写った写真をお使いください。";
    case "BAD_RESPONSE":
      return "解析結果の形式が想定と異なりました。もう一度お試しください。";
    case "CONFIG_ERROR":
      return "サーバー設定に問題があります。お手数ですが GitHub の Issue でご連絡ください。";
    case "UNKNOWN":
    default:
      return "解析に失敗しました。しばらくしてから再度お試しください。";
  }
}

const PROMPT_TEMPLATE = (mealType: string = "朝食") => `あなたは栄養士のアシスタントです。食事写真から食材と推定グラム数を抽出します。
この写真は【${mealType}】の食事です。
このアプリは魚タンパク質の割合を判定するため、**魚の種類を特定すること**が最重要です。

【最重要ルール】曖昧な総称ではなく**必ず具体名**にコミットしてください。
- ❌ 禁止: 「焼き魚」「煮魚」「魚料理」「肉料理」「炒め物」「スープ」「漬物」「サラダ」
- ✅ 必須: 「サバ」「サンマ」「サケ」「アジ」「ブリ」「イワシ」「タラ」「鶏むね肉」「豚ロース肉」「牛肉」「味噌汁」「たくあん」「ポテトサラダ」など、食材レベルの具体名

魚は写真の見た目（皮の色、形、身の質感）から最も可能性の高い種類を1つ選んでください。
判別が難しい場合は「サバ」を既定として返してOKです（魚であることが分かれば十分）。

【他のルール】
- 食材名は日本語の標準的な名前で
- grams は整数で、推定が難しい場合は標準的な1人前の量
- 食事と関係ない物体（皿、箸、テーブル等）は無視
- 写真に食事が写っていない場合は空配列 [] を返す

【出力例】
焼き魚定食の場合: [{"name":"サバ","grams":100},{"name":"白米","grams":150},{"name":"味噌汁","grams":180},{"name":"たくあん","grams":20}]

この食事の写真から見える食材と推定グラム数を、上記ルールに従ってJSON配列で返してください。`;

const TIMEOUT_MS = 25_000;
// Gemini 2.5 Flash: free-tier, vision-capable, fast
const MODEL = "gemini-2.5-flash";

const RESPONSE_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      name: { type: Type.STRING, description: "具体的な食材名（日本語）" },
      grams: { type: Type.INTEGER, description: "推定グラム数" },
    },
    required: ["name", "grams"],
  },
};

export async function analyzePhoto(
  imageBytes: ArrayBuffer,
  mimeType: string,
  mealType?: string,
): Promise<VisionFood[]> {
  const mealTypeLabel =
    mealType === "breakfast"
      ? "朝食"
      : mealType === "lunch"
        ? "昼食"
        : mealType === "dinner"
          ? "夕食"
          : "朝食";
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new VisionError(
      "GEMINI_API_KEY not set",
      userMessageForCode("CONFIG_ERROR"),
      "CONFIG_ERROR",
    );
  }

  if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
    throw new VisionError(
      `Unsupported MIME: ${mimeType}`,
      "対応していない画像形式です。JPEG/PNG/WEBPで再アップロードしてください。",
      "BAD_RESPONSE",
    );
  }

  const ai = new GoogleGenAI({ apiKey });
  const base64 = Buffer.from(imageBytes).toString("base64");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let text: string;
  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { text: PROMPT_TEMPLATE(mealTypeLabel) },
            { inlineData: { mimeType, data: base64 } },
          ],
        },
      ],
      config: {
        // 命名揺れを最小化するため温度0
        temperature: 0,
        // 構造化出力でJSON形式を強制
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        abortSignal: controller.signal,
        maxOutputTokens: 2048,
      },
    });
    text = response.text ?? "";
  } catch (err) {
    clearTimeout(timeout);
    const e = err as { name?: string; message?: string };
    if (e?.name === "AbortError") {
      throw new VisionError(
        "Vision API timeout",
        userMessageForCode("TIMEOUT"),
        "TIMEOUT",
      );
    }
    const code = classifyVisionError(err);
    throw new VisionError(
      `Vision API error: ${e?.message ?? "unknown"}`,
      userMessageForCode(code),
      code,
    );
  }
  clearTimeout(timeout);

  let parsed: unknown;
  try {
    parsed = JSON.parse(text.trim());
  } catch {
    throw new VisionError(
      `Vision returned non-JSON: ${text.slice(0, 200)}`,
      userMessageForCode("BAD_RESPONSE"),
      "BAD_RESPONSE",
    );
  }

  if (!Array.isArray(parsed)) {
    throw new VisionError(
      `Vision returned non-array`,
      userMessageForCode("BAD_RESPONSE"),
      "BAD_RESPONSE",
    );
  }

  const foods: VisionFood[] = [];
  for (const item of parsed.slice(0, 20)) {
    if (
      typeof item === "object" &&
      item !== null &&
      typeof (item as { name?: unknown }).name === "string" &&
      typeof (item as { grams?: unknown }).grams === "number" &&
      (item as { name: string }).name.trim().length > 0 &&
      (item as { name: string }).name.length <= 100 &&
      Number.isFinite((item as { grams: number }).grams) &&
      (item as { grams: number }).grams <= 10000 &&
      (item as { grams: number }).grams >= 0.5
    ) {
      foods.push({
        name: (item as { name: string }).name.trim(),
        grams: Math.round((item as { grams: number }).grams),
      });
    }
  }

  return foods;
}
