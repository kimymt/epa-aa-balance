// AI コーチング section (v0.4.0-alpha)
//
// State machine:
//   initial → loading → result → (refined OR error)
//
// 配置: ResultPanel.tsx の Aggregate Stats カード直下、個別 MealResultCard grid の上。
// データ: aggregate (全 meal の lipidPct + EPA/DHA/AA mg) を渡す、Vision 食材リストも文脈に。

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RecipeCard } from "./RecipeCard";
import {
  CHIP_LABELS,
  type ChipKey,
  type CoachRequest,
  type Recipe,
} from "@/lib/coach";
// v0.4.10: 目標食習慣を自動算出するため diet-patterns helpers を利用
import { dailyAverageMg, findPatternPosition } from "@/lib/diet-patterns";

type State =
  | { kind: "initial" }
  // v0.8.0: streaming で recipe が 1 件確定するたびに partialRecipes に追加。
  // partial.length が 1 なら「1 件届いた + 残り skeleton」を表示できる。
  | { kind: "loading"; partialRecipes: Recipe[]; activeChip: ChipKey | null }
  | { kind: "result"; recipes: Recipe[]; activeChip: ChipKey | null; retried: boolean }
  // v0.4.3: 429 (自前 rate limit) 専用 state。AI 提案の上限に達したユーザーは
  // まだ「魚を食べる意識」が育っていないと解釈し、洗脳動画で啓蒙する。
  | { kind: "rate_limited" }
  // v0.4.3: 503 (Gemini API quota) 専用 state。Google 側の無料枠が尽きた状態で、
  // 「自分のせい」ではなくユーザー側からは打つ手なし（明日待つ）。
  | { kind: "quota_exceeded" }
  | { kind: "error"; message: string };

// v0.8.0: 進捗メッセージのローテーション (~5 秒ごとに次へ)。
// 偽進捗ではあるが、固定スピナーよりは「進んでる感」が出る。
// streaming で recipe が届けば実カードに置換されるので、メッセージは「あと N 件」
// 系ではなく漠然とした「考え中...」系で揃える。
const LOADING_STAGES = [
  "材料を選定中...",
  "手順を組み立て中...",
  "コツと安全注意を確認中...",
  "もう少しで完成します...",
];

/** v0.8.0: ストリーム NDJSON のイベント型。lib/coach.ts の RecipeStreamEvent と
 *  対応するが、UI 側では error event も含める (server がストリーム内エラーを
 *  embed するため)。 */
type StreamEvent =
  | { type: "recipe"; index: number; recipe: Recipe }
  | { type: "complete"; retried: boolean }
  | { type: "error"; code?: string; message: string };

/** v0.8.0: skeleton カード。v0.7.0 RecipeCard の折りたたみ状態とほぼ同じ寸法で
 *  shimmer (animate-pulse) する。recipes が届いていないスロット用。
 *
 *  F-036 (v0.8.11): 末尾の placeholder を「expand button っぽい shape」
 *  (border + 角丸 + paddings) に変更。以前は flat bar だったので、本物の
 *  RecipeCard がポップインした瞬間に「あ、これ tappable だったのか」と
 *  気付くまで一瞬遅れていた。affordance を skeleton 段階で予告する。 */
function SkeletonRecipeCard() {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 p-4 animate-pulse">
      <div className="flex items-start justify-between mb-2 gap-2">
        <div className="h-5 w-2/3 bg-slate-200 dark:bg-slate-700 rounded" />
        <div className="h-3 w-20 bg-slate-200 dark:bg-slate-700 rounded shrink-0" />
      </div>
      <div className="h-3 w-full bg-slate-200 dark:bg-slate-700 rounded mb-1.5" />
      <div className="h-3 w-4/5 bg-slate-200 dark:bg-slate-700 rounded mb-3" />
      <div className="ml-auto h-6 w-40 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/80" />
    </div>
  );
}

interface Props {
  aggregate: CoachRequest["aggregate"];
  /** v0.4.10: 1 日換算 (3 食=1 日) のため。目標食習慣の自動算出に使う。 */
  mealsWithData: number;
  recentFoods: CoachRequest["recentFoods"];
}

