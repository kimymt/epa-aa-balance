// AI コーチ・レシピ提案のユニットテスト (v0.4.0-alpha)
//
// validateCoachBody, buildPrompt, filterFishRecipes, aggregateFromAnalysis を検証。
// generateCoachRecipes は Gemini API モックを使わず integration test として手動確認 (本番 deploy 後)。

import { describe, it, expect } from "bun:test";
import {
  validateCoachBody,
  buildPrompt,
  filterFishRecipes,
  aggregateFromAnalysis,
  isGeminiQuotaError,
  getCoachErrorCode,
  detectRequestedCookingMethods,
  isRecipeComplete,
  CHIP_LABELS,
  type CoachRequest,
  type Recipe,
} from "./coach";
import type { AnalysisResult } from "./analyzer";

const sampleAggregate = { lipidPct: 30, epaMg: 100, dhaMg: 200, aaMg: 50 };
const sampleFoods = [{ name: "鶏もも", grams: 150 }, { name: "白米", grams: 200 }];

describe("validateCoachBody", () => {
  it("accepts valid minimal body", () => {
    const r = validateCoachBody({ aggregate: sampleAggregate, recentFoods: sampleFoods });
    expect(r.ok).toBe(true);
  });

  it("accepts valid body with chip refinement", () => {
    const r = validateCoachBody({
      aggregate: sampleAggregate,
      recentFoods: sampleFoods,
      refinement: { type: "chip", value: "japanese_style" },
    });
    expect(r.ok).toBe(true);
  });

  it("accepts valid body with freetext refinement", () => {
    const r = validateCoachBody({
      aggregate: sampleAggregate,
      recentFoods: sampleFoods,
      refinement: { type: "freetext", value: "魚卵を使ったレシピで" },
    });
    expect(r.ok).toBe(true);
  });

  it("accepts null lipidPct", () => {
    const r = validateCoachBody({
      aggregate: { lipidPct: null, epaMg: 0, dhaMg: 0, aaMg: 0 },
      recentFoods: [],
    });
    expect(r.ok).toBe(true);
  });

  it("rejects non-object body", () => {
    expect(validateCoachBody(null).ok).toBe(false);
    expect(validateCoachBody("string").ok).toBe(false);
    expect(validateCoachBody(123).ok).toBe(false);
  });

  it("rejects missing aggregate", () => {
    expect(validateCoachBody({ recentFoods: [] }).ok).toBe(false);
  });

  it("rejects aggregate with non-number EPA/DHA/AA", () => {
    expect(validateCoachBody({
      aggregate: { lipidPct: 30, epaMg: "100", dhaMg: 200, aaMg: 50 },
      recentFoods: [],
    }).ok).toBe(false);
  });

  it("rejects food with non-string name or non-number grams", () => {
    expect(validateCoachBody({
      aggregate: sampleAggregate,
      recentFoods: [{ name: 123, grams: 100 }],
    }).ok).toBe(false);
    expect(validateCoachBody({
      aggregate: sampleAggregate,
      recentFoods: [{ name: "サバ", grams: "100" }],
    }).ok).toBe(false);
  });

  it("rejects refinement with invalid type", () => {
    expect(validateCoachBody({
      aggregate: sampleAggregate,
      recentFoods: [],
      refinement: { type: "voice", value: "foo" },
    }).ok).toBe(false);
  });

  it("rejects refinement value over 200 chars", () => {
    expect(validateCoachBody({
      aggregate: sampleAggregate,
      recentFoods: [],
      refinement: { type: "freetext", value: "a".repeat(201) },
    }).ok).toBe(false);
  });

  it("rejects empty refinement value", () => {
    expect(validateCoachBody({
      aggregate: sampleAggregate,
      recentFoods: [],
      refinement: { type: "freetext", value: "" },
    }).ok).toBe(false);
  });

  // v0.4.10: target validation
  it("accepts valid target", () => {
    const r = validateCoachBody({
      aggregate: sampleAggregate,
      recentFoods: sampleFoods,
      target: { patternName: "地中海食", gapMg: 120 },
    });
    expect(r.ok).toBe(true);
  });

  it("accepts target with gapMg = 0 (already at target)", () => {
    const r = validateCoachBody({
      aggregate: sampleAggregate,
      recentFoods: sampleFoods,
      target: { patternName: "地中海食", gapMg: 0 },
    });
    expect(r.ok).toBe(true);
  });

  it("rejects target with negative gapMg", () => {
    const r = validateCoachBody({
      aggregate: sampleAggregate,
      recentFoods: sampleFoods,
      target: { patternName: "地中海食", gapMg: -10 },
    });
    expect(r.ok).toBe(false);
  });

  it("rejects target with empty patternName", () => {
    const r = validateCoachBody({
      aggregate: sampleAggregate,
      recentFoods: sampleFoods,
      target: { patternName: "", gapMg: 100 },
    });
    expect(r.ok).toBe(false);
  });

  it("rejects target with NaN gapMg", () => {
    const r = validateCoachBody({
      aggregate: sampleAggregate,
      recentFoods: sampleFoods,
      target: { patternName: "地中海食", gapMg: NaN },
    });
    expect(r.ok).toBe(false);
  });

  it("rejects target with non-string patternName", () => {
    const r = validateCoachBody({
      aggregate: sampleAggregate,
      recentFoods: sampleFoods,
      target: { patternName: 123, gapMg: 100 },
    });
    expect(r.ok).toBe(false);
  });
});

