// 食習慣パターン参照データ (v0.4.9)
//
// 目的: ユーザーの食事 EPA+DHA 摂取量を、世界の代表的食習慣 5 パターンと
// 比較する WOW 体験。「あなたは標準的アメリカ食と地中海食の間です」のような
// 文化的アンカーで自分の位置を直感把握させる。
//
// **科学的注記**:
// - 値は「公開文献での集団平均値の代表値」を rounded して採用
// - 個人差・調査時期・調理法等で 2-3 倍ぶれる
// - 「血液 Omega-3 Index は ~8 週間遅れて反応」など時間遅延も無視
// - あくまで方向性把握。クリニカルな絶対値ではない (オンボーディングで開示済み)
//
// 値の出典:
// - 標準的アメリカ食:    NHANES 調査 (~100-200 mg/日) → 150 mg/日
// - 地中海食:            PREDIMED 試験ベース (~500-700) → 600 mg/日
// - 日本伝統食:          国民健康栄養調査ベース (~1000-1500) → 1200 mg/日
// - ノルウェー食:        魚介 + 肝油サプリ普及 (~1500-2000) → 1700 mg/日
// - イヌイット伝統食:    Bang & Dyerberg 研究 (~10000-16000) → 14000 mg/日

export interface DietPattern {
  /** 内部 key (英) */
  id: string;
  /** UI 表示名 (日) */
  name: string;
  /** EPA+DHA 摂取量 (mg/日)、集団平均の代表値 */
  epaDhaMgPerDay: number;
  /** 1 行 caption (UI 補足説明) */
  caption: string;
  /**
   * F-026 (v0.8.10): 「歴史的参考値」フラグ。true のパターンは現代的に
   * 達成可能な目標ではなく歴史的・人類学的アンカーであることを UI 側で
   * 視覚的に明示する (PatternRow が薄め + 「歴史的参考値」chip 付き)。
   * イヌイット 14,000 mg/日 のように他の 4 倍以上に飛び抜けた値が
   * 「目指すべき目標」と読まれることを防ぐ。
   */
  historical?: boolean;
}

/**
 * 5 パターン、低い順にソート済み。UI でこの順序のまま縦に並べる。
 */
export const DIET_PATTERNS: readonly DietPattern[] = [
  {
    id: "us_standard",
    name: "標準的アメリカ食",
    epaDhaMgPerDay: 150,
    caption: "魚は週 1 回未満",
  },
  {
    id: "mediterranean",
    name: "地中海食",
    epaDhaMgPerDay: 600,
    caption: "週 2-3 回の魚介、オリーブオイル中心",
  },
  {
    id: "japanese_traditional",
    name: "日本伝統食",
    epaDhaMgPerDay: 1200,
    caption: "青魚を週 3-4 回（戦後〜70 年代の標準）",
  },
  {
    id: "norwegian",
    name: "ノルウェー食",
    epaDhaMgPerDay: 1700,
    caption: "鮭・鯖中心 + 肝油サプリ普及",
  },
  {
    id: "inuit_traditional",
    name: "イヌイット伝統食 (1970 年代以前)",
    epaDhaMgPerDay: 14000,
    // v0.4.18: 時代背景を明示。現代イヌイットの食事は欧米化が進んでおり、
    // この値はあくまで歴史的な極端値。Bang & Dyerberg 研究当時のレベル。
    caption:
      "1970 年代以前の伝統食。アザラシ・クジラの脂で 90% 以上が魚介由来。現代イヌイット食は欧米化が進み、この値は歴史的な極端値",
    historical: true,
  },
] as const;

export interface PatternPosition {
  /** ユーザーが超えている最高パターン (null = 最低パターン未満) */
  surpassed: DietPattern | null;
  /** ユーザーが届いていない次のパターン (null = 全パターン超え) */
  next: DietPattern | null;
  /** next までの差 (mg/日)。surpassed/next の関係で計算。null なら不要。 */
  gapToNextMg: number | null;
}

/**
 * ユーザーの daily mg 値を 5 パターンと照合し、位置を返す。
 *
 * 例: userDailyMg = 480
 *   → surpassed = "標準的アメリカ食" (150), next = "地中海食" (600)
 *   → gapToNextMg = 120
 *
 * 例: userDailyMg = 50
 *   → surpassed = null, next = "標準的アメリカ食" (150)
 *   → gapToNextMg = 100
 *
 * 例: userDailyMg = 20000
 *   → surpassed = "イヌイット伝統食" (14000), next = null
 *   → gapToNextMg = null
 */
export function findPatternPosition(userDailyMg: number): PatternPosition {
  let surpassed: DietPattern | null = null;
  let next: DietPattern | null = null;

  for (const p of DIET_PATTERNS) {
    if (userDailyMg >= p.epaDhaMgPerDay) {
      surpassed = p;
    } else if (next === null) {
      next = p;
      break; // 一旦 next 見つけたら確定
    }
  }

  const gapToNextMg = next ? Math.round(next.epaDhaMgPerDay - userDailyMg) : null;
  return { surpassed, next, gapToNextMg };
}

/**
 * アップロード食数 → 1 日換算した平均 EPA+DHA mg/日。
 * 仕様: 3 食 = 1 日。
 *   - meals=3: total / 1 = total
 *   - meals=6: total / 2 = total/2
 *   - meals=1: total / (1/3) = total * 3
 *   - meals=4: total / (4/3) = total * 0.75
 *
 * 数式: dailyAvgMg = totalMg * 3 / mealsCount
 *
 * meals = 0 の防御 → 0 を返す (UI 側で「該当データなし」表示）。
 */
export function dailyAverageMg(totalMg: number, mealsCount: number): number {
  if (mealsCount <= 0) return 0;
  return (totalMg * 3) / mealsCount;
}
