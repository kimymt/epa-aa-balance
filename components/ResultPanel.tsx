import { LipidSourceBar } from "./LipidSourceBar";
import { CoachSection } from "./CoachSection";
import { DietPatternComparison } from "./DietPatternComparison";
import { MEAL_TYPES } from "@/lib/session";
import type { AnalysisResult } from "@/lib/analyzer";
import type { AnalysisSessionResult } from "@/lib/session";
import type { VisionFood } from "@/lib/vision";
import { useState } from "react";

// 信号機色 → CSS class マッピング
// v0.3.0: unknown=グレー追加
// v0.4.7: bg-*-500 (saturated pill, button-like) → bg-*-50 + text-*-700 + border
//         (chip style, status-label-like)。/design-review F-002 対応:
//         「改善推奨」が clickable CTA に見える false affordance を解消。
const SIGNAL_CHIP: Record<string, string> = {
  green: "bg-green-50 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-800",
  yellow: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
  red: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800",
  unknown: "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
};
const SIGNAL_LABEL: Record<string, string> = {
  green: "良好",
  yellow: "中程度",
  red: "改善推奨",
  unknown: "判定不能",
};

// Component for a single meal result (reusable)
function MealResultCard({
  result,
  mealType,
  index,
  total,
  foods,
}: {
  result: AnalysisResult;
  mealType: string;
  index: number;
  total: number;
  foods?: VisionFood[];
}) {
  const mealLabel =
    MEAL_TYPES.find((m) => m.value === mealType)?.label || "食事";

  const [feedbackState, setFeedbackState] = useState<
    "none" | "accurate" | "correcting" | "submitted"
  >("none");
  const [selectedCorrection, setSelectedCorrection] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const handleFeedbackSubmit = async (accurate: boolean, correction?: string) => {
    setSubmitting(true);
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mealType,
          predictedFoods: foods || [],
          accurate,
          correctedFoods: correction ? correction.split(",").map(f => f.trim()) : undefined,
          timestamp: new Date().toISOString(),
        }),
      });
      if (response.ok) {
        setFeedbackState("submitted");
        setSelectedCorrection("");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-3">
        <div>
          <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {mealLabel}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {index + 1} / {total}
          </div>
        </div>
      </div>

      {result.lipidCoverage < 1 && result.lipidPct !== null && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          ⚠ {result.excludedNoData.length}品目の脂肪酸データが不足しているため計算から除外されています
          （信頼度 {Math.round(result.lipidCoverage * 100)}%）
        </div>
      )}
      <>
          <div>
            <div className="text-3xl font-bold text-slate-900 dark:text-slate-100">
              {result.lipidPct === null ? "—" : `${Math.round(result.lipidPct)}%`}
              <span className="ml-2 text-lg text-slate-600 dark:text-slate-400">
                魚由来脂質（EPA+DHA / EPA+DHA+AA）
              </span>
            </div>
            <div
              className={`mt-2 inline-flex items-center px-2.5 py-0.5 rounded-md border text-xs font-medium ${SIGNAL_CHIP[result.light]}`}
            >
              {SIGNAL_LABEL[result.light]}
            </div>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
              脂肪酸の内訳
            </h4>
            <div className="mt-2">
              <LipidSourceBar
                epaMg={result.epaMg}
                dhaMg={result.dhaMg}
                aaMg={result.aaMg}
              />
            </div>
          </div>

          <div className="text-xs text-slate-500 dark:text-slate-500 space-y-1">
            <p>
              <strong>EPA:</strong> {result.epaMg.toFixed(0)} mg（魚由来、抗炎症性）
            </p>
            <p>
              <strong>DHA:</strong> {result.dhaMg.toFixed(0)} mg（魚由来）
            </p>
            <p>
              <strong>AA（アラキドン酸）:</strong> {result.aaMg.toFixed(0)} mg（肉・卵・乳由来）
            </p>
            {result.lipidRatio !== null && (
              <p className="pt-1 border-t border-slate-200 dark:border-slate-700 mt-1">
                <strong>(EPA+DHA) / AA 比:</strong> {result.lipidRatio.toFixed(2)}
              </p>
            )}
          </div>

          {/* Feedback Section */}
          <div className="border-t border-slate-200 dark:border-slate-700 pt-3">
            {feedbackState === "submitted" && (
              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-200">
                ✓ フィードバックありがとうございました。精度改善に活用します。
              </div>
            )}

            {feedbackState === "none" && (
              <div>
                <p className="text-xs text-slate-600 dark:text-slate-400 mb-2">
                  この判定は正確ですか？
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleFeedbackSubmit(true)}
                    disabled={submitting}
                    className="flex-1 text-xs px-3 py-2 rounded border border-green-300 text-green-700 hover:bg-green-50 dark:border-green-800 dark:text-green-400 dark:hover:bg-green-950/40 disabled:opacity-50"
                  >
                    正確 ✓
                  </button>
                  <button
                    onClick={() => setFeedbackState("correcting")}
                    disabled={submitting}
                    className="flex-1 text-xs px-3 py-2 rounded border border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950/40 disabled:opacity-50"
                  >
                    誤り - 修正
                  </button>
                </div>
              </div>
            )}

            {feedbackState === "correcting" && (
              <div>
                <p className="text-xs text-slate-600 dark:text-slate-400 mb-2">
                  実際の食材は何でしたか？（カンマで区切る）
                </p>
                <input
                  type="text"
                  placeholder="例：サケ, 野菜"
                  value={selectedCorrection}
                  onChange={(e) => setSelectedCorrection(e.target.value)}
                  className="w-full text-xs px-2 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 mb-2"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => handleFeedbackSubmit(false, selectedCorrection)}
                    disabled={submitting || !selectedCorrection.trim()}
                    className="flex-1 text-xs px-3 py-2 rounded bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50"
                  >
                    送信
                  </button>
                  <button
                    onClick={() => {
                      setFeedbackState("none");
                      setSelectedCorrection("");
                    }}
                    disabled={submitting}
                    className="flex-1 text-xs px-3 py-2 rounded border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
                  >
                    キャンセル
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
    </div>
  );
}

