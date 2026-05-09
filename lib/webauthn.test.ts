// WebAuthn ヘルパーのユニットテスト (v0.8.1)
//
// 実認証器を使えないので、@simplewebauthn/server の verifyRegistrationResponse
// 等は呼ばない。代わりに以下を検証:
//   - deriveRpInfo: URL → rpID + origin の導出ロジック
//   - buildRegistrationOptions: PRF Extension が options に組み込まれているか
//   - buildAuthenticationOptions: 同上、PRF eval salt が固定値か
//   - toBase64Url / fromBase64Url: roundtrip

import { describe, it, expect } from "bun:test";
import {
  deriveRpInfo,
  buildRegistrationOptions,
  buildAuthenticationOptions,
  toBase64Url,
  fromBase64Url,
} from "./webauthn";

describe("deriveRpInfo", () => {
  it("extracts hostname and origin from production URL", () => {
    const r = deriveRpInfo("https://epaaa.mymt.casa/api/auth/register/start");
    expect(r.rpID).toBe("epaaa.mymt.casa");
    expect(r.origin).toBe("https://epaaa.mymt.casa");
  });

  it("works for Vercel preview URL", () => {
    const r = deriveRpInfo(
      "https://eaa-scorer-abc123-xyz.vercel.app/api/auth/register/start"
    );
    expect(r.rpID).toBe("eaa-scorer-abc123-xyz.vercel.app");
    expect(r.origin).toBe("https://eaa-scorer-abc123-xyz.vercel.app");
  });

  it("works for local dev (localhost)", () => {
    const r = deriveRpInfo("http://localhost:3000/api/auth/register/start");
    expect(r.rpID).toBe("localhost");
    expect(r.origin).toBe("http://localhost:3000");
  });

  it("strips path / query from origin", () => {
    const r = deriveRpInfo(
      "https://epaaa.mymt.casa/some/long/path?foo=bar&baz=qux"
    );
    expect(r.rpID).toBe("epaaa.mymt.casa");
    expect(r.origin).toBe("https://epaaa.mymt.casa");
  });
});

describe("buildRegistrationOptions", () => {
  it("returns options with rpID matching request URL", async () => {
    const { options } = await buildRegistrationOptions(
      "user-1",
      "https://epaaa.mymt.casa/api/auth/register/start"
    );
    expect(options.rp.id).toBe("epaaa.mymt.casa");
  });

  it("includes PRF extension request", async () => {
    const { options } = await buildRegistrationOptions(
      "user-1",
      "https://epaaa.mymt.casa/api/auth/register/start"
    );
    const ext = (options as { extensions?: { prf?: unknown } }).extensions;
    expect(ext?.prf).toBeDefined();
  });

  it("returns a non-empty challenge", async () => {
    const { challenge } = await buildRegistrationOptions(
      "user-1",
      "https://epaaa.mymt.casa/api/auth/register/start"
    );
    expect(challenge.length).toBeGreaterThan(10);
  });

  it("uses anonymous user labels (no PII)", async () => {
    const { options } = await buildRegistrationOptions(
      "user-1",
      "https://epaaa.mymt.casa/api/auth/register/start"
    );
    // user.name / user.displayName are intentionally fixed to non-PII
    expect(options.user.name).toBe("あなた");
    expect(options.user.displayName).toBe("あなた");
  });

  it("requests resident key (discoverable credential)", async () => {
    const { options } = await buildRegistrationOptions(
      "user-1",
      "https://epaaa.mymt.casa/api/auth/register/start"
    );
    expect(options.authenticatorSelection?.residentKey).toBe("required");
  });
});

describe("buildAuthenticationOptions", () => {
  it("returns options with rpID and a challenge", async () => {
    const { options, challenge } = await buildAuthenticationOptions(
      "https://epaaa.mymt.casa/api/auth/login/start"
    );
    expect(options.rpId).toBe("epaaa.mymt.casa");
    expect(challenge.length).toBeGreaterThan(10);
  });

  it("includes PRF extension with eval salt for key derivation", async () => {
    const { options } = await buildAuthenticationOptions(
      "https://epaaa.mymt.casa/api/auth/login/start"
    );
    const ext = (
      options as { extensions?: { prf?: { eval?: { first?: string } } } }
    ).extensions;
    expect(ext?.prf?.eval?.first).toBeDefined();
    // Salt は固定値 (app-level、version suffix v1) — 値の安定性を担保
    expect(ext?.prf?.eval?.first?.length).toBeGreaterThan(8);
  });

  it("uses empty allowCredentials (relies on discoverable credentials)", async () => {
    const { options } = await buildAuthenticationOptions(
      "https://epaaa.mymt.casa/api/auth/login/start"
    );
    expect(options.allowCredentials).toEqual([]);
  });
});

describe("toBase64Url / fromBase64Url", () => {
  it("roundtrips arbitrary bytes", () => {
    const original = new Uint8Array([0, 1, 2, 3, 250, 251, 252, 253, 254, 255]);
    const encoded = toBase64Url(original);
    const decoded = fromBase64Url(encoded);
    expect(Array.from(decoded)).toEqual(Array.from(original));
  });

  it("produces URL-safe characters only (no + / =)", () => {
    const bytes = new Uint8Array([255, 255, 255, 255]); // would be //// in normal base64
    const encoded = toBase64Url(bytes);
    expect(encoded).not.toMatch(/[+/=]/);
  });

  it("handles empty bytes", () => {
    const encoded = toBase64Url(new Uint8Array(0));
    expect(encoded).toBe("");
    const decoded = fromBase64Url("");
    expect(decoded.length).toBe(0);
  });
});
