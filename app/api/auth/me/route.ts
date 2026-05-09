// 認証済みユーザー情報の取得 (v0.8.2)
//
// GET /api/auth/me
//   Headers:  Authorization: Bearer <session-token>
//   Response (認証済): { userId: string }
//   Response (未認証): { error, code: "UNAUTHORIZED" } status 401
//
// 用途:
//   - クライアント側で「自分はログイン済か」を確認する軽量エンドポイント
//   - v0.8.5 の `/history` 表示前の auth 状態チェックに使う
//   - 保護ルートのリファレンス実装でもある (requireSession の使い方の見本)
//
// 注意: PII を一切返さない。userId (UUID v7) のみ。

import { NextResponse } from "next/server";
import { requireSession } from "@/lib/jwt";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await requireSession(req);
  if ("response" in auth) return auth.response;

  return NextResponse.json({ userId: auth.session.userId });
}
