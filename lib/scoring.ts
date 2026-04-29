import { EAA_KEYS, type EAAKey } from "./standards";

export type TrafficLight = "green" | "yellow" | "red";

export interface SufficiencyResult {
  /** EAAごとの充足率（%）。100 = 必要量を完全に満たしている */
  sufficiencyPct: Record<EAAKey, number>;
  /** 信号機スコア */
  light: TrafficLight;
  /** 不足しているEAA（充足率<100%）の一覧、低い順 */
  deficient: { key: EAAKey; pct: number }[];
}

/**
 * 充足率から信号機スコアを判定する。
 *
 * ルール（優先順位順、最初に合致したものが適用される）:
 *   赤: いずれか1種のEAAの充足率 < 80%
 *   黄: 赤でなく、いずれか1種のEAAの充足率 80% 以上 100% 未満
 *   青: 全EAAの充足率 ≥ 100%
 *
 * 閾値（80% / 100%）はMVP暫定値。一般的な食事摂取基準の充足度判定に準拠。
 */
export function computeLight(
  sufficiencyPct: Record<EAAKey, number>,
): TrafficLight {
  const values = EAA_KEYS.map((k) => sufficiencyPct[k]);
  if (values.some((v) => v < 80)) return "red";
  if (values.some((v) => v < 100)) return "yellow";
  return "green";
}

/**
 * 摂取量（mg）と必要量（mg）から完全な結果を組み立てる。
 */
export function buildResult(
  intakeMg: Record<EAAKey, number>,
  requirementMg: Record<EAAKey, number>,
): SufficiencyResult {
  const sufficiencyPct = {} as Record<EAAKey, number>;
  for (const k of EAA_KEYS) {
    const req = requirementMg[k];
    sufficiencyPct[k] = req > 0 ? Math.round((intakeMg[k] / req) * 100) : 0;
  }
  const light = computeLight(sufficiencyPct);
  const deficient = EAA_KEYS.map((k) => ({ key: k, pct: sufficiencyPct[k] }))
    .filter((x) => x.pct < 100)
    .sort((a, b) => a.pct - b.pct);
  return { sufficiencyPct, light, deficient };
}
