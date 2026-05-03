// AI コーチング・レシピ提案 (v0.4.0-alpha)
//
// Aggregate ベース: 1 セッション = 1 提案セット (1 LLM コール)。
// Gemini 2.5 Flash の structured output で 3 件のレシピを取得。
// チップ/自由入力で refinement 可能 (refinement 毎に 1 LLM コール追加)。
//
// 設計ドキュメント:
//   ~/.gstack/projects/kimymt-epa-aa-balance/likemike-main-design-20260502-145712.md
//
// Rate limiting は v0.4.0-alpha では未実装 (button-based UX で natural な rate limit、
// Gemini 無料枠 1500 req/day で十分、Vercel KV/Upstash setup を避ける)。
// 必要になったら v0.4.1 で追加。

import { GoogleGenAI, Type } from "@google/genai";
import type { AnalysisResult } from "./analyzer";

// v0.4.4: gemini-2.5-flash (free tier 20 req/day) → gemini-2.5-flash-lite
// (free tier 1000 req/day) に切り替え。レシピ提案は短く構造化された出力なので
// lite で品質は十分。50倍の枠で実用的なテスト・運用が可能になる。
const MODEL = "gemini-2.5-flash-lite";
const TIMEOUT_MS = 25_000;

/** ユーザーが選択できる調整チップ。各 key は prompt 内の指示文に展開される。 */
export type ChipKey =
  | "japanese_style"      // 和食寄り
  | "convenience_store"   // コンビニで
  | "quick"               // 20分以内
  | "cheap_ingredients"   // 安い食材で
  | "kid_friendly";       // 子ども向け

export const CHIP_LABELS: Record<ChipKey, string> = {
  japanese_style: "和食寄り",
  convenience_store: "コンビニで",
  quick: "20分以内",
  cheap_ingredients: "安い食材で",
  kid_friendly: "子ども向け",
};

const CHIP_PROMPT_HINTS: Record<ChipKey, string> = {
  japanese_style: "和食 (出汁・醤油・味噌ベース) に寄せたレシピを優先。",
  convenience_store: "コンビニ (セブン/ファミマ/ローソン) で買える材料のみで作れるレシピ。",
  quick: "調理時間 20 分以内で完成するレシピのみ。",
  cheap_ingredients: "高級食材 (本まぐろ、活け車海老 等) は避け、安価な食材を中心に。",
  kid_friendly: "子ども (5-10 歳) でも食べやすい味付け。骨が多い魚、苦味の強いものは避ける。",
};

export interface Recipe {
  name: string;
  mealType: "breakfast" | "lunch" | "dinner";
  cookTime: string;          // "5分", "20分", "調理不要" など
  description: string;       // 1-2 文
  fishType: "fish" | "shellfish" | "fish_product";
}

export interface CoachRequest {
  /** 直近のセッション集計 (lipidPct, 食材リスト等) */
  aggregate: {
    lipidPct: number | null;
    epaMg: number;
    dhaMg: number;
    aaMg: number;
  };
  /** 識別済み食材 (Vision 出力)。文脈に使う */
  recentFoods: { name: string; grams: number }[];
  /** Optional refinement (チップ or 自由入力) */
  refinement?: {
    type: "chip" | "freetext";
    value: ChipKey | string; // chip なら ChipKey、freetext なら任意 (max 200 文字)
  };
  /**
   * Optional target diet pattern (v0.4.10): 「この食習慣に近づきたい」目標。
   * 設定時、prompt に「あと +N mg/日 で {pattern.name} に到達」と明記、
   * Gemini が「ギャップを埋める」レシピを優先するよう誘導する。
   * UI 側で findPatternPosition() の結果から自動算出するのが想定運用。
   */
  target?: {
    /** 目標食習慣の表示名 (例: "地中海食") */
    patternName: string;
    /** 1 日換算であと何 mg 必要か (>=0) */
    gapMg: number;
  };
}

export interface CoachResponse {
  recipes: Recipe[];        // 必ず 3 件、全て fish 系カテゴリ
  generatedAt: string;      // ISO 8601
  retried: boolean;         // 1 回目の出力に non-fish が混入して再生成したら true
}

export interface CoachError {
  error: string;
  // v0.4.3:
  //   - RATE_LIMITED: 自前の D1 レート制限（10 req/h/IP）に到達。UI で洗脳動画。
  //   - QUOTA_EXCEEDED: Gemini 側の無料枠（per-day / per-minute）に到達。
  //     gemini-2.5-flash-lite の無料枠は 1000 req/day（v0.4.4 で flash → lite に変更）。
  //     それでも day 上限に達する可能性があるため明確な UI が必要。LLM_ERROR と
  //     区別することで UI が「Gemini API の本日の枠が尽きました」と明示できる。
  code: "INVALID_REQUEST" | "LLM_ERROR" | "TIMEOUT" | "RATE_LIMITED" | "QUOTA_EXCEEDED";
}

