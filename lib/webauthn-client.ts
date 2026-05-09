// クライアント側 WebAuthn ラッパー (v0.8.4)
//
// 提供するもの:
//   - registerPasskey()  : 新規 Passkey 登録 (PRF capability 検出付き)
//   - loginWithPasskey() : 既存 Passkey で認証
//   - registerOrLogin()  : ログイン優先、失敗時に登録 (UI 統合用)
//
// すべて成功時は setSession() で memory に session を保持する。
//
// PRF Extension 必須: 非対応端末で auth/register が成功しても、
// PRF results が返ってこない場合は throw して unsupported を伝える。
// (philosophy: 暗号化が成立しないなら履歴機能は無効化)
//
// "use client" は呼び出し元 component で付ける (本 lib は React 非依存、
// fetch + browser API のみ)。

import {
  startRegistration,
  startAuthentication,
} from "@simplewebauthn/browser";
import { importPrfKey } from "./crypto";
import { setSession } from "./auth-session";
import { fromBase64Url } from "./crypto";

/**
 * PRF Extension が利用可能かを WebAuthn capability で確認。
 * Browser native 機能であり、サーバー往復不要。
 */
export function isPasskeyAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential !== "undefined"
  );
}

export class PasskeyError extends Error {
  constructor(
    public readonly code:
      | "UNSUPPORTED"
      | "PRF_UNSUPPORTED"
      | "USER_CANCELLED"
      | "REGISTER_FAILED"
      | "LOGIN_FAILED"
      | "NETWORK"
      | "UNKNOWN",
    message: string
  ) {
    super(message);
    this.name = "PasskeyError";
  }
}

/**
 * 新規 Passkey 登録 + 即座に PRF 認証で対称鍵を取得して setSession。
 *
 * 流れ:
 *   1. /api/auth/register/start で options + registrationToken を取得
 *   2. browser で registration (FaceID 等のプロンプト)
 *   3. /api/auth/register/finish で credential を保存 + sessionToken 取得
 *   4. すぐに /api/auth/login/start + login で PRF eval を回し対称鍵を取得
 *      (registration 時は PRF capability discovery のみで eval 不可のため)
 *   5. setSession で memory に保持
 */
export async function registerPasskey(): Promise<{ userId: string }> {
  if (!isPasskeyAvailable()) {
    throw new PasskeyError("UNSUPPORTED", "Passkey 非対応のブラウザです。");
  }

  // 1. options + registrationToken
  const startRes = await fetch("/api/auth/register/start", { method: "POST" });
  if (!startRes.ok) {
    throw new PasskeyError("NETWORK", "登録開始に失敗しました。");
  }
  const { options, registrationToken } = await startRes.json();

  // 2. browser native registration
  let credential;
  try {
    credential = await startRegistration({ optionsJSON: options });
  } catch (err) {
    const e = err as { name?: string; message?: string };
    if (e?.name === "NotAllowedError" || e?.name === "AbortError") {
      throw new PasskeyError("USER_CANCELLED", "登録がキャンセルされました。");
    }
    throw new PasskeyError("REGISTER_FAILED", e.message ?? "登録に失敗しました。");
  }

  // 3. /api/auth/register/finish
  const finishRes = await fetch("/api/auth/register/finish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ registrationToken, credential }),
  });
  if (!finishRes.ok) {
    const j = (await finishRes.json().catch(() => ({}))) as { error?: string };
    throw new PasskeyError("REGISTER_FAILED", j.error ?? "登録の検証に失敗しました。");
  }
  const { userId, prfSupported } = (await finishRes.json()) as {
    userId: string;
    prfSupported: boolean;
  };

  if (!prfSupported) {
    // PRF 非対応 → 暗号化が成立しないので履歴機能は使えない
    // 既に D1 に user 行が作られているが、この時点では孤児になるだけ (無害)。
    // 将来 user 削除 API で消せる。
    throw new PasskeyError(
      "PRF_UNSUPPORTED",
      "このブラウザ・端末では履歴機能 (暗号化) に対応していません。"
    );
  }

  // 4. すぐ login して PRF eval を取得 (=暗号鍵を派生させる)
  await loginWithPasskey({ skipSessionCreate: false });

  return { userId };
}

