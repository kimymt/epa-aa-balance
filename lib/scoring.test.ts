import { describe, expect, test } from "bun:test";
import { computeLight } from "./scoring";

describe("computeLight", () => {
  test("魚タンパク質 ≥ 50% → green", () => {
    expect(computeLight(50)).toBe("green");
    expect(computeLight(75)).toBe("green");
    expect(computeLight(100)).toBe("green");
  });

  test("25% ≤ 魚タンパク質 < 50% → yellow", () => {
    expect(computeLight(25)).toBe("yellow");
    expect(computeLight(40)).toBe("yellow");
    expect(computeLight(49)).toBe("yellow");
  });

  test("魚タンパク質 < 25% → red", () => {
    expect(computeLight(0)).toBe("red");
    expect(computeLight(10)).toBe("red");
    expect(computeLight(24)).toBe("red");
  });

  test("境界値: 50%ちょうど → green", () => {
    expect(computeLight(50)).toBe("green");
  });

  test("境界値: 25%ちょうど → yellow", () => {
    expect(computeLight(25)).toBe("yellow");
  });

  test("境界値: 49.999% → yellow", () => {
    expect(computeLight(49.999)).toBe("yellow");
  });
});
