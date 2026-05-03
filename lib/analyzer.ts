import { lookupFood } from "./food-db";
import {
  COVERAGE_THRESHOLD,
  MIN_TOTAL_PROTEIN_G,
  type ProteinCategory,
} from "./standards";
import { computeLight, type TrafficLight } from "./scoring";
import { computeLipidScore } from "./lipid-scoring";
import { useLipidCalculation } from "./feature-flags";
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
  /**
   * 信号機判定。USE_LIPID_CALCULATION=true なら lipidPct ベース、
   * false (default) なら fishProteinPct ベース。
   * v0.3.0 (PR 3) で fishProteinPct 経路を削除予定。
   */
  light: TrafficLight;
  /** 魚タンパク質割合（%）。総タンパク質に対する魚タンパクの割合。PR 3 で削除予定。 */
  fishProteinPct: number;
  /** カテゴリ別タンパク質量（g）。PR 3 で削除予定。 */
  proteinByCategory: Record<ProteinCategory, number>;
  /** マッチ食材の総タンパク質量（g）。PR 3 で削除予定。 */
  totalProteinG: number;
  matched: MatchedFood[];
  unmatched: UnmatchedFood[];
  /** マッチ食材が全食材推定タンパク質量に占める割合（0-1）。PR 3 で削除予定。 */
  proteinCoverage: number;
  /** スコアの信頼性が低い場合 true。PR 3 で削除予定。 */
  insufficientData: boolean;

  // === v0.3.0-beta 追加 (PR 3 で必須化) ===
  /** (EPA+DHA)/(EPA+DHA+AA) * 100 (share form, %). 全食材データ欠損時 null */
  lipidPct: number | null;
  /** (EPA+DHA)/AA (true ratio, 無次元). AA=0 時 null */
  lipidRatio: number | null;
  /** Lipid 計算ベースの信号機。lipidPct=null 時 "unknown" */
  lipidSignal: TrafficLight;
  /** Meal 全体の EPA 合計 (mg) */
  epaMg: number;
  /** Meal 全体の DHA 合計 (mg) */
  dhaMg: number;
  /** Meal 全体の AA 合計 (mg) */
  aaMg: number;
  /** Mass-weighted lipid coverage 0.0〜1.0 (脂肪酸データある食材の grams 比率) */
  lipidCoverage: number;
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

  // 脂質ベース計算 (v0.3.0-beta+) は常に実行する。
  // light を protein 由来にするか lipid 由来にするかは feature flag で切替。
  const lipid = computeLipidScore(foods);
  const proteinLight = computeLight(fishProteinPct);
  const light = useLipidCalculation() ? lipid.signal : proteinLight;

  return {
    light,
    fishProteinPct,
    proteinByCategory,
    totalProteinG,
    matched,
    unmatched,
    proteinCoverage,
    insufficientData,
    // Lipid fields (always computed, used by UI in PR 3)
    lipidPct: lipid.lipidPct,
    lipidRatio: lipid.lipidRatio,
    lipidSignal: lipid.signal,
    epaMg: lipid.epaMg,
    dhaMg: lipid.dhaMg,
    aaMg: lipid.aaMg,
    lipidCoverage: lipid.lipidCoverage,
  };
}
