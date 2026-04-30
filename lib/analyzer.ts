import { lookupFood } from "./food-db";
import {
  COVERAGE_THRESHOLD,
  MIN_TOTAL_PROTEIN_G,
  type ProteinCategory,
} from "./standards";
import { computeLight, type TrafficLight } from "./scoring";
import type { VisionFood } from "./vision";

export interface MatchedFood {
  query: string;
  matched: string;
  grams: number;
  protein_g: number;
  category: ProteinCategory;
  /** category_fallback が使われた場合 true */
  isFallback: boolean;
}

export interface UnmatchedFood {
  query: string;
  grams: number;
}

export interface AnalysisResult {
  light: TrafficLight;
  /** 魚タンパク質割合（%）。総タンパク質に対する魚タンパクの割合 */
  fishProteinPct: number;
  /** カテゴリ別タンパク質量（g） */
  proteinByCategory: Record<ProteinCategory, number>;
  /** マッチ食材の総タンパク質量（g） */
  totalProteinG: number;
  matched: MatchedFood[];
  unmatched: UnmatchedFood[];
  /** マッチ食材が全食材推定タンパク質量に占める割合（0-1） */
  proteinCoverage: number;
  /** スコアの信頼性が低い場合 true（タンパク質量不足 or データ欠損） */
  insufficientData: boolean;
}

const FALLBACK_PROTEIN_PER_100G = 10;

/**
 * Vision APIの結果（食材リスト）から魚タンパク質割合を計算し、信号機判定する。
 *
 * 計算方法:
 *   1. 各食材を category（fish/meat/egg_dairy/plant_protein/other）に分類
 *   2. 総タンパク質量 = 全マッチ食材のタンパク質合算
 *   3. 魚タンパク質割合(%) = fish カテゴリの protein_g / 総タンパク質 × 100
 *   4. 閾値で信号機判定（標準: ≥50%青、≥25%黄、<25%赤）
 *
 * 摂取量・体重には依存しない（割合のみ）。
 */
export function analyze(foods: VisionFood[]): AnalysisResult {
  const matched: MatchedFood[] = [];
  const unmatched: UnmatchedFood[] = [];
  const proteinByCategory: Record<ProteinCategory, number> = {
    fish: 0,
    meat: 0,
    egg_dairy: 0,
    plant_protein: 0,
    other: 0,
  };
  let totalProteinG = 0;
  let estimatedTotalProtein = 0;

  for (const f of foods) {
    const result = lookupFood(f.name);
    if (!result) {
      unmatched.push({ query: f.name, grams: f.grams });
      estimatedTotalProtein += (FALLBACK_PROTEIN_PER_100G * f.grams) / 100;
      continue;
    }
    const { entry, isFallback } = result;
    const factor = f.grams / 100;
    const protein = entry.protein_g * factor;
    totalProteinG += protein;
    estimatedTotalProtein += protein;
    proteinByCategory[entry.category] += protein;
    matched.push({
      query: f.name,
      matched: entry.name,
      grams: f.grams,
      protein_g: protein,
      category: entry.category,
      isFallback,
    });
  }

  const fishProteinPct =
    totalProteinG > 0 ? (proteinByCategory.fish / totalProteinG) * 100 : 0;

  const proteinCoverage =
    estimatedTotalProtein > 0 ? totalProteinG / estimatedTotalProtein : 0;

  const insufficientData =
    foods.length > 0 &&
    (totalProteinG < MIN_TOTAL_PROTEIN_G || proteinCoverage < COVERAGE_THRESHOLD);

  const light = computeLight(fishProteinPct);

  return {
    light,
    fishProteinPct,
    proteinByCategory,
    totalProteinG,
    matched,
    unmatched,
    proteinCoverage,
    insufficientData,
  };
}
