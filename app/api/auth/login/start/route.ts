// WebAuthn 認証開始 (v0.8.2)
//
// POST /api/auth/login/start
//   Request:  なし (匿名で開始、credential ID も持たない)
//   Response: {
//     options: PublicKeyCredentialRequestOptionsJSON,  // navigator.credentials.get() に渡す
//     loginToken: string                                // 5min TTL JWT (challenge を保持)
//   }
//
// discoverable credential を使うので allowCredentials は空。browser/OS が
// 「使える Passkey」を選ばせる UI を出す (FaceID プロンプト等)。
// PRF Extension の eval salt が options に含まれる (lib/webauthn.ts 側で固定値設定)。

import { NextResponse } from "next/server";
import { buildAuthenticationOptions } from "@/lib/webauthn";
import { issueLoginToken } from "@/lib/jwt";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { options, challenge } = await buildAuthenticationOptions(req.url);
    const loginToken = await issueLoginToken({ challenge });
    return NextResponse.json({ options, loginToken });
  } catch (err) {
    console.error("login/start failed:", err);
    return NextResponse.json(
      { error: "ログイン開始に失敗しました。" },
      { status: 500 }
    );
  }
}
