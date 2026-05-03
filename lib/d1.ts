// Cloudflare D1 共有クライアント (v0.4.2)
//
// もともと app/api/feedback/route.ts にインライン定義されていたが、
// v0.4.2 で rate limiter (lib/rate-limit.ts) も D1 を使うため lib に抽出。
//
// 使い方:
//   import { d1Query } from "@/lib/d1";
//   const r = await d1Query<MyRow>("SELECT * FROM t WHERE id = ?", [id]);
//
// REST API ベース (Workers binding ではない)。Vercel から fetch で叩く。

const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CF_D1_DATABASE_ID = process.env.CLOUDFLARE_D1_DATABASE_ID;
const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

export interface D1Response<T = unknown> {
  result?: Array<{
    results: T[];
    success: boolean;
    meta: Record<string, unknown>;
  }>;
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  messages: unknown[];
}

export async function d1Query<T = unknown>(
  sql: string,
  params: (string | number | null)[] = []
): Promise<D1Response<T>> {
  if (!CF_ACCOUNT_ID || !CF_D1_DATABASE_ID || !CF_API_TOKEN) {
    throw new Error("Cloudflare D1 environment variables are not configured.");
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${CF_D1_DATABASE_ID}/query`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CF_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sql, params }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`D1 query failed (${response.status}): ${text}`);
  }

  return response.json();
}

/** D1 結果の最初の row を取り出すヘルパ。なければ undefined。 */
export function firstRow<T>(resp: D1Response<T>): T | undefined {
  return resp.result?.[0]?.results?.[0];
}
