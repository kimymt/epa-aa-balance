import type { TrafficLight as Light } from "@/lib/scoring";

const LABELS: Record<Light, string> = {
  green: "EAAバランス良好",
  yellow: "やや不足",
  red: "EAA不足",
};

const SUBTITLES: Record<Light, string> = {
  green: "全EAAが基準パターンを満たしています",
  yellow: "一部のEAAが基準の80-99%です",
  red: "1種以上のEAAが基準の80%未満です",
};

const COLORS: Record<Light, string> = {
  green: "bg-emerald-500 shadow-emerald-500/50",
  yellow: "bg-amber-400 shadow-amber-400/50",
  red: "bg-rose-500 shadow-rose-500/50",
};

interface Props {
  light: Light;
  /** 制限アミノ酸スコア（最低スコア）。これがアミノ酸スコアの代表値 */
  limitingScore: number;
}

export function TrafficLight({ light, limitingScore }: Props) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className={`relative h-24 w-24 sm:h-32 sm:w-32 rounded-full shadow-2xl ${COLORS[light]} transition-all flex items-center justify-center`}
        aria-label={LABELS[light]}
      >
        <span className="text-2xl sm:text-3xl font-bold text-white tabular-nums">
          {limitingScore}
        </span>
      </div>
      <div className="text-center">
        <div className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">
          {LABELS[light]}
        </div>
        <div className="mt-1 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
          {SUBTITLES[light]}
        </div>
        <div className="mt-2 text-xs text-slate-500 dark:text-slate-500">
          アミノ酸スコア: {limitingScore}
        </div>
      </div>
    </div>
  );
}
