// 個別レシピ表示 (v0.4.0-alpha)

import type { Recipe } from "@/lib/coach";

const MEAL_LABEL: Record<Recipe["mealType"], string> = {
  breakfast: "朝食",
  lunch: "昼食",
  dinner: "夕食",
};

export function RecipeCard({ recipe }: { recipe: Recipe }) {
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
    </div>
  );
}
