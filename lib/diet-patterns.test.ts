// lib/diet-patterns.ts のユニットテスト

import { describe, it, expect } from "bun:test";
import {
  DIET_PATTERNS,
  findPatternPosition,
  dailyAverageMg,
} from "./diet-patterns";

describe("DIET_PATTERNS", () => {
  it("contains exactly 5 patterns", () => {
    expect(DIET_PATTERNS.length).toBe(5);
  });

  it("is sorted ascending by epaDhaMgPerDay", () => {
    for (let i = 1; i < DIET_PATTERNS.length; i++) {
      expect(DIET_PATTERNS[i].epaDhaMgPerDay).toBeGreaterThan(
        DIET_PATTERNS[i - 1].epaDhaMgPerDay
      );
    }
  });

  it("each pattern has id/name/epaDhaMgPerDay/caption", () => {
    for (const p of DIET_PATTERNS) {
      expect(p.id).toMatch(/^[a-z_]+$/);
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.epaDhaMgPerDay).toBeGreaterThan(0);
      expect(p.caption.length).toBeGreaterThan(0);
    }
  });

  it("expected named patterns are present", () => {
    const ids = DIET_PATTERNS.map((p) => p.id);
    expect(ids).toContain("us_standard");
    expect(ids).toContain("mediterranean");
    expect(ids).toContain("japanese_traditional");
    expect(ids).toContain("norwegian");
    expect(ids).toContain("inuit_traditional");
  });
});

describe("findPatternPosition", () => {
  it("user below lowest pattern → surpassed null, next = lowest", () => {
    const r = findPatternPosition(50);
    expect(r.surpassed).toBeNull();
    expect(r.next?.id).toBe("us_standard");
    expect(r.gapToNextMg).toBe(100); // 150 - 50
  });

  it("user between us and mediterranean → surpassed us, next mediterranean", () => {
    const r = findPatternPosition(480);
    expect(r.surpassed?.id).toBe("us_standard");
    expect(r.next?.id).toBe("mediterranean");
    expect(r.gapToNextMg).toBe(120); // 600 - 480
  });

  it("user matches a pattern exactly → counts as surpassed", () => {
    const r = findPatternPosition(600);
    expect(r.surpassed?.id).toBe("mediterranean");
    expect(r.next?.id).toBe("japanese_traditional");
  });

  it("user just below japanese_traditional → next = japanese", () => {
    const r = findPatternPosition(1100);
    expect(r.surpassed?.id).toBe("mediterranean");
    expect(r.next?.id).toBe("japanese_traditional");
    expect(r.gapToNextMg).toBe(100); // 1200 - 1100
  });

  it("user above all patterns → surpassed = highest, next = null", () => {
    const r = findPatternPosition(20000);
    expect(r.surpassed?.id).toBe("inuit_traditional");
    expect(r.next).toBeNull();
    expect(r.gapToNextMg).toBeNull();
  });

  it("user at zero → next = lowest", () => {
    const r = findPatternPosition(0);
    expect(r.surpassed).toBeNull();
    expect(r.next?.id).toBe("us_standard");
  });
});

describe("dailyAverageMg", () => {
  it("3 meals = 1 day → total / 1", () => {
    expect(dailyAverageMg(900, 3)).toBe(900);
  });

  it("6 meals = 2 days → total / 2", () => {
    expect(dailyAverageMg(2400, 6)).toBe(1200);
  });

  it("1 meal = 1/3 day → total * 3", () => {
    expect(dailyAverageMg(300, 1)).toBe(900);
  });

  it("4 meals = 4/3 day → total * 0.75", () => {
    expect(dailyAverageMg(1000, 4)).toBe(750);
  });

  it("9 meals (max) = 3 days → total / 3", () => {
    expect(dailyAverageMg(3600, 9)).toBe(1200);
  });

  it("returns 0 when meals=0 (defensive)", () => {
    expect(dailyAverageMg(1000, 0)).toBe(0);
  });

  it("returns 0 when meals<0 (defensive)", () => {
    expect(dailyAverageMg(1000, -1)).toBe(0);
  });
});