describe("buildPrompt", () => {
  const baseReq: CoachRequest = { aggregate: sampleAggregate, recentFoods: sampleFoods };

  it("includes aggregate stats in prompt", () => {
    const p = buildPrompt(baseReq);
    expect(p).toContain("30%");        // lipidPct
    expect(p).toContain("100 mg");     // EPA
    expect(p).toContain("200 mg");     // DHA
    expect(p).toContain("50 mg");      // AA
  });

  it("includes recent foods in prompt", () => {
    const p = buildPrompt(baseReq);
    expect(p).toContain("鶏もも");
    expect(p).toContain("白米");
  });

  it("handles null lipidPct gracefully", () => {
    const p = buildPrompt({ ...baseReq, aggregate: { ...sampleAggregate, lipidPct: null } });
    expect(p).toContain("計算不能");
  });

  it("handles empty foods list", () => {
    const p = buildPrompt({ ...baseReq, recentFoods: [] });
    expect(p).toContain("(食材情報なし)");
  });

  it("includes chip-derived hint when refinement is chip", () => {
    const p = buildPrompt({
      ...baseReq,
      refinement: { type: "chip", value: "japanese_style" },
    });
    expect(p).toContain("追加要望");
    expect(p).toContain("和食");
  });

  it("includes freetext refinement verbatim", () => {
    const p = buildPrompt({
      ...baseReq,
      refinement: { type: "freetext", value: "魚卵中心で" },
    });
    expect(p).toContain("魚卵中心で");
  });

  // v0.4.10: target section in prompt
  it("includes target pattern section when target is provided", () => {
    const p = buildPrompt({
      ...baseReq,
      target: { patternName: "地中海食", gapMg: 120 },
    });
    expect(p).toContain("【目標食習慣】");
    expect(p).toContain("地中海食");
    expect(p).toContain("+120 mg/日");
  });

  it("includes content food guidance (mg/100g hints) when target set", () => {
    const p = buildPrompt({
      ...baseReq,
      target: { patternName: "日本伝統食", gapMg: 800 },
    });
    expect(p).toContain("サバ");
    expect(p).toContain("含有量");
  });

  it("rounds fractional gapMg to integer in prompt", () => {
    const p = buildPrompt({
      ...baseReq,
      target: { patternName: "地中海食", gapMg: 119.6 },
    });
    expect(p).toContain("+120 mg/日"); // Math.round(119.6) = 120
  });

  it("omits target section when target is undefined", () => {
    const p = buildPrompt(baseReq);
    expect(p).not.toContain("【目標食習慣】");
  });

  it("includes both refinement and target sections when both provided", () => {
    const p = buildPrompt({
      ...baseReq,
      refinement: { type: "chip", value: "japanese_style" },
      target: { patternName: "日本伝統食", gapMg: 500 },
    });
    expect(p).toContain("【追加要望】");
    expect(p).toContain("【目標食習慣】");
    expect(p).toContain("和食");
    expect(p).toContain("日本伝統食");
  });

  // v0.6.0: chip-conditional food candidates
  it("includes chip-specific food candidates section for convenience_store", () => {
    const p = buildPrompt({
      ...baseReq,
      refinement: { type: "chip", value: "convenience_store" },
    });
    expect(p).toContain("コンビニで");
    expect(p).toContain("サバ缶");
    expect(p).toContain("ツナ缶");
    expect(p).toContain("食材リストから優先的に選んで");
  });

  it("includes chip-specific food candidates for kid_friendly (no サバ・サンマ・イワシ アンカー)", () => {
    const p = buildPrompt({
      ...baseReq,
      refinement: { type: "chip", value: "kid_friendly" },
    });
    expect(p).toContain("鮭");
    expect(p).toContain("はんぺん");
    expect(p).toContain("子ども向け");
  });

  it("omits target's generic 4-fish anchor list when chip is set (avoids dilution)", () => {
    const p = buildPrompt({
      ...baseReq,
      refinement: { type: "chip", value: "convenience_store" },
      target: { patternName: "地中海食", gapMg: 200 },
    });
    // chip-specific 食材リストが優先される。target section に汎用「サバ ~1500mg/100g」が
    // 重複列挙されるとプロンプトが矛盾するため、target 側では food list を省略する。
    expect(p).not.toContain("サバ ~1500mg/100g、サンマ ~1300mg/100g、イワシ ~1200mg/100g、鮭 ~600mg/100g");
    expect(p).toContain("【目標食習慣】"); // section 自体は残る
  });

  it("appends explicit cookingMethod constraint when freetext contains '生魚'", () => {
    const p = buildPrompt({
      ...baseReq,
      refinement: { type: "freetext", value: "生魚を中心にお願いします" },
    });
    expect(p).toContain("【絶対遵守の調理法制約】");
    expect(p).toContain("raw");
  });

  it("appends explicit cookingMethod constraint when freetext contains '焼き'", () => {
    const p = buildPrompt({
      ...baseReq,
      refinement: { type: "freetext", value: "焼き魚で 3 つ" },
    });
    expect(p).toContain("【絶対遵守の調理法制約】");
    expect(p).toContain("grilled");
  });

  it("does NOT append cookingMethod constraint when freetext has no method keyword", () => {
    const p = buildPrompt({
      ...baseReq,
      refinement: { type: "freetext", value: "塩分控えめで" },
    });
    expect(p).not.toContain("【絶対遵守の調理法制約】");
  });

  it("includes few-shot examples covering raw / grilled / simmered / no_cook", () => {
    const p = buildPrompt(baseReq);
    expect(p).toContain("【参考例】");
    expect(p).toContain('"cookingMethod": "raw"');
    expect(p).toContain('"cookingMethod": "grilled"');
    expect(p).toContain('"cookingMethod": "simmered"');
    expect(p).toContain('"cookingMethod": "no_cook"');
  });

  it("instructs Gemini to vary cookingMethod across the 3 recipes", () => {
    const p = buildPrompt(baseReq);
    expect(p).toContain("調理法 (cookingMethod) を散らす");
  });

  // v0.7.0: full-detail スキーマの prompt 反映を確認
  it("includes per-field粒度 rules for full-detail schema (description / ingredients / steps)", () => {
    const p = buildPrompt(baseReq);
    expect(p).toContain("【出力スキーマと粒度の絶対ルール】");
    expect(p).toContain("description: 30-60 文字");
    expect(p).toContain("ingredients: 3-7 件");
    expect(p).toContain("steps: 1-5 件");
  });

  it("few-shot examples carry servings + ingredients + steps fields (full-detail format)", () => {
    const p = buildPrompt(baseReq);
    expect(p).toContain('"servings"');
    expect(p).toContain('"ingredients"');
    expect(p).toContain('"steps"');
    expect(p).toContain('"equipment"');
    expect(p).toContain('"safetyNote"');
  });

  it("few-shot includes a no_cook example with empty equipment array (zero道具対応)", () => {
    const p = buildPrompt(baseReq);
    // しらすパック朝定食 例: "equipment": []
    expect(p).toMatch(/"cookingMethod":\s*"no_cook"[\s\S]*?"equipment":\s*\[\s*\]/);
  });

  it("few-shot includes a raw example with non-empty safetyNote (生食安全注意)", () => {
    const p = buildPrompt(baseReq);
    // 鯵のなめろう丼 例: 刺身用…当日中に
    expect(p).toMatch(/"cookingMethod":\s*"raw"[\s\S]*?"safetyNote":\s*"[^"]*?当日中/);
  });

  it("instructs all 12 required fields in the closing line", () => {
    const p = buildPrompt(baseReq);
    // 末尾「全フィールドを含む JSON」指示
    expect(p).toContain("全フィールドを含む JSON");
    expect(p).toContain("ingredients");
    expect(p).toContain("steps");
    expect(p).toContain("equipment");
    expect(p).toContain("tips");
    expect(p).toContain("safetyNote");
  });
});

