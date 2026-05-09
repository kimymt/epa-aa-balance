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
import { parse as parsePartialJson, Allow } from "partial-json";
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

// v0.6.0: chip ごとに「使うべき食材リスト」を chip-specific に切り替える。
// 従来は target section が固定で「サバ/サンマ/イワシ/鮭」を列挙してたため、
// chip を変えても 3 件中の魚種が収束していた。chip 文脈に整合する食材を渡すことで
// 同じ aggregate でも chip 違いで実食材レベルの差が出るようにする。
const CHIP_FOOD_CANDIDATES: Record<ChipKey, string> = {
  japanese_style:
    "サバ ~1500mg、サンマ ~1300mg、真鯵 ~600mg、ぶり ~900mg、真鯛 ~250mg、しらす ~580mg (mg/100g、出汁・煮魚・焼き魚向き)",
  convenience_store:
    "サバ缶 ~1500mg、ツナ缶 (油漬) ~700mg、しらすパック ~580mg、鮭フレーク ~600mg、いわし蒲焼缶 ~1100mg、刺身パック (まぐろ赤身 / 鮭) (mg/100g、調理不要 or 和えるだけ)",
  quick:
    "サバ缶 ~1500mg、ツナ缶 ~700mg、しらす ~580mg、刺身パック (まぐろ赤身 / サーモン)、ぶり (切り身) ~900mg、たらこ ~500mg (mg/100g、火を使わない or 火 5 分以内)",
  cheap_ingredients:
    "イワシ ~1200mg、サンマ ~1300mg、サバ ~1500mg、アジ ~600mg、サバ缶 ~1500mg、いわし蒲焼缶 ~1100mg、ちくわ ~50mg (mg/100g、庶民魚と缶詰中心)",
  kid_friendly:
    "鮭 ~600mg、たら ~70mg、はんぺん ~20mg、ちくわ ~50mg、ツナ缶 ~700mg、しらす ~580mg、サーモン (刺身) ~600mg (mg/100g、骨が少なく味が穏やかな食材)",
};

/** v0.6.0: 調理法 enum。Recipe.cookingMethod と post-validation で使用。 */
export type CookingMethod =
  | "raw"          // 刺身、なめろう、カルパッチョ、ユッケ、セビーチェ
  | "grilled"      // 焼き、塩焼き、ホイル焼き、炙り
  | "simmered"     // 煮物、煮付け、味噌煮、煮込み
  | "steamed"      // 蒸し、酒蒸し
  | "fried"        // 炒め、ソテー、ムニエル (浅い油)
  | "deep_fried"   // 揚げ、唐揚げ、天ぷら、フライ
  | "no_cook";     // 缶を開けるだけ、和えるだけ、サラダ

/**
 * v0.6.0: free-text refinement から「生」「焼」「煮」等のキーワードを検出し、
 * 該当 CookingMethod を返す。chip にはマッピングしない (chip は調理法を指定しないため)。
 * 1 つの文に複数の方法が含まれる可能性もあるので array を返す。
 */
const COOKING_METHOD_KEYWORDS: Record<CookingMethod, string[]> = {
  raw: ["生魚", "生で", "生の", "刺身", "カルパッチョ", "なめろう", "ユッケ", "セビーチェ", "タルタル"],
  grilled: ["焼き", "焼く", "塩焼", "ホイル焼", "炙り", "西京焼", "蒲焼"],
  simmered: ["煮物", "煮付け", "味噌煮", "煮込み", "煮る"],
  steamed: ["蒸し", "蒸す", "酒蒸"],
  fried: ["炒め", "ソテー", "ムニエル"],
  deep_fried: ["揚げ", "唐揚", "天ぷら", "フライ"],
  no_cook: ["調理不要", "そのまま", "和えるだけ", "缶を開ける"],
};

export function detectRequestedCookingMethods(refinementText: string | undefined): CookingMethod[] {
  if (!refinementText) return [];
  const found: CookingMethod[] = [];
  for (const [method, keywords] of Object.entries(COOKING_METHOD_KEYWORDS)) {
    if (keywords.some((kw) => refinementText.includes(kw))) {
      found.push(method as CookingMethod);
    }
  }
  return found;
}

/** v0.7.0: 材料 1 件分 (name + amount のシンプルな構造)。
 *  amount は日本語料理の表現の幅 (g / ml / 大さじ / 1 缶 / 1/2 個 等) を許容するため string。 */
