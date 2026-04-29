import { describe, expect, test } from "bun:test";
import { computeLight, buildResult } from "./scoring";
import type { EAAKey } from "./standards";
import { EAA_KEYS } from "./standards";

function pct(n: number): Record<EAAKey, number> {
  return Object.fromEntries(EAA_KEYS.map((k) => [k, n])) as Record<EAAKey, number>;
}

describe("computeLight", () => {
  test("全EAAが100%以上 → green", () => {
    expect(computeLight(pct(100))).toBe("green");
    expect(computeLight(pct(150))).toBe("green");
  });

  test("いずれかが80-99% → yellow", () => {
    const p = pct(100);
    p.lysine = 85;
    expect(computeLight(p)).toBe("yellow");
  });

  test("いずれかが80%未満 → red（最優先）", () => {
    const p = pct(100);
    p.tryptophan = 79;
    expect(computeLight(p)).toBe("red");
  });

  test("赤と黄が混在 → red", () => {
    const p = pct(100);
    p.lysine = 85;
    p.tryptophan = 50;
    expect(computeLight(p)).toBe("red");
  });

  test("境界値: 80%ちょうど → yellow（赤ではない）", () => {
    const p = pct(100);
    p.lysine = 80;
    expect(computeLight(p)).toBe("yellow");
  });

  test("境界値: 100%ちょうど → green", () => {
    expect(computeLight(pct(100))).toBe("green");
  });
});

describe("buildResult", () => {
  test("充足率を正しく計算する", () => {
    const intake = pct(0);
    intake.lysine = 900;
    const req = pct(0);
    req.lysine = 1800;
    const result = buildResult(intake, req);
    expect(result.sufficiencyPct.lysine).toBe(50);
    expect(result.light).toBe("red");
  });

  test("不足EAAが充足率の低い順にソートされる", () => {
    const intake = pct(1000);
    const req = pct(1000);
    intake.lysine = 700;
    intake.tryptophan = 500;
    const result = buildResult(intake, req);
    expect(result.deficient[0].key).toBe("tryptophan");
    expect(result.deficient[1].key).toBe("lysine");
  });

  test("必要量が0の場合はゼロ除算しない", () => {
    const result = buildResult(pct(0), pct(0));
    expect(result.sufficiencyPct.lysine).toBe(0);
  });
});
