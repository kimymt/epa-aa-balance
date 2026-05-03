// lib/timing-safe.ts のユニットテスト

import { describe, it, expect } from "bun:test";
import { constantTimeStringEqual } from "./timing-safe";

describe("constantTimeStringEqual", () => {
  it("returns true for identical strings", () => {
    expect(constantTimeStringEqual("foo", "foo")).toBe(true);
    expect(constantTimeStringEqual("", "")).toBe(true);
    expect(constantTimeStringEqual("a".repeat(1000), "a".repeat(1000))).toBe(true);
  });

  it("returns false for different strings of same length", () => {
    expect(constantTimeStringEqual("foo", "bar")).toBe(false);
    expect(constantTimeStringEqual("admin:secret1", "admin:secret2")).toBe(false);
  });

  it("returns false for different lengths (early return)", () => {
    expect(constantTimeStringEqual("foo", "fooo")).toBe(false);
    expect(constantTimeStringEqual("", "x")).toBe(false);
    expect(constantTimeStringEqual("longer-string", "short")).toBe(false);
  });

  it("handles UTF-8 multi-byte characters correctly", () => {
    // "あ" は UTF-8 で 3 バイト。string length と byte length が異なるケース。
    expect(constantTimeStringEqual("あいう", "あいう")).toBe(true);
    expect(constantTimeStringEqual("あいう", "あいえ")).toBe(false);
    // string.length 同じだが byte length 違う組み合わせ
    expect(constantTimeStringEqual("aaa", "あいう")).toBe(false);
  });

  it("handles base64 / token-like strings", () => {
    const tokenA = "x4f9z2K8mNvBcQrTyU7iOpLkJhGfDsAa";
    const tokenB = "x4f9z2K8mNvBcQrTyU7iOpLkJhGfDsAb";
    expect(constantTimeStringEqual(tokenA, tokenA)).toBe(true);
    expect(constantTimeStringEqual(tokenA, tokenB)).toBe(false);
  });
});
