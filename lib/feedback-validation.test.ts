import { describe, expect, test } from "bun:test";
import { validateFeedbackBody } from "./feedback-validation";

describe("validateFeedbackBody", () => {
  test("rejects null", () => {
    const r = validateFeedbackBody(null);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("body-not-object");
  });

  test("rejects undefined", () => {
    const r = validateFeedbackBody(undefined);
    expect(r.ok).toBe(false);
  });

  test("rejects string body", () => {
    const r = validateFeedbackBody("hello");
    expect(r.ok).toBe(false);
  });

  test("rejects missing mealType", () => {
    const r = validateFeedbackBody({ accurate: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("mealType-not-string");
  });

  test("rejects unknown mealType", () => {
    const r = validateFeedbackBody({ mealType: "snack", accurate: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("mealType-invalid");
  });

  test("rejects missing accurate flag", () => {
    const r = validateFeedbackBody({ mealType: "breakfast" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("accurate-not-boolean");
  });

  test("rejects accurate as string", () => {
    const r = validateFeedbackBody({ mealType: "breakfast", accurate: "yes" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("accurate-not-boolean");
  });

  test("rejects timestamp as number", () => {
    const r = validateFeedbackBody({
      mealType: "breakfast",
      accurate: true,
      timestamp: 12345,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("timestamp-wrong-type");
  });

  test("accepts minimal valid body (breakfast, accurate=true)", () => {
    const r = validateFeedbackBody({ mealType: "breakfast", accurate: true });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.body.mealType).toBe("breakfast");
      expect(r.body.accurate).toBe(true);
      expect(r.body.timestamp).toBeUndefined();
    }
  });

  test("accepts all 3 valid meal types", () => {
    for (const mealType of ["breakfast", "lunch", "dinner"]) {
      const r = validateFeedbackBody({ mealType, accurate: true });
      expect(r.ok).toBe(true);
    }
  });

  test("accepts full body with corrections", () => {
    const r = validateFeedbackBody({
      mealType: "dinner",
      accurate: false,
      predictedFoods: [{ name: "サケ", grams: 100 }],
      correctedFoods: ["サンマ", "ご飯"],
      timestamp: "2026-05-02T12:00:00Z",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.body.timestamp).toBe("2026-05-02T12:00:00Z");
      expect(r.body.correctedFoods).toEqual(["サンマ", "ご飯"]);
    }
  });

  test("preserves predictedFoods unchanged (passthrough)", () => {
    const foods = [{ name: "ラーメン", grams: 200 }];
    const r = validateFeedbackBody({
      mealType: "lunch",
      accurate: true,
      predictedFoods: foods,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.body.predictedFoods).toBe(foods);
  });
});
