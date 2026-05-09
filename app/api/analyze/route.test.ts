// pickDominantCode の単体テスト (v0.8.6 / F-012)
//
// 全 photo 失敗時の top-level error code を per-photo code 配列から決める
// pure function。ルートハンドラ全体は Next.js の依存が重く、ここでは
// 集約ロジックだけ切り出して検証する。
//
// 規則 (実装側のコメントと整合):
//   1. 全部同じ → その code
//   2. CONFIG_ERROR / AUTH_FAILED が 1 件でもあれば優先 (= サーバー設定問題)
//   3. QUOTA_EXHAUSTED / SERVER_ERROR / RATE_LIMITED / TIMEOUT / NETWORK / NO_FOOD
//      の優先度順に「過半数 (strict majority)」判定
//   4. 該当なし (混在) → UNKNOWN

import { describe, it, expect } from "bun:test";
import type { VisionErrorCode } from "@/lib/vision";
import { pickDominantCode } from "./route";

describe("pickDominantCode — 全部同じケース (規則 1)", () => {
  it("空配列 → UNKNOWN (= 防御パス)", () => {
    expect(pickDominantCode([])).toBe("UNKNOWN");
  });

  it("単一 QUOTA_EXHAUSTED → QUOTA_EXHAUSTED", () => {
    expect(pickDominantCode(["QUOTA_EXHAUSTED"])).toBe("QUOTA_EXHAUSTED");
  });

  it("全部 NO_FOOD (3 件) → NO_FOOD", () => {
    expect(pickDominantCode(["NO_FOOD", "NO_FOOD", "NO_FOOD"])).toBe("NO_FOOD");
  });

  it("全部 TIMEOUT (5 件) → TIMEOUT", () => {
    expect(
      pickDominantCode(["TIMEOUT", "TIMEOUT", "TIMEOUT", "TIMEOUT", "TIMEOUT"]),
    ).toBe("TIMEOUT");
  });
});

describe("pickDominantCode — CONFIG_ERROR / AUTH_FAILED が最優先 (規則 2)", () => {
  it("CONFIG_ERROR が 1 件混じる → CONFIG_ERROR (他が大多数でも)", () => {
    const codes: VisionErrorCode[] = [
      "QUOTA_EXHAUSTED",
      "QUOTA_EXHAUSTED",
      "CONFIG_ERROR",
    ];
    expect(pickDominantCode(codes)).toBe("CONFIG_ERROR");
  });

  it("AUTH_FAILED が 1 件混じる → AUTH_FAILED", () => {
    const codes: VisionErrorCode[] = ["NO_FOOD", "NO_FOOD", "AUTH_FAILED"];
    expect(pickDominantCode(codes)).toBe("AUTH_FAILED");
  });

  it("CONFIG_ERROR と AUTH_FAILED 両方 → CONFIG_ERROR (より重大)", () => {
    expect(pickDominantCode(["AUTH_FAILED", "CONFIG_ERROR"])).toBe(
      "CONFIG_ERROR",
    );
  });
});

describe("pickDominantCode — 過半数優先 (規則 3)", () => {
  it("QUOTA 2 + NO_FOOD 1 → QUOTA_EXHAUSTED", () => {
    expect(
      pickDominantCode(["QUOTA_EXHAUSTED", "QUOTA_EXHAUSTED", "NO_FOOD"]),
    ).toBe("QUOTA_EXHAUSTED");
  });

  it("SERVER 3 + NETWORK 2 → SERVER_ERROR (3/5 = 60% > half)", () => {
    expect(
      pickDominantCode([
        "SERVER_ERROR",
        "SERVER_ERROR",
        "SERVER_ERROR",
        "NETWORK",
        "NETWORK",
      ]),
    ).toBe("SERVER_ERROR");
  });

  it("QUOTA と SERVER 同数 (2-2) → どちらも過半 NOT、規則 4 で UNKNOWN", () => {
    expect(
      pickDominantCode([
        "QUOTA_EXHAUSTED",
        "QUOTA_EXHAUSTED",
        "SERVER_ERROR",
        "SERVER_ERROR",
      ]),
    ).toBe("UNKNOWN");
  });

  it("優先順位: QUOTA > SERVER (両方 1 件、片方が過半数なら優先)", () => {
    // QUOTA 2 + SERVER 1 = 3 件中 QUOTA が 2/3 過半数
    expect(
      pickDominantCode(["QUOTA_EXHAUSTED", "QUOTA_EXHAUSTED", "SERVER_ERROR"]),
    ).toBe("QUOTA_EXHAUSTED");
  });

  it("RATE_LIMITED が過半 → RATE_LIMITED", () => {
    expect(pickDominantCode(["RATE_LIMITED", "RATE_LIMITED", "NO_FOOD"])).toBe(
      "RATE_LIMITED",
    );
  });

  it("NO_FOOD が過半 → NO_FOOD (この場合のみ「明るい場所」表現が出る)", () => {
    expect(pickDominantCode(["NO_FOOD", "NO_FOOD", "NO_FOOD", "TIMEOUT"])).toBe(
      "NO_FOOD",
    );
  });
});

describe("pickDominantCode — 混在で過半なし (規則 4)", () => {
  it("4 種類混在、全て同数 → UNKNOWN", () => {
    expect(
      pickDominantCode(["QUOTA_EXHAUSTED", "TIMEOUT", "NETWORK", "NO_FOOD"]),
    ).toBe("UNKNOWN");
  });

  it("UNKNOWN が過半でも明示的に UNKNOWN (= 区別不能)", () => {
    expect(pickDominantCode(["UNKNOWN", "UNKNOWN", "QUOTA_EXHAUSTED"])).toBe(
      "UNKNOWN",
    );
  });
});

describe("pickDominantCode — F-012 の元ケース (regression)", () => {
  // バグ報告: ユーザーは Vision API quota 起因の 429 を全 photo で受けたのに
  // 「明るい場所で撮影し直してください」と表示された。
  // 修正後は QUOTA_EXHAUSTED が選ばれ、quota 用の文言が出る必要がある。
  it("3 photos すべて QUOTA_EXHAUSTED → QUOTA_EXHAUSTED (旧バグ: NO_FOOD 文言が出ていた)", () => {
    expect(
      pickDominantCode([
        "QUOTA_EXHAUSTED",
        "QUOTA_EXHAUSTED",
        "QUOTA_EXHAUSTED",
      ]),
    ).toBe("QUOTA_EXHAUSTED");
  });
});
