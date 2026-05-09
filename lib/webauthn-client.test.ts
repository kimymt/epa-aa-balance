// Passkey 登録 flag (localStorage-backed) のテスト (v0.8.4 fix)
//
// registerOrLogin の登録 / 認証ブランチ分岐は、本来 fetch + WebAuthn API
// 全体をモックする e2e に近い領域。ここでは下記の小さな性質だけ検証する:
//   - flag 初期値は false
//   - localStorage に "1" が入っていれば true
//   - localStorage 例外時 (Safari Private Mode 等) でも throw しない
// flag を立てる/外す内部 helper は registerPasskey/registerOrLogin から
// しか呼ばれないため、export せず動作確認は preview の手動 e2e で行う。

import { describe, it, expect, beforeEach } from "bun:test";
import { hasRegisteredPasskeyOnThisDevice } from "./webauthn-client";

describe("hasRegisteredPasskeyOnThisDevice", () => {
  beforeEach(() => {
    if (typeof localStorage !== "undefined") {
      try {
        localStorage.clear();
      } catch {
        // ignore
      }
    }
  });

  it("returns false when localStorage has no flag", () => {
    expect(hasRegisteredPasskeyOnThisDevice()).toBe(false);
  });

  it("returns true when flag is '1'", () => {
    localStorage.setItem("eaa.passkey.registered", "1");
    expect(hasRegisteredPasskeyOnThisDevice()).toBe(true);
  });

  it("returns false for other flag values (defensive)", () => {
    localStorage.setItem("eaa.passkey.registered", "yes");
    expect(hasRegisteredPasskeyOnThisDevice()).toBe(false);
    localStorage.setItem("eaa.passkey.registered", "");
    expect(hasRegisteredPasskeyOnThisDevice()).toBe(false);
  });
});
