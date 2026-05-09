// クライアント側 WebAuthn ラッパー (v0.8.4)
//
// 提供するもの:
//   - registerPasskey()  : 新規 Passkey 登録 (PRF capability 検出付き)
//   - loginWithPasskey() : 既存 Passkey で認証
//   - registerOrLogin()  : 端末 flag に基づき登録 / 認証を選択 (UI 統合用)
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

/**
 * 「この端末で過去に Passkey を登録したか?」を localStorage に記録。
 *
 * 必要な理由: discoverable credential ベースの login (allowCredentials が空)
 * は、新規ユーザーに対して graceful に失敗しない。Chrome/Safari は
 * cross-device picker (QR コード) を表示してしまい、新規ユーザーは選べる
 * Passkey が無くキャンセルする以外なくなる。キャンセルは USER_CANCELLED で
 * fallback 対象外なので、登録 UI に到達できない。
 *
 * このため「flag が立っていれば login、立っていなければ register」と
 * 端末側で先に分岐する。flag は registration finish 成功時に立てる。
 */
const PASSKEY_REGISTERED_FLAG_KEY = "eaa.passkey.registered";

function safeLocalStorage(): Storage | null {
  try {
    return typeof window !== "undefined" && window.localStorage
      ? window.localStorage
      : null;
  } catch {
    // Safari Private Mode 等で throw する可能性あり
    return null;
  }
}

export function hasRegisteredPasskeyOnThisDevice(): boolean {
  const ls = safeLocalStorage();
  if (!ls) return false;
  try {
    return ls.getItem(PASSKEY_REGISTERED_FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

function markPasskeyRegistered(): void {
  const ls = safeLocalStorage();
  if (!ls) return;
  try {
    ls.setItem(PASSKEY_REGISTERED_FLAG_KEY, "1");
  } catch {
    // 容量超過等は無視 (動作は壊れない、次回 login が失敗 → register fallback)
  }
}

function clearPasskeyRegisteredFlag(): void {
  const ls = safeLocalStorage();
  if (!ls) return;
  try {
    ls.removeItem(PASSKEY_REGISTERED_FLAG_KEY);
  } catch {
    // ignore
  }
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
    const j = (await finishRes.json().catch(() => ({}))) as {
      error?: string;
      code?: string;
    };
    // v0.8.4: server が PRF 非対応を 400 で返す (orphan 防止のため D1 INSERT 前に判定)
    if (j.code === "PRF_UNSUPPORTED") {
      throw new PasskeyError(
        "PRF_UNSUPPORTED",
        j.error ?? "このブラウザ・端末では履歴機能 (暗号化) に対応していません。"
      );
    }
    throw new PasskeyError("REGISTER_FAILED", j.error ?? "登録の検証に失敗しました。");
  }
  const { userId } = (await finishRes.json()) as {
    userId: string;
    sessionToken: string;
  };

  // この端末で登録済 flag を立てる。次回 registerOrLogin() が直接 login に
  // 入れるようにする (新規ユーザーへの cross-device picker 誤表示を防ぐ)。
  // 内部 loginWithPasskey が失敗した場合でも flag は残し、retry 時に login
  // 経由で PRF 鍵を再派生できるようにする (server に credential は既にある)。
  markPasskeyRegistered();

  // 4. すぐ login して PRF eval を取得 (=暗号鍵を派生させる)
  // 注: register/finish が返す sessionToken は破棄。login で取り直す
  //     (PRF 鍵を派生する必要があるため)
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

  // PATCH: @simplewebauthn/browser v13 は extensions の PRF salt を変換しない
  // (challenge と allowCredentials.id だけ base64url→ArrayBuffer する)。
  // navigator.credentials.get() は extensions.prf.eval.first として
  // ArrayBuffer/ArrayBufferView を要求するため、ここで手動変換する。
  // 型は最終的に native API に渡される時点で BufferSource に揃えば OK。
  const optsWithPrf = options as typeof options & {
    extensions?: { prf?: { eval?: { first?: string | Uint8Array } } };
  };
  const prfEvalFirst = optsWithPrf.extensions?.prf?.eval?.first;
  if (typeof prfEvalFirst === "string") {
    // base64url string → Uint8Array に in-place 置換 (TS 型は string だが
    // ライブラリは spread で素通しするので Uint8Array でも到達できる)
    (optsWithPrf.extensions!.prf!.eval as { first: unknown }).first =
      fromBase64Url(prfEvalFirst);
  }

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

  // 3. PRF result を取り出す。
  //    WebAuthn 仕様: clientExtensionResults.prf.results.first は BufferSource
  //    (ArrayBuffer または TypedArray)。Safari iOS は ArrayBuffer をそのまま返す。
  //    @simplewebauthn/browser はこの値を変換せずに通す。
  //    防御的に複数型 (ArrayBuffer / Uint8Array / 万一の string) を受け付ける。
  const ext = (
    credential as typeof credential & {
      clientExtensionResults?: {
        prf?: { results?: { first?: ArrayBuffer | Uint8Array | string } };
      };
    }
  ).clientExtensionResults;
  const prfFirstRaw = ext?.prf?.results?.first;
  if (prfFirstRaw == null) {
    throw new PasskeyError(
      "PRF_UNSUPPORTED",
      "PRF Extension の応答が取得できませんでした。"
    );
  }
  let prfBytes: Uint8Array;
  if (prfFirstRaw instanceof ArrayBuffer) {
    prfBytes = new Uint8Array(prfFirstRaw);
  } else if (prfFirstRaw instanceof Uint8Array) {
    prfBytes = prfFirstRaw;
  } else if (typeof prfFirstRaw === "string") {
    // 一部実装/将来 base64url string で返る可能性に対応
    prfBytes = fromBase64Url(prfFirstRaw);
  } else {
    throw new PasskeyError(
      "PRF_UNSUPPORTED",
      `PRF 応答が想定外の型: ${typeof prfFirstRaw}`
    );
  }
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
 * UI 統合用: 端末の登録 flag に基づき登録 / 認証を選択。
 *
 *   flag 無し → registerPasskey() を直接呼ぶ。
 *               理由: discoverable credential 方式の login は
 *               allowCredentials が空のため、新規ユーザーに対し
 *               cross-device picker (QR) を出す。失敗もキャンセル扱いで
 *               fallback できないため、最初から register UI を出す。
 *   flag 有り → loginWithPasskey() を呼ぶ。
 *               LOGIN_FAILED / NETWORK で失敗した場合は flag をクリアして
 *               registerPasskey() に切替 (例: server から credential が
 *               消えた、別 user data へ移行した等のレアケース)。
 *
 * USER_CANCELLED と UNSUPPORTED は常に投げる (キャンセル後に別 prompt を
 * 出すと UX が壊れる、UNSUPPORTED は環境問題で再試行不能)。
 */
export async function registerOrLogin(): Promise<{ userId: string; action: "registered" | "logged-in" }> {
  if (hasRegisteredPasskeyOnThisDevice()) {
    try {
      const result = await loginWithPasskey();
      return { ...result, action: "logged-in" };
    } catch (err) {
      if (err instanceof PasskeyError) {
        if (err.code === "USER_CANCELLED" || err.code === "UNSUPPORTED") {
          throw err;
        }
        // login が server 検証で失敗 = この端末の flag が古い。
        // flag をクリアして新規登録に切替。
        clearPasskeyRegisteredFlag();
      } else {
        throw err;
      }
    }
  }

  const result = await registerPasskey();
  return { ...result, action: "registered" };
}
