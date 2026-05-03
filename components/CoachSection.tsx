// AI コーチング section (v0.4.0-alpha)
//
// State machine:
//   initial → loading → result → (refined OR error)
//
// 配置: ResultPanel.tsx の Aggregate Stats カード直下、個別 MealResultCard grid の上。
// データ: aggregate (全 meal の lipidPct + EPA/DHA/AA mg) を渡す、Vision 食材リストも文脈に。

"use client";

import { useState } from "react";
import { RecipeCard } from "./RecipeCard";
import {
  CHIP_LABELS,
  type ChipKey,
  type CoachRequest,
  type CoachResponse,
  type Recipe,
} from "@/lib/coach";

type State =
  | { kind: "initial" }
  | { kind: "loading" }
  | { kind: "result"; recipes: Recipe[]; activeChip: ChipKey | null; retried: boolean }
  | { kind: "error"; message: string };

interface Props {
  aggregate: CoachRequest["aggregate"];
  recentFoods: CoachRequest["recentFoods"];
}

export function CoachSection({ aggregate, recentFoods }: Props) {
  const [state, setState] = useState<State>({ kind: "initial" });
  const [freeText, setFreeText] = useState("");

  async function fetchRecipes(refinement?: CoachRequest["refinement"]) {
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aggregate, recentFoods, refinement }),
      });
      const json = await res.json();
      if (!res.ok) {
        setState({ kind: "error", message: json.error ?? "提案を取得できませんでした。" });
        return;
      }
      const data = json as CoachResponse;
      setState({
        kind: "result",
        recipes: data.recipes,
        activeChip: refinement?.type === "chip" ? (refinement.value as ChipKey) : null,
        retried: data.retried,
      });
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "通信エラー",
      });
    }
  }

  function handleChipClick(chip: ChipKey) {
    void fetchRecipes({ type: "chip", value: chip });
  }

  function handleFreeTextSubmit() {
    const trimmed = freeText.trim();
    if (!trimmed) return;
    void fetchRecipes({ type: "freetext", value: trimmed });
  }

  return (
    <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 p-5 sm:p-6">
      {state.kind === "initial" && (
        <div>
          <div className="text-base sm:text-lg text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-2">
            <span className="text-2xl">🍳</span>
            <span className="font-medium">AI コーチに提案してもらう</span>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-4 leading-relaxed">
            EPA・DHA を増やすレシピを 3 件、AI が提案します。
          </p>
          <button
            onClick={() => void fetchRecipes()}
            className="w-full bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 py-3 sm:py-4 px-6 rounded-lg font-medium hover:bg-slate-800 dark:hover:bg-slate-200 active:bg-slate-950 transition"
          >
            AI に提案してもらう
          </button>
          <p className="mt-3 text-xs text-slate-400 text-center">
            ※ 5〜15 秒ほどかかります
          </p>
        </div>
      )}

      {state.kind === "loading" && (
        <div>
          <div className="text-base sm:text-lg text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-2">
            <span className="text-2xl">🍳</span>
            <span className="font-medium">AI が提案を考えています...</span>
          </div>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 animate-pulse">
                <div className="h-5 w-3/4 bg-slate-200 dark:bg-slate-700 rounded mb-2" />
                <div className="h-4 w-full bg-slate-200 dark:bg-slate-700 rounded" />
              </div>
            ))}
          </div>
        </div>
      )}

      {state.kind === "result" && (
        <div>
          <div className="text-base sm:text-lg text-slate-700 dark:text-slate-200 mb-1 flex items-center gap-2">
            <span className="text-2xl">🍳</span>
            <span className="font-medium">AI からの提案</span>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            {state.activeChip && (
              <span className="mr-2">✓ 「{CHIP_LABELS[state.activeChip]}」で再提案</span>
            )}
            {state.retried && (
              <span className="text-amber-600 dark:text-amber-400">
                (一部レシピが省略されました)
              </span>
            )}
          </div>

          {state.recipes.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 italic">
              レシピが取得できませんでした。
            </p>
          ) : (
            <div className="space-y-3 mb-6">
              {state.recipes.map((r, i) => (
                <RecipeCard key={i} recipe={r} />
              ))}
            </div>
          )}

          <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
            <div className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
              こだわりはありますか？
            </div>
            <div className="flex flex-wrap gap-2 mb-4">
              {(Object.keys(CHIP_LABELS) as ChipKey[]).map((chip) => {
                const active = state.activeChip === chip;
                return (
                  <button
                    key={chip}
                    onClick={() => handleChipClick(chip)}
                    className={`px-4 py-2 border rounded-full text-sm transition min-h-[44px] ${
                      active
                        ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border-slate-900 dark:border-slate-100"
                        : "border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                    }`}
                  >
                    {CHIP_LABELS[chip]}
                  </button>
                );
              })}
            </div>
            <div className="text-sm text-slate-600 dark:text-slate-400 mb-2">
              それ以外で：
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={freeText}
                onChange={(e) => setFreeText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleFreeTextSubmit()}
                placeholder="例：青魚を使ったレシピで..."
                maxLength={200}
                className="flex-1 px-4 py-3 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 rounded-lg text-base text-slate-900 dark:text-slate-100 focus:outline-none focus:border-slate-900 dark:focus:border-slate-100"
              />
              <button
                onClick={handleFreeTextSubmit}
                disabled={!freeText.trim()}
                className="bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 px-5 py-3 rounded-lg font-medium hover:bg-slate-800 dark:hover:bg-slate-200 disabled:opacity-50 transition"
              >
                送信
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-400">最大 200 文字</p>
          </div>
        </div>
      )}

      {state.kind === "error" && (
        <div>
          <div className="text-base sm:text-lg text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-2">
            <span className="text-2xl">⚠️</span>
            <span className="font-medium">提案を取得できませんでした</span>
          </div>
          <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg p-4 mb-4">
            <p className="text-sm text-amber-900 dark:text-amber-200 leading-relaxed">
              {state.message}
            </p>
          </div>
          <button
            onClick={() => setState({ kind: "initial" })}
            className="w-full bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-600 py-3 px-6 rounded-lg font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition"
          >
            戻る
          </button>
        </div>
      )}
    </section>
  );
}
