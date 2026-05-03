// 脂質ベース EPA/AA バランス計算 (v0.3.0-beta+)
//
// 計算式 (3 層):
//   - lipidPct (primary, UI 表示):
//       (EPA + DHA) / (EPA + DHA + AA) * 100
//       share form, 範囲 [0, 100]
//   - lipidRatio (secondary, 内部 + API レスポンス):
//       (EPA + DHA) / AA
//       true ratio, 無次元、AA=0 時は null
//   - 絶対量 (将来 v0.4.0): WHO/AHA 推奨値との比較
//       epaMg + dhaMg (集計値)
//
// データソース: data/foods.json の epa_mg, dha_mg, aa_mg (per 100g、MEXT 由来)
//
// 欠損ハンドリング:
//   - 食材の epa_mg/dha_mg/aa_mg のいずれかが null → その食材は計算から除外
//   - lipidCoverage = (Σ grams_with_full_data) / (Σ all_grams) で信頼度報告
//   - 全食材除外 (有効 grams = 0) → lipidPct=null, signal="unknown"

import { lookupFood } from "./food-db";
import { LIPID_RATIO_THRESHOLDS } from "./standards";
import type { TrafficLight } from "./scoring";
import type { VisionFood } from "./vision";

export interface MatchedLipidFood {
  query: string;
  matched: string;
  grams: number;
  /** 該当食材から meal に貢献した EPA mg (= per100g_value × grams / 100) */
  epaContribMg: number;
  dhaContribMg: number;
  aaContribMg: number;
}

export interface LipidResult {
  /** (EPA+DHA) / (EPA+DHA+AA) * 100 (%, share form). 全食材 null なら null */
  lipidPct: number | null;
  /** (EPA+DHA) / AA (unitless ratio). AA=0 時は null */
  lipidRatio: number | null;
  /** 信号機判定。lipidPct=null なら "unknown" */
  signal: TrafficLight;
  /** Meal 全体の EPA 合計 (mg) */
  epaMg: number;
  /** Meal 全体の DHA 合計 (mg) */
  dhaMg: number;
  /** Meal 全体の AA 合計 (mg) */
  aaMg: number;
  /**
   * Mass-weighted coverage: 0.0〜1.0
   * = (脂肪酸データある食材の grams 合計) / (全食材 grams 合計)
   * 1.0 = 全食材にデータあり、0.0 = 全食材データ欠損
   */
  lipidCoverage: number;
  /** 計算に使った（全 3 値が non-null だった）食材 */
  matched: MatchedLipidFood[];
  /** 食材は識別できたが脂肪酸データが部分 null で除外された食材 */
  excludedNoData: { query: string; matched: string; grams: number }[];
  /** 食材データベースに該当が無く識別できなかった食材 (analyzer.ts と同じ集合) */
  unmatched: { query: string; grams: number }[];
}

/**
 * Vision API の出力 (食材名 + グラム量) から脂質ベースの EPA/AA バランスを計算する。
 *
 * 食材ルックアップは既存 `lookupFood` を再利用。fallback (カテゴリ平均) がヒット
 * した場合は脂肪酸データが無い扱い (excludedNoData) で計算から除外する。
 * (カテゴリ平均は脂肪酸推定として信頼できないため。)
 */
export function computeLipidScore(foods: VisionFood[]): LipidResult {
  const matched: MatchedLipidFood[] = [];
  const excludedNoData: { query: string; matched: string; grams: number }[] = [];
  const unmatched: { query: string; grams: number }[] = [];

  let epaMg = 0;
  let dhaMg = 0;
  let aaMg = 0;
  let gramsWithData = 0;
  let gramsTotal = 0;

  for (const f of foods) {
    gramsTotal += f.grams;
    const result = lookupFood(f.name);
    if (!result) {
      unmatched.push({ query: f.name, grams: f.grams });
      continue;
    }
    const { entry, isFallback } = result;
    // Fallback (カテゴリ平均) は脂肪酸データを持たないので除外
    if (isFallback || entry.epa_mg == null || entry.dha_mg == null || entry.aa_mg == null) {
      excludedNoData.push({ query: f.name, matched: entry.name, grams: f.grams });
      continue;
    }
    const factor = f.grams / 100;
    const epaContribMg = entry.epa_mg * factor;
    const dhaContribMg = entry.dha_mg * factor;
    const aaContribMg = entry.aa_mg * factor;
    epaMg += epaContribMg;
    dhaMg += dhaContribMg;
    aaMg += aaContribMg;
    gramsWithData += f.grams;
    matched.push({
      query: f.name,
      matched: entry.name,
      grams: f.grams,
      epaContribMg,
      dhaContribMg,
      aaContribMg,
    });
  }

  const lipidCoverage = gramsTotal > 0 ? gramsWithData / gramsTotal : 0;

  // 全食材に脂肪酸データがない or 食材ゼロ → 判定不能
  if (matched.length === 0) {
    return {
      lipidPct: null,
      lipidRatio: null,
      signal: "unknown",
      epaMg: 0,
      dhaMg: 0,
      aaMg: 0,
      lipidCoverage,
      matched,
      excludedNoData,
      unmatched,
    };
  }

  const totalRelevant = epaMg + dhaMg + aaMg;
  // EPA + DHA + AA がすべて 0 → 比率定義不能 (例: 全食材が脂肪酸ゼロの野菜)
  if (totalRelevant === 0) {
    return {
      lipidPct: null,
      lipidRatio: null,
      signal: "unknown",
      epaMg,
      dhaMg,
      aaMg,
      lipidCoverage,
      matched,
      excludedNoData,
      unmatched,
    };
  }

  const lipidPct = ((epaMg + dhaMg) / totalRelevant) * 100;
  const lipidRatio = aaMg > 0 ? (epaMg + dhaMg) / aaMg : null;
  const signal = computeLipidSignal(lipidPct);

  return {
    lipidPct,
    lipidRatio,
    signal,
    epaMg,
    dhaMg,
    aaMg,
    lipidCoverage,
    matched,
    excludedNoData,
    unmatched,
  };
}

/**
 * lipidPct (%) から信号機判定する。
 *   緑: ≥ 30%   黄: 15-29%   赤: < 15%
 *   null: "unknown"
 */
export function computeLipidSignal(lipidPct: number | null): TrafficLight {
  if (lipidPct === null) return "unknown";
  if (lipidPct >= LIPID_RATIO_THRESHOLDS.green) return "green";
  if (lipidPct >= LIPID_RATIO_THRESHOLDS.yellow) return "yellow";
  return "red";
}
