// クライアント側暗号化ヘルパーのユニットテスト (v0.8.3)
//
// Web Crypto API は bun (Node 20+ 互換) で利用可能なので、実際の暗号 lib を
// そのまま動かす。

import { describe, it, expect } from "bun:test";
import {
  importPrfKey,
  encryptJson,
  decryptJson,
  toBase64Url,
  fromBase64Url,
} from "./crypto";

/** 32 bytes のテスト用「PRF 派生」鍵を生成。 */
function makeKeyBytes(seed = 0): Uint8Array {
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) bytes[i] = (seed + i) & 0xff;
  return bytes;
}

describe("importPrfKey", () => {
  it("imports 32-byte key successfully", async () => {
    const key = await importPrfKey(makeKeyBytes());
    expect(key.algorithm.name).toBe("AES-GCM");
    expect(key.usages).toContain("encrypt");
    expect(key.usages).toContain("decrypt");
    expect(key.extractable).toBe(false); // セキュリティ重要: extract 不可
  });

  it("rejects key shorter than 32 bytes", async () => {
    await expect(importPrfKey(new Uint8Array(16))).rejects.toThrow(
      /must be 32 bytes/
    );
  });

  it("rejects key longer than 32 bytes", async () => {
    await expect(importPrfKey(new Uint8Array(64))).rejects.toThrow(
      /must be 32 bytes/
    );
  });
});

describe("encryptJson / decryptJson roundtrip", () => {
  it("preserves a simple object", async () => {
    const key = await importPrfKey(makeKeyBytes());
    const original = { hello: "world", n: 42 };
    const ciphertext = await encryptJson(key, original);
    const decrypted = await decryptJson(key, ciphertext);
    expect(decrypted).toEqual(original);
  });

  it("preserves nested structures and arrays", async () => {
    const key = await importPrfKey(makeKeyBytes());
    const original = {
      recipes: [
        { name: "サバ味噌煮", ingredients: ["サバ", "味噌"] },
        { name: "鯵刺身", ingredients: ["鯵"] },
      ],
      meta: { count: 2, avgLipid: 47.3 },
    };
    const ciphertext = await encryptJson(key, original);
    const decrypted = await decryptJson<typeof original>(key, ciphertext);
    expect(decrypted).toEqual(original);
  });

  it("preserves Japanese text and emoji", async () => {
    const key = await importPrfKey(makeKeyBytes());
    const original = { name: "🐟 サバの味噌煮", desc: "EPA・DHA 豊富" };
    expect(await decryptJson(key, await encryptJson(key, original))).toEqual(original);
  });

  it("handles empty object", async () => {
    const key = await importPrfKey(makeKeyBytes());
    expect(await decryptJson(key, await encryptJson(key, {}))).toEqual({});
  });

  it("handles primitives (string, number, boolean, null)", async () => {
    const key = await importPrfKey(makeKeyBytes());
    expect(await decryptJson(key, await encryptJson(key, "hello"))).toBe("hello");
    expect(await decryptJson(key, await encryptJson(key, 123))).toBe(123);
    expect(await decryptJson(key, await encryptJson(key, true))).toBe(true);
    expect(await decryptJson(key, await encryptJson(key, null))).toBe(null);
  });

  it("produces different ciphertexts for the same plaintext (random IV)", async () => {
    const key = await importPrfKey(makeKeyBytes());
    const payload = { same: "input" };
    const c1 = await encryptJson(key, payload);
    const c2 = await encryptJson(key, payload);
    // 同じ平文でも IV がランダムなので毎回違う ciphertext (確率的にほぼ 100%)
    expect(c1).not.toBe(c2);
    // 復号結果は同じ
    expect(await decryptJson(key, c1)).toEqual(payload);
    expect(await decryptJson(key, c2)).toEqual(payload);
  });

  it("ciphertext length scales with payload size (sanity)", async () => {
    const key = await importPrfKey(makeKeyBytes());
    const small = await encryptJson(key, { x: 1 });
    const large = await encryptJson(key, { x: "a".repeat(1000) });
    expect(large.length).toBeGreaterThan(small.length);
  });
});

describe("encryptJson / decryptJson error cases", () => {
  it("decrypt fails with wrong key", async () => {
    const key1 = await importPrfKey(makeKeyBytes(1));
    const key2 = await importPrfKey(makeKeyBytes(2));
    const ciphertext = await encryptJson(key1, { secret: "abc" });
    await expect(decryptJson(key2, ciphertext)).rejects.toThrow();
  });

  it("decrypt fails on tampered ciphertext (auth tag invalidated)", async () => {
    const key = await importPrfKey(makeKeyBytes());
    const ciphertext = await encryptJson(key, { hi: "there" });
    // 末尾 1 文字を変える
    const tampered = ciphertext.slice(0, -1) + (ciphertext.endsWith("A") ? "B" : "A");
    await expect(decryptJson(key, tampered)).rejects.toThrow();
  });

  it("decrypt rejects too-short ciphertext", async () => {
    const key = await importPrfKey(makeKeyBytes());
    await expect(decryptJson(key, "abc")).rejects.toThrow(/too short/);
  });

  it("decrypt fails on garbage base64", async () => {
    const key = await importPrfKey(makeKeyBytes());
    await expect(decryptJson(key, "!!!not_base64!!!")).rejects.toThrow();
  });
});

describe("toBase64Url / fromBase64Url", () => {
  it("roundtrips arbitrary bytes (browser-compatible impl)", () => {
    const original = new Uint8Array([0, 1, 2, 3, 250, 251, 252, 253, 254, 255]);
    const encoded = toBase64Url(original);
    const decoded = fromBase64Url(encoded);
    expect(Array.from(decoded)).toEqual(Array.from(original));
  });

  it("uses URL-safe characters (no + / =)", () => {
    const bytes = new Uint8Array([255, 255, 255, 255]);
    expect(toBase64Url(bytes)).not.toMatch(/[+/=]/);
  });

  it("matches lib/webauthn.ts (Buffer-based) output for cross-implementation safety", () => {
    // Buffer.from(bytes).toString("base64url") と一致する必要がある
    const bytes = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    expect(toBase64Url(bytes)).toBe("SGVsbG8");
  });

  it("handles empty bytes", () => {
    expect(toBase64Url(new Uint8Array(0))).toBe("");
    expect(fromBase64Url("").length).toBe(0);
  });
});