// v0.7.0: full-detail Recipe を作るための test helper。
// fishType と cookingMethod は呼び元で上書き可能 (filterFishRecipes 等の検証用)。
function makeRecipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    name: "テストレシピ",
    mealType: "dinner",
    cookTime: "10分",
    description: "テスト用の短い要約。",
    fishType: "fish",
    cookingMethod: "grilled",
    servings: 1,
    ingredients: [{ name: "サバ", amount: "1 切れ" }],
    steps: ["焼く。"],
    equipment: [],
    tips: "",
    safetyNote: "",
    ...overrides,
  };
}

describe("filterFishRecipes", () => {
  it("keeps fish/shellfish/fish_product, removes others", () => {
    const recipes: Recipe[] = [
      makeRecipe({ name: "サバ焼き", fishType: "fish" }),
      // @ts-expect-error testing wrong type
      makeRecipe({ name: "ステーキ", fishType: "meat" }),
      makeRecipe({ name: "ホタテバター", fishType: "shellfish" }),
    ];
    const r = filterFishRecipes(recipes);
    expect(r.ok.length).toBe(2);
    expect(r.removed).toBe(1);
    expect(r.ok.map((x) => x.name)).toEqual(["サバ焼き", "ホタテバター"]);
  });

  it("returns all when all are fish-type", () => {
    const recipes: Recipe[] = [
      makeRecipe({ name: "a", fishType: "fish" }),
      makeRecipe({ name: "b", fishType: "shellfish", cookingMethod: "raw" }),
      makeRecipe({ name: "c", fishType: "fish_product", cookingMethod: "no_cook" }),
    ];
    expect(filterFishRecipes(recipes).removed).toBe(0);
    expect(filterFishRecipes(recipes).ok.length).toBe(3);
  });
});