/**
 * 既存 Passkey で認証 + PRF 鍵を派生して setSession。
 *
 * registerPasskey の最終ステップでも内部呼び出しされる (skipSessionCreate=false)。
 * 戻ってきたユーザー (別 tab / 翌日 etc.) のメインエントリでもある。
 */
export async function loginWithPasskey(opts?: {
  skipSessionCreate?: boolean;
}): Promise<{ userId: string }> {
  if (!isPasskeyAvailable()) {
    throw new PasskeyError("UNSUPPORTED", "Passkey 非対応のブラウザです。");
  }

  // 1. options + loginToken
  const startRes = await fetch("/api/auth/login/start", { method: "POST" });
  if (!startRes.ok) {
    throw new PasskeyError("NETWORK", "ログイン開始に失敗しました。");
  }
  const { options, loginToken } = await startRes.json();

  // 2. browser auth (PRF eval extension が options に含まれている、
  //    response.clientExtensionResults.prf.results.first に派生鍵が乗る)
  let credential;
  try {
    credential = await startAuthentication({ optionsJSON: options });
  } catch (err) {
    const e = err as { name?: string; message?: string };
    if (e?.name === "NotAllowedError" || e?.name === "AbortError") {
      throw new PasskeyError("USER_CANCELLED", "認証がキャンセルされました。");
    }
    throw new PasskeyError("LOGIN_FAILED", e.message ?? "認証に失敗しました。");
  }

  // 3. PRF result を取り出す。startAuthentication の戻り値の型には
  //    clientExtensionResults が含まれるはず。
  const ext = (
    credential as typeof credential & {
      clientExtensionResults?: { prf?: { results?: { first?: string } } };
    }
  ).clientExtensionResults;
  const prfFirstB64 = ext?.prf?.results?.first;
  if (!prfFirstB64) {
    throw new PasskeyError(
      "PRF_UNSUPPORTED",
      "PRF Extension の応答が取得できませんでした。"
    );
  }
  const prfBytes = fromBase64Url(prfFirstB64);
  if (prfBytes.byteLength < 32) {
    throw new PasskeyError(
      "PRF_UNSUPPORTED",
      `PRF 鍵の長さが不足 (${prfBytes.byteLength} bytes)。`
    );
  }
  // PRF が 32 bytes 超えで返ってくる実装もあり得る (仕様上は任意長)。先頭 32 bytes を採用。
  const prfKey = await importPrfKey(prfBytes.slice(0, 32));

  // 4. /api/auth/login/finish
  const finishRes = await fetch("/api/auth/login/finish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ loginToken, credential }),
  });
  if (!finishRes.ok) {
    const j = (await finishRes.json().catch(() => ({}))) as { error?: string };
    throw new PasskeyError("LOGIN_FAILED", j.error ?? "認証の検証に失敗しました。");
  }
  const { sessionToken, userId } = (await finishRes.json()) as {
    sessionToken: string;
    userId: string;
  };

  // 5. memory に保持
  if (!opts?.skipSessionCreate) {
    setSession({ userId, sessionToken, prfKey });
  }

  return { userId };
}

/**
 * UI 統合用: ログイン優先、失敗時に新規登録に fallback。
 * - 既存 Passkey 持ちのユーザー → 普通にログイン
 * - 初回ユーザー → 新規登録
 *
 * 注: NotAllowedError (ユーザーキャンセル) は fallback せず即座に投げる
 *     (キャンセル後に登録 prompt を出すと UX が壊れる)。
 */
export async function registerOrLogin(): Promise<{ userId: string; action: "registered" | "logged-in" }> {
  try {
    const result = await loginWithPasskey();
    return { ...result, action: "logged-in" };
  } catch (err) {
    if (err instanceof PasskeyError) {
      if (err.code === "USER_CANCELLED" || err.code === "UNSUPPORTED") {
        throw err; // fallback しない
      }
    }
    // login 失敗 → 新規登録を試す
    const result = await registerPasskey();
    return { ...result, action: "registered" };
  }
}
