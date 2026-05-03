// lib/rate-limit.ts のユニットテスト (v0.4.2)
//
// D1 を叩く checkRateLimit / logRequest は integration test として手動確認
// (本番デプロイ後)。ここでは pure helper のみ:
//   - getClientIp: x-forwarded-for / x-real-ip / fallback の挙動
//   - hashIp: 決定性、secret で出力が変わる、IP で出力が変わる、長さ 16 hex

import { describe, it, expect } from "bun:test";
import { getClientIp, hashIp } from "./rate-limit";

describe("getClientIp", () => {
  it("returns first IP from x-forwarded-for", () => {
    const req = new Request("https://example.com", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });
    expect(getClientIp(req)).toBe("1.2.3.4");
  });

  it("trims whitespace", () => {
    const req = new Request("https://example.com", {
      headers: { "x-forwarded-for": "  1.2.3.4  , 5.6.7.8" },
    });
    expect(getClientIp(req)).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip when no x-forwarded-for", () => {
    const req = new Request("https://example.com", {
      headers: { "x-real-ip": "9.9.9.9" },
    });
    expect(getClientIp(req)).toBe("9.9.9.9");
  });

  it("returns 'unknown' when no headers present", () => {
    const req = new Request("https://example.com");
    expect(getClientIp(req)).toBe("unknown");
  });

  it("handles single IP without comma", () => {
    const req = new Request("https://example.com", {
      headers: { "x-forwarded-for": "203.0.113.5" },
    });
    expect(getClientIp(req)).toBe("203.0.113.5");
  });

  it("handles IPv6", () => {
    const req = new Request("https://example.com", {
      headers: { "x-forwarded-for": "2001:db8::1" },
    });
    expect(getClientIp(req)).toBe("2001:db8::1");
  });
});

describe("hashIp", () => {
  it("produces a 16-char hex string", () => {
    const h = hashIp("1.2.3.4", "test-secret");
    expect(h).toMatch(/^[0-9a-f]{16}$/);
  });

  it("is deterministic for same input", () => {
    expect(hashIp("1.2.3.4", "s")).toBe(hashIp("1.2.3.4", "s"));
  });

  it("differs by IP (same secret)", () => {
    expect(hashIp("1.2.3.4", "s")).not.toBe(hashIp("1.2.3.5", "s"));
  });

  it("differs by secret (same IP)", () => {
    expect(hashIp("1.2.3.4", "secret-a")).not.toBe(hashIp("1.2.3.4", "secret-b"));
  });

  it("never returns the raw IP", () => {
    expect(hashIp("1.2.3.4", "s")).not.toContain("1.2.3.4");
  });

  it("handles 'unknown' (fallback IP)", () => {
    const h = hashIp("unknown", "s");
    expect(h).toMatch(/^[0-9a-f]{16}$/);
  });
});
