// 定数時間文字列比較 (v0.4.6)
//
// 認証 token / Basic auth 等のクレデンシャル比較に使う。素朴な `===` / `!==` は
// 短絡評価により先頭不一致のときに早く抜けるため、理論上はタイミング攻撃で
// バイト単位の漏洩が可能。Vercel エッジでは network jitter が支配的なので
// 現実的攻撃は困難だが、auth コードでは慣習として constant-time を使うのが正解。
//
// Node 標準 `crypto.timingSafeEqual` は Buffer 長一致が必須なため、
// 長さ不一致を early-return + 同長 Buffer の `timingSafeEqual` に統一する。
//
// 参考: OWASP "Use a constant-time comparison function" recommendation。

import { timingSafeEqual } from "node:crypto";

/**
 * 2 つの文字列を constant-time で比較する。長さが異なれば false（短絡）。
 * 長さ一致時は内部で `crypto.timingSafeEqual` を使うため、内容比較自体は
 * 一定時間で完了する。
 *
 * 注: 長さの不一致だけは即 false で返るので、token の「長さ」自体は
 * タイミングで漏れる可能性がある。ランダム生成の token 長は固定なので、
 * これは実用上問題にならない。
 */
export function constantTimeStringEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
