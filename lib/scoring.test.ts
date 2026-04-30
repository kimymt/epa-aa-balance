import { describe, expect, test } from "bun:test";
import { computeLight, computeScores, buildResult } from "./scoring";
import { EAA_KEYS, EAA_REFERENCE_MG_PER_G_PROTEIN, type EAAKey } from "./standards";

function fillEaa(n: number): Record<EAAKey, number> {
  return Object.fromEntries(EAA_KEYS.map((k) => [k, n])) as Record<EAAKey, number>;
}

/** 基準パターン通り（全EAAが100%スコアになる） */
function referencePerG(): Record<EAAKey, number> {
  return { ...EAA_REFERENCE_MG_PER_G_PROTEIN };
}

describe("computeLight", () => {
  test("limitingScore >= 100 → green", () => {
    expect(computeLight(100)).toBe("green");
    expect(computeLight(150)).toBe("green");
  });

  test("80 ≤ limitingScore < 100 → yellow", () => {
    expect(computeLight(80)).toBe("yellow");
    expect(computeLight(99)).toBe("yellow");
  });

  test("limitingScore < 80 → red", () => {
    expect(computeLight(79)).toBe("red");
    expect(computeLight(50)).toBe("red");
  });
});

describe("computeScores", () => {
  test("基準パターン通りなら全EAAが100%", () => {
    const scores = computeScores(referencePerG());
    for (const k of EAA_KEYS) {
      expect(scores[k]).toBe(100);
    }
  });

  test("基準の半分なら全EAAが50%", () => {
    const half = {} as Record<EAAKey, number>;
    for (const k of EAA_KEYS) half[k] = EAA_REFERENCE_MG_PER_G_PROTEIN[k] / 2;
    const scores = computeScores(half);
    for (const k of EAA_KEYS) {
      expect(scores[k]).toBe(50);
    }
  });

  test("ゼロ入力でゼロ除算しない（基準値ゼロのEAAは無いが念のため）", () => {
    const scores = computeScores(fillEaa(0));
    for (const k of EAA_KEYS) {
      expect(scores[k]).toBe(0);
    }
  });
});

describe("buildResult", () => {
  test("基準パターン通り → green、limitingScore 100", () => {
    const r = buildResult(referencePerG());
    expect(r.light).toBe("green");
    expect(r.limitingScore).toBe(100);
    expect(r.deficient).toHaveLength(0);
  });

  test("リジンだけ不足（70%）→ red、limitingScore 70", () => {
    const eaa = referencePerG();
    eaa.lysine = EAA_REFERENCE_MG_PER_G_PROTEIN.lysine * 0.7;
    const r = buildResult(eaa);
    expect(r.light).toBe("red");
    expect(r.limitingScore).toBe(70);
    expect(r.deficient[0].key).toBe("lysine");
  });

  test("リジン85%、トリプトファン90% → yellow、limitingScore 85", () => {
    const eaa = referencePerG();
    eaa.lysine = EAA_REFERENCE_MG_PER_G_PROTEIN.lysine * 0.85;
    eaa.tryptophan = EAA_REFERENCE_MG_PER_G_PROTEIN.tryptophan * 0.9;
    const r = buildResult(eaa);
    expect(r.light).toBe("yellow");
    expect(r.limitingScore).toBe(85);
    expect(r.deficient[0].key).toBe("lysine");
  });

  test("不足EAAが充足率の低い順にソートされる", () => {
    const eaa = referencePerG();
    eaa.lysine = EAA_REFERENCE_MG_PER_G_PROTEIN.lysine * 0.7;
    eaa.tryptophan = EAA_REFERENCE_MG_PER_G_PROTEIN.tryptophan * 0.5;
    const r = buildResult(eaa);
    expect(r.deficient[0].key).toBe("tryptophan");
    expect(r.deficient[1].key).toBe("lysine");
  });
});
