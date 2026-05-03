// lib/onboarding.ts のユニットテスト
//
// localStorage を polyfill して状態遷移を検証する。
// Bun テストランナーはデフォルトで window/localStorage を持たないので、
// 簡易な in-memory 実装をモジュールレベルで注入する。

import { describe, it, expect, beforeEach } from "bun:test";

// --- localStorage polyfill (Bun は jsdom 持たないので) ---
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(k: string): string | null {
    return this.store.has(k) ? this.store.get(k)! : null;
  }
  setItem(k: string, v: string): void {
    this.store.set(k, v);
  }
  removeItem(k: string): void {
    this.store.delete(k);
  }
  clear(): void {
    this.store.clear();
  }
}
// グローバルに window + localStorage を捏造
(globalThis as unknown as { window: { localStorage: MemoryStorage } }).window = {
  localStorage: new MemoryStorage(),
};

// import は polyfill 注入後に行う（onboarding.ts が `typeof window !== "undefined"` をチェックする）
import {
  hasSeenOnboarding,
  markOnboardingSeen,
  resetOnboardingState,
  ONBOARDING_STORAGE_KEY,
} from "./onboarding";

beforeEach(() => {
  (globalThis as unknown as { window: { localStorage: MemoryStorage } }).window.localStorage.clear();
});

describe("hasSeenOnboarding", () => {
  it("returns false on first call (no key set)", () => {
    expect(hasSeenOnboarding()).toBe(false);
  });

  it("returns true after markOnboardingSeen", () => {
    markOnboardingSeen();
    expect(hasSeenOnboarding()).toBe(true);
  });

  it("returns false after resetOnboardingState", () => {
    markOnboardingSeen();
    resetOnboardingState();
    expect(hasSeenOnboarding()).toBe(false);
  });
});

describe("markOnboardingSeen", () => {
  it("stores an ISO timestamp", () => {
    markOnboardingSeen();
    const stored = window.localStorage.getItem(ONBOARDING_STORAGE_KEY);
    expect(stored).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("is idempotent (overwrites with new timestamp)", () => {
    markOnboardingSeen();
    const first = window.localStorage.getItem(ONBOARDING_STORAGE_KEY);
    // 微小遅延を作って 2 回目
    const before = Date.now();
    while (Date.now() - before < 5) {
      // busy wait 5ms
    }
    markOnboardingSeen();
    const second = window.localStorage.getItem(ONBOARDING_STORAGE_KEY);
    expect(second).not.toBe(first);
    expect(hasSeenOnboarding()).toBe(true);
  });
});

describe("STORAGE_KEY versioning", () => {
  it("includes -v1 suffix (so we can bump in future)", () => {
    expect(ONBOARDING_STORAGE_KEY).toContain("-v1");
  });
});
