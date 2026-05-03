/**
 * 食品カテゴリ。EPA/AA バランス計算で使う食材分類。
 *
 * - fish: 魚介類（EPA・DHA の主要源）
 * - meat / egg_dairy / plant_protein / other: それ以外
 *
 * v0.3.0+: 計算は脂肪酸ベース (lib/scoring.ts computeLipidScore)。
 * カテゴリは表示・凡例・将来の比較機能で使う。
 *
 * 注: 型名 `ProteinCategory` および `plant_protein` 値は v0.2.0 (タンパク質ベース計算)
 * からの歴史的な命名。v0.3.1 で `FoodCategory` / `plant` にリネーム予定 (TODOS.md)。
 */
export type ProteinCategory =
  | "fish"
  | "meat"
  | "egg_dairy"
  | "plant_protein"
  | "other";

/**
 * 脂質ベース計算 (v0.3.0+) の閾値。
 * fishLipidPct = (EPA + DHA) / (EPA + DHA + AA) * 100
 *
 * **暫定値** (v0.3.0): 旧タンパク質ベース (50%/25%) より大幅下方修正。
 * 食材の脂質絶対量はタンパク質より少ないため、魚由来比率も低めに出る。
 *
 *   - 緑（良好）: ≥ 30%
 *   - 黄（中程度）: 15-29%
 *   - 赤（改善推奨）: < 15%
 *
 * エビデンスベース閾値 (WHO/AHA EPA+DHA mg/日推奨値ベース) は v0.4.0 で再評価。
 */
export const LIPID_RATIO_THRESHOLDS = {
  green: 30, // ≥ 30% → 青
  yellow: 15, // 15-29% → 黄、< 15% → 赤
} as const;

export const CATEGORY_LABELS_JA: Record<ProteinCategory, string> = {
  fish: "魚介",
  meat: "肉",
  egg_dairy: "卵・乳",
  plant_protein: "豆類",
  other: "その他",
};