// Main result panel for multi-image session
export function ResultPanel({ result }: { result: AnalysisSessionResult }) {
  const successfulMeals = result.meals;
  const failedMeals = result.failed;
  const aggregate = result.aggregate;

  return (
    <div className="flex flex-col gap-8 sm:gap-10">
      {/* Aggregate Stats - Primary */}
      <div className="rounded-2xl bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-950/30 dark:to-emerald-900/30 p-6 sm:p-8 border border-emerald-200 dark:border-emerald-800">
        <div className="text-center">
          <div className="text-sm font-medium text-emerald-700 dark:text-emerald-300 uppercase tracking-wide">
            {successfulMeals.length}食事の平均
          </div>
          <div className="mt-4 text-5xl sm:text-6xl font-bold text-emerald-900 dark:text-emerald-50">
            {aggregate.lipidPct === null ? "—" : `${Math.round(aggregate.lipidPct)}%`}
          </div>
          <div className="mt-2 text-base text-emerald-800 dark:text-emerald-200">
            魚由来脂質の割合（EPA+DHA / EPA+DHA+AA）
          </div>
          {/* v0.4.7: aggregate signal label も chip スタイルに統一 (F-002 対応)。
              大きめ (px-3 py-1 + text-base) で hierarchy は保つ。 */}
          <div
            className={`mt-4 inline-flex items-center px-3 py-1 rounded-md border text-base font-semibold ${SIGNAL_CHIP[aggregate.signal]}`}
          >
            {aggregate.signal === "green" ? "良好 ✓"
              : aggregate.signal === "yellow" ? "中程度"
              : aggregate.signal === "red" ? "改善推奨"
              : "判定不能"}
          </div>
          <p className="mt-4 text-sm text-emerald-700 dark:text-emerald-300">
            {aggregate.totalMeals} 食事中 {aggregate.successfulMeals} 食事を正常に解析
            {aggregate.mealsWithData < aggregate.successfulMeals && (
              <span>（{aggregate.mealsWithData} 食事で脂質計算可能）</span>
            )}
          </p>
          <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">
            EPA合計 {aggregate.totalEpaMg.toFixed(0)}mg ／ DHA合計 {aggregate.totalDhaMg.toFixed(0)}mg ／ AA合計 {aggregate.totalAaMg.toFixed(0)}mg
          </p>
        </div>
      </div>

      {/* v0.4.9: 食習慣パターン比較 (Aggregate と AI Coach の間)。
          5 パターン (米国 / 地中海 / 日本 / ノルウェー / イヌイット) と並べて
          ユーザーの位置を可視化する WOW 体験。 */}
      {successfulMeals.length > 0 && (
        <DietPatternComparison
          totalEpaMg={aggregate.totalEpaMg}
          totalDhaMg={aggregate.totalDhaMg}
          mealsWithData={aggregate.mealsWithData}
          lipidPct={aggregate.lipidPct}
        />
      )}

      {/* AI Coach Section (v0.4.0): Aggregate と個別 MealResultCard の間 */}
      {successfulMeals.length > 0 && (
        <CoachSection
          aggregate={{
            lipidPct: aggregate.lipidPct,
            epaMg: aggregate.totalEpaMg,
            dhaMg: aggregate.totalDhaMg,
            aaMg: aggregate.totalAaMg,
          }}
          recentFoods={successfulMeals.flatMap((m) => m.foods ?? [])}
        />
      )}

      {/* Failed Meals Alert */}
      {failedMeals.length > 0 && (
        <div className="rounded-lg border border-rose-300 bg-rose-50 p-4 dark:border-rose-800 dark:bg-rose-950/30">
          <div className="text-sm font-medium text-rose-900 dark:text-rose-200">
            ⚠ {failedMeals.length} 食事の解析に失敗しました
          </div>
          <ul className="mt-2 space-y-1 text-sm text-rose-800 dark:text-rose-300">
            {failedMeals.map((failed, i) => (
              <li key={i}>
                • {MEAL_TYPES.find((m) => m.value === failed.mealType)?.label || "食事"} (写真{failed.index + 1}): {failed.error}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Carousel of Individual Meals */}
      {successfulMeals.length > 0 && (
        <div>
          {/* v0.4.7: <div> → <h2> でセマンティック見出しに昇格 (F-004 対応)。
              スクリーンリーダーと検索エンジンに section 構造を伝える。
              視覚は既存のままに保つ (mb-4 text-sm font-semibold)。 */}
          <h2 className="mb-4 text-sm font-semibold text-slate-700 dark:text-slate-300">
            個別の食事結果
          </h2>

          <div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pb-2"
            role="region"
            aria-label="食事結果のグリッド"
          >
            {successfulMeals.map((meal, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 bg-white dark:bg-slate-900/50 hover:shadow-lg transition-shadow"
              >
                <MealResultCard
                  result={meal.result}
                  mealType={meal.mealType}
                  index={meal.index}
                  total={result.aggregate.totalMeals}
                  foods={meal.foods}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* EPA/AA Explanation */}
      {/* v0.4.7: text-xs (12px) text-slate-500 → text-sm (14px) text-slate-600
          で本文のコントラストと可読性を改善 (F-006 対応)。
          dark mode は slate-400 → slate-300 で同様の改善。 */}
      <div className="text-sm text-slate-600 dark:text-slate-300 space-y-2 leading-relaxed">
        <p>
          <strong>判定方法:</strong>{" "}
          食材ごとの脂肪酸成分（MEXT 食品成分表 脂肪酸成分表編 2020 由来）から、
          (EPA+DHA) / (EPA+DHA+AA) の割合を計算しています。
        </p>
        <p>
          <strong>EPA・DHA:</strong> 魚介類に多い omega-3 脂肪酸（抗炎症性）。
          <strong className="ml-2">AA（アラキドン酸）:</strong> 肉・卵・乳製品に多い omega-6 脂肪酸。
        </p>
        <p>
          <strong>暫定閾値:</strong> 30%以上 = 緑、15-29% = 黄、15%未満 = 赤。
          エビデンスベース閾値は今後の改訂で再評価予定。
        </p>
      </div>
    </div>
  );
}