export interface Ingredient {
  name: string;
  amount: string;
}

export interface Recipe {
  name: string;
  mealType: "breakfast" | "lunch" | "dinner";
  cookTime: string;          // "5分", "20分", "調理不要" など
  /** 1 行要約 (30-60 文字)。カード折りたたみ時に表示。詳細は ingredients/steps へ。 */
  description: string;
  fishType: "fish" | "shellfish" | "fish_product";
  cookingMethod: CookingMethod;
  // v0.7.0 追加: full-detail フィールド
  /** 何人前か (1-4)。1 人前なら 1。 */
  servings: number;
  /** 材料リスト (3-7 件)。最初は主要食材 (魚介) を置く慣習。 */
  ingredients: Ingredient[];
  /** 調理手順 (1-5 ステップ)。各 30-80 文字、料理初心者でも追える粒度。
   *  no_cook (缶詰だけ等) では 1-2 ステップでも可。 */
  steps: string[];
  /** 必要な道具 (鍋・フライパン・電子レンジ・包丁・魚焼きグリル 等)。
   *  道具不要なら空配列で OK。 */
  equipment: string[];
  /** 1 文のコツ (例: "皮目から焼くと崩れにくい")。なければ空文字列。 */
  tips: string;
  /** 安全注意 (例: "鮮度の良いものを当日中に")。生魚や半生で必要、それ以外は空文字列。 */
  safetyNote: string;
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
          description: { type: Type.STRING, description: "1 行要約 30-60 文字。カード折りたたみ時に表示" },
          fishType: {
            type: Type.STRING,
            enum: ["fish", "shellfish", "fish_product"],
            description: "魚カテゴリ。3 件全て魚系であること",
          },
          cookingMethod: {
            type: Type.STRING,
            enum: ["raw", "grilled", "simmered", "steamed", "fried", "deep_fried", "no_cook"],
            description:
              "調理法。raw=刺身/カルパッチョ等、grilled=焼き、simmered=煮、" +
              "steamed=蒸し、fried=炒め/ソテー、deep_fried=揚げ/天ぷら、no_cook=缶を開けるだけ等",
          },
          // v0.7.0: full-detail フィールド
          servings: {
            type: Type.NUMBER,
            description: "何人前か (1-4 の整数、デフォルト 1)",
          },
          ingredients: {
            type: Type.ARRAY,
            description: "材料リスト 3-7 件、最初に主要な魚介を置く",
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING, description: "食材名 (例: サバ缶、トマト、長ねぎ)" },
                amount: {
                  type: Type.STRING,
                  description: "分量 (例: '190g' '1 缶' '大さじ 1' '1/2 個')",
                },
              },
              required: ["name", "amount"],
            },
          },
          steps: {
            type: Type.ARRAY,
            description: "手順 1-5 件、各ステップ 30-80 文字。no_cook なら 1-2 件でも可",
            items: { type: Type.STRING },
          },
          equipment: {
            type: Type.ARRAY,
            description: "必要な道具 (鍋/フライパン/電子レンジ/包丁/魚焼きグリル 等)。不要なら空配列",
            items: { type: Type.STRING },
          },
          tips: {
            type: Type.STRING,
            description: "1 文のコツ (~80 文字以内)。特になければ空文字列",
          },
          safetyNote: {
            type: Type.STRING,
            description:
              "安全注意 (~80 文字)。生魚なら『鮮度の良いものを当日中に』等、" +
              "半生なら中心温度等。不要なら空文字列",
          },
        },
        required: [
          "name", "mealType", "cookTime", "description", "fishType", "cookingMethod",
          "servings", "ingredients", "steps", "equipment", "tips", "safetyNote",
        ],
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
 * v0.6.0: chip-conditional food list を含む chip section を組む。
 * chip が指定された場合、target section の汎用魚種列挙を上書きする想定で並ぶ。
 */
function buildChipSection(chip: ChipKey): string {
  const candidates = CHIP_FOOD_CANDIDATES[chip];
  return `

【「${CHIP_LABELS[chip]}」要望に合う食材候補】
${candidates}

3 件のレシピは、上記の食材リストから優先的に選んでください。`;
}

/**
 * v0.6.0: free-text に「生」「焼」等が含まれる場合、強い遵守制約を付ける。
 */
