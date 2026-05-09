// WebAuthn 登録開始 (v0.8.1)
//
// POST /api/auth/register/start
//   Request:  なし (匿名で開始)
//   Response: {
//     options: PublicKeyCredentialCreationOptionsJSON,  // navigator.credentials.create() に渡す
//     registrationToken: string                          // 5 分 TTL の JWT (challenge + pending userId)
//   }
//
// この時点では D1 にユーザーは作らない。register/finish が成功した時のみ作る。
// → 「途中でやめたら何も残らない」が成立。

import { NextResponse } from "next/server";
import { buildRegistrationOptions } from "@/lib/webauthn";
import { issueRegistrationToken } from "@/lib/jwt";

export const runtime = "nodejs";

/** UUID v7 を生成 (Bun / Node には標準で v7 がないので簡易自前実装) */
function uuidv7(): string {
  // RFC 9562 v7: 48-bit unix-ms-timestamp || 4-bit version || 12-bit rand_a || 2-bit variant || 62-bit rand_b
  const ts = BigInt(Date.now());
  const tsHex = ts.toString(16).padStart(12, "0"); // 48 bit
  const randA = Math.floor(Math.random() * 0x1000)
    .toString(16)
    .padStart(3, "0"); // 12 bit
  const randB = crypto.getRandomValues(new Uint8Array(8));
  // 上位 2 bit を variant (10) に
  randB[0] = (randB[0] & 0x3f) | 0x80;
  const randBHex = Array.from(randB)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return [
    tsHex.slice(0, 8),
    tsHex.slice(8, 12),
    "7" + randA, // version 7 + rand_a
    randBHex.slice(0, 4),
    randBHex.slice(4, 16),
  ].join("-");
}

export async function POST(req: Request) {
  // 仮の userId を発行 (確定保存は finish 成功時)
  const pendingUserId = uuidv7();

  try {
    const { options, challenge } = await buildRegistrationOptions(
      pendingUserId,
      req.url
    );
    const registrationToken = await issueRegistrationToken({
      userId: pendingUserId,
      challenge,
    });

    return NextResponse.json({ options, registrationToken });
  } catch (err) {
    console.error("register/start failed:", err);
    return NextResponse.json(
      { error: "登録開始に失敗しました。" },
      { status: 500 }
    );
  }
}
