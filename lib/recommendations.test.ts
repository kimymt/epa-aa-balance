// lib/recommendations.ts のユニットテスト

import { describe, it, expect } from "bun:test";
import {
  INTAKE_RECOMMENDATIONS,
  evaluateAchievements,
} from "./recommendations";

describe("INTAKE_RECOMMENDATIONS", () => {
  it("contains 3 recommendations (WHO general / AHA primary / AHA CVD)", () => {
    expect(INTAKE_RECOMMENDATIONS.length).toBe(3);
  });

  it("is sorted ascending by threshold", () => {
    for (let i = 1; i < INTAKE_RECOMMENDATIONS.length; i++) {
      expect(INTAKE_RECOMMENDATIONS[i].thresholdMgPerDay).toBeGreaterThan(
        INTAKE_RECOMMENDATIONS[i - 1].thresholdMgPerDay
      );
    }
  });

  it("each entry has id/label/threshold/description", () => {
    for (const r of INTAKE_RECOMMENDATIONS) {
      expect(r.id).toMatch(/^[a-z_]+$/);
      expect(r.label.length).toBeGreaterThan(0);
      expect(r.thresholdMgPerDay).toBeGreaterThan(0);
      expect(r.description.length).toBeGreaterThan(20); // 文献出典含む十分な長さ
    }
  });

  it("expected ids present", () => {
    const ids = INTAKE_RECOMMENDATIONS.map((r) => r.id);
    expect(ids).toContain("who_general");
    expect(ids).toContain("aha_primary");
    expect(ids).toContain("aha_cvd");
  });
});

describe("evaluateAchievements", () => {
  it("user at 0 mg → all unachieved, ratio 0", () => {
    const r = evaluateAchievements(0);
    expect(r.length).toBe(3);
    for (const a of r) {
      expect(a.achieved).toBe(false);
      expect(a.ratio).toBe(0);
    }
  });

  it("user at 300 mg → only WHO achieved", () => {
    const r = evaluateAchievements(300);
    expect(r[0].achieved).toBe(true); // WHO 250
    expect(r[1].achieved).toBe(false); // AHA 500
    expect(r[2].achieved).toBe(false); // AHA 1000
    expect(r[0].ratio).toBeCloseTo(1.2);
    expect(r[1].ratio).toBeCloseTo(0.6);
  });

  it("user at exactly threshold → achieved (>=)", () => {
    const r = evaluateAchievements(250);
    expect(r[0].achieved).toBe(true);
    expect(r[0].ratio).toBe(1.0);
  });

  it("user at 1500 mg → all 3 achieved", () => {
    const r = evaluateAchievements(1500);
    for (const a of r) expect(a.achieved).toBe(true);
    expect(r[2].ratio).toBe(1.5); // 1500 / 1000
  });

  it("user at 600 mg → WHO + AHA primary achieved, AHA CVD not", () => {
    const r = evaluateAchievements(600);
    expect(r[0].achieved).toBe(true);
    expect(r[1].achieved).toBe(true);
    expect(r[2].achieved).toBe(false);
    expect(r[2].ratio).toBeCloseTo(0.6);
  });
});
