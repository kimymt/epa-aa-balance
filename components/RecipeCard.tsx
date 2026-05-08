// 個別レシピ表示 (v0.4.0-alpha → v0.7.0 expandable)
//
// v0.7.0: ingredients / steps / equipment / tips / safetyNote の full-detail
// 表示に対応。要約 (description) は折りたたみ時に表示、affordance ボタン
// 「材料 N つ・手順 M ステップ ▾」で展開できる (タップで toggle)。
//
// アクセシビリティ: button[aria-expanded] を持たせる。展開エリアは
// aria-hidden の制御は CSS の display:none で兼ねる (簡潔に)。
"use client";

import { useState } from "react";
import type { Recipe } from "@/lib/coach";

const MEAL_LABEL: Record<Recipe["mealType"], string> = {
  breakfast: "朝食",
  lunch: "昼食",
  dinner: "夕食",
};

export function RecipeCard({ recipe }: { recipe: Recipe }) {
  const [expanded, setExpanded] = useState(false);

  const ingredientCount = recipe.ingredients?.length ?? 0;
  const stepCount = recipe.steps?.length ?? 0;
  const hasEquipment = (recipe.equipment?.length ?? 0) > 0;
  const hasTips = !!recipe.tips && recipe.tips.trim().length > 0;
  const hasSafetyNote =
    !!recipe.safetyNote && recipe.safetyNote.trim().length > 0;

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 p-4 transition-colors hover:border-slate-300 dark:hover:border-slate-600">
      <div className="flex items-start justify-between mb-1 gap-2">
        <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-base sm:text-base-up leading-snug">
          {recipe.name}
        </h3>
        <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0">
          {MEAL_LABEL[recipe.mealType]} · {recipe.cookTime}
        </span>
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
        {recipe.description}
      </p>

      {/* v0.7.0: 展開 affordance — 材料/手順の件数を予告して中身の量感を伝える */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="mt-3 w-full text-right text-xs text-sky-700 dark:text-sky-300 hover:text-sky-900 dark:hover:text-sky-100 font-medium transition-colors"
      >
        {expanded
          ? "折りたたむ ▴"
          : `材料 ${ingredientCount} つ・手順 ${stepCount} ステップ ▾`}
      </button>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700 space-y-4 text-sm text-slate-700 dark:text-slate-300">
          <div>
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
              材料 ({recipe.servings} 人前)
            </div>
            <ul className="space-y-0.5">
              {recipe.ingredients.map((ing, i) => (
                <li key={i} className="flex justify-between gap-2">
                  <span>{ing.name}</span>
                  <span className="text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {ing.amount}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
              手順
            </div>
            <ol className="space-y-1.5 list-decimal list-inside">
              {recipe.steps.map((step, i) => (
                <li key={i} className="leading-relaxed">
                  {step}
                </li>
              ))}
            </ol>
          </div>

          {hasEquipment && (
            <div>
              <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                道具
              </div>
              <div className="text-slate-600 dark:text-slate-400">
                {recipe.equipment.join(" / ")}
              </div>
            </div>
          )}

          {hasTips && (
            <div className="rounded bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 p-2.5">
              <div className="text-xs font-semibold text-amber-800 dark:text-amber-200 mb-0.5">
                💡 コツ
              </div>
              <div className="text-amber-900 dark:text-amber-100 leading-relaxed">
                {recipe.tips}
              </div>
            </div>
          )}

          {hasSafetyNote && (
            <div className="rounded bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/40 p-2.5">
              <div className="text-xs font-semibold text-rose-800 dark:text-rose-200 mb-0.5">
                ⚠ 安全注意
              </div>
              <div className="text-rose-900 dark:text-rose-100 leading-relaxed">
                {recipe.safetyNote}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
