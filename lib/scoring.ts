import { FISH_RATIO_THRESHOLDS } from "./standards";

/**
 * 信号機判定。
 * - "green" / "yellow" / "red": 通常の判定 (閾値以上 / 中間 / 以下)
 * - "unknown": データ不足で判定不能 (v0.3.0-beta から、lipidPct=null のケース)
 */
export type TrafficLight = "green" | "yellow" | "red" | "unknown";

/**
 * 魚タンパク質割合（%）から信号機判定する。
 *
 *   青: 魚タンパク質 ≥ 50%
 *   黄: 25% ≤ 魚タンパク質 < 50%
 *   赤: 魚タンパク質 < 25%
 */
export function computeLight(fishProteinPct: number): TrafficLight {
  if (fishProteinPct >= FISH_RATIO_THRESHOLDS.green) return "green";
  if (fishProteinPct >= FISH_RATIO_THRESHOLDS.yellow) return "yellow";
  return "red";
}