function buildCookingMethodConstraintHint(methods: CookingMethod[]): string {
  if (methods.length === 0) return "";
  const list = methods.join(", ");
  return `

【絶対遵守の調理法制約】
ユーザーは ${list} を希望しています。3 件のレシピのうち **少なくとも 2 件は cookingMethod が ${methods[0]}** であること。残り 1 件も ${list} のいずれかを優先。「${methods[0]}」と矛盾するレシピ名 (例: raw 希望なのに「焼き〜」「煮〜」) は禁止。`;
}

/** v0.7.0: 出力スキーマと粒度を学ばせる full-detail 参考例 (4 件、調理法多様)。
 *  ingredients/steps/equipment/tips/safetyNote のリアルな使い方を示す。
 *  ※ 出力ではなく、形式と粒度の参考。 */
const FEW_SHOT_EXAMPLES = `

【参考例】(出力ではなく、出力形式と各フィールドの粒度を学ぶための例)
例 1 (raw, 朝食、火を使わない):
{
  "name": "鯵のなめろう丼",
  "mealType": "lunch",
  "cookTime": "10分",
  "description": "鯵と味噌・薬味で作るなめろうをご飯に乗せた丼。EPA・DHA をそのまま摂取。",
  "fishType": "fish",
  "cookingMethod": "raw",
  "servings": 1,
  "ingredients": [
    {"name": "鯵 (刺身用)", "amount": "1 尾分 (約 80g)"},
    {"name": "白米 (温かいもの)", "amount": "1 杯 (180g)"},
    {"name": "味噌", "amount": "小さじ 1"},
    {"name": "青ねぎ (小口切り)", "amount": "5g"},
    {"name": "生姜 (すりおろし)", "amount": "小さじ 1/2"},
    {"name": "大葉", "amount": "2 枚"}
  ],
  "steps": [
    "鯵を 5mm 角に切り、まな板の上で味噌・生姜・青ねぎを乗せて包丁で軽く叩いて混ぜる (15 回程度)。",
    "丼に温かい白米を盛り、なめろうを乗せる。",
    "千切りにした大葉を散らして完成。"
  ],
  "equipment": ["包丁", "まな板"],
  "tips": "刺身用の柵で買うと骨抜き不要で楽。叩きすぎるとペースト状になるので粗目で止める。",
  "safetyNote": "刺身用 (生食可) と表示のあるものを当日中に使い切ってください。"
}

例 2 (simmered, 夕食、缶詰活用):
{
  "name": "サバ缶トマト煮",
  "mealType": "dinner",
  "cookTime": "15分",
  "description": "サバ水煮缶とカットトマトを煮るだけの一皿。EPA+DHA 約 1500mg/缶。",
  "fishType": "fish",
  "cookingMethod": "simmered",
  "servings": 2,
  "ingredients": [
    {"name": "サバ水煮缶", "amount": "1 缶 (190g)"},
    {"name": "カットトマト缶", "amount": "1/2 缶 (200g)"},
    {"name": "玉ねぎ (薄切り)", "amount": "1/2 個 (100g)"},
    {"name": "にんにく (みじん切り)", "amount": "1 片"},
    {"name": "オリーブオイル", "amount": "大さじ 1"},
    {"name": "塩・こしょう", "amount": "適量"}
  ],
  "steps": [
    "鍋にオリーブオイルとにんにくを入れ、弱火で香りが立つまで炒める (1 分)。",
    "玉ねぎを加えて中火で透き通るまで炒める (3 分)。",
    "サバ水煮缶を汁ごと、カットトマトを加え、軽く崩しながら 8 分煮込む。",
    "塩・こしょうで味を整えて完成。"
  ],
  "equipment": ["鍋", "包丁", "まな板"],
  "tips": "サバ缶の汁には EPA/DHA が溶け出しているので捨てずに使う。",
  "safetyNote": ""
}

例 3 (grilled, 夕食、家庭定番):
{
  "name": "鮭のホイル焼き",
  "mealType": "dinner",
  "cookTime": "20分",
  "description": "きのこと一緒に蒸し焼きにする鮭料理。バターでコクを足す。",
  "fishType": "fish",
  "cookingMethod": "grilled",
  "servings": 1,
  "ingredients": [
    {"name": "生鮭 (切り身)", "amount": "1 切れ (80g)"},
    {"name": "しめじ", "amount": "1/3 株 (30g)"},
    {"name": "玉ねぎ (薄切り)", "amount": "1/4 個 (50g)"},
    {"name": "バター", "amount": "5g"},
    {"name": "塩・こしょう", "amount": "少々"},
    {"name": "醤油", "amount": "小さじ 1"}
  ],
  "steps": [
    "鮭の両面に塩・こしょうを振る。しめじは石づきを取りほぐす。",
    "アルミホイルに玉ねぎ → 鮭 → しめじ → バターの順に乗せ、醤油をかけて包む。",
    "魚焼きグリルまたはトースター 220℃ で 12-15 分焼く。",
    "ホイルを開けて湯気が落ち着いたら完成。"
  ],
  "equipment": ["魚焼きグリル または オーブントースター", "アルミホイル"],
  "tips": "ホイルを開けたとき鮭中心が透明感ある桜色なら火が通っている。",
  "safetyNote": ""
}

例 4 (no_cook, 朝食、調理不要):
{
  "name": "しらすパック朝定食",
  "mealType": "breakfast",
  "cookTime": "調理不要",
  "description": "パックしらす + ご飯 + 味噌汁の即席朝食。EPA+DHA が手軽に。",
  "fishType": "fish",
  "cookingMethod": "no_cook",
  "servings": 1,
  "ingredients": [
    {"name": "しらす (パック)", "amount": "30g"},
    {"name": "白米 (温かいもの)", "amount": "1 杯 (180g)"},
    {"name": "味噌汁 (即席)", "amount": "1 杯"},
    {"name": "刻みのり", "amount": "少々"}
  ],
  "steps": [
    "ご飯にしらすと刻みのりを乗せ、味噌汁を温めて添える。"
  ],
  "equipment": [],
  "tips": "卵黄を 1 個落とすとタンパク質も補える。",
  "safetyNote": ""
}`;

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
  let chipSection = "";
  let methodConstraint = "";
  if (refinement) {
    if (refinement.type === "chip") {
      const chipKey = refinement.value as ChipKey;
      refinementHint = "\n\n【追加要望】" + (CHIP_PROMPT_HINTS[chipKey] ?? "");
      // v0.6.0: chip ごとに食材候補を切り替えて多様性を出す
      if (chipKey in CHIP_FOOD_CANDIDATES) {
        chipSection = buildChipSection(chipKey);
      }
    } else {
      refinementHint = `\n\n【ユーザーからの追加要望】\n${refinement.value}`;
      // v0.6.0: free-text から調理法を抽出して明示制約に
      const detectedMethods = detectRequestedCookingMethods(refinement.value as string);
      methodConstraint = buildCookingMethodConstraintHint(detectedMethods);
    }
  }

  // v0.4.10: 目標食習慣セクション。設定があれば prompt にギャップ情報を埋め込み、
  // Gemini が「ギャップを埋める設計」のレシピを優先するよう誘導。
  // v0.6.0: chip が指定された場合は CHIP_FOOD_CANDIDATES が food guidance を担うので、
  // target section では魚種列挙を省略 (重複・矛盾を避ける)。
  let targetSection = "";
  if (target) {
    const omitFoodList = !!chipSection;
    targetSection = `

【目標食習慣】
ユーザーは「${target.patternName}」に近づきたい食習慣傾向にあります。
1 日換算で **あと +${Math.round(target.gapMg)} mg/日** の EPA+DHA 摂取で目標水準に到達します。
3 件のレシピで合計 ${Math.round(target.gapMg)} mg 程度の EPA+DHA を上乗せできるよう設計してください。${
      omitFoodList
        ? ""
        : `
含有量の多い食材 (サバ ~1500mg/100g、サンマ ~1300mg/100g、イワシ ~1200mg/100g、鮭 ~600mg/100g 等) を中心に組み立ててください。`
    }`;
  }

  return `あなたは栄養士です。直近の食事から、EPA・DHA を増やすためのレシピを 3 件提案してください。

【直近の食事の集計】
- 魚由来脂質割合 (EPA+DHA / EPA+DHA+AA): ${lipidPctStr}
- EPA 合計: ${Math.round(aggregate.epaMg)} mg
- DHA 合計: ${Math.round(aggregate.dhaMg)} mg
- AA 合計: ${Math.round(aggregate.aaMg)} mg
- 識別された食材: ${foodsSummary}${targetSection}${chipSection}${methodConstraint}

【提案ルール】
1. 必ず 3 件、全て魚介類 (fish / shellfish / fish_product) を使うレシピ
2. 朝食・昼食・夕食 でバランスを取り、1 件ずつ別の時間帯にする (理想)
3. 直近の食事と被らない食材を選ぶ (例: サバを既に食べていれば別の魚)
4. 一般家庭で入手可能な食材
5. **3 件は調理法 (cookingMethod) を散らす**: 例えば 1 件 raw、1 件 grilled、1 件 simmered のように同じ method に偏らせない${refinementHint}

【出力スキーマと粒度の絶対ルール】
- name: 10-20 文字
- description: 30-60 文字の 1 行要約 (カード折りたたみ時に表示するため簡潔に)
- servings: 1-4 の整数。デフォルト 1
- ingredients: 3-7 件、最初は主要な魚介を置く。各 amount は実際に作れる粒度 ("190g" "1 缶" "大さじ 1" "1/2 個" 等)
- steps: 1-5 件、各 30-80 文字。料理初心者でも追える具体性 (火加減・時間・分量を含む)。no_cook なら 1-2 件でも可
- equipment: 必要な道具のみ列挙。道具不要なら空配列 []
- tips: 1 文 (~80 文字以内) のコツ。なければ空文字列 ""
- safetyNote: 生魚 (raw) や半生では必須 (例: "鮮度の良いものを当日中に")。それ以外の調理法では空文字列 ""${FEW_SHOT_EXAMPLES}

上記の例の粒度・形式に厳密に従い、name, mealType, cookTime, description, fishType, cookingMethod, servings, ingredients, steps, equipment, tips, safetyNote の全フィールドを含む JSON で返してください。`;
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

