/**
 * EAA基準値（mg/kg体重/日）
 *
 * Source: WHO/FAO/UNU (2007) "Protein and amino acid requirements in human nutrition"
 *         Table 26, p.150 — adult requirements
 *
 * 日本水産のEAA基準が公開文書から入手できた場合はこの値を差し替える。
 * スコアリングロジックは数値に依存しないため、差し替えはこのファイルだけで完結する。
 */
export const EAA_STANDARD_MG_PER_KG_DAY = {
  histidine: 10,
  isoleucine: 20,
  leucine: 39,
  lysine: 30,
  methionine_cysteine: 15, // Met + Cys 合算
  phenylalanine_tyrosine: 25, // Phe + Tyr 合算
  threonine: 15,
  tryptophan: 4,
  valine: 26,
} as const;

export type EAAKey = keyof typeof EAA_STANDARD_MG_PER_KG_DAY;

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

export const DEFAULT_BODY_WEIGHT_KG = 60;

/**
 * Compute the daily requirement (mg) for the given body weight.
 */
export function dailyRequirementMg(bodyWeightKg: number = DEFAULT_BODY_WEIGHT_KG) {
  const out = {} as Record<EAAKey, number>;
  for (const k of EAA_KEYS) {
    out[k] = EAA_STANDARD_MG_PER_KG_DAY[k] * bodyWeightKg;
  }
  return out;
}
