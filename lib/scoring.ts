import { FISH_RATIO_THRESHOLDS } from "./standards";

export type TrafficLight = "green" | "yellow" | "red";

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
