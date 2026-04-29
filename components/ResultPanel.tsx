import { TrafficLight } from "./TrafficLight";
import { AminoAcidBars } from "./AminoAcidBar";
import { EAA_LABELS_JA } from "@/lib/standards";
import type { AnalysisResult } from "@/lib/eaa-calculator";

export function ResultPanel({ result }: { result: AnalysisResult }) {
  const redDeficient = result.deficient.filter((d) => d.pct < 80);
  const yellowDeficient = result.deficient.filter((d) => d.pct >= 80 && d.pct < 100);

  return (
    <div className="flex flex-col gap-8">
      {result.insufficientCoverage ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-6 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          多くの食材のデータが不足しているため、正確なスコアを算出できませんでした。
        </div>
      ) : (
        <TrafficLight light={result.light} />
      )}

      {!result.insufficientCoverage && (
        <>
          {redDeficient.length > 0 && (
            <div className="rounded-lg bg-rose-50 p-4 dark:bg-rose-950/30">
              {redDeficient.map((d) => (
                <p key={d.key} className="text-sm text-rose-900 dark:text-rose-200">
                  {EAA_LABELS_JA[d.key]}が不足しています（充足率{d.pct}%）。
                </p>
              ))}
            </div>
          )}
          {redDeficient.length === 0 && yellowDeficient.length > 0 && (
            <div className="rounded-lg bg-amber-50 p-4 dark:bg-amber-950/30">
              {yellowDeficient.map((d) => (
                <p key={d.key} className="text-sm text-amber-900 dark:text-amber-200">
                  {EAA_LABELS_JA[d.key]}がやや不足しています（充足率{d.pct}%）。
                </p>
              ))}
            </div>
          )}

          <div>
            <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
              EAA別の充足率
            </h3>
            <AminoAcidBars sufficiencyPct={result.sufficiencyPct} />
          </div>
        </>
      )}

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
          認識された食材
        </h3>
        <ul className="space-y-1 text-sm text-slate-600 dark:text-slate-400">
          {result.matched.map((m, i) => (
            <li key={i}>
              {m.isFallback ? "≈" : "✓"} {m.query} → {m.matched}（{m.grams}g、タンパク質
              {m.protein_g.toFixed(1)}g）
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

      <div className="text-xs text-slate-500 dark:text-slate-500 leading-relaxed">
        体重{result.bodyWeightKg}kgを基準として、必要量の目安を計算しています。基準値はWHO/FAO/UNU 2007（mg/kg体重/日）。
      </div>
    </div>
  );
}
