import { GoogleGenAI } from "@google/genai";

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
出力は厳密にJSON配列のみ。前後にテキストや markdown を含めないでください。

ルール:
- 食材名は日本語で、できるだけ標準的な名前（例: "鶏むね肉", "白米", "卵"）を使う
- grams は整数（推定が難しい場合は標準的な1人前の量）
- 食事と関係ない物体（皿、箸、テーブル等）は無視
- 食材が認識できない場合は空配列 [] を返す

出力例:
[{"name":"鶏むね肉","grams":150},{"name":"白米","grams":200},{"name":"ブロッコリー","grams":80}]

この食事の写真から見える食材と推定グラム数をJSON配列で返してください。`;

const TIMEOUT_MS = 25_000;
// Gemini 2.5 Flash: free-tier, vision-capable, fast
const MODEL = "gemini-2.5-flash";

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
            {
              inlineData: {
                mimeType,
                data: base64,
              },
            },
          ],
        },
      ],
      config: {
        // 軽くJSONを安定させる
        temperature: 0.2,
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

  const cleaned = stripCodeFence(text.trim());

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
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

function stripCodeFence(text: string): string {
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/m;
  const m = text.match(fence);
  return m ? m[1].trim() : text.trim();
}
