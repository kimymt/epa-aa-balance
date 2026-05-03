/**
 * 食品カテゴリ。EPA/AA バランス計算で使う食材分類。
 *
 * - fish: 魚介類（EPA・DHA の主要源）
 * - meat / egg_dairy / plant / other: それ以外
 *
 * v0.3.0+: 計算は脂肪酸ベース (lib/scoring.ts computeLipidScore)。
 * カテゴリは表示・凡例・将来の比較機能で使う。
 *
 * v0.3.7: `ProteinCategory` → `FoodCategory`、`plant_protein` → `plant` にリネーム
 * (タンパク質ベース計算からの歴史的命名を整理、ドメイン語彙統一)。
 * v0.4.1: 後方互換 alias `ProteinCategory` を完全削除（移行完了）。
 */
export type FoodCategory =
  | "fish"
  | "meat"
  | "egg_dairy"
  | "plant"
  | "other";

/**
 * 脂質ベース計算 (v0.3.0+) の閾値。
 * fishLipidPct = (EPA + DHA) / (EPA + DHA + AA) * 100
 *
 * **位置付け** (v0.4.13 で評価し直し):
 *
 * これらの閾値は「魚に偏った食事か」を直感的に把握するための **ヒューリスティック**
 * であり、絶対量を anchor する WHO/AHA 推奨値とは目的が異なる。
 *
 *   - 緑（良好）: ≥ 30%
 *   - 黄（中程度）: 15-29%
 *   - 赤（改善推奨）: < 15%
 *
 * **科学的補足**:
 * - 血中 EPA/AA 比 (臨床指標) と食事 lipidPct には直接の 1:1 マッピングは存在しない
 *   （AA は食事よりリノール酸からの内因性合成が支配的）
 * - 心血管疾患リスク低減で確立しているのは絶対摂取量ベースの推奨
 *   （WHO 250 mg/日、AHA 一般 500 mg/日、AHA CVD 二次予防 1000 mg/日）
 * - 詳細・出典は `lib/recommendations.ts` 参照
 *
 * **したがって UI は両指標を併記する設計** (v0.4.13):
 * - lipidPct (本指標): 魚に偏ってるかの傾向把握 → 信号機 + 閾値判定
 * - 絶対 mg/日: 摂取量足りてるかの evidence-based 判定 → WHO/AHA 達成バッジ
 *
 * 30%/15% の数値自体は v0.3.0 設計時のヒューリスティック設定値で、ratio 指標と
 * しての厳密な anchor は無いが、「魚タンパク中心 80% 食事が緑」のような感覚的
 * チェックで設定された経緯あり (CHANGELOG v0.3.0 参照)。当面は維持し、ユーザー
 * フィードバックや将来の研究データで必要に応じて調整。
 */
export const LIPID_RATIO_THRESHOLDS = {
  green: 30, // ≥ 30% → 青
  yellow: 15, // 15-29% → 黄、< 15% → 赤
} as const;

export const CATEGORY_LABELS_JA: Record<FoodCategory, string> = {
  fish: "魚介",
  meat: "肉",
  egg_dairy: "卵・乳",
  plant: "豆類",
  other: "その他",
};