/** v0.8.0: streaming 経路の event 型。recipe = 1 件確定、complete = ストリーム完結。 */
export type RecipeStreamEvent =
  | { type: "recipe"; index: number; recipe: Recipe }
  | { type: "complete"; retried: boolean };

/** v0.8.0: 受信した部分オブジェクトが Recipe として「揃った」かを判定。
 *  全 12 必須フィールドが期待型を満たし、かつ array/string が空でないこと。
 *  partial-json は途中の文字列も部分文字列として返すため、ここでは「空ではない」
 *  程度の素朴チェックで OK (= 各 chunk で何度か false → そのうち true になる流れ)。 */
export function isRecipeComplete(r: unknown): r is Recipe {
  if (!r || typeof r !== "object") return false;
  const rec = r as Record<string, unknown>;
  if (typeof rec.name !== "string" || rec.name.length === 0) return false;
  if (typeof rec.mealType !== "string" || rec.mealType.length === 0) return false;
  if (typeof rec.cookTime !== "string" || rec.cookTime.length === 0) return false;
  if (typeof rec.description !== "string" || rec.description.length === 0) return false;
  if (typeof rec.fishType !== "string" || rec.fishType.length === 0) return false;
  if (typeof rec.cookingMethod !== "string" || rec.cookingMethod.length === 0) return false;
  if (typeof rec.servings !== "number") return false;
  if (!Array.isArray(rec.ingredients) || rec.ingredients.length === 0) return false;
  for (const ing of rec.ingredients) {
    if (!ing || typeof ing !== "object") return false;
    const i = ing as Record<string, unknown>;
    if (typeof i.name !== "string" || typeof i.amount !== "string") return false;
  }
  if (!Array.isArray(rec.steps) || rec.steps.length === 0) return false;
  for (const s of rec.steps) {
    if (typeof s !== "string" || s.length === 0) return false;
  }
  if (!Array.isArray(rec.equipment)) return false;
  if (typeof rec.tips !== "string") return false;
  if (typeof rec.safetyNote !== "string") return false;
  return true;
}

