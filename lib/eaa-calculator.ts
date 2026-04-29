import { lookupFood } from "./food-db";
import { dailyRequirementMg, EAA_KEYS, type EAAKey } from "./standards";
import { buildResult, type SufficiencyResult } from "./scoring";
import type { VisionFood } from "./vision";

export interface MatchedFood {
  query: string;
  matched: string;
  grams: number;
  protein_g: number;
  eaaContribution: Record<EAAKey, number>;
}

export interface UnmatchedFood {
  query: string;
  grams: number;
}

export interface AnalysisResult extends SufficiencyResult {
  matched: MatchedFood[];
  unmatched: UnmatchedFood[];
  /** マッチした食材が全推定タンパク質量に占める割合（0-1） */
  proteinCoverage: number;
  /** カバレッジが50%未満の場合true（スコア表示を抑制すべき） */
  insufficientCoverage: boolean;
  bodyWeightKg: number;
}

const COVERAGE_THRESHOLD = 0.5;

/**
 * Vision APIの結果（食材リスト）からEAA摂取量を計算し、信号機スコアを返す。
 *
 * 注意: 一致しなかった食材は推定タンパク質量を計算できないため、coverage 計算では
 *       「マッチした食材のタンパク質量 / マッチ＋未マッチ食材を含む推定総タンパク質量」
 *       を使う。未マッチのタンパク質はサンプルDBの平均値（~10g/100g）で粗く見積もる。
 */
export function calculate(foods: VisionFood[], bodyWeightKg: number): AnalysisResult {
  const matched: MatchedFood[] = [];
  const unmatched: UnmatchedFood[] = [];
  const intake: Record<EAAKey, number> = Object.fromEntries(
    EAA_KEYS.map((k) => [k, 0]),
  ) as Record<EAAKey, number>;

  let matchedProtein = 0;
  let estimatedTotalProtein = 0;
  // 未マッチ食材のタンパク質含有量の粗い推定（平均的な食材として10g/100g）
  const FALLBACK_PROTEIN_PER_100G = 10;

  for (const f of foods) {
    const entry = lookupFood(f.name);
    if (!entry) {
      unmatched.push({ query: f.name, grams: f.grams });
      estimatedTotalProtein += (FALLBACK_PROTEIN_PER_100G * f.grams) / 100;
      continue;
    }
    const factor = f.grams / 100;
    const eaaContribution = {} as Record<EAAKey, number>;
    for (const k of EAA_KEYS) {
      const c = entry.eaa[k] * factor;
      eaaContribution[k] = c;
      intake[k] += c;
    }
    const protein = entry.protein_g * factor;
    matchedProtein += protein;
    estimatedTotalProtein += protein;
    matched.push({
      query: f.name,
      matched: entry.name,
      grams: f.grams,
      protein_g: protein,
      eaaContribution,
    });
  }

  const proteinCoverage =
    estimatedTotalProtein > 0 ? matchedProtein / estimatedTotalProtein : 0;
  const insufficientCoverage =
    foods.length > 0 && proteinCoverage < COVERAGE_THRESHOLD;

  const requirement = dailyRequirementMg(bodyWeightKg);
  const result = buildResult(intake, requirement);

  return {
    ...result,
    matched,
    unmatched,
    proteinCoverage,
    insufficientCoverage,
    bodyWeightKg,
  };
}