// v0.6.0: 調理法キーワード検出
describe("detectRequestedCookingMethods", () => {
  it("returns empty array for undefined / empty input", () => {
    expect(detectRequestedCookingMethods(undefined)).toEqual([]);
    expect(detectRequestedCookingMethods("")).toEqual([]);
  });

  it("detects raw from 生魚 / 刺身 / カルパッチョ", () => {
    expect(detectRequestedCookingMethods("生魚で")).toContain("raw");
    expect(detectRequestedCookingMethods("刺身が食べたい")).toContain("raw");
    expect(detectRequestedCookingMethods("カルパッチョ風で")).toContain("raw");
  });

  it("detects grilled from 焼き / 塩焼", () => {
    expect(detectRequestedCookingMethods("焼き魚で")).toContain("grilled");
    expect(detectRequestedCookingMethods("塩焼で")).toContain("grilled");
  });

  it("detects simmered / steamed / fried / deep_fried / no_cook", () => {
    expect(detectRequestedCookingMethods("煮物で")).toContain("simmered");
    expect(detectRequestedCookingMethods("蒸し料理")).toContain("steamed");
    expect(detectRequestedCookingMethods("ソテーで")).toContain("fried");
    expect(detectRequestedCookingMethods("唐揚げで")).toContain("deep_fried");
    expect(detectRequestedCookingMethods("調理不要なもの")).toContain("no_cook");
  });

  it("can return multiple methods when multiple kw present", () => {
    const got = detectRequestedCookingMethods("生魚か焼き魚で");
    expect(got).toContain("raw");
    expect(got).toContain("grilled");
  });

  it("returns empty when no cooking-method keyword present", () => {
    expect(detectRequestedCookingMethods("子ども向けにお願い")).toEqual([]);
  });
});

