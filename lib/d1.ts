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
  const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
  const CF_D1_DATABASE_ID = process.env.CLOUDFLARE_D1_DATABASE_ID;
  const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
  if (!CF_ACCOUNT_ID || !CF_D1_DATABASE_ID || !CF_API_TOKEN) {
    throw new Error("Cloudflare D1 environment variables are not configured.");
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${CF_D1_DATABASE_ID}/query`;

  const response = await fetch(url, {
    method: "POST",
    signal: AbortSignal.timeout(5000),
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${CF_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sql, params }),
  });

  if (!response.ok) {
    throw new Error(`D1 query failed (${response.status})`);
  }

  const data = await response.json() as D1Response<T>;
  if (!data.success || !Array.isArray(data.result) || data.result.length === 0 ||
      data.result.some((r) => !r.success || !Array.isArray(r.results))) {
    throw new Error("D1 returned an unsuccessful query result");
  }
  return data;
}

/** D1 結果の最初の row を取り出すヘルパ。なければ undefined。 */
export function firstRow<T>(resp: D1Response<T>): T | undefined {
  return resp.result?.[0]?.results?.[0];
}
