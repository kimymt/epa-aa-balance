import { GoogleGenAI, Type } from "@google/genai";

export interface VisionFood {
  name: string;
  grams: number;
}

export class VisionError extends Error {
  constructor(
    message: string,
    public readonly userMessage: string,
  ) {
    super(message);
    this.name = "VisionError";
  }
}

const PROMPT = `あなたは栄養士のアシスタントです。食事写真から食材と推定グラム数を抽出します。

【最重要ルール】曖昧な総称ではなく**必ず具体名**にコミットしてください。
- ❌ 禁止: 「焼き魚」「煮魚」「魚料理」「肉料理」「炒め物」「スープ」「漬物」「サラダ」
- ✅ 必須: 「サバ」「サンマ」「サケ」「アジ」「鶏むね肉」「豚ロース肉」「牛肉」「味噌汁」「たくあん」「ポテトサラダ」など、食材レベルの具体名

写真から特定が難しいときも、最も可能性の高い具体食材を1つ選んでコミットしてください。

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
): Promise<VisionFood[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new VisionError(
      "GEMINI_API_KEY not set",
      "サーバー設定エラー: APIキーが設定されていません。",
    );
  }

  if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
    throw new VisionError(
      `Unsupported MIME: ${mimeType}`,
      "対応していない画像形式です。JPEG/PNG/WEBPで再アップロードしてください。",
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
            { text: PROMPT },
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
      },
    });
    text = response.text ?? "";
  } catch (err) {
    clearTimeout(timeout);
    const e = err as Error & { name?: string };
    if (e?.name === "AbortError") {
      throw new VisionError(
        "Vision API timeout",
        "解析に時間がかかっています。再試行してください。",
      );
    }
    throw new VisionError(
      `Vision API error: ${e?.message ?? "unknown"}`,
      "解析に失敗しました。30秒後に再試行してください。",
    );
  }
  clearTimeout(timeout);

  let parsed: unknown;
  try {
    parsed = JSON.parse(text.trim());
  } catch {
    throw new VisionError(
      `Vision returned non-JSON: ${text.slice(0, 200)}`,
      "解析結果の形式が不正でした。再試行してください。",
    );
  }

  if (!Array.isArray(parsed)) {
    throw new VisionError(
      `Vision returned non-array`,
      "解析結果の形式が不正でした。再試行してください。",
    );
  }

  const foods: VisionFood[] = [];
  for (const item of parsed) {
    if (
      typeof item === "object" &&
      item !== null &&
      typeof (item as { name?: unknown }).name === "string" &&
      typeof (item as { grams?: unknown }).grams === "number" &&
      (item as { grams: number }).grams > 0
    ) {
      foods.push({
        name: (item as { name: string }).name.trim(),
        grams: Math.round((item as { grams: number }).grams),
      });
    }
  }

  return foods;
}
