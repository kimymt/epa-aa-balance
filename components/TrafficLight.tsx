// 信号機 UI: lipidPct (魚由来脂質割合) を 4 値（green/yellow/red/unknown）で表示。
// v0.3.0: 旧 fishProteinPct 表示を lipidPct に置換。"unknown" 値追加 (グレー)。

import type { TrafficLight as Light } from "@/lib/scoring";

const LABELS: Record<Light, string> = {
  green: "魚由来 多め",
  yellow: "魚由来 やや少なめ",
  red: "魚由来 少ない",
  unknown: "判定不能",
};

const SUBTITLES: Record<Light, string> = {
  green: "EPA+DHA が脂肪酸の30%以上を占めています",
  yellow: "EPA+DHA は脂肪酸の15〜29%です",
  red: "EPA+DHA が15%未満です",
  unknown: "データ不足のため判定できません",
};

const COLORS: Record<Light, string> = {
  green: "bg-emerald-500 shadow-emerald-500/50",
  yellow: "bg-amber-400 shadow-amber-400/50",
  red: "bg-rose-500 shadow-rose-500/50",
  unknown: "bg-slate-400 shadow-slate-400/50",
};

interface Props {
  light: Light;
  /** (EPA+DHA) / (EPA+DHA+AA) * 100. データ不足時 null */
  lipidPct: number | null;
}

export function TrafficLight({ light, lipidPct }: Props) {
  const display = lipidPct === null ? "—" : Math.round(lipidPct).toString();
  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className={`relative h-28 w-28 sm:h-36 sm:w-36 rounded-full shadow-2xl ${COLORS[light]} transition-all flex items-center justify-center`}
        aria-label={LABELS[light]}
      >
        <div className="text-center">
          <div className="text-3xl sm:text-4xl font-bold text-white tabular-nums leading-none">
            {display}
            {lipidPct !== null && <span className="text-lg sm:text-xl">%</span>}
          </div>
          <div className="mt-1 text-[10px] sm:text-xs text-white/90">
            魚由来脂質
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
