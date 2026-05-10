// 食事中の脂肪酸構成（EPA / DHA / AA）をスタックドバーで可視化 (v0.3.0+)
//
// 旧 ProteinSourceBar (タンパク質カテゴリ別) を脂肪酸 3 値の表示に置き換え。
// 計算と表示のメンタルモデルが一致：UI 上の「魚由来 X%」は EPA+DHA の合計、
// バーの幅もそれに対応。

interface Props {
  epaMg: number;
  dhaMg: number;
  aaMg: number;
}

const SEGMENTS = [
  { key: "epa", label: "EPA", color: "bg-emerald-500", textColor: "text-emerald-700 dark:text-emerald-400" },
  { key: "dha", label: "DHA", color: "bg-teal-400", textColor: "text-teal-700 dark:text-teal-400" },
  { key: "aa", label: "AA",  color: "bg-rose-400", textColor: "text-rose-700 dark:text-rose-400" },
] as const;

export function LipidSourceBar({ epaMg, dhaMg, aaMg }: Props) {
  const total = epaMg + dhaMg + aaMg;
  if (total <= 0) {
    return (
      <div className="text-xs text-slate-500 dark:text-slate-400 italic">
        該当する脂肪酸データがありません
      </div>
    );
  }

  const values: Record<string, number> = { epa: epaMg, dha: dhaMg, aa: aaMg };
  const segments = SEGMENTS.map((s) => ({
    ...s,
    mg: values[s.key],
    pct: (values[s.key] / total) * 100,
  })).filter((s) => s.mg > 0);

  return (
    <div className="space-y-3">
      {/* スタックドバー */}
      <div className="flex h-5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        {segments.map((s) => (
          <div
            key={s.key}
            className={`${s.color} transition-all`}
            style={{ width: `${s.pct}%` }}
            title={`${s.label}: ${s.mg.toFixed(0)}mg (${s.pct.toFixed(0)}%)`}
          />
        ))}
      </div>

      {/* 凡例と mg 量
          F-024 (v0.8.7): grid-cols-3 → flex-col stack。
          per-meal カードは max-w-3xl + lg:grid-cols-3 の中で ~240px 幅まで
          縮むため、3-column 凡例は 1 セル ~70px しか取れず
          「EPA 85mgDHA 142mg...」と label が密着して読めなくなっていた。
          縦積みで常に full-width 行にすることで container 幅に依存しない
          可読性を確保する (情報量は同じ、占有高さが +24px 程度増加)。 */}
      <div className="flex flex-col gap-1.5 text-xs sm:text-sm">
        {segments.map((s) => (
          <div key={s.key} className="flex items-center gap-2">
            <span className={`inline-block h-3 w-3 rounded-sm ${s.color}`} />
            <span className={`font-medium ${s.textColor}`}>{s.label}</span>
            <span className="ml-auto tabular-nums text-slate-600 dark:text-slate-400">
              {s.mg.toFixed(0)}mg
            </span>
          </div>
        ))}
      </div>

      <div className="text-xs text-slate-500 dark:text-slate-500">
        EPA+DHA+AA 合計: {total.toFixed(0)} mg
      </div>
    </div>
  );
}