/**
 * v0.8.0: Gemini からのレスポンスをストリーミングで受け取り、Recipe が確定するたびに
 * yield する async generator。
 *
 * - partial-json で accumulated text を逐次パース
 * - recipes[length-1] (= 最後の要素) は更新中の可能性があるので emit 保留
 * - stream 完結後に最終パースして残りの recipe (最後の 1 件 等) を emit
 * - 検証 (fish-type 等) は途中 emit を止めない方針 (UI 体験優先)。retry も streaming
 *   経路では一旦 OFF (Phase 1 では体感優先、品質低下が観測されたら次フェーズで対応)
 *
 * v0.4.x の同期版 `generateCoachRecipes` も内部で本 generator を畳み込む実装に変更。
 */
export async function* generateCoachRecipesStream(
  req: CoachRequest
): AsyncGenerator<RecipeStreamEvent, void, void> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not set");
  }

  const ai = new GoogleGenAI({ apiKey });
  const prompt = buildPrompt(req);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const emittedIndexes = new Set<number>();
  let accumulated = "";

  function tryEmit(): RecipeStreamEvent[] {
    if (!accumulated.trim()) return [];
    let partial: unknown;
    try {
      partial = parsePartialJson(accumulated, Allow.ALL);
    } catch {
      return []; // まだ JSON として解釈できない (chunk が小さすぎる等)
    }
    const obj = partial as { recipes?: unknown[] } | null;
    if (!obj || !Array.isArray(obj.recipes)) return [];

    const events: RecipeStreamEvent[] = [];
    // 「最後の要素」は更新中の可能性があるので除外。
    // length=2 なら index 0 だけ emit OK (index 1 はまだ growing)
    const closedCount = obj.recipes.length - 1;
    for (let i = 0; i < closedCount; i++) {
      if (emittedIndexes.has(i)) continue;
      const r = obj.recipes[i];
      if (isRecipeComplete(r)) {
        emittedIndexes.add(i);
        events.push({ type: "recipe", index: i, recipe: r as Recipe });
      }
    }
    return events;
  }

  function finalEmit(): RecipeStreamEvent[] {
    if (!accumulated.trim()) return [];
    let partial: unknown;
    try {
      partial = parsePartialJson(accumulated, Allow.ALL);
    } catch {
      return [];
    }
    const obj = partial as { recipes?: unknown[] } | null;
    if (!obj || !Array.isArray(obj.recipes)) return [];

    const events: RecipeStreamEvent[] = [];
    // 終了時は全 index を確認 (最後の要素も含む)
    for (let i = 0; i < obj.recipes.length; i++) {
      if (emittedIndexes.has(i)) continue;
      const r = obj.recipes[i];
      if (isRecipeComplete(r)) {
        emittedIndexes.add(i);
        events.push({ type: "recipe", index: i, recipe: r as Recipe });
      }
    }
    return events;
  }

  try {
    const stream = await ai.models.generateContentStream({
      model: MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        temperature: 0.7,
        responseMimeType: "application/json",
        responseSchema: RECIPE_SCHEMA,
        abortSignal: controller.signal,
      },
    });

    for await (const chunk of stream) {
      const t = chunk.text ?? "";
      if (!t) continue;
      accumulated += t;
      for (const ev of tryEmit()) yield ev;
    }

    // ストリーム完結後の最終パスで「最後の recipe」を拾う
    for (const ev of finalEmit()) yield ev;

    // v0.8.0: streaming 経路では retry は実装せず (中断時の体感が複雑)。
    // 既存 v0.6.0 の retry 機構は generateCoachRecipes (非streaming wrapper) 側で
    // 残すか、別チャンネルで対応するか今後検討。
    yield { type: "complete", retried: false };
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
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * v0.4.x → v0.8.0: streaming generator を集約して 1 回の Promise<CoachResponse> を返す
 * 互換 wrapper。プログラム側で「全件揃ってから処理したい」用途や既存 API consumers
 * のための後方互換 (今後 streaming 経路に移行)。
 *
 * Gemini 検証 (fish-only filter) も最終的に適用。
 */
