// WebAuthn / Passkey 登録 + 認証ヘルパー (v0.8.1)
//
// @simplewebauthn/server をラップして、本プロジェクト固有の方針を集約:
//   - PRF Extension (E2E 暗号化用の対称鍵を端末で派生) を必須リクエスト
//   - rpID は呼び出し側が request URL から動的に決定 (preview deploy + local dev 対応)
//   - userName / displayName は固定文字列にする (ユーザー入力を取らない方針)
//
// challenge と pending user_id は短命 JWT (lib/jwt.ts) で client へ返却し、
// finish 時に同じ JWT を受け取って検証する (server stateless、no session DB)。

import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type GenerateRegistrationOptionsOpts,
  type VerifiedRegistrationResponse,
  type VerifiedAuthenticationResponse,
} from "@simplewebauthn/server";
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from "@simplewebauthn/server";
import { PRF_SALT_BASE64URL } from "./prf-salt";

const RP_NAME = "EPA/AAバランス";

/** 本人を識別する短い表示名 (PII を含めない方針)。サーバには保存しない値。 */
const USER_DISPLAY_NAME = "あなた";

/**
 * リクエストの origin から rpID (相対のホスト部分) を導出。
 * - 本番:  https://epaaa.mymt.casa → "epaaa.mymt.casa"
 * - preview: https://eaa-scorer-xxx.vercel.app → "eaa-scorer-xxx.vercel.app"
 * - local:  http://localhost:3000 → "localhost"
 */
export function deriveRpInfo(requestUrl: string): { rpID: string; origin: string } {
  const u = new URL(requestUrl);
  return { rpID: u.hostname, origin: u.origin };
}

/**
 * PRF Extension をリクエストする登録 options を生成。
 * @param userId 新規発行された UUID (この後 credential 紐付けに使う)
 * @param requestUrl req.url で得たリクエスト URL
 * @returns options (browser へ渡す) + challenge (registration token に埋め込む)
 */
export async function buildRegistrationOptions(
  userId: string,
  requestUrl: string
): Promise<{
  options: PublicKeyCredentialCreationOptionsJSON;
  challenge: string;
}> {
  const { rpID } = deriveRpInfo(requestUrl);

  const opts: GenerateRegistrationOptionsOpts = {
    rpName: RP_NAME,
    rpID,
    // ユーザー識別子は anonymous な userId のみ。name / displayName に PII を入れない
    userName: USER_DISPLAY_NAME,
    userDisplayName: USER_DISPLAY_NAME,
    userID: new TextEncoder().encode(userId),
    timeout: 60_000,
    attestationType: "none", // privacy 観点: attestation で端末情報を取らない
    authenticatorSelection: {
      // platform authenticator (FaceID / Hello / Android biometric) を優先、
      // ただし security key (cross-platform) も許容
      residentKey: "required", // discoverable credential を強制 (UX 向上)
      userVerification: "preferred",
    },
    // 楕円曲線アルゴリズム優先 (ES256 = ECDSA P-256、最も互換性が高い)
    supportedAlgorithmIDs: [-7, -257], // ES256, RS256
  };

  const options = await generateRegistrationOptions(opts);

  // PRF Extension request を手動で追加。@simplewebauthn/server は extensions の
  // 直接サポート範囲が限定的なので、戻り値の object に追記する。
  // hmac-secret 由来 PRF: https://www.w3.org/TR/webauthn-3/#prf-extension
  (options as PublicKeyCredentialCreationOptionsJSON & {
    extensions?: Record<string, unknown>;
  }).extensions = {
    prf: {}, // 登録時は eval なし、capability discovery のみ
  };

  return { options, challenge: options.challenge };
}

/**
 * registration response (browser からの credential) を検証。
 * 成功なら credential metadata を返す。
 */
