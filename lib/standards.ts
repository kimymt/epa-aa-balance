/**
 * EAA基準パターン（mg/gタンパク質）— アミノ酸スコア計算用の参照値。
 *
 * Source: WHO/FAO/UNU (2007) "Protein and amino acid requirements in human nutrition"
 *         Table 26, p.150 — adult amino acid scoring pattern
 *
 * これは「タンパク質1gあたり、各EAAが何mg含まれているべきか」の理想パターン。
 * 食事のEAA含有量をこの基準に対する比率で評価することで、摂取量や体重に依存せずに
 * 「タンパク質の質」を判定できる（アミノ酸スコア法）。
 *
 * 日本水産のEAA基準が公開文書から入手できた場合はこの値を差し替える。
 * スコアリングロジックは値に依存しないため、差し替えはこのファイルだけで完結する。
 */
export const EAA_REFERENCE_MG_PER_G_PROTEIN = {
  histidine: 15,
  isoleucine: 30,
  leucine: 59,
  lysine: 45,
  methionine_cysteine: 22, // Met + Cys 合算
  phenylalanine_tyrosine: 38, // Phe + Tyr 合算
  threonine: 23,
  tryptophan: 6,
  valine: 39,
} as const;

export type EAAKey = keyof typeof EAA_REFERENCE_MG_PER_G_PROTEIN;

export const EAA_LABELS_JA: Record<EAAKey, string> = {
  histidine: "ヒスチジン",
  isoleucine: "イソロイシン",
  leucine: "ロイシン",
  lysine: "リジン",
  methionine_cysteine: "含硫アミノ酸 (Met+Cys)",
  phenylalanine_tyrosine: "芳香族アミノ酸 (Phe+Tyr)",
  threonine: "スレオニン",
  tryptophan: "トリプトファン",
  valine: "バリン",
};

export const EAA_KEYS: EAAKey[] = [
  "histidine",
  "isoleucine",
  "leucine",
  "lysine",
  "methionine_cysteine",
  "phenylalanine_tyrosine",
  "threonine",
  "tryptophan",
  "valine",
];
