// JWT ヘルパーのユニットテスト (v0.8.1)
//
// jose の sign/verify を実 lib で動かす (mock しない、ロジック軽量なため)。
// 時間操作は jose の jwtVerify の clock tolerance に頼らず、TTL 端は触らない。

import { describe, it, expect } from "bun:test";
import {
  issueSessionToken,
  verifySessionToken,
  issueRegistrationToken,
  verifyRegistrationToken,
  issueLoginToken,
  verifyLoginToken,
  readBearerSession,
} from "./jwt";

describe("issueSessionToken / verifySessionToken", () => {
  it("issues a token that verifies and returns userId", async () => {
    const token = await issueSessionToken("user-123");
    const result = await verifySessionToken(token);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.userId).toBe("user-123");
    }
  });

  it("rejects tampered token", async () => {
    const token = await issueSessionToken("user-123");
    // 改ざん: 末尾 1 文字を変える
    const tampered = token.slice(0, -1) + (token.endsWith("A") ? "B" : "A");
    const result = await verifySessionToken(tampered);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("invalid");
    }
  });

  it("rejects garbage", async () => {
    const result = await verifySessionToken("not-a-jwt");
    expect(result.ok).toBe(false);
  });

  it("rejects empty token", async () => {
    const result = await verifySessionToken("");
    expect(result.ok).toBe(false);
  });
});

describe("registration / login token isolation", () => {
  it("session token does NOT verify as registration token", async () => {
    const sessionTok = await issueSessionToken("user-x");
    const result = await verifyRegistrationToken(sessionTok);
    // 異なる issuer で発行されているので invalid
    expect(result.ok).toBe(false);
  });

  it("registration token does NOT verify as session token", async () => {
    const regTok = await issueRegistrationToken({
      userId: "user-y",
      challenge: "abc",
    });
    const result = await verifySessionToken(regTok);
    expect(result.ok).toBe(false);
  });

  it("login token does NOT verify as registration token", async () => {
    const loginTok = await issueLoginToken({ challenge: "xyz" });
    const result = await verifyRegistrationToken(loginTok);
    expect(result.ok).toBe(false);
  });
});

describe("registration token roundtrip", () => {
  it("preserves userId and challenge", async () => {
    const tok = await issueRegistrationToken({
      userId: "u-1",
      challenge: "ch-2",
    });
    const result = await verifyRegistrationToken(tok);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.userId).toBe("u-1");
      expect(result.payload.challenge).toBe("ch-2");
    }
  });
});

describe("login token roundtrip", () => {
  it("preserves challenge", async () => {
    const tok = await issueLoginToken({ challenge: "ch-3" });
    const result = await verifyLoginToken(tok);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.challenge).toBe("ch-3");
    }
  });
});

describe("readBearerSession", () => {
  it("returns null for null header", async () => {
    expect(await readBearerSession(null)).toBeNull();
  });

  it("returns null for non-Bearer header", async () => {
    expect(await readBearerSession("Basic abc")).toBeNull();
    expect(await readBearerSession("just-a-token")).toBeNull();
  });

  it("returns payload for valid Bearer header", async () => {
    const token = await issueSessionToken("user-99");
    const result = await readBearerSession(`Bearer ${token}`);
    expect(result).not.toBeNull();
    expect(result?.userId).toBe("user-99");
  });

  it("is case-insensitive on Bearer prefix", async () => {
    const token = await issueSessionToken("user-99");
    expect((await readBearerSession(`bearer ${token}`))?.userId).toBe("user-99");
    expect((await readBearerSession(`BEARER ${token}`))?.userId).toBe("user-99");
  });

  it("returns null for invalid token in Bearer", async () => {
    const result = await readBearerSession("Bearer invalid-jwt");
    expect(result).toBeNull();
  });
});