export async function verifyRegistration(
  response: RegistrationResponseJSON,
  expectedChallenge: string,
  requestUrl: string
): Promise<{
  ok: boolean;
  verified: VerifiedRegistrationResponse | null;
  /** PRF Extension がこの credential で利用可能か (browser からの応答に含まれる) */
  prfSupported: boolean;
}> {
  const { rpID, origin } = deriveRpInfo(requestUrl);

  let verified: VerifiedRegistrationResponse;
  try {
    verified = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false, // platform 仕様揺れ吸収のため preferred と整合
    });
  } catch (err) {
    console.warn("WebAuthn registration verification failed:", err);
    return { ok: false, verified: null, prfSupported: false };
  }

  if (!verified.verified || !verified.registrationInfo) {
    return { ok: false, verified, prfSupported: false };
  }

  // PRF Extension の応答を確認。client extension results は response 側に来る。
  // browser は registration 時には PRF eval を実施しない (capability 検出のみ) ため、
  // clientExtensionResults.prf?.enabled === true で対応端末か分かる。
  const ext = (
    response as RegistrationResponseJSON & {
      clientExtensionResults?: { prf?: { enabled?: boolean } };
    }
  ).clientExtensionResults;
  const prfSupported = Boolean(ext?.prf?.enabled);

  return { ok: true, verified, prfSupported };
}

/**
 * 認証 (login) options。allowCredentials は server 側で user_id 紐付け済みの
 * credential ID を限定指定する用途だが、discoverable credential を使う場合は
 * 空にして browser 側に「どの passkey を使うか」を選ばせる方が UX 良い。
 */
export async function buildAuthenticationOptions(
  requestUrl: string
): Promise<{
  options: PublicKeyCredentialRequestOptionsJSON;
  challenge: string;
}> {
  const { rpID } = deriveRpInfo(requestUrl);
  const options = await generateAuthenticationOptions({
    rpID,
    timeout: 60_000,
    userVerification: "preferred",
    // discoverable credential を使うので allowCredentials は空
    allowCredentials: [],
  });

  // PRF eval をリクエスト (auth 時に対称鍵を派生するための salt)。
  // salt は lib/prf-salt.ts で 1 箇所に集約 (server / client 共有、
  // 鍵ローテーション時はバージョン suffix を bump)。
  (options as PublicKeyCredentialRequestOptionsJSON & {
    extensions?: Record<string, unknown>;
  }).extensions = {
    prf: {
      eval: {
        first: PRF_SALT_BASE64URL,
      },
    },
  };

  return { options, challenge: options.challenge };
}

export async function verifyAuthentication(
  response: AuthenticationResponseJSON,
  expectedChallenge: string,
  requestUrl: string,
  storedCredential: {
    id: string;        // base64url
    publicKey: Uint8Array;
    counter: number;
  }
): Promise<{
  ok: boolean;
  verified: VerifiedAuthenticationResponse | null;
  newCounter: number | null;
}> {
  const { rpID, origin } = deriveRpInfo(requestUrl);

  // TS strict mode 対策: Uint8Array<ArrayBufferLike> ではなく Uint8Array<ArrayBuffer>
  // が要求されるため、明示コピーで ArrayBuffer 裏付けを保証する
  const publicKeyCopy = new Uint8Array(storedCredential.publicKey.byteLength);
  publicKeyCopy.set(storedCredential.publicKey);

  let verified: VerifiedAuthenticationResponse;
  try {
    verified = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: storedCredential.id,
        publicKey: publicKeyCopy,
        counter: storedCredential.counter,
      },
      requireUserVerification: false,
    });
  } catch (err) {
    console.warn("WebAuthn authentication verification failed:", err);
    return { ok: false, verified: null, newCounter: null };
  }

  if (!verified.verified || !verified.authenticationInfo) {
    return { ok: false, verified, newCounter: null };
  }

  return {
    ok: true,
    verified,
    newCounter: verified.authenticationInfo.newCounter,
  };
}

/** Uint8Array → base64url string (D1 TEXT 列用) */
export function toBase64Url(bytes: Uint8Array): string {
  // Buffer は Node.js 標準 (Vercel runtime で利用可)
  return Buffer.from(bytes).toString("base64url");
}

/** base64url string → Uint8Array */
export function fromBase64Url(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s, "base64url"));
}
