"use client";

interface Props {
  bodyWeightKg: number;
  onChange: (kg: number) => void;
}

export function BodyWeightInput({ bodyWeightKg, onChange }: Props) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <label className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            あなたの体重
          </span>
          <span className="mt-0.5 text-xs text-slate-500 dark:text-slate-500">
            EAAの必要量の目安を体重に応じて計算します
          </span>
        </div>
        <div className="flex items-center gap-1">
          <input
            type="number"
            inputMode="numeric"
            min={20}
            max={250}
            step={1}
            value={bodyWeightKg}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v) && v >= 20 && v <= 250) onChange(v);
            }}
            className="w-20 rounded-lg border border-slate-300 bg-white px-3 py-2 text-right text-base font-semibold tabular-nums text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            aria-label="体重 (kg)"
          />
          <span className="text-sm text-slate-600 dark:text-slate-400">kg</span>
        </div>
      </label>
    </div>
  );
}
