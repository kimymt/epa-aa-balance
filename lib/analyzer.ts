// 脂質ベース EPA/AA バランス分析 (v0.3.0+)
//
// v0.2.0 では「魚タンパク質 / 総タンパク質」の proxy 計算だったが、
// v0.3.0 で実 EPA/DHA/AA mg 値ベースの計算に移行した。
// 旧 fishProteinPct, proteinByCategory 等のフィールドは削除済み。
//
// 計算は lib/scoring.ts の computeLipidScore() に委譲。
// このモジュールは vision の結果と統合し、UI 向けの集計形式に整える。

import { computeLipidScore } from "./scoring";
import type { TrafficLight } from "./scoring";
import type { VisionFood } from "./vision";

export interface MatchedFood {
  query: string;
  matched: string;
  grams: number;
  /** 該当食材から meal に貢献した EPA mg */
  epaContribMg: number;
  /** 該当食材から meal に貢献した DHA mg */
  dhaContribMg: number;
  /** 該当食材から meal に貢献した AA mg */
  aaContribMg: number;
}

export interface UnmatchedFood {
  query: string;
  grams: number;
}

export interface ExcludedFood {
  query: string;
  matched: string;
  grams: number;
}

export interface AnalysisResult {
  /** 信号機判定。lipidPct=null 時は "unknown" (グレー表示) */
  light: TrafficLight;
  /** (EPA+DHA) / (EPA+DHA+AA) * 100 (share form, %). 全食材データ欠損時 null */
  lipidPct: number | null;
  /** (EPA+DHA) / AA (true ratio, 無次元). AA=0 時 null */
  lipidRatio: number | null;
  /** Meal 全体の EPA 合計 (mg) */
  epaMg: number;
  /** Meal 全体の DHA 合計 (mg) */
  dhaMg: number;
  /** Meal 全体の AA 合計 (mg) */
  aaMg: number;
  /** Mass-weighted 信頼度 (脂肪酸データある食材の grams 比率, 0-1) */
  lipidCoverage: number;
  /** 計算に使った（脂肪酸データ揃った）食材 */
  matched: MatchedFood[];
  /** 識別はできたが脂肪酸データが部分 null で除外された食材 */
  excludedNoData: ExcludedFood[];
  /** 食材データベースに該当が無く識別できなかった食材 */
  unmatched: UnmatchedFood[];
}

/**
 * Vision API の結果（食材リスト）から脂質ベースの EPA/AA バランスを計算し、信号機判定する。
 *
 * 計算方法:
 *   1. 各食材を food-db で lookup → epa_mg/dha_mg/aa_mg 取得
 *   2. グラム量に応じてスケーリング → meal 全体の EPA/DHA/AA 合計
 *   3. lipidPct = (EPA+DHA) / (EPA+DHA+AA) * 100
 *   4. 閾値で信号機判定 (≥30% 青、≥15% 黄、<15% 赤、データ不足 unknown)
 */
export function analyze(foods: VisionFood[]): AnalysisResult {
  const lipid = computeLipidScore(foods);

  const matched: MatchedFood[] = lipid.matched.map((m) => ({
    query: m.query,
    matched: m.matched,
    grams: m.grams,
    epaContribMg: m.epaContribMg,
    dhaContribMg: m.dhaContribMg,
    aaContribMg: m.aaContribMg,
  }));

  return {
    light: lipid.signal,
    lipidPct: lipid.lipidPct,
    lipidRatio: lipid.lipidRatio,
    epaMg: lipid.epaMg,
    dhaMg: lipid.dhaMg,
    aaMg: lipid.aaMg,
    lipidCoverage: lipid.lipidCoverage,
    matched,
    excludedNoData: lipid.excludedNoData,
    unmatched: lipid.unmatched,
  };
}
