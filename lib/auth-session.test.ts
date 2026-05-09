// 認証セッション (memory-only) のテスト (v0.8.3)

import { describe, it, expect, beforeEach } from "bun:test";
import {
  getSession,
  setSession,
  clearSession,
  isAuthenticated,
} from "./auth-session";
import { importPrfKey } from "./crypto";

async function makeFakeSession() {
  const prfBytes = new Uint8Array(32).fill(7);
  const prfKey = await importPrfKey(prfBytes);
  return {
    userId: "test-user-1",
    sessionToken: "test-session-token",
    prfKey,
  };
}

describe("auth-session (memory-only)", () => {
  beforeEach(() => {
    // 各テスト前にリセット (module-scoped state)
    clearSession();
  });

  it("starts unauthenticated", () => {
    expect(getSession()).toBeNull();
    expect(isAuthenticated()).toBe(false);
  });

  it("setSession + getSession round-trips", async () => {
    const session = await makeFakeSession();
    setSession(session);
    expect(getSession()).toBe(session); // same reference
    expect(isAuthenticated()).toBe(true);
  });

  it("clearSession removes the session", async () => {
    setSession(await makeFakeSession());
    expect(isAuthenticated()).toBe(true);
    clearSession();
    expect(getSession()).toBeNull();
    expect(isAuthenticated()).toBe(false);
  });

  it("setSession overwrites previous session", async () => {
    const s1 = await makeFakeSession();
    setSession(s1);
    const s2 = { ...s1, userId: "test-user-2" };
    setSession(s2);
    expect(getSession()?.userId).toBe("test-user-2");
  });
});