export function CoachSection({ aggregate, mealsWithData, recentFoods }: Props) {
  const [state, setState] = useState<State>({ kind: "initial" });
  const [freeText, setFreeText] = useState("");
  // v0.8.0: 進捗メッセージのインデックス。loading 中だけ ~5 秒ごとに進む。
  const [loadingStage, setLoadingStage] = useState(0);
  // F-040 (v0.8.11): 進行中の fetch を持っておき、新規 fetch 開始時に abort。
  // chip A 連打 / chip → freetext などで複数の stream が重なると、後続の
  // setState 内で「現在の loading state」をチェックしているはずが、A の
  // stream events が B の partialRecipes を mutate して recipe が混ざる
  // race を防ぐ。component unmount 時にも abort して memory leak を防ぐ。
  const activeAbortRef = useRef<AbortController | null>(null);

  // loading に入ったら 0 にリセット、3 秒ごとに次のメッセージへ (最後で停止)。
  // F-035 (v0.8.11): 旧 5 秒間隔だと「6〜10 秒」の promise 範囲内で stage 1
  // までしか見えず、4 段階の rotation が事実上 dead code になっていた。
  // 3 秒間隔にして 12 秒で全 4 stage を消化、promise 上限の「3 件揃うまで
  // 15〜25 秒」の範囲内に収まる。実 perf がもっと速い場合 (sub-second) は
  // どちらにせよ stage 0 しか見えないが、それは harm では無い。
  useEffect(() => {
    if (state.kind !== "loading") {
      setLoadingStage(0);
      return;
    }
    setLoadingStage(0);
    const id = setInterval(() => {
      setLoadingStage((s) => Math.min(s + 1, LOADING_STAGES.length - 1));
    }, 3000);
    return () => clearInterval(id);
  }, [state.kind]);

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
    const activeChip =
      refinement?.type === "chip" ? (refinement.value as ChipKey) : null;

    // F-040 (v0.8.11): 進行中の fetch があれば abort し、新しい AbortController
    // を作って ref に保持。abort された fetch は AbortError を throw し、catch
    // 経由でこの関数を抜ける (= setState には到達しない)。abort は
    // ignoreAbort フラグで識別する。
    activeAbortRef.current?.abort();
    const ctrl = new AbortController();
    activeAbortRef.current = ctrl;

    setState({ kind: "loading", partialRecipes: [], activeChip });

    // F-038 (v0.8.11): catch ブロックからも recipe 救済できるように
    // try の外側で宣言。stream の各 event handler はこの配列を mutate する。
    const collected: Recipe[] = [];

    try {
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aggregate, recentFoods, refinement, target }),
        signal: ctrl.signal,
      });

      // v0.8.0: ストリーム開始前のエラー (rate limit / validation) は従来通り JSON。
      if (!res.ok) {
        let json: { code?: string; error?: string } = {};
        try {
          json = await res.json();
        } catch {}
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

      // v0.8.0: NDJSON ストリーミング — 1 行 = 1 イベント。
      if (!res.body) {
        setState({ kind: "error", message: "通信エラー: ストリームが取得できません。" });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let retried = false;
      // ストリーム内エラー event の最終遷移先。closure 内代入を TS が
      // narrowing するのを避けるため、object 経由で参照する (ref-style wrapper)。
      type StreamEnd =
        | { kind: "ok" }
        | { kind: "quota_exceeded" }
        | { kind: "error"; message: string };
      const endRef: { current: StreamEnd } = { current: { kind: "ok" } };

      const handleEvent = (event: StreamEvent) => {
        // F-040: abort 済 fetch の event は state を触らない。
        // (新 fetch 側で別の loading state が立ち上がっているため、ここで
        //  partialRecipes を mutate すると recipe が混ざる)
        if (ctrl.signal.aborted) return;
        if (event.type === "recipe") {
          collected[event.index] = event.recipe;
          // partial を sparse array → dense array に変換して setState
          const dense = collected.filter((r): r is Recipe => Boolean(r));
          setState((s) => (s.kind === "loading" ? { ...s, partialRecipes: dense } : s));
        } else if (event.type === "complete") {
          retried = event.retried;
        } else if (event.type === "error") {
          if (event.code === "QUOTA_EXCEEDED") {
            endRef.current = { kind: "quota_exceeded" };
          } else {
            endRef.current = { kind: "error", message: event.message };
          }
        }
      };

      const processLine = (raw: string) => {
        const line = raw.trim();
        if (!line) return;
        try {
          const ev = JSON.parse(line) as StreamEvent;
          handleEvent(ev);
        } catch {
          // ストリーム途中の不完全行は捨てる (buffer 残しで次 chunk と結合される)
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const ln of lines) processLine(ln);
      }
      // 最終 buffer も flush (改行で締めてないケース対策)
      if (buffer.trim()) processLine(buffer);

      // F-040: stream 完了後に abort 検知したら setState せず終了。
      // (新 fetch がすでに次の loading state を立てている)
      if (ctrl.signal.aborted) return;

      // ストリーム完結後の最終遷移
      // F-038 (v0.8.11): error/quota が来ても部分到着 recipe を捨てない。
      // 旧: 1〜2 件届いた途中でエラー → 全 recipe を破棄して error 画面へ。
      //     ユーザーは見ていた recipe を失い、quota も 1 つ無駄になる。
      // 新: partial が >0 件あれば result に降格遷移し、retried=true を
      //     立てて「(N 件のうち K 件のみ取得)」表記を出す (header の
      //     state.retried 分岐を再利用)。0 件のときだけ従来通り error 画面。
      const finalEnd = endRef.current;
      const recoveredRecipes = collected.filter((r): r is Recipe => Boolean(r));

      if (finalEnd.kind === "quota_exceeded") {
        if (recoveredRecipes.length > 0) {
          setState({
            kind: "result",
            recipes: recoveredRecipes,
            activeChip,
            retried: true,
          });
          return;
        }
        setState({ kind: "quota_exceeded" });
        return;
      }
      if (finalEnd.kind === "error") {
        if (recoveredRecipes.length > 0) {
          setState({
            kind: "result",
            recipes: recoveredRecipes,
            activeChip,
            retried: true,
          });
          return;
        }
        setState({ kind: "error", message: finalEnd.message });
        return;
      }
      if (recoveredRecipes.length === 0) {
        setState({
          kind: "error",
          message: "レシピを生成できませんでした。再度お試しください。",
        });
        return;
      }
      setState({ kind: "result", recipes: recoveredRecipes, activeChip, retried });
    } catch (err) {
      // F-040: AbortError は「次の fetch に置き換えられた」サインなので
      // setState は完全に抑制 (新 fetch 側がすでに loading state を立てている)。
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }
      if (ctrl.signal.aborted) {
        return;
      }
      // F-038: catch 経由 (ネットワーク断、parse 失敗等) でも recipe 救済。
      // collected は closure 内で生きている。
      const recoveredRecipes = collected.filter((r): r is Recipe => Boolean(r));
      if (recoveredRecipes.length > 0) {
        setState({
          kind: "result",
          recipes: recoveredRecipes,
          activeChip,
          retried: true,
        });
        return;
      }
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "通信エラー",
      });
    } finally {
      // この controller がまだ ref に座っているなら掃除。
      // (新しい fetch が始まっていれば既に上書きされている)
      if (activeAbortRef.current === ctrl) {
        activeAbortRef.current = null;
      }
    }
  }

  // F-040: unmount で進行中の fetch を abort してメモリリーク防止。
  useEffect(() => {
    return () => {
      activeAbortRef.current?.abort();
      activeAbortRef.current = null;
    };
  }, []);

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
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-2 leading-relaxed">
            EPA・DHA を増やすレシピを 3 件、AI が提案します。
          </p>
          {/* v0.4.18: 薬機法・医師法配慮の免責文を 1 行追加。AI の「ギャップを埋める」
              表現が食事療法に近いニュアンスを持つため、健康増進の参考であり医学的
              指導ではないことを明示する。 */}
          <p className="text-xs text-slate-500 dark:text-slate-500 mb-4 leading-relaxed">
            ※ 提案は栄養計算に基づく参考情報です。特定の疾患の予防・診断・治療や、
            医師・管理栄養士による食事療法を代替するものではありません。
          </p>
          {/* v0.4.10: 自動算出された目標食習慣を inline 表示。
              ユーザーが「何を目指すレシピが返ってくるのか」を事前に把握できる。 */}
          {target && (
            <div className="mb-4 rounded-lg bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:bg-sky-950/30 dark:text-sky-100">
              <span className="font-semibold">今のあなたより魚を食べていたのは</span>{" "}
              <strong>{target.patternName}</strong>{" "}
              <span className="text-sky-700 dark:text-sky-300">
                (あと +{Math.round(target.gapMg).toLocaleString("en-US")} mg/日)
              </span>
              <div className="mt-1 text-xs text-sky-700 dark:text-sky-300">
                これからも美味しく魚を食べてください
              </div>
            </div>
          )}
          {/* F-027 (v0.8.8): bg-slate-900 → bg-brand。アプリの primary CTA は
              「写真を解析する」(brand emerald) で統一されているのに、ここだけ
              黒ピル UI で Vercel/Linear から copy-paste したような印象を残して
              いた。同じ役割の primary CTA は同じ色でいくのが原則。 */}
          <button
            onClick={() => void fetchRecipes()}
            className="w-full bg-brand text-white py-3 sm:py-4 px-6 rounded-lg font-medium shadow-lg shadow-brand/30 hover:bg-brand-hover active:scale-[0.99] transition"
          >
            AI に提案してもらう
          </button>
          <p className="mt-3 text-xs text-slate-400 text-center">
            ※ 1 件目は約 6〜10 秒で届きます (3 件揃うまで 15〜25 秒)
          </p>
        </div>
      )}

      {state.kind === "loading" && (() => {
        // F-045 (v0.8.11): partial が満杯 (3 件) になっているのに complete
        // event 待ちで spinner が回り続ける期間がある。視覚的には全 recipe が
        // 出揃って見えるのに spinner だけ残っている mismatch。
        // → partial=MAX なら spinner + caption を抑制し、result-state に近い
        //   見た目に先行収束させる (実 state は complete を待ってから flip)。
        const allArrived = state.partialRecipes.length >= 3;
        // F-037 (v0.8.11): "1 / 3 件 届きました" は「1 件到着」の過去形 +
        // active spinner で語形 mismatch だった。"完了 — 次を生成中..." に
        // 揃えて「完了した分 + 進行中」を 1 行で表現。
        const progressText =
          state.partialRecipes.length === 0
            ? LOADING_STAGES[loadingStage]
            : `${state.partialRecipes.length} / 3 件 完了 — 次を生成中…`;
        return (
          <div>
            <div className="text-base sm:text-lg text-slate-700 dark:text-slate-200 mb-1 flex items-center gap-2">
              <span className="text-2xl">🍳</span>
              <span className="font-medium">AI からの提案</span>
            </div>
            {!allArrived && (
              <div className="text-xs text-slate-500 dark:text-slate-400 mb-4 flex items-center gap-2">
                {state.activeChip && (
                  <span>✓ 「{CHIP_LABELS[state.activeChip]}」で再提案中</span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block w-3 h-3 border-2 border-slate-300 dark:border-slate-600 border-t-slate-600 dark:border-t-slate-300 rounded-full animate-spin" />
                  {progressText}
                </span>
              </div>
            )}
            {allArrived && (
              <div className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                {state.activeChip && (
                  <span>✓ 「{CHIP_LABELS[state.activeChip]}」で再提案</span>
                )}
              </div>
            )}
            {/* v0.8.0: 届いた recipe は実カードで、未到着は skeleton で表示。
                streaming で先頭から順に届くので [...partial, ...skeletons] の構成。 */}
            <div className="space-y-3">
              {state.partialRecipes.map((r, i) => (
                <RecipeCard key={`partial-${i}`} recipe={r} />
              ))}
              {Array.from({ length: Math.max(0, 3 - state.partialRecipes.length) }).map(
                (_, i) => (
                  <SkeletonRecipeCard key={`skel-${i}`} />
                )
              )}
            </div>
          </div>
        );
      })()}

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
                className="bg-brand text-white px-5 py-3 rounded-lg font-medium hover:bg-brand-hover disabled:opacity-50 transition"
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
            ※ AI 提案は 1 時間あたり 5 回までです。少し時間を置いてから再試行してください。
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
