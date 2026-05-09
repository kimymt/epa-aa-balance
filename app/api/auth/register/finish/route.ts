// WebAuthn 登録完了 (v0.8.1)
//
// POST /api/auth/register/finish
//   Request:  {
//     registrationToken: string,                     // start 時に受け取った 5 分 TTL JWT
//     credential: RegistrationResponseJSON           // navigator.credentials.create() の結果
//   }
//   Response (成功): { sessionToken: string, userId: string }
//   Response (失敗): { error: string, code?: string }
//
// 成功時に user 行と user_credentials 行を D1 に作成 (= 「履歴を始める」確定)。
// 24h 有効の session token を発行して返す。

import { NextResponse } from "next/server";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import {
  verifyRegistration,
  toBase64Url,
} from "@/lib/webauthn";
import {
  verifyRegistrationToken,
  issueSessionToken,
} from "@/lib/jwt";
import { d1Query } from "@/lib/d1";

export const runtime = "nodejs";

interface ReqBody {
  registrationToken?: string;
  credential?: RegistrationResponseJSON;
}

export async function POST(req: Request) {
  let body: ReqBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "リクエスト形式が不正です。", code: "INVALID_REQUEST" },
      { status: 400 }
    );
  }

  const { registrationToken, credential } = body;
  if (!registrationToken || !credential) {
    return NextResponse.json(
      { error: "registrationToken と credential が必要です。", code: "INVALID_REQUEST" },
      { status: 400 }
    );
  }

  // 1. 短命 JWT を検証 (challenge と pendingUserId を取り出す)
  const tokenResult = await verifyRegistrationToken(registrationToken);
  if (!tokenResult.ok) {
    const code =
      tokenResult.reason === "expired" ? "TOKEN_EXPIRED" : "INVALID_TOKEN";
    return NextResponse.json(
      {
        error:
          tokenResult.reason === "expired"
            ? "登録セッションがタイムアウトしました。最初からやり直してください。"
            : "登録 token の検証に失敗しました。",
        code,
      },
      { status: 400 }
    );
  }
  const { userId, challenge } = tokenResult.payload;

  // 2. WebAuthn credential を検証
  const verifyResult = await verifyRegistration(credential, challenge, req.url);
  if (!verifyResult.ok || !verifyResult.verified?.registrationInfo) {
    return NextResponse.json(
      { error: "Passkey 登録の検証に失敗しました。", code: "VERIFICATION_FAILED" },
      { status: 400 }
    );
  }

  // v0.8.4: PRF 対応チェックを D1 INSERT より前に行う。
  // 非対応 credential を保存しない (orphan 防止)。
  // 暗号化が成立しない credential は機能上意味がないため、登録自体を成立させない。
  if (!verifyResult.prfSupported) {
    return NextResponse.json(
      {
        error:
          "このブラウザ・端末では暗号化機能 (PRF Extension) に対応していません。" +
          "iPhone (iCloud Keychain) や Android Chrome (Google Password Manager) " +
          "など、OS ネイティブの Passkey をお試しください。",
        code: "PRF_UNSUPPORTED",
      },
      { status: 400 }
    );
  }

  const regInfo = verifyResult.verified.registrationInfo;
  // SimpleWebAuthn v13: registrationInfo.credential.id は既に base64url string、
  // publicKey のみ Uint8Array なので変換が必要
  const credentialIdB64 = regInfo.credential.id;
  const publicKeyB64 = toBase64Url(regInfo.credential.publicKey);
  const counter = regInfo.credential.counter;
  const now = Date.now();

  // 3. D1 に user + credential を保存 (1 トランザクションが理想だが D1 REST API は
  //    複数 SQL の atomic 実行 API があるので将来対応。ここでは順次 INSERT)
  try {
    await d1Query(
      "INSERT INTO users (id, created_at) VALUES (?, ?)",
      [userId, now]
    );
    await d1Query(
      "INSERT INTO user_credentials (user_id, credential_id, public_key, counter, device_label, prf_supported, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      // prf_supported は常に 1 (上で非対応なら早期 return 済)
      [userId, credentialIdB64, publicKeyB64, counter, "Device 1", 1, now]
    );
  } catch (err) {
    console.error("register/finish DB error:", err);
    // 念のため user 側を削除 (孤立 user 行が残らないように)
    try {
      await d1Query("DELETE FROM users WHERE id = ?", [userId]);
    } catch {
      // ignore cleanup errors
    }
    return NextResponse.json(
      { error: "登録の保存に失敗しました。再度お試しください。", code: "DB_ERROR" },
      { status: 500 }
    );
  }

  // 4. 24h session token を発行
  const sessionToken = await issueSessionToken(userId);

  return NextResponse.json({
    sessionToken,
    userId,
    prfSupported: true, // ここまで来たら PRF 対応 (上で早期 return 済)
  });
}
