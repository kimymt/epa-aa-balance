// 安全性に関する注意事項の中央集権 (v0.4.16)
//
// 目的: アプリ各所で同じ注意事項を一貫して表示するための単一情報源 (single
// source of truth)。文言を変更したい時、ここ 1 箇所を直せば全箇所に反映される。
//
// 配置方針:
// - 「事実通告」スタンスを徹底。fear-mongering しない。
// - 食事からの摂取で問題になるケースはほぼ無い、という前提で書く。
//   問題になるのはサプリ高用量 + 抗凝固薬併用等のニッチケース。
//
// 出典:
// - AHA 2002/2017 Statement: 〜3-4 g/日で出血リスク増加なし
// - EFSA 2012: 最大 5 g/日まで安全性懸念なし
// - REDUCE-IT 試験 (2018): 4g/日 × 5 年で major bleeding なし
// - Cochrane Review 2018 (Abdelhamid et al., 79 RCTs): 出血イベントに有意差なし

export interface SafetyNote {
  /** 内部 key */
  id: string;
  /** UI 表示用ラベル (短) */
  label: string;
  /** 本文 (1-3 文、敬体) */
  body: string;
  /** カテゴリ (将来 filtering 用) */
  category: "bleeding" | "allergy" | "interaction" | "general";
}

/**
 * 主要な注意事項。新規追加は SafetyNote interface を満たす形で。
 * 個別 export は使う側が明示的に import できるよう SAFETY_NOTES オブジェクト経由で公開。
 */
export const SAFETY_NOTES = {
  /**
   * 抗凝固薬・抗血小板剤併用者および手術予定者向けの相談推奨。
   * OnboardingCard で表示。
   * Q&A の対応する記述と整合させる。
   */
  ANTICOAGULANT_CONSULT: {
    id: "anticoagulant_consult",
    label: "服薬中・手術予定の方へ",
    body:
      "抗凝固薬・抗血小板剤を服用中、または手術予定がある方は、EPA・DHA サプリメントの併用について医師にご相談ください（食事からの摂取で問題になることはほぼありません）。",
    category: "bleeding",
  },

  /**
   * 食事 EPA+DHA が高水準（イヌイット食レベル超え）に達した時の文言。
   * DietPatternComparison の「全パターン超え」フッターで表示。
   * 称賛ではなく「ここから先は維持が大事」のスタンス。
   *
   * v0.4.18: 旧文言の「3 g/日 を超える」→「5 g/日 を超える」に修正。
   * サバ缶 1 缶 (150g) で約 3 g に達するため、3 g は通常食で到達可能。
   * 出血リスク等の議論で「過剰」とされる継続摂取の目安は EFSA 上限 (5 g/日) ベース。
   * 詳細は README の安全性セクション参照。
   */
  HIGH_INTAKE_MAINTENANCE: {
    id: "high_intake_maintenance",
    label: "高水準到達時のメッセージ",
    body:
      "食事からの EPA+DHA 摂取が高水準に達しています。これ以上の上乗せは不要で、ここから先は量より「この食習慣を続けること」が大事です。サプリメント等で 5 g/日を超える継続摂取がある場合は医師にご相談ください。",
    category: "general",
  },
} as const satisfies Record<string, SafetyNote>;

export type SafetyNoteKey = keyof typeof SAFETY_NOTES;