describe("aggregateFromAnalysis", () => {
  function meal(lipidPct: number | null, epa: number, dha: number, aa: number): AnalysisResult {
    return {
      light: lipidPct === null ? "unknown" : "green",
      lipidPct, lipidRatio: null,
      epaMg: epa, dhaMg: dha, aaMg: aa,
      lipidCoverage: 1, matched: [], excludedNoData: [], unmatched: [],
    };
  }

  it("sums EPA/DHA/AA across meals", () => {
    const r = aggregateFromAnalysis([meal(50, 100, 200, 30), meal(40, 50, 100, 20)]);
    expect(r.epaMg).toBe(150);
    expect(r.dhaMg).toBe(300);
    expect(r.aaMg).toBe(50);
    expect(r.lipidPct).toBe(45); // (50+40)/2
  });

  it("returns null lipidPct when no meal has data", () => {
    const r = aggregateFromAnalysis([meal(null, 0, 0, 0)]);
    expect(r.lipidPct).toBeNull();
  });

  it("excludes null-lipidPct meals from average but sums their EPA/DHA/AA still", () => {
    const r = aggregateFromAnalysis([meal(60, 100, 100, 30), meal(null, 50, 50, 10)]);
    expect(r.lipidPct).toBe(60); // only first counts
    expect(r.epaMg).toBe(150);
    expect(r.dhaMg).toBe(150);
    expect(r.aaMg).toBe(40);
  });

  it("returns 0/null for empty meals array", () => {
    const r = aggregateFromAnalysis([]);
    expect(r.epaMg).toBe(0);
    expect(r.dhaMg).toBe(0);
    expect(r.aaMg).toBe(0);
    expect(r.lipidPct).toBeNull();
  });
});

describe("isGeminiQuotaError", () => {
  it("detects RESOURCE_EXHAUSTED status from real Gemini error JSON", () => {
    const realMsg =
      '{"error":{"code":429,"message":"You exceeded your current quota",' +
      '"status":"RESOURCE_EXHAUSTED","details":[]}}';
    expect(isGeminiQuotaError(realMsg)).toBe(true);
  });

  it("detects 'quota exceeded' phrase (case-insensitive)", () => {
    expect(isGeminiQuotaError("Quota Exceeded for metric foo")).toBe(true);
  });

  it("detects 'exceeded your current quota' phrase", () => {
    expect(isGeminiQuotaError("You exceeded your current quota.")).toBe(true);
  });

  it("returns false for unrelated error messages", () => {
    expect(isGeminiQuotaError("Network error: ECONNREFUSED")).toBe(false);
    expect(isGeminiQuotaError("Timeout after 25s")).toBe(false);
    expect(isGeminiQuotaError("")).toBe(false);
  });

  it("does NOT trigger on a bare HTTP 429 string (avoids self-rate-limit confusion)", () => {
    // 自前 rate limit (429 + RATE_LIMITED) と紛らわしいので、429 単独では検出しない
    expect(isGeminiQuotaError("HTTP 429 Too Many Requests")).toBe(false);
  });

  // v0.4.19: per-minute throttling 検出強化 (QA Issue #1 対応)
  it("detects 'rate limit exceeded' phrase (case-insensitive)", () => {
    expect(isGeminiQuotaError("Rate limit exceeded for project gen-lang-client")).toBe(true);
    expect(isGeminiQuotaError("RATE LIMIT EXCEEDED")).toBe(true);
  });

  it("detects 'rate_limit_exceeded' API error code variant", () => {
    expect(isGeminiQuotaError('{"code":"rate_limit_exceeded","message":"..."}')).toBe(true);
  });

  it("detects 'requests per minute' phrase (per-minute quota)", () => {
    expect(
      isGeminiQuotaError("Quota exceeded: 15 requests per minute limit reached")
    ).toBe(true);
  });

  it("detects 'requests per day' phrase (per-day quota fallback)", () => {
    expect(
      isGeminiQuotaError("API requests per day exceeded for free tier")
    ).toBe(true);
  });
});

