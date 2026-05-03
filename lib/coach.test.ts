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
});

describe("filterFishRecipes", () => {
  it("keeps fish/shellfish/fish_product, removes others", () => {
    const recipes: Recipe[] = [
      { name: "サバ焼き", mealType: "breakfast", cookTime: "5分", description: "焼く", fishType: "fish" },
      // @ts-expect-error testing wrong type
      { name: "ステーキ", mealType: "dinner", cookTime: "20分", description: "焼く", fishType: "meat" },
      { name: "ホタテバター", mealType: "dinner", cookTime: "10分", description: "焼く", fishType: "shellfish" },
    ];
    const r = filterFishRecipes(recipes);
    expect(r.ok.length).toBe(2);
    expect(r.removed).toBe(1);
    expect(r.ok.map((x) => x.name)).toEqual(["サバ焼き", "ホタテバター"]);
  });

  it("returns all when all are fish-type", () => {
    const recipes: Recipe[] = [
      { name: "a", mealType: "breakfast", cookTime: "1", description: "x", fishType: "fish" },
      { name: "b", mealType: "lunch", cookTime: "1", description: "x", fishType: "shellfish" },
      { name: "c", mealType: "dinner", cookTime: "1", description: "x", fishType: "fish_product" },
    ];
    expect(filterFishRecipes(recipes).removed).toBe(0);
    expect(filterFishRecipes(recipes).ok.length).toBe(3);
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
