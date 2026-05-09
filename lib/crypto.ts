// クライアント側 AES-GCM 暗号化ヘルパー (v0.8.3)
//
// E2E 暗号化のフロー:
//   1. ユーザーが Passkey で WebAuthn auth → response.clientExtensionResults.prf.results.first
//      に PRF 派生 32 bytes が入る (端末側で派生、サーバーには渡らない)
//   2. その 32 bytes を AES-256-GCM の対称鍵として importPrfKey で CryptoKey 化
//   3. 履歴データを encryptJson で暗号化 → base64url ciphertext を server へ送信
//   4. 履歴閲覧時、サーバーから ciphertext を取得 → decryptJson で復号
//
// セキュリティ上の選択:
//   - 鍵は extractable: false で import (raw bytes をエクスポート不能、メモリ漏洩リスク低減)
//   - IV は暗号化のたびに 12 bytes ランダム生成 (AES-GCM 標準)
//   - Auth tag (16 bytes) は ciphertext 末尾に付加される (Web Crypto API 仕様)
//   - 出力フォーマット: IV (12) || ciphertext+tag → base64url
//
// Web Crypto API は Node 20+ / 全モダンブラウザでサポート。

const AES_GCM = { name: "AES-GCM" } as const;
const IV_BYTES = 12;
const PRF_KEY_BYTES = 32; // AES-256-GCM = 256 bits

/**
 * WebAuthn PRF 応答から取得した 32 bytes を AES-GCM の鍵として import する。
 * extractable: false で raw bytes を後から取り出せないようにする (security boundary)。
 */
export async function importPrfKey(prfBytes: Uint8Array): Promise<CryptoKey> {
  if (prfBytes.byteLength !== PRF_KEY_BYTES) {
    throw new Error(
      `PRF key must be ${PRF_KEY_BYTES} bytes (got ${prfBytes.byteLength})`
    );
  }
  // TS strict mode 対策: Uint8Array<ArrayBuffer> を保証するため明示コピー
  const buf = new Uint8Array(PRF_KEY_BYTES);
  buf.set(prfBytes);
  return await crypto.subtle.importKey(
    "raw",
    buf,
    AES_GCM,
    false, // not extractable: 鍵バイト列を JS から取り出せないようにする
    ["encrypt", "decrypt"]
  );
}

/**
 * 任意の JSON 化可能オブジェクトを AES-256-GCM で暗号化し、base64url string にして返す。
 * 出力フォーマット: IV (12 bytes) || ciphertext (variable) || auth_tag (16 bytes、自動付与)
 */
export async function encryptJson(
  key: CryptoKey,
  payload: unknown
): Promise<string> {
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ ...AES_GCM, iv }, key, plaintext)
  );

  // IV と ciphertext を concat
  const combined = new Uint8Array(IV_BYTES + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(ciphertext, IV_BYTES);
  return toBase64Url(combined);
}

/**
 * encryptJson が返した base64url string を復号して JSON parse 結果を返す。
 * - 鍵が違う / IV が壊れている / ciphertext 改竄 → throw
 * - JSON parse 失敗 → throw
 */
export async function decryptJson<T = unknown>(
  key: CryptoKey,
  ciphertextBase64Url: string
): Promise<T> {
  const combined = fromBase64Url(ciphertextBase64Url);
  if (combined.byteLength < IV_BYTES + 16 /* min tag size */) {
    throw new Error("Ciphertext too short");
  }
  const iv = combined.slice(0, IV_BYTES);
  const data = combined.slice(IV_BYTES);
  const plaintextBuffer = await crypto.subtle.decrypt(
    { ...AES_GCM, iv },
    key,
    data
  );
  const plaintext = new TextDecoder().decode(plaintextBuffer);
  return JSON.parse(plaintext) as T;
}

// ------------------------------------------------------------
// base64url helpers (browser + Node 互換)
//
// 注: lib/webauthn.ts も同名の helper を持つが、あちらは Buffer (Node 専用)
// を使っている。本ファイルは client (browser) で動くため、Buffer に依存しない
// 実装を採用する。
// ------------------------------------------------------------

export function toBase64Url(bytes: Uint8Array): string {
  // btoa を使うため、まず binary string 化
  let bin = "";
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  // 標準 base64 → URL-safe (+/= → -_) に変換
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(s: string): Uint8Array {
  // URL-safe → 標準 base64 に戻す + padding 復元
  const std = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = std.length % 4 === 0 ? "" : "=".repeat(4 - (std.length % 4));
  const bin = atob(std + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}
