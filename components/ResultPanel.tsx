import { TrafficLight } from "./TrafficLight";
import { ProteinSourceBar } from "./ProteinSourceBar";
import { CATEGORY_LABELS_JA } from "@/lib/standards";
import { MEAL_TYPES } from "@/lib/session";
import type { AnalysisResult } from "@/lib/analyzer";
import type { AnalysisSessionResult } from "@/lib/session";

// Component for a single meal result (reusable)
function MealResultCard({
  result,
  mealType,
  index,
  total,
}: {
  result: AnalysisResult;
  mealType: string;
  index: number;
  total: number;
}) {
  const mealLabel =
    MEAL_TYPES.find((m) => m.value === mealType)?.label || "食事";

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

      {result.insufficientData && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          ⚠ 一部の食材データが不足しています。下記は判明分のみの参考値です。
        </div>
      )}
      <>
          <div>
            <div className="text-3xl font-bold text-slate-900 dark:text-slate-100">
              {Math.round(result.fishProteinPct)}%
              <span className="ml-2 text-lg text-slate-600 dark:text-slate-400">
                魚タンパク質
              </span>
            </div>
            <div
              className={`mt-2 inline-block px-3 py-1 rounded-full text-sm font-medium text-white ${
                result.light === "green"
                  ? "bg-green-500"
                  : result.light === "yellow"
                    ? "bg-yellow-500"
                    : "bg-red-500"
              }`}
            >
              {result.light === "green"
                ? "良好"
                : result.light === "yellow"
                  ? "中程度"
                  : "改善推奨"}
            </div>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
              タンパク質の内訳
            </h4>
            <div className="mt-2">
              <ProteinSourceBar
                proteinByCategory={result.proteinByCategory}
                totalProteinG={result.totalProteinG}
              />
            </div>
          </div>

          <div className="text-xs text-slate-500 dark:text-slate-500 space-y-2">
            <p>
              <strong>魚タンパク:</strong> {result.proteinByCategory.fish.toFixed(1)}g
            </p>
            <p>
              <strong>肉タンパク:</strong>{" "}
              {result.proteinByCategory.meat.toFixed(1)}g
            </p>
            <p>
              <strong>卵・乳タンパク:</strong>{" "}
              {result.proteinByCategory.egg_dairy.toFixed(1)}g
            </p>
            <p>
              <strong>植物タンパク:</strong>{" "}
              {result.proteinByCategory.plant_protein.toFixed(1)}g
            </p>
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
            {aggregate.fishPct}%
          </div>
          <div className="mt-2 text-base text-emerald-800 dark:text-emerald-200">
            魚タンパク質の割合
          </div>
          <div
            className={`mt-4 inline-block px-4 py-2 rounded-full text-lg font-semibold text-white ${
              aggregate.signal === "green"
                ? "bg-emerald-600"
                : aggregate.signal === "yellow"
                  ? "bg-yellow-500"
                  : "bg-rose-500"
            }`}
          >
            {aggregate.signal === "green"
              ? "良好 ✓"
              : aggregate.signal === "yellow"
                ? "中程度"
                : "改善推奨"}
          </div>
          <p className="mt-4 text-sm text-emerald-700 dark:text-emerald-300">
            {aggregate.totalMeals} 食事中 {aggregate.successfulMeals}{" "}
            食事を正常に解析しました
          </p>
        </div>
      </div>

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
          <div className="mb-4 text-sm font-semibold text-slate-700 dark:text-slate-300">
            個別の食事結果
          </div>

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
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* EPA/AA Explanation */}
      <div className="text-xs text-slate-500 dark:text-slate-400 space-y-2 leading-relaxed">
        <p>
          <strong>判定方法:</strong>{" "}
          魚タンパク質（EPAの主要源）と総タンパク質の割合で、EPA/AAバランスの代理指標としています。
        </p>
        <p>
          <strong>カテゴリ:</strong> 魚 / 肉 / 卵・乳 / 植物タンパク質に分類。
          魚タンパク質の割合が高いほど、EPA/AAバランスが良好と推定されます。
        </p>
      </div>
    </div>
  );
}
