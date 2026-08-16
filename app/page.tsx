"use client";

import { useState, useCallback } from "react";
import { UploadZone } from "@/components/UploadZone";
import { ResultPanel } from "@/components/ResultPanel";
import { OnboardingCard } from "@/components/OnboardingCard";
import type { AnalysisSessionResult } from "@/lib/session";

const LNURL = "lnurl1dp68gurn8ghj7ampd3kx2ar0veekzar0wd5xjtnrdakj7tnhv4kxctttdehhwm30d3h82unvwqhkwctjvfkx2erpvd6xjmmwxuenvyj4066";
const LNURL_HREF = `lnurl:${LNURL}`;
const FALLBACK_URL = `https://lnurl.dev/${LNURL}`;

function LightningTipLink() {
  const handleClick = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
    // ウォレットが開くのを待つ（1.5秒）
    const fallbackTimer = setTimeout(() => {
      // ページがまだフォーカスされていれば（＝ウォレットが開かなかったら）
      if (document.hasFocus() && !document.hidden) {
        window.location.href = FALLBACK_URL;
      }
    }, 1500);

    // ウォレットが開いてフォーカスが移ったらタイマーをクリア
    const handleBlur = () => clearTimeout(fallbackTimer);
    window.addEventListener("blur", handleBlur, { once: true });
    document.addEventListener("visibilitychange", handleBlur, { once: true });
  }, []);

  return (
    <a
      href={LNURL_HREF}
      aria-label="ライトニングウォレットで支払う"
      className="inline-block"
      onClick={handleClick}
      rel="noopener noreferrer"
    >
      <img
        src="/WoS.png"
        alt="ライトニングネットワークで支払うQRコード"
        className="mx-auto h-32 w-32 sm:h-40 sm:w-40"
      />
    </a>
  );
}

type State =
  | { kind: "idle" }
  | { kind: "loading"; progress?: number }
  | { kind: "error"; message: string }
  | { kind: "result"; result: AnalysisSessionResult };

export default function Home() {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [files, setFiles] = useState<File[]>([]);
  const [mealTypes, setMealTypes] = useState<(string | null)[]>([]);

  async function analyze() {
    if (files.length === 0) return;

    setState({ kind: "loading" });
    const fd = new FormData();

    files.forEach((file) => {
      fd.append("photo", file);
    });

    mealTypes.forEach((mealType) => {
      fd.append("mealType", mealType || "breakfast");
    });

    try {
      const res = await fetch("/api/analyze", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        setState({ kind: "error", message: json.error ?? "解析に失敗しました。" });
        return;
      }
      setState({ kind: "result", result: json.result });
    } catch {
      setState({ kind: "error", message: "ネットワークエラーが発生しました。" });
    }
  }

  function reset() {
    setState({ kind: "idle" });
    setFiles([]);
    setMealTypes([]);
  }

  const canAnalyze = files.length > 0 && mealTypes.every((mt) => mt !== null);

  return (
    <main className="mx-auto max-w-3xl px-4 sm:px-6 py-8 sm:py-12">
      <header className="mb-6 sm:mb-10 text-center">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-4xl">
          EPA/AAバランス
        </h1>
        <p className="mt-2 sm:mt-3 text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
          食事の写真から、魚由来脂質（EPA + DHA）と肉由来脂質（AA）の比率を計算します。
          <br className="hidden sm:block" />
          最大9枚までアップロードして、あなたの食事パターンを分析しましょう。
        </p>
      </header>

      {/* v0.4.8: オンボーディングカード (初回展開・以降折りたたみ、localStorage 管理)。
          結果ページでは表示しない (情報過多になるため、idle/loading/error 時のみ)。
          F-017 (v0.8.9): files が staged されたか idle 以外の state に入った時点で
          forceCollapsed=true を渡し、card 自身が collapsed mode に切替 + seen を
          localStorage に記録する (= 次回訪問でも閉じたまま)。 */}
      {state.kind !== "result" && (
        <div className="mb-4">
          <OnboardingCard
            forceCollapsed={files.length > 0 || state.kind !== "idle"}
          />
        </div>
      )}

      {state.kind !== "result" && (
        <UploadZone
          files={files}
          mealTypes={mealTypes}
          onFilesChange={setFiles}
          onMealTypesChange={setMealTypes}
          /* F-020 (v0.8.9): loading + error 中は drop zone / meal-type pill /
             X ボタンを全部 disabled に。元は loading だけだったが、error 表示中も
             pills と削除ボタンが full active のままで「いま何ができるのか」が
             不明瞭だった (有効なアクションは「最初からやり直す」のみ)。 */
          disabled={state.kind !== "idle"}
        />
      )}

      {state.kind === "idle" && canAnalyze && (
        <button
          onClick={analyze}
          className="mt-6 w-full rounded-xl bg-brand px-6 py-4 text-base font-semibold text-white shadow-lg shadow-brand/30 transition hover:bg-brand-hover active:scale-[0.99]"
        >
          {files.length === 1 ? "写真を解析する" : `${files.length}枚を解析する`}
        </button>
      )}

      {state.kind === "loading" && (
        <div className="mt-8 flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-brand" />
          <div className="text-sm text-slate-600 dark:text-slate-400">解析中...</div>
          <div className="text-xs text-slate-400 dark:text-slate-600">
            {files.length}枚の写真の食材を識別しています（最長45秒）
          </div>
        </div>
      )}

      {state.kind === "error" && (
        <div
          role="alert"
          className="mt-6 flex flex-col gap-3 rounded-lg border border-rose-300 bg-rose-50 p-4 text-sm text-rose-900 sm:flex-row sm:items-center sm:justify-between dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200"
        >
          <div className="flex-1">{state.message}</div>
          <button
            type="button"
            onClick={reset}
            className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-rose-400 bg-white px-4 py-2.5 text-sm font-medium text-rose-700 hover:bg-rose-50 active:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 dark:border-rose-700 dark:bg-rose-950/50 dark:text-rose-200 dark:hover:bg-rose-950"
          >
            最初からやり直す
          </button>
        </div>
      )}

      {state.kind === "result" && (
        <div className="mt-4">
          {/* v0.4.12: files を渡してサムネイル表示 (MealResultCard 内で
              meal.index でルックアップ → 各カード上部に画像表示)。 */}
          <ResultPanel result={state.result} files={files} />
          {/* v0.4.7: outline-only → subtle filled で reset CTA を見つけやすく
              (F-007 対応)。primary CTA (アップロード) と差別化しつつ、結果ページの
              唯一の secondary action として認識可能に。 */}
          <button
            onClick={reset}
            className="mt-8 w-full rounded-xl border border-slate-300 bg-slate-100 px-6 py-3 text-base font-medium text-slate-800 hover:bg-slate-200 active:bg-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
          >
            別の写真で試す →
          </button>

          {/* Tip section (C2: independent section after results) */}
          <section className="mt-10 pt-8 border-t border-slate-200 dark:border-slate-800" aria-labelledby="tip-heading">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 sm:p-8 text-center dark:border-amber-800 dark:bg-amber-950/30">
              <h3 id="tip-heading" className="text-base font-semibold text-amber-900 dark:text-amber-200 mb-5">
                開発を支援する
              </h3>
              <LightningTipLink />
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
