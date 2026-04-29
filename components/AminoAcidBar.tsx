import { EAA_KEYS, EAA_LABELS_JA, type EAAKey } from "@/lib/standards";

interface Props {
  sufficiencyPct: Record<EAAKey, number>;
}

function colorFor(pct: number): string {
  if (pct >= 100) return "bg-emerald-500";
  if (pct >= 80) return "bg-amber-400";
  return "bg-rose-500";
}

export function AminoAcidBars({ sufficiencyPct }: Props) {
  return (
    <div className="space-y-3">
      {EAA_KEYS.map((k) => {
        const pct = sufficiencyPct[k];
        const width = Math.min(pct, 150); // 視覚的な上限
        return (
          <div key={k} className="grid grid-cols-[160px_1fr_60px] items-center gap-3">
            <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {EAA_LABELS_JA[k]}
            </div>
            <div className="relative h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
              <div
                className={`h-full rounded-full ${colorFor(pct)} transition-all`}
                style={{ width: `${(width / 150) * 100}%` }}
              />
              <div
                className="absolute inset-y-0 border-r border-dashed border-slate-400/60"
                style={{ left: `${(100 / 150) * 100}%` }}
                aria-label="100%基準線"
              />
            </div>
            <div className="text-right text-sm tabular-nums text-slate-600 dark:text-slate-400">
              {pct}%
            </div>
          </div>
        );
      })}
    </div>
  );
}
