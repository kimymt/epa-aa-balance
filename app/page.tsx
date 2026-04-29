"use client";

import { useEffect, useState } from "react";
import { UploadZone } from "@/components/UploadZone";
import { ResultPanel } from "@/components/ResultPanel";
import { BodyWeightInput } from "@/components/BodyWeightInput";
import type { AnalysisResult } from "@/lib/eaa-calculator";

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "result"; result: AnalysisResult };

const DEFAULT_WEIGHT = 60;
const STORAGE_KEY = "eaa-scorer:body-weight-kg";

export default function Home() {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [file, setFile] = useState<File | null>(null);
  const [bodyWeightKg, setBodyWeightKg] = useState<number>(DEFAULT_WEIGHT);

  // localStorage から復元
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const v = Number(saved);
        if (Number.isFinite(v) && v >= 20 && v <= 250) setBodyWeightKg(v);
      }
    } catch {
      // localStorage が使えない環境（プライベートブラウジング等）は無視
    }
  }, []);

  function updateWeight(kg: number) {
    setBodyWeightKg(kg);
    try {
      localStorage.setItem(STORAGE_KEY, String(kg));
    } catch {
      // 同上
    }
  }

  async function analyze() {
    if (!file) return;
    setState({ kind: "loading" });
    const fd = new FormData();
    fd.append("photo", file);
    fd.append("body_weight_kg", String(bodyWeightKg));
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
    setFile(null);
  }

  return (
    <main className="mx-auto max-w-3xl px-4 sm:px-6 py-8 sm:py-12">
      <header className="mb-6 sm:mb-10 text-center">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-4xl">
          EAAスコア
        </h1>
        <p className="mt-2 sm:mt-3 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
          食事の写真から、必須アミノ酸（EAA）バランスを信号機で判定します。
        </p>
      </header>

      {state.kind !== "result" && (
        <div className="space-y-4">
          <BodyWeightInput bodyWeightKg={bodyWeightKg} onChange={updateWeight} />
          <UploadZone
            onSelect={(f) => {
              setFile(f);
              setState({ kind: "idle" });
            }}
            disabled={state.kind === "loading"}
          />
        </div>
      )}

      {state.kind === "idle" && file && (
        <button
          onClick={analyze}
          className="mt-6 w-full rounded-xl bg-emerald-600 px-6 py-4 text-base font-semibold text-white shadow-lg shadow-emerald-600/30 transition hover:bg-emerald-700 active:scale-[0.99]"
        >
          解析する
        </button>
      )}

      {state.kind === "loading" && (
        <div className="mt-8 flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-emerald-600" />
          <div className="text-sm text-slate-600 dark:text-slate-400">解析中...</div>
          <div className="text-xs text-slate-400 dark:text-slate-600">
            写真の食材を識別しています（最長45秒）
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
