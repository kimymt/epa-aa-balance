import { TrafficLight } from "./TrafficLight";
import { ProteinSourceBar } from "./ProteinSourceBar";
import { CATEGORY_LABELS_JA } from "@/lib/standards";
import type { AnalysisResult } from "@/lib/analyzer";

export function ResultPanel({ result }: { result: AnalysisResult }) {
  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      {result.insufficientData ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-6 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          食材データまたはタンパク質量が不足しているため、正確な判定ができませんでした。
        </div>
      ) : (
        <TrafficLight
          light={result.light}
          fishProteinPct={result.fishProteinPct}
        />
      )}

      {!result.insufficientData && (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
            タンパク質の内訳
          </h3>
          <ProteinSourceBar
            proteinByCategory={result.proteinByCategory}
            totalProteinG={result.totalProteinG}
          />
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-500 leading-relaxed">
            EPA/AA比のプロキシとして「魚タンパク質 / 総タンパク質」の割合を判定しています。
            EPAは主に魚由来、AA（アラキドン酸）は主に肉・卵・乳由来。
            魚タンパク質の割合が高いほど、EPA/AAバランスが良好と推定されます。
          </p>
        </div>
      )}

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
          認識された食材
        </h3>
        <ul className="space-y-1 text-sm text-slate-600 dark:text-slate-400">
          {result.matched.map((m, i) => (
            <li key={i}>
              {m.isFallback ? "≈" : "✓"} {m.query} → {m.matched}
              <span className="ml-1 text-xs text-slate-400 dark:text-slate-600">
                [{CATEGORY_LABELS_JA[m.category]}]
              </span>
              （{m.grams}g、タンパク質{m.protein_g.toFixed(1)}g）
              {m.isFallback && (
                <span className="ml-1 text-amber-600 dark:text-amber-400">
                  （カテゴリ平均値で推定）
                </span>
              )}
            </li>
          ))}
          {result.unmatched.map((u, i) => (
            <li key={`u${i}`} className="text-slate-400 dark:text-slate-600">
              ⚠ {u.query}（{u.grams}g）：データなし
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
