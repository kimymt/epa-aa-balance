import { lookupFood } from "./food-db";
import { EAA_KEYS, type EAAKey } from "./standards";
import { buildResult, type ScoreResult } from "./scoring";
import type { VisionFood } from "./vision";

export interface MatchedFood {
  query: string;
  matched: string;
  grams: number;
  protein_g: number;
  /** カテゴリfallback（平均値での推定）が使われた場合 true */
  isFallback: boolean;
}

export interface UnmatchedFood {
  query: string;
  grams: number;
}

export interface AnalysisResult extends ScoreResult {
  matched: MatchedFood[];
  unmatched: UnmatchedFood[];
  /** マッチした食材が全推定タンパク質量に占める割合（0-1） */
  proteinCoverage: number;
  /** カバレッジが50%未満の場合true（スコア表示を抑制すべき） */
  insufficientCoverage: boolean;
  /** 食事全体の総タンパク質量（g、マッチ食材のみ） */
  totalProteinG: number;
  /** 食事全体の各EAAの絶対量（mg、マッチ食材のみ） */
  totalEaaMg: Record<EAAKey, number>;
}

const COVERAGE_THRESHOLD = 0.5;
/** タンパク質量がこれ未満だと比率の信頼性が低い（誤差が大きすぎる） */
const MIN_TOTAL_PROTEIN_G = 1;

/**
 * Vision APIの結果（食材リスト）からEAAスコアを計算する。
 *
 * 計算方法（アミノ酸スコア法）:
 *   1. マッチ食材の総EAA量(mg) と総タンパク質量(g) を合算
 *   2. EAA含有量を「mg/gタンパク質」に正規化
 *   3. WHO/FAO 2007 基準パターンとの比率を計算
 *   4. 最低スコア（制限アミノ酸）で信号機判定
 *
 * 摂取量や体重には依存しない。タンパク質の「質」だけを評価する。
 */
export function calculate(foods: VisionFood[]): AnalysisResult {
  const matched: MatchedFood[] = [];
  const unmatched: UnmatchedFood[] = [];
  const totalEaaMg: Record<EAAKey, number> = Object.fromEntries(
    EAA_KEYS.map((k) => [k, 0]),
  ) as Record<EAAKey, number>;

  let totalProteinG = 0;
  let estimatedTotalProtein = 0;
  // 未マッチ食材のタンパク質含有量の粗い推定（平均的な食材として10g/100g）
  const FALLBACK_PROTEIN_PER_100G = 10;

  for (const f of foods) {
    const result = lookupFood(f.name);
    if (!result) {
      unmatched.push({ query: f.name, grams: f.grams });
      estimatedTotalProtein += (FALLBACK_PROTEIN_PER_100G * f.grams) / 100;
      continue;
    }
    const { entry, isFallback } = result;
    const factor = f.grams / 100;
    for (const k of EAA_KEYS) {
      totalEaaMg[k] += entry.eaa[k] * factor;
    }
    const protein = entry.protein_g * factor;
    totalProteinG += protein;
    estimatedTotalProtein += protein;
    matched.push({
      query: f.name,
      matched: entry.name,
      grams: f.grams,
      protein_g: protein,
      isFallback,
    });
  }

  const proteinCoverage =
    estimatedTotalProtein > 0 ? totalProteinG / estimatedTotalProtein : 0;
  const insufficientCoverage =
    foods.length > 0 &&
    (proteinCoverage < COVERAGE_THRESHOLD || totalProteinG < MIN_TOTAL_PROTEIN_G);

  // EAAをタンパク質1gあたりに正規化（アミノ酸スコアの基本単位）
  const eaaPerGProtein = {} as Record<EAAKey, number>;
  for (const k of EAA_KEYS) {
    eaaPerGProtein[k] =
      totalProteinG > 0 ? totalEaaMg[k] / totalProteinG : 0;
  }

  const result = buildResult(eaaPerGProtein);

  return {
    ...result,
    matched,
    unmatched,
    proteinCoverage,
    insufficientCoverage,
    totalProteinG,
    totalEaaMg,
  };
}