const RECIPE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    recipes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: "レシピ名 (10-20 文字)" },
          mealType: {
            type: Type.STRING,
            enum: ["breakfast", "lunch", "dinner"],
            description: "想定する食事の時間帯",
          },
          cookTime: { type: Type.STRING, description: '"5分" "20分" "調理不要" 等' },
          description: { type: Type.STRING, description: "1-2 文の作り方説明 (50-100 文字)" },
          fishType: {
            type: Type.STRING,
            enum: ["fish", "shellfish", "fish_product"],
            description: "魚カテゴリ。3 件全て魚系であること",
          },
        },
        required: ["name", "mealType", "cookTime", "description", "fishType"],
      },
    },
  },
  required: ["recipes"],
};

/**
 * リクエスト body のバリデーション。
 */
export function validateCoachBody(input: unknown): { ok: true; body: CoachRequest } | { ok: false; reason: string } {
  if (!input || typeof input !== "object") return { ok: false, reason: "body-not-object" };
  const b = input as Record<string, unknown>;
  if (!b.aggregate || typeof b.aggregate !== "object") return { ok: false, reason: "aggregate-required" };
  const agg = b.aggregate as Record<string, unknown>;
  if (typeof agg.epaMg !== "number" || typeof agg.dhaMg !== "number" || typeof agg.aaMg !== "number") {
    return { ok: false, reason: "aggregate-fields-not-number" };
  }
  if (agg.lipidPct !== null && typeof agg.lipidPct !== "number") {
    return { ok: false, reason: "lipidPct-wrong-type" };
  }
  if (!Array.isArray(b.recentFoods)) return { ok: false, reason: "recentFoods-not-array" };
  for (const f of b.recentFoods) {
    if (!f || typeof f !== "object") return { ok: false, reason: "food-not-object" };
    const ff = f as Record<string, unknown>;
    if (typeof ff.name !== "string" || typeof ff.grams !== "number") {
      return { ok: false, reason: "food-fields-invalid" };
    }
  }
  if (b.refinement !== undefined) {
    const r = b.refinement as Record<string, unknown>;
    if (!r || typeof r !== "object") return { ok: false, reason: "refinement-not-object" };
    if (r.type !== "chip" && r.type !== "freetext") return { ok: false, reason: "refinement-type-invalid" };
    if (typeof r.value !== "string" || r.value.length === 0 || r.value.length > 200) {
      return { ok: false, reason: "refinement-value-invalid" };
    }
  }
  // v0.4.10: target validation
  if (b.target !== undefined) {
    const t = b.target as Record<string, unknown>;
    if (!t || typeof t !== "object") return { ok: false, reason: "target-not-object" };
    if (typeof t.patternName !== "string" || t.patternName.length === 0 || t.patternName.length > 50) {
      return { ok: false, reason: "target-patternName-invalid" };
    }
    if (typeof t.gapMg !== "number" || t.gapMg < 0 || !Number.isFinite(t.gapMg)) {
      return { ok: false, reason: "target-gapMg-invalid" };
    }
  }
  return { ok: true, body: b as unknown as CoachRequest };
}

/**
 * Gemini に投げる prompt を組み立てる。
 */
export function buildPrompt(req: CoachRequest): string {
  const { aggregate, recentFoods, refinement, target } = req;
  const lipidPctStr = aggregate.lipidPct === null ? "計算不能" : `${Math.round(aggregate.lipidPct)}%`;

  const foodsSummary =
    recentFoods.length === 0
      ? "(食材情報なし)"
      : recentFoods.map((f) => `${f.name} ${f.grams}g`).join(", ");

  let refinementHint = "";
  if (refinement) {
    if (refinement.type === "chip") {
      refinementHint = "\n\n【追加要望】" + (CHIP_PROMPT_HINTS[refinement.value as ChipKey] ?? "");
    } else {
      refinementHint = `\n\n【ユーザーからの追加要望】\n${refinement.value}`;
    }
  }

  // v0.4.10: 目標食習慣セクション。設定があれば prompt にギャップ情報を埋め込み、
  // Gemini が「ギャップを埋める設計」のレシピを優先するよう誘導。
  let targetSection = "";
  if (target) {
    targetSection = `

【目標食習慣】
ユーザーは「${target.patternName}」に近づきたい食習慣傾向にあります。
1 日換算で **あと +${Math.round(target.gapMg)} mg/日** の EPA+DHA 摂取で目標水準に到達します。
3 件のレシピで合計 ${Math.round(target.gapMg)} mg 程度の EPA+DHA を上乗せできるよう、
含有量の多い食材 (サバ ~1500mg/100g、サンマ ~1300mg/100g、イワシ ~1200mg/100g、
鮭 ~600mg/100g 等) を中心に組み立ててください。`;
  }

  return `あなたは栄養士です。直近の食事から、EPA・DHA を増やすためのレシピを 3 件提案してください。

【直近の食事の集計】
- 魚由来脂質割合 (EPA+DHA / EPA+DHA+AA): ${lipidPctStr}
- EPA 合計: ${Math.round(aggregate.epaMg)} mg
- DHA 合計: ${Math.round(aggregate.dhaMg)} mg
- AA 合計: ${Math.round(aggregate.aaMg)} mg
- 識別された食材: ${foodsSummary}${targetSection}

【提案ルール】
1. 必ず 3 件、全て魚介類 (fish / shellfish / fish_product) を使うレシピ
2. 朝食・昼食・夕食 でバランスを取り、1 件ずつ別の時間帯にする (理想)
3. 直近の食事と被らない食材を選ぶ (例: サバを既に食べていれば別の魚)
4. 一般家庭で入手可能な食材
5. レシピ名は 10-20 文字、説明は 1-2 文 (50-100 文字)${refinementHint}

各レシピは name, mealType, cookTime, description, fishType (fish/shellfish/fish_product) を含む JSON で返してください。`;
}

