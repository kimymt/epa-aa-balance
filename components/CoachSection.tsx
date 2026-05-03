// AI コーチング section (v0.4.0-alpha)
//
// State machine:
//   initial → loading → result → (refined OR error)
//
// 配置: ResultPanel.tsx の Aggregate Stats カード直下、個別 MealResultCard grid の上。
// データ: aggregate (全 meal の lipidPct + EPA/DHA/AA mg) を渡す、Vision 食材リストも文脈に。

"use client";

import { useMemo, useState } from "react";
import { RecipeCard } from "./RecipeCard";
import {
  CHIP_LABELS,
  type ChipKey,
  type CoachRequest,
  type CoachResponse,
  type Recipe,
} from "@/lib/coach";
// v0.4.10: 目標食習慣を自動算出するため diet-patterns helpers を利用
import { dailyAverageMg, findPatternPosition } from "@/lib/diet-patterns";

type State =
  | { kind: "initial" }
  | { kind: "loading" }
  | { kind: "result"; recipes: Recipe[]; activeChip: ChipKey | null; retried: boolean }
  // v0.4.3: 429 (自前 rate limit) 専用 state。AI 提案の上限に達したユーザーは
  // まだ「魚を食べる意識」が育っていないと解釈し、洗脳動画で啓蒙する。
  | { kind: "rate_limited" }
  // v0.4.3: 503 (Gemini API quota) 専用 state。Google 側の無料枠が尽きた状態で、
  // 「自分のせい」ではなくユーザー側からは打つ手なし（明日待つ）。
  | { kind: "quota_exceeded" }
  | { kind: "error"; message: string };

interface Props {
  aggregate: CoachRequest["aggregate"];
  /** v0.4.10: 1 日換算 (3 食=1 日) のため。目標食習慣の自動算出に使う。 */
  mealsWithData: number;
  recentFoods: CoachRequest["recentFoods"];
}

export function CoachSection({ aggregate, mealsWithData, recentFoods }: Props) {
  const [state, setState] = useState<State>({ kind: "initial" });
  const [freeText, setFreeText] = useState("");

  // v0.4.10: 目標食習慣を自動算出。次のパターン (= 現状を超えた直後のパターン) を狙う。
  // 全パターン超え or データ無しなら target = undefined (prompt に目標セクション出さない)。
  const target = useMemo<CoachRequest["target"]>(() => {
    if (mealsWithData === 0) return undefined;
    const totalMg = aggregate.epaMg + aggregate.dhaMg;
    const dailyAvg = dailyAverageMg(totalMg, mealsWithData);
    const position = findPatternPosition(dailyAvg);
    if (!position.next || position.gapToNextMg === null) return undefined;
    return {
      patternName: position.next.name,
      gapMg: position.gapToNextMg,
    };
  }, [aggregate.epaMg, aggregate.dhaMg, mealsWithData]);

  async function fetchRecipes(refinement?: CoachRequest["refinement"]) {
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aggregate, recentFoods, refinement, target }),
      });
      const json = await res.json();
      if (!res.ok) {
        // v0.4.3: エラーコード別に専用 UI を出す。
        // - RATE_LIMITED (429): 自前レート制限 → 魚啓蒙動画
        // - QUOTA_EXCEEDED (503): Gemini 側 quota → 「明日また」
        if (res.status === 429 || json.code === "RATE_LIMITED") {
          setState({ kind: "rate_limited" });
          return;
        }
        if (json.code === "QUOTA_EXCEEDED" || res.status === 503) {
          setState({ kind: "quota_exceeded" });
          return;
        }
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
          {/* v0.4.10: 自動算出された目標食習慣を inline 表示。
              ユーザーが「何を目指すレシピが返ってくるのか」を事前に把握できる。 */}
          {target && (
            <div className="mb-4 rounded-lg bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:bg-sky-950/30 dark:text-sky-100">
              <span className="font-semibold">目標:</span>{" "}
              <strong>{target.patternName}</strong>{" "}
              <span className="text-sky-700 dark:text-sky-300">
                (あと +{Math.round(target.gapMg).toLocaleString("en-US")} mg/日)
              </span>
              <div className="mt-1 text-xs text-sky-700 dark:text-sky-300">
                このギャップを埋めるレシピを優先して提案します。
              </div>
            </div>
          )}
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

      {state.kind === "rate_limited" && (
        <div>
          <div className="text-base sm:text-lg text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-2">
            <span className="text-2xl">🐟</span>
            <span className="font-medium">魚のこと、好きですか？</span>
          </div>
          <p className="text-sm text-slate-700 dark:text-slate-300 mb-4 leading-relaxed">
            魚のことが好きではないですか？魚を好きになれるよう、この
            <s className="text-slate-400 dark:text-slate-500">動機づけ</s>
            <span className="font-semibold">洗脳</span>動画をご覧ください。
          </p>
          <div className="aspect-video w-full overflow-hidden rounded-lg bg-black mb-4">
            <iframe
              className="w-full h-full"
              src="https://www.youtube-nocookie.com/embed/rPPJey1perw?si=Re8uhR7G_MZ8L3rL"
              title="YouTube video player"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          </div>
          <button
            onClick={() => setState({ kind: "initial" })}
            className="w-full bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-600 py-3 px-6 rounded-lg font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition"
          >
            戻る
          </button>
          <p className="mt-3 text-xs text-slate-400 text-center">
            ※ AI 提案は 1 時間あたり 10 回までです。少し時間を置いてから再試行してください。
          </p>
        </div>
      )}

      {state.kind === "quota_exceeded" && (
        <div>
          <div className="text-base sm:text-lg text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-2">
            <span className="text-2xl">⏳</span>
            <span className="font-medium">本日分の AI 提案枠が尽きました</span>
          </div>
          <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg p-4 mb-4">
            <p className="text-sm text-amber-900 dark:text-amber-200 leading-relaxed mb-2">
              Google Gemini API の本日の無料枠に到達しました。アプリ側の問題ではないため、明日まで待つか、しばらく時間を置いてから再度お試しください。
            </p>
            <p className="text-xs text-amber-800/80 dark:text-amber-300/80">
              ※ 無料枠は日次でリセットされます（JST 午後 5 時前後）。
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
