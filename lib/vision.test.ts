// Vision API エラー分類のテスト (v0.8.6 / F-012)
//
// classifyVisionError と userMessageForCode の組合せが、
// 「どの写真も解析できませんでした。明るい場所で撮影し直してください。」
// 汎用文言を出していたバグの再発を防ぐ regression test。
//
// 実 API は呼ばないため網羅的に書ける。各 code の分岐 + 文言の存在確認のみ。

import { describe, it, expect } from "bun:test";
import {
  classifyVisionError,
  userMessageForCode,
  VisionError,
  type VisionErrorCode,
} from "./vision";

// @google/genai の ApiError は { status: number, message: string } 互換オブジェクト。
// SDK 内部実装に依存しないため shape のみ模倣。
function apiError(status: number, message: string): unknown {
  const e = new Error(message) as Error & { status: number };
  e.status = status;
  return e;
}

describe("classifyVisionError — HTTP status 分類", () => {
  it("429 + RESOURCE_EXHAUSTED → QUOTA_EXHAUSTED", () => {
    expect(
      classifyVisionError(
        apiError(
          429,
          "Resource has been exhausted (e.g. check quota). [RESOURCE_EXHAUSTED]",
        ),
      ),
    ).toBe("QUOTA_EXHAUSTED");
  });

  it("429 + 大文字 quota 文言 → QUOTA_EXHAUSTED", () => {
    expect(
      classifyVisionError(apiError(429, "Quota limit reached for the day")),
    ).toBe("QUOTA_EXHAUSTED");
  });

  it("429 だが quota 文言なし → RATE_LIMITED (短期)", () => {
    expect(classifyVisionError(apiError(429, "Too Many Requests"))).toBe(
      "RATE_LIMITED",
    );
  });

  it("401 → AUTH_FAILED", () => {
    expect(classifyVisionError(apiError(401, "Invalid API key"))).toBe(
      "AUTH_FAILED",
    );
  });

  it("403 → AUTH_FAILED", () => {
    expect(classifyVisionError(apiError(403, "Permission denied"))).toBe(
      "AUTH_FAILED",
    );
  });

  it.each([500, 502, 503, 504])("%d → SERVER_ERROR", (status) => {
    expect(classifyVisionError(apiError(status, "Service unavailable"))).toBe(
      "SERVER_ERROR",
    );
  });

  it("400 (それ以外の 4xx) → BAD_RESPONSE", () => {
    expect(classifyVisionError(apiError(400, "Invalid argument"))).toBe(
      "BAD_RESPONSE",
    );
  });
});

describe("classifyVisionError — message 経由の network 検出", () => {
  it.each([
    "fetch failed",
    "Network error",
    "getaddrinfo ENOTFOUND api.googleapis.com",
    "connect ECONNREFUSED 127.0.0.1:443",
    "ETIMEDOUT",
    "socket hang up",
  ])("'%s' → NETWORK", (msg) => {
    expect(classifyVisionError(new Error(msg))).toBe("NETWORK");
  });
});

describe("classifyVisionError — その他", () => {
  it("AbortError → TIMEOUT (防御パス)", () => {
    const e = new Error("aborted");
    e.name = "AbortError";
    expect(classifyVisionError(e)).toBe("TIMEOUT");
  });

  it("status も network 文言も無い汎用 Error → UNKNOWN", () => {
    expect(classifyVisionError(new Error("something weird happened"))).toBe(
      "UNKNOWN",
    );
  });

  it("null / undefined / 非 Error → UNKNOWN", () => {
    expect(classifyVisionError(null)).toBe("UNKNOWN");
    expect(classifyVisionError(undefined)).toBe("UNKNOWN");
    expect(classifyVisionError("string error")).toBe("UNKNOWN");
    expect(classifyVisionError({ random: "obj" })).toBe("UNKNOWN");
  });
});

describe("userMessageForCode — 各 code に文言が存在", () => {
  const allCodes: VisionErrorCode[] = [
    "QUOTA_EXHAUSTED",
    "RATE_LIMITED",
    "AUTH_FAILED",
    "SERVER_ERROR",
    "TIMEOUT",
    "NETWORK",
    "NO_FOOD",
    "BAD_RESPONSE",
    "CONFIG_ERROR",
    "UNKNOWN",
  ];

  it.each(allCodes)("%s に対応する非空文字列を返す", (code) => {
    const msg = userMessageForCode(code);
    expect(typeof msg).toBe("string");
    expect(msg.length).toBeGreaterThan(0);
  });

  it("QUOTA_EXHAUSTED は『1 時間』のヒントを含む (回復目安)", () => {
    expect(userMessageForCode("QUOTA_EXHAUSTED")).toContain("1 時間");
  });

  it("RATE_LIMITED は『1〜2 分』のヒントを含む (短期回復)", () => {
    expect(userMessageForCode("RATE_LIMITED")).toContain("1〜2 分");
  });

  it("NO_FOOD は『明るい場所』を含む (旧汎用文言の正当な用法)", () => {
    expect(userMessageForCode("NO_FOOD")).toContain("明るい場所");
  });

  it("AUTH_FAILED と CONFIG_ERROR は『GitHub の Issue』を含む (問い合わせ誘導)", () => {
    expect(userMessageForCode("AUTH_FAILED")).toContain("GitHub");
    expect(userMessageForCode("CONFIG_ERROR")).toContain("GitHub");
  });
});

describe("VisionError — code field", () => {
  it("code 省略時は UNKNOWN", () => {
    const err = new VisionError("internal", "ユーザー向け");
    expect(err.code).toBe("UNKNOWN");
  });

  it("code を明示すると保持される", () => {
    const err = new VisionError("internal", "ユーザー向け", "QUOTA_EXHAUSTED");
    expect(err.code).toBe("QUOTA_EXHAUSTED");
  });

  it("instanceof Error として動作する", () => {
    const err = new VisionError("internal", "ユーザー向け", "TIMEOUT");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(VisionError);
  });
});
