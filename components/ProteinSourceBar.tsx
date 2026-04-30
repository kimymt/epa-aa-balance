import {
  CATEGORY_LABELS_JA,
  type ProteinCategory,
} from "@/lib/standards";

interface Props {
  proteinByCategory: Record<ProteinCategory, number>;
  totalProteinG: number;
}

const ORDER: ProteinCategory[] = [
  "fish",
  "meat",
  "egg_dairy",
  "plant_protein",
  "other",
];

const COLORS: Record<ProteinCategory, string> = {
  fish: "bg-emerald-500",
  meat: "bg-rose-400",
  egg_dairy: "bg-amber-300",
  plant_protein: "bg-teal-300",
  other: "bg-slate-300",
};

const TEXT_COLORS: Record<ProteinCategory, string> = {
  fish: "text-emerald-700 dark:text-emerald-400",
  meat: "text-rose-700 dark:text-rose-400",
  egg_dairy: "text-amber-700 dark:text-amber-400",
  plant_protein: "text-teal-700 dark:text-teal-400",
  other: "text-slate-700 dark:text-slate-400",
};

export function ProteinSourceBar({ proteinByCategory, totalProteinG }: Props) {
  if (totalProteinG <= 0) return null;

  const segments = ORDER.map((cat) => ({
    cat,
    g: proteinByCategory[cat],
    pct: (proteinByCategory[cat] / totalProteinG) * 100,
  })).filter((s) => s.g > 0);

  return (
    <div className="space-y-3">
      {/* スタックドバー */}
      <div className="flex h-5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        {segments.map((s) => (
          <div
            key={s.cat}
            className={`${COLORS[s.cat]} transition-all`}
            style={{ width: `${s.pct}%` }}
            title={`${CATEGORY_LABELS_JA[s.cat]}: ${s.g.toFixed(1)}g (${s.pct.toFixed(0)}%)`}
          />
        ))}
      </div>

      {/* 凡例とグラム数 */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:text-sm">
        {segments.map((s) => (
          <div key={s.cat} className="flex items-center gap-2">
            <span className={`inline-block h-3 w-3 rounded-sm ${COLORS[s.cat]}`} />
            <span className={`font-medium ${TEXT_COLORS[s.cat]}`}>
              {CATEGORY_LABELS_JA[s.cat]}
            </span>
            <span className="ml-auto tabular-nums text-slate-600 dark:text-slate-400">
              {s.g.toFixed(1)}g（{s.pct.toFixed(0)}%）
            </span>
          </div>
        ))}
      </div>

      <div className="text-xs text-slate-500 dark:text-slate-500">
        食事全体のタンパク質量: 約 {totalProteinG.toFixed(1)} g
      </div>
    </div>
  );
}
