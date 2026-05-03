/**
 * 食品カテゴリ。EPA/AA比のプロキシ計算で使う。
 *
 * - fish: 魚介類（EPA源 = numerator）
 * - meat / egg_dairy / plant_protein / other: それ以外（denominatorに加算）
 */
export type ProteinCategory =
  | "fish"
  | "meat"
  | "egg_dairy"
  | "plant_protein"
  | "other";

/**
 * 信号機判定の閾値（魚タンパク質割合 % で判定）。
 *
 * EPA/AA比は本来は血中脂肪酸の比だが、食事写真からの推定としては
 * 「魚タンパク質 / 総タンパク質」を実用的なプロキシとして使う。
 *
 * 一般的なEPA/AA比の医学的目安:
 *   - 0.5以上: 一般健康ライン
 *   - 0.75以上: 心血管保護
 *   - 1.0以上: アスリート目標
 *
 * 食事中の魚タンパク質比率としてのMVP閾値（推奨値が出たら差し替え可能）:
 *   - 50%以上: 青信号（魚中心の食事）
 *   - 25%以上: 黄信号（混在）
 *   - 25%未満: 赤信号（魚が少ない）
 */
export const FISH_RATIO_THRESHOLDS = {
  green: 50, // ≥ 50% → 青
  yellow: 25, // 25-49% → 黄、< 25% → 赤
} as const;

/**
 * 脂質ベース計算 (v0.3.0-beta+) の閾値。
 * fishLipidPct = (EPA + DHA) / (EPA + DHA + AA) * 100
 *
 * **暫定値** (v0.3.0): 旧タンパク質ベース (50%/25%) より大幅下方修正。
 * 食材の脂質絶対量はタンパク質より少ないため、魚由来比率も低めに出る。
 *
 *   - 緑（良好）: ≥ 30%
 *   - 黄（中程度）: 15-29%
 *   - 赤（改善推奨）: < 15%
 *
 * 妥当性検証: data/test-fixtures/threshold-validation-meals.json で
 * 「魚中心 80% が緑」「肉中心 80% が黄/赤」を満たすことを PR 2 で確認。
 *
 * エビデンスベース閾値 (WHO/AHA EPA+DHA mg/日推奨値ベース) は v0.4.0 で再評価。
 */
export const LIPID_RATIO_THRESHOLDS = {
  green: 30, // ≥ 30% → 青
  yellow: 15, // 15-29% → 黄、< 15% → 赤
} as const;

/** タンパク質量がこれ未満だと比率の信頼性が低い（誤差が大きすぎる） */
export const MIN_TOTAL_PROTEIN_G = 1;

/** 食材データのカバレッジ閾値（マッチした食材のタンパク質比率） */
export const COVERAGE_THRESHOLD = 0.5;

export const CATEGORY_LABELS_JA: Record<ProteinCategory, string> = {
  fish: "魚介",
  meat: "肉",
  egg_dairy: "卵・乳",
  plant_protein: "豆類",
  other: "その他",
};