export async function generateCoachRecipes(req: CoachRequest): Promise<CoachResponse> {
  const collected: Recipe[] = [];
  let retried = false;
  for await (const event of generateCoachRecipesStream(req)) {
    if (event.type === "recipe") {
      collected[event.index] = event.recipe;
    } else if (event.type === "complete") {
      retried = event.retried;
    }
  }
  // 穴を取り除く (途中 chunk で抜け漏れた場合の防御)
  const dense = collected.filter((r): r is Recipe => Boolean(r));
  return {
    recipes: filterFishRecipes(dense).ok,
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
 *
 * v0.4.19: per-minute throttling のキャッチ漏れ対応 (QA Issue #1)。
 * 連続呼び出しで Gemini が per-minute RPM 上限に達した時、SDK が異なる文言
 * (RESOURCE_EXHAUSTED 含まない) を返すケースを観測したため検出強化。
 */
export function isGeminiQuotaError(message: string): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    message.includes("RESOURCE_EXHAUSTED") ||
    m.includes("quota exceeded") ||
    m.includes("exceeded your current quota") ||
    // v0.4.19: 以下は per-minute 系の検出 (HTTP 429 単独は依然除外、自前 rate
    // limit と区別するため)
    m.includes("rate limit exceeded") ||
    m.includes("rate_limit_exceeded") ||
    m.includes("requests per minute") ||
    m.includes("requests per day")
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