describe("getCoachErrorCode", () => {
  it("extracts QUOTA_EXCEEDED from tagged error", () => {
    const err = Object.assign(new Error("quota"), { __code: "QUOTA_EXCEEDED" });
    expect(getCoachErrorCode(err)).toBe("QUOTA_EXCEEDED");
  });

  it("extracts TIMEOUT and LLM_ERROR (regression)", () => {
    expect(getCoachErrorCode(Object.assign(new Error(""), { __code: "TIMEOUT" }))).toBe(
      "TIMEOUT"
    );
    expect(getCoachErrorCode(Object.assign(new Error(""), { __code: "LLM_ERROR" }))).toBe(
      "LLM_ERROR"
    );
  });

  it("returns null for untagged or unknown codes", () => {
    expect(getCoachErrorCode(new Error("plain"))).toBeNull();
    expect(getCoachErrorCode(Object.assign(new Error(""), { __code: "OTHER" }))).toBeNull();
    expect(getCoachErrorCode(null)).toBeNull();
  });
});

describe("CHIP_LABELS", () => {
  it("contains all 5 chip keys", () => {
    expect(Object.keys(CHIP_LABELS).length).toBe(5);
    expect(CHIP_LABELS.japanese_style).toBe("和食寄り");
    expect(CHIP_LABELS.convenience_store).toBe("コンビニで");
    expect(CHIP_LABELS.quick).toBe("20分以内");
    expect(CHIP_LABELS.cheap_ingredients).toBe("安い食材で");
    expect(CHIP_LABELS.kid_friendly).toBe("子ども向け");
  });
});

// v0.8.0: Recipe 完結判定 (streaming で部分パースされたオブジェクトが Recipe として
// 揃ったかを判定する predicate)
describe("isRecipeComplete", () => {
  function fullRecipe(): Recipe {
    return {
      name: "サバ味噌煮",
      mealType: "dinner",
      cookTime: "20分",
      description: "サバを味噌で煮込む和食の定番。",
      fishType: "fish",
      cookingMethod: "simmered",
      servings: 2,
      ingredients: [{ name: "サバ", amount: "2 切れ" }],
      steps: ["煮る。"],
      equipment: [],
      tips: "",
      safetyNote: "",
    };
  }

  it("returns true for a fully-formed Recipe", () => {
    expect(isRecipeComplete(fullRecipe())).toBe(true);
  });

  it("returns false for null / non-object", () => {
    expect(isRecipeComplete(null)).toBe(false);
    expect(isRecipeComplete(undefined)).toBe(false);
    expect(isRecipeComplete("string")).toBe(false);
    expect(isRecipeComplete(42)).toBe(false);
  });

  it("returns false when name is missing or empty", () => {
    const r = fullRecipe();
    delete (r as Partial<Recipe>).name;
    expect(isRecipeComplete(r)).toBe(false);
    expect(isRecipeComplete({ ...fullRecipe(), name: "" })).toBe(false);
  });

  it("returns false when ingredients array is empty", () => {
    expect(isRecipeComplete({ ...fullRecipe(), ingredients: [] })).toBe(false);
  });

  it("returns false when an ingredient lacks name or amount", () => {
    const r = { ...fullRecipe(), ingredients: [{ name: "サバ" }] }; // missing amount
    expect(isRecipeComplete(r)).toBe(false);
  });

  it("returns false when steps array is empty", () => {
    expect(isRecipeComplete({ ...fullRecipe(), steps: [] })).toBe(false);
  });

  it("returns false when a step is not a non-empty string", () => {
    expect(isRecipeComplete({ ...fullRecipe(), steps: [""] })).toBe(false);
  });

  it("accepts empty equipment array (no_cook recipes don't need tools)", () => {
    expect(isRecipeComplete({ ...fullRecipe(), equipment: [] })).toBe(true);
  });

  it("accepts empty tips and safetyNote (optional fields modeled as empty string)", () => {
    expect(isRecipeComplete({ ...fullRecipe(), tips: "", safetyNote: "" })).toBe(true);
  });

  it("returns false when servings is non-number", () => {
    // @ts-expect-error testing wrong type
    expect(isRecipeComplete({ ...fullRecipe(), servings: "2" })).toBe(false);
  });

  it("returns false on partial mid-stream object (only name + mealType)", () => {
    expect(
      isRecipeComplete({ name: "鯵のなめろう", mealType: "lunch" })
    ).toBe(false);
  });
});
