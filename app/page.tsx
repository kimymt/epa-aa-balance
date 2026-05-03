"use client";

import { useState } from "react";
import { UploadZone } from "@/components/UploadZone";
import { ResultPanel } from "@/components/ResultPanel";
import type { AnalysisSessionResult } from "@/lib/session";

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

      {state.kind !== "result" && (
        <UploadZone
          files={files}
          mealTypes={mealTypes}
          onFilesChange={setFiles}
          onMealTypesChange={setMealTypes}
          disabled={state.kind === "loading"}
        />
      )}

      {state.kind === "idle" && canAnalyze && (
        <button
          onClick={analyze}
          className="mt-6 w-full rounded-xl bg-emerald-600 px-6 py-4 text-base font-semibold text-white shadow-lg shadow-emerald-600/30 transition hover:bg-emerald-700 active:scale-[0.99]"
        >
          {files.length === 1 ? "写真を解析する" : `${files.length}枚を解析する`}
        </button>
      )}

      {state.kind === "loading" && (
        <div className="mt-8 flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-emerald-600" />
          <div className="text-sm text-slate-600 dark:text-slate-400">解析中...</div>
          <div className="text-xs text-slate-400 dark:text-slate-600">
            {files.length}枚の写真の食材を識別しています（最長45秒）
          </div>
        </div>
      )}

      {state.kind === "error" && (
        <div className="mt-6 rounded-lg border border-rose-300 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200">
          {state.message}
          <button
            onClick={reset}
            className="ml-3 underline underline-offset-2 hover:no-underline"
          >
            やり直す
          </button>
        </div>
      )}

      {state.kind === "result" && (
        <div className="mt-4">
          <ResultPanel result={state.result} />
          <button
            onClick={reset}
            className="mt-8 w-full rounded-xl border border-slate-300 px-6 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900"
          >
            別の写真で試す
          </button>
        </div>
      )}
    </main>
  );
}
