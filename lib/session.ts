// 複数食事セッション集計 (v0.3.0+: 脂質ベース)
//
// 個別 meal の AnalysisResult を集約し、平均 lipidPct / 集計 EPA/DHA/AA を出す。
// lipidPct=null の meal は平均から除外。全 meal が null なら aggregate.lipidPct=null,
// signal="unknown".

import type { AnalysisResult } from "./analyzer";
import type { TrafficLight } from "./scoring";
import { LIPID_RATIO_THRESHOLDS } from "./standards";
import type { VisionFood } from "./vision";

// Inline threshold判定 (scoring.ts の computeLipidSignal と同等ロジック)。
// scoring.ts を runtime import すると food-db (node:fs) がクライアントに漏れるため、
// session.ts は閾値定数だけ standards.ts から取り、判定はここで完結させる。
function aggregateSignal(lipidPct: number): TrafficLight {
  if (lipidPct >= LIPID_RATIO_THRESHOLDS.green) return "green";
  if (lipidPct >= LIPID_RATIO_THRESHOLDS.yellow) return "yellow";
  return "red";
}

export interface MealAnalysis {
  index: number;
  mealType: "breakfast" | "lunch" | "dinner";
  result: AnalysisResult;
  foods?: VisionFood[];
}

export interface FailedMeal {
  index: number;
  mealType: "breakfast" | "lunch" | "dinner";
  /** v0.8.6: VisionErrorCode の値 (lib/vision.ts)。サポート対応 / DevTools 用。 */
  code: string;
  /** UI に表示するユーザー向け文言 (vision.userMessageForCode の出力)。 */
  userMessage: string;
}

export interface AggregateStats {
  /** 平均 lipidPct (%、有効な meal のみ)。全 meal データ不足時 null */
  lipidPct: number | null;
  /** 集計 EPA (mg、全 meal の合計) */
  totalEpaMg: number;
  /** 集計 DHA (mg) */
  totalDhaMg: number;
  /** 集計 AA (mg) */
  totalAaMg: number;
  /** 信号機判定。lipidPct=null 時 "unknown" */
  signal: TrafficLight;
  /** 解析対象 meal 数 */
  totalMeals: number;
  /** 解析成功 meal 数 */
  successfulMeals: number;
  /** lipidPct 計算可能だった meal 数 (=null の meal は除外) */
  mealsWithData: number;
}

export interface AnalysisSessionResult {
  meals: MealAnalysis[];
  failed: FailedMeal[];
  aggregate: AggregateStats;
}

/**
 * 複数 meal の脂質ベーススコアを集約。
 *
 * 平均は lipidPct=null の meal を除外して計算 (データ欠損 meal を 0 扱いしない)。
 * 集計 mg は全 meal の素直な合計。
 */
export function computeAggregate(
  meals: AnalysisResult[]
): Omit<AggregateStats, "totalMeals" | "successfulMeals"> {
  const totalEpaMg = meals.reduce((s, m) => s + m.epaMg, 0);
  const totalDhaMg = meals.reduce((s, m) => s + m.dhaMg, 0);
  const totalAaMg = meals.reduce((s, m) => s + m.aaMg, 0);

  const validMeals = meals.filter((m) => m.lipidPct !== null);
  if (validMeals.length === 0) {
    return {
      lipidPct: null,
      totalEpaMg, totalDhaMg, totalAaMg,
      signal: "unknown",
      mealsWithData: 0,
    };
  }

  const avgLipidPct =
    validMeals.reduce((s, m) => s + (m.lipidPct as number), 0) / validMeals.length;
  const signal = aggregateSignal(avgLipidPct);

  return {
    lipidPct: avgLipidPct,
    totalEpaMg, totalDhaMg, totalAaMg,
    signal,
    mealsWithData: validMeals.length,
  };
}

// Meal type constants for UI
export const MEAL_TYPES = [
  { value: "breakfast", label: "朝食", labelEn: "Breakfast" },
  { value: "lunch", label: "昼食", labelEn: "Lunch" },
  { value: "dinner", label: "夕食", labelEn: "Dinner" },
] as const;

export type MealTypeValue = (typeof MEAL_TYPES)[number]["value"];
