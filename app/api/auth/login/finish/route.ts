// WebAuthn 認証完了 (v0.8.2)
//
// POST /api/auth/login/finish
//   Request:  {
//     loginToken: string,                            // start 時の 5min JWT
//     credential: AuthenticationResponseJSON         // navigator.credentials.get() の結果
//   }
//   Response (成功): { sessionToken: string, userId: string }
//   Response (失敗): { error: string, code?: string }
//
// 動作:
//   1. loginToken を検証して challenge を取り出す
//   2. response.id (credential ID) で D1 を引いて user_id / public_key / counter を取得
//   3. WebAuthn assertion を検証 (signature、challenge、origin、rpID)
//   4. counter を更新 (replay 防止)
//   5. 24h session token を発行して返す

import { NextResponse } from "next/server";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { verifyAuthentication, fromBase64Url } from "@/lib/webauthn";
import {
  verifyLoginToken,
  issueSessionToken,
} from "@/lib/jwt";
import { d1Query, firstRow } from "@/lib/d1";

export const runtime = "nodejs";

interface ReqBody {
  loginToken?: string;
  credential?: AuthenticationResponseJSON;
}

interface CredentialRow {
  user_id: string;
  public_key: string;  // base64url
  counter: number;
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

  const { loginToken, credential } = body;
  if (!loginToken || !credential) {
    return NextResponse.json(
      { error: "loginToken と credential が必要です。", code: "INVALID_REQUEST" },
      { status: 400 }
    );
  }

  // 1. login token を検証
  const tokenResult = await verifyLoginToken(loginToken);
  if (!tokenResult.ok) {
    const code =
      tokenResult.reason === "expired" ? "TOKEN_EXPIRED" : "INVALID_TOKEN";
    return NextResponse.json(
      {
        error:
          tokenResult.reason === "expired"
            ? "ログインセッションがタイムアウトしました。最初からやり直してください。"
            : "ログイン token の検証に失敗しました。",
        code,
      },
      { status: 400 }
    );
  }
  const { challenge } = tokenResult.payload;

  // 2. credential ID で D1 を引く
  const credentialId = credential.id; // 既に base64url
  let row: CredentialRow | undefined;
  try {
    const queryResult = await d1Query<CredentialRow>(
      "SELECT user_id, public_key, counter FROM user_credentials WHERE credential_id = ? LIMIT 1",
      [credentialId]
    );
    row = firstRow(queryResult);
  } catch (err) {
    console.error("login/finish DB query error:", err);
    return NextResponse.json(
      { error: "認証情報の検索に失敗しました。", code: "DB_ERROR" },
      { status: 500 }
    );
  }

  if (!row) {
    // 登録されていない credential。privacy 配慮で「登録されていません」とは
    // 明言せず、認証失敗の汎用エラーで返す
    return NextResponse.json(
      { error: "認証に失敗しました。", code: "AUTHENTICATION_FAILED" },
      { status: 401 }
    );
  }

  // 3. WebAuthn assertion を検証
  const publicKey = fromBase64Url(row.public_key);
  const verifyResult = await verifyAuthentication(
    credential,
    challenge,
    req.url,
    {
      id: credentialId,
      publicKey,
      counter: row.counter,
    }
  );

  if (!verifyResult.ok) {
    return NextResponse.json(
      { error: "認証に失敗しました。", code: "AUTHENTICATION_FAILED" },
      { status: 401 }
    );
  }

  // 4. counter を更新 (replay 防止のため成功時のみ)
  if (verifyResult.newCounter !== null && verifyResult.newCounter !== row.counter) {
    try {
      await d1Query(
        "UPDATE user_credentials SET counter = ? WHERE credential_id = ?",
        [verifyResult.newCounter, credentialId]
      );
    } catch (err) {
      // counter 更新失敗はログだけ残して続行 (認証は成功している)
      console.warn("login/finish: counter update failed:", err);
    }
  }

  // 5. 24h session token を発行
  const sessionToken = await issueSessionToken(row.user_id);

  return NextResponse.json({
    sessionToken,
    userId: row.user_id,
  });
}
