// lib/onboarding.ts のユニットテスト
//
// test/setup.ts の happy-dom localStorage で状態遷移を検証する。

import { describe, it, expect, beforeEach } from "bun:test";

// happy-dom is installed by test/setup.ts; keep its real window for other tests.
import {
  hasSeenOnboarding,
  markOnboardingSeen,
  resetOnboardingState,
  ONBOARDING_STORAGE_KEY,
} from "./onboarding";

beforeEach(() => {
  window.localStorage.clear();
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
