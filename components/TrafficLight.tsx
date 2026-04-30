import type { TrafficLight as Light } from "@/lib/scoring";

const LABELS: Record<Light, string> = {
  green: "魚タンパク中心",
  yellow: "やや魚少なめ",
  red: "魚不足",
};

const SUBTITLES: Record<Light, string> = {
  green: "魚タンパク質が50%以上を占めています",
  yellow: "魚タンパク質は25〜50%です",
  red: "魚タンパク質が25%未満です",
};

const COLORS: Record<Light, string> = {
  green: "bg-emerald-500 shadow-emerald-500/50",
  yellow: "bg-amber-400 shadow-amber-400/50",
  red: "bg-rose-500 shadow-rose-500/50",
};

interface Props {
  light: Light;
  fishProteinPct: number;
}

export function TrafficLight({ light, fishProteinPct }: Props) {
  const display = Math.round(fishProteinPct);
  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className={`relative h-28 w-28 sm:h-36 sm:w-36 rounded-full shadow-2xl ${COLORS[light]} transition-all flex items-center justify-center`}
        aria-label={LABELS[light]}
      >
        <div className="text-center">
          <div className="text-3xl sm:text-4xl font-bold text-white tabular-nums leading-none">
            {display}
            <span className="text-lg sm:text-xl">%</span>
          </div>
          <div className="mt-1 text-[10px] sm:text-xs text-white/90">
            魚タンパク
          </div>
        </div>
      </div>
      <div className="text-center">
        <div className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">
          {LABELS[light]}
        </div>
        <div className="mt-1 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
          {SUBTITLES[light]}
        </div>
      </div>
    </div>
  );
}
