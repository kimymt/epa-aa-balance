// 暗号化済み解析履歴の保存 (v0.8.4)
//
// POST /api/analyses
//   Headers: Authorization: Bearer <session-token>
//   Request:  { cipherBlob: string }   // クライアント側で AES-GCM 暗号化済み
//   Response (成功): { id: string, createdAt: number }
//   Response (失敗): { error, code }
//
// このエンドポイントは ciphertext のみを受け取る。サーバーは内容を decrypt
// できない (鍵は端末側 Passkey で派生されサーバーには渡らない)。
// philosophy: "even 開発者が読めない" を実現する核となるエンドポイント。
//
// 保護: requireSession でセッショントークン検証。401 if unauthenticated。
// 保存先: D1 analyses テーブル (id, user_id, created_at, cipher_blob)。

import { NextResponse } from "next/server";
import { requireSession } from "@/lib/jwt";
import { d1Query } from "@/lib/d1";

export const runtime = "nodejs";

interface ReqBody {
  cipherBlob?: string;
}

/** UUID v7 (時系列ソート可能、analyses.id 用) */
function uuidv7(): string {
  const ts = BigInt(Date.now());
  const tsHex = ts.toString(16).padStart(12, "0");
  const randA = Math.floor(Math.random() * 0x1000)
    .toString(16)
    .padStart(3, "0");
  const randB = crypto.getRandomValues(new Uint8Array(8));
  randB[0] = (randB[0] & 0x3f) | 0x80;
  const randBHex = Array.from(randB)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return [
    tsHex.slice(0, 8),
    tsHex.slice(8, 12),
    "7" + randA,
    randBHex.slice(0, 4),
    randBHex.slice(4, 16),
  ].join("-");
}

// ciphertext のサイズ上限。AES-GCM ciphertext は base64url で平文の ~1.4x。
// AnalysisResult[] の現実サイズは ~5-50 KB (画像なし、食材リスト + 数値)、
// その 2-3x マージン込みで 256 KB に設定。明らかな外れ値で D1 容量保護。
const MAX_CIPHER_BLOB_SIZE = 256 * 1024;

export async function POST(req: Request) {
  const auth = await requireSession(req);
  if ("response" in auth) return auth.response;
  const { userId } = auth.session;

  let body: ReqBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "リクエスト形式が不正です。", code: "INVALID_REQUEST" },
      { status: 400 }
    );
  }

  const { cipherBlob } = body;
  if (!cipherBlob || typeof cipherBlob !== "string") {
    return NextResponse.json(
      { error: "cipherBlob (暗号化済みデータ) が必要です。", code: "INVALID_REQUEST" },
      { status: 400 }
    );
  }
  if (cipherBlob.length > MAX_CIPHER_BLOB_SIZE) {
    return NextResponse.json(
      {
        error: `cipherBlob が大きすぎます (上限 ${MAX_CIPHER_BLOB_SIZE} bytes)。`,
        code: "PAYLOAD_TOO_LARGE",
      },
      { status: 413 }
    );
  }

  const id = uuidv7();
  const createdAt = Date.now();

  try {
    await d1Query(
      "INSERT INTO analyses (id, user_id, created_at, cipher_blob) VALUES (?, ?, ?, ?)",
      [id, userId, createdAt, cipherBlob]
    );
  } catch (err) {
    console.error("/api/analyses INSERT error:", err);
    return NextResponse.json(
      { error: "保存に失敗しました。", code: "DB_ERROR" },
      { status: 500 }
    );
  }

  return NextResponse.json({ id, createdAt });
}
