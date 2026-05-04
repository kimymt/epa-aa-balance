// EPA+DHA 摂取量に関する公的推奨値 (v0.4.13)
//
// 目的: ユーザーの 1 日換算 EPA+DHA mg を、国際的に認められた公的推奨と
// 並べて達成度を示す。lipidPct (30%/15% 暫定閾値) より科学的に強い anchor。
//
// **科学的位置付け**:
// - lipidPct (魚由来脂質割合): ratio 指標。簡単で直感的だが、AA 内因性合成の
//   影響で血中 EPA/AA 比への直接プロキシではない。
// - 絶対 mg 摂取量: 多くの臨床試験 (REDUCE-IT, JELIS, GISSI-Prevenzione 等) で
//   心血管イベント減少と関連付けられている。WHO/AHA はこちらをベースに推奨。
//
// したがって UI は両指標を並列表示し、ユーザーが 2 つの観点から自分の食事を
// 評価できるようにする (lipidPct = "魚に偏ってるか"、mg = "絶対量足りてるか")。
//
// **出典**:
// - WHO/FAO 2010 "Fats and Fatty Acids in Human Nutrition" Expert Consultation:
//   EPA+DHA 250-2000 mg/day (健康成人)、CVD リスク低減に 250 mg 以上推奨
// - AHA 2002/2017 Statement: 一般成人で週 2 回の oily fish (= ~500mg/day 相当)、
//   CVD secondary prevention で 1000 mg/day EPA+DHA 推奨
// - 日本厚労省「日本人の食事摂取基準 2020 年版」: n-3 系脂肪酸 目標量
//   成人男性 2.0-2.2 g/日 / 成人女性 1.6-2.0 g/日 (ALA 含む total n-3、
//   EPA+DHA はその一部、概ね 1000-1500 mg/day が現実的目標)
//
// 注: 上記は摂取量レベルの推奨で、血中 Omega-3 Index への 1:1 マッピングは
// 個人差・遺伝子多型・吸収率で大きくぶれる。あくまで「目標 mg/日」の参考。

export interface IntakeRecommendation {
  /** 内部 key */
  id: string;
  /** UI 表示用ラベル (短) */
  label: string;
  /** 推奨 mg/日 (達成判定の閾値) */
  thresholdMgPerDay: number;
  /** 詳細説明 (出典含む、tooltip 等で使う) */
  description: string;
}

/**
 * 推奨値、達成しやすい順 (low → high)。UI で並べる際この順。
 */
export const INTAKE_RECOMMENDATIONS: readonly IntakeRecommendation[] = [
  {
    id: "who_general",
    label: "WHO 一般推奨",
    thresholdMgPerDay: 250,
    description:
      "WHO/FAO 2010 専門家委員会: 健康成人で EPA+DHA 250 mg/日 以上が CVD リスク低減の最低ライン。",
  },
  {
    id: "aha_primary",
    label: "AHA 一般推奨 (2002/2017)",
    thresholdMgPerDay: 500,
    description:
      "AHA Scientific Statement (2002, 再確認 2017): 健康成人で週 2 回の oily fish (脂質豊富な魚) を推奨、≒ EPA+DHA 500 mg/日。",
  },
  {
    id: "aha_cvd",
    label: "AHA CVD 二次予防 (2017 年版)",
    thresholdMgPerDay: 1000,
    description:
      "AHA Scientific Advisory 2017: 心血管疾患の既往者に EPA+DHA 1000 mg/日 を「妥当 (Reasonable)」と位置付け。なお高用量補充の効果については STRENGTH 試験 (2020) 等で慎重な見解も示されています。",
  },
] as const;

export interface AchievementResult {
  recommendation: IntakeRecommendation;
  /** 達成しているか (userMgPerDay >= threshold) */
  achieved: boolean;
  /** 達成率 (0.0〜2.0+ で clamp なし、UI 側で見せ方判断) */
  ratio: number;
}

/**
 * ユーザーの daily mg/日を全推奨値と照合し、結果配列を返す。
 * 順序は INTAKE_RECOMMENDATIONS と同じ (達成しやすい順)。
 */
export function evaluateAchievements(userMgPerDay: number): AchievementResult[] {
  return INTAKE_RECOMMENDATIONS.map((rec) => ({
    recommendation: rec,
    achieved: userMgPerDay >= rec.thresholdMgPerDay,
    ratio: userMgPerDay / rec.thresholdMgPerDay,
  }));
}
