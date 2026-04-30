import { EAA_KEYS, EAA_REFERENCE_MG_PER_G_PROTEIN, type EAAKey } from "./standards";

export type TrafficLight = "green" | "yellow" | "red";

export interface ScoreResult {
  /** EAAごとのスコア（%）。100 = 基準パターン通り、>100 = 基準より多い */
  scorePct: Record<EAAKey, number>;
  /** 制限アミノ酸スコア（最も低いEAAスコア） */
  limitingScore: number;
  /** 信号機判定 */
  light: TrafficLight;
  /** スコア100%未満のEAA（限定アミノ酸候補）、低い順 */
  deficient: { key: EAAKey; pct: number }[];
}

/**
 * 食事のEAA含有量（mg/gタンパク質）と基準パターンから、各EAAのスコアを計算する。
 *
 * スコア(%) = 食事中の (mg EAA / g タンパク質) ÷ 基準パターン × 100
 */
export function computeScores(
  eaaPerGProtein: Record<EAAKey, number>,
): Record<EAAKey, number> {
  const out = {} as Record<EAAKey, number>;
  for (const k of EAA_KEYS) {
    const ref = EAA_REFERENCE_MG_PER_G_PROTEIN[k];
    out[k] = ref > 0 ? Math.round((eaaPerGProtein[k] / ref) * 100) : 0;
  }
  return out;
}

/**
 * 各EAAスコアから信号機判定する。
 *
 * 制限アミノ酸スコア（最低スコア）で決まる：
 *   赤: limitingScore < 80%（明確なEAA不足、タンパク質の質が低い）
 *   黄: 80% ≤ limitingScore < 100%（やや不足）
 *   青: limitingScore ≥ 100%（基準パターン通り、完全タンパク質）
 *
 * 閾値は一般的な食事摂取基準の充足度判定に準拠。
 */
export function computeLight(limitingScore: number): TrafficLight {
  if (limitingScore < 80) return "red";
  if (limitingScore < 100) return "yellow";
  return "green";
}

/**
 * 食事のEAA含有量（mg/gタンパク質）から完全な結果を組み立てる。
 */
export function buildResult(
  eaaPerGProtein: Record<EAAKey, number>,
): ScoreResult {
  const scorePct = computeScores(eaaPerGProtein);
  const limitingScore = Math.min(...EAA_KEYS.map((k) => scorePct[k]));
  const light = computeLight(limitingScore);
  const deficient = EAA_KEYS.map((k) => ({ key: k, pct: scorePct[k] }))
    .filter((x) => x.pct < 100)
    .sort((a, b) => a.pct - b.pct);
  return { scorePct, limitingScore, light, deficient };
}