/**
 * 応答の sanity check: 全 recipe が fish 系であること。
 * non-fish 混入なら除外して返す (excluded-count も返す)。
 */
export function filterFishRecipes(recipes: Recipe[]): { ok: Recipe[]; removed: number } {
  const FISH_TYPES = new Set(["fish", "shellfish", "fish_product"]);
  const ok: Recipe[] = [];
  let removed = 0;
  for (const r of recipes) {
    if (FISH_TYPES.has(r.fishType)) ok.push(r);
    else removed++;
  }
  return { ok, removed };
}

/**
 * Gemini を呼んで Recipe[] を取得。tax の検証 (fish-only) も実施。
 * non-fish 混入があれば 1 回まで再生成する。
 */
export async function generateCoachRecipes(req: CoachRequest): Promise<CoachResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not set");
  }

  const ai = new GoogleGenAI({ apiKey });
  const prompt = buildPrompt(req);

  async function callOnce(): Promise<Recipe[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await ai.models.generateContent({
        model: MODEL,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: {
          temperature: 0.7,
          responseMimeType: "application/json",
          responseSchema: RECIPE_SCHEMA,
          abortSignal: controller.signal,
        },
      });
      const text = response.text ?? "";
      const parsed = JSON.parse(text) as { recipes: Recipe[] };
      return parsed.recipes ?? [];
    } finally {
      clearTimeout(timeout);
    }
  }

  let recipes: Recipe[] = [];
  let retried = false;
  try {
    recipes = await callOnce();
    const filtered = filterFishRecipes(recipes);
    if (filtered.removed > 0 && filtered.ok.length < 3) {
      // 1 回だけ再生成
      retried = true;
      recipes = await callOnce();
    }
  } catch (err) {
    const e = err as Error & { name?: string };
    if (e?.name === "AbortError") {
      throw Object.assign(new Error("Coach API timeout"), { __code: "TIMEOUT" });
    }
    const msg = e?.message ?? String(err);
    if (isGeminiQuotaError(msg)) {
      throw Object.assign(new Error(`Coach quota exceeded: ${msg}`), { __code: "QUOTA_EXCEEDED" });
    }
    throw Object.assign(new Error(`Coach LLM error: ${msg}`), { __code: "LLM_ERROR" });
  }

  const final = filterFishRecipes(recipes).ok;
  return {
    recipes: final,
    generatedAt: new Date().toISOString(),
    retried,
  };
}

/**
 * Helper: コードを取り出す型安全な関数。
 */
export function getCoachErrorCode(
  err: unknown
): "TIMEOUT" | "LLM_ERROR" | "QUOTA_EXCEEDED" | null {
  if (err && typeof err === "object" && "__code" in err) {
    const code = (err as { __code?: unknown }).__code;
    if (code === "TIMEOUT" || code === "LLM_ERROR" || code === "QUOTA_EXCEEDED") {
      return code;
    }
  }
  return null;
}

/**
 * Gemini API の quota / rate-limit エラーを検出する。
 *
 * Gemini SDK が throw する Error の message には、API のエラー JSON が文字列
 * として含まれる（例: `{"error":{"code":429, ..., "status":"RESOURCE_EXHAUSTED"}}`）。
 * "RESOURCE_EXHAUSTED" は Google API 共通の quota 超過コードなので最も信頼できる。
 * fallback として "quota" / "rate limit" の文字列マッチも入れて、SDK 側の文言
 * 揺らぎに強くしておく（HTTP 429 は自前 rate limit と紛らわしいので使わない）。
 */
export function isGeminiQuotaError(message: string): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    message.includes("RESOURCE_EXHAUSTED") ||
    m.includes("quota exceeded") ||
    m.includes("exceeded your current quota")
  );
}

/**
 * 「analyze の AnalysisResult から CoachRequest.aggregate を作る」変換ヘルパー。
 * UI 側で aggregate field を組む手間を減らす。
 */
export function aggregateFromAnalysis(results: AnalysisResult[]): CoachRequest["aggregate"] {
  let epaMg = 0, dhaMg = 0, aaMg = 0;
  let validLipidPct: number[] = [];
  for (const r of results) {
    epaMg += r.epaMg;
    dhaMg += r.dhaMg;
    aaMg += r.aaMg;
    if (r.lipidPct !== null) validLipidPct.push(r.lipidPct);
  }
  const lipidPct =
    validLipidPct.length > 0
      ? validLipidPct.reduce((s, v) => s + v, 0) / validLipidPct.length
      : null;
  return { lipidPct, epaMg, dhaMg, aaMg };
}
