"use client";

import { useEffect, useRef, useState } from "react";
import { MEAL_TYPES } from "@/lib/session";

interface FeedbackItem {
  id: string;
  mealType: string;
  predictedFoods: Array<{ name: string; grams: number } | string>;
  accurate: boolean;
  correctedFoods: string[] | null;
  timestamp: string;
  createdAt: string;
  calculationVersion: number;
}

interface Stats {
  totalFeedback: number;
  accurateFeedback: number;
  inaccurateFeedback: number;
  accuracyPercentage: string;
  byMealType: Record<string, { accurate: number; inaccurate: number }>;
  byCalculationVersion: Record<string, number>; // {"1": N, "2": M}
}

interface FeedbackResponse {
  filter: { version: string };
  stats: Stats;
  recentFeedback: FeedbackItem[];
}

type VersionFilter = "all" | "1" | "2";

const VERSION_LABELS: Record<string, string> = {
  "1": "v1 (タンパク質)",
  "2": "v2 (脂質)",
};
const VERSION_BADGE_BG: Record<string, string> = {
  "1": "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300",
  "2": "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
};

const TOKEN_STORAGE_KEY = "eaa-scorer-admin-token";

function mealLabel(value: string): string {
  return MEAL_TYPES.find((m) => m.value === value)?.label ?? value;
}

function foodsToString(
  foods: Array<{ name: string; grams: number } | string> | null
): string {
  if (!foods || foods.length === 0) return "—";
  return foods
    .map((f) =>
      typeof f === "string" ? f : `${f.name}(${f.grams}g)`
    )
    .join(", ");
}

export default function AdminPage() {
  const activeRequest = useRef<AbortController | null>(null);
  const [token, setToken] = useState<string>("");
  const [tokenInput, setTokenInput] = useState<string>("");
  const [data, setData] = useState<FeedbackResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [versionFilter, setVersionFilter] = useState<VersionFilter>("all");

  // Remove legacy persistent credentials without reading or using them.
  useEffect(() => {
    try { localStorage.removeItem(TOKEN_STORAGE_KEY); } catch {}
    return () => activeRequest.current?.abort();
  }, []);

  // Auto-fetch when token or version filter changes
  useEffect(() => {
    if (!token) return;
    void fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, versionFilter]);

  async function fetchStats() {
    if (!token) return;
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/feedback?version=${versionFilter}`,
        { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: controller.signal }
      );
      if (res.status === 401) {
        setError("認証に失敗しました。トークンを確認してください。");
        setData(null);
        return;
      }
      if (!res.ok) {
        setError(`取得に失敗しました (HTTP ${res.status})`);
        return;
      }
      const json = (await res.json()) as FeedbackResponse;
      if (!controller.signal.aborted) setData(json);
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "通信エラー");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  function handleSaveToken() {
    const trimmed = tokenInput.trim();
    if (!trimmed) return;
    setTokenInput("");
    setToken(trimmed);
  }

  function handleClearToken() {
    activeRequest.current?.abort();
    setLoading(false);
    try { localStorage.removeItem(TOKEN_STORAGE_KEY); } catch {}
    setToken("");
    setTokenInput("");
    setData(null);
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            フィードバック管理
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Vision API の精度測定とユーザー修正の確認。
          </p>
        </header>

        {/* Token gate */}
        {!token && (
          <div className="mb-6 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              管理トークン
            </label>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              管理トークンを入力（この画面を閉じると再入力が必要です）
            </p>
            <div className="mt-3 flex gap-2">
              <input
                type="password"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSaveToken()}
                placeholder="トークンを貼り付け"
                className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
              <button
                onClick={handleSaveToken}
                disabled={!tokenInput.trim()}
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                認証して取得
              </button>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-6 rounded-lg border border-rose-300 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200">
            {error}
            <button
              onClick={handleClearToken}
              className="ml-3 underline hover:no-underline"
            >
              トークンを変更
            </button>
          </div>
        )}

        {/* Loading */}
        {token && loading && !data && (
          <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
            読み込み中...
          </div>
        )}

        {/* Stats */}
        {data && (
          <>
            {/* Calculation version filter (v0.3.8) */}
            <div className="mb-4 flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                計算バージョン:
              </span>
              {(["all", "2", "1"] as VersionFilter[]).map((v) => {
                const count =
                  v === "all"
                    ? (data.stats.byCalculationVersion["1"] ?? 0) +
                      (data.stats.byCalculationVersion["2"] ?? 0)
                    : (data.stats.byCalculationVersion[v] ?? 0);
                const label =
                  v === "all" ? "すべて" : VERSION_LABELS[v] ?? v;
                const active = versionFilter === v;
                return (
                  <button
                    key={v}
                    onClick={() => setVersionFilter(v)}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                      active
                        ? "bg-emerald-600 text-white"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                    }`}
                  >
                    {label} <span className="opacity-75">({count})</span>
                  </button>
                );
              })}
            </div>

            {/* Top stats */}
            <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <StatCard
                label="フィードバック総数"
                value={String(data.stats.totalFeedback)}
                color="slate"
              />
              <StatCard
                label="正確と回答"
                value={`${data.stats.accurateFeedback} 件`}
                color="emerald"
              />
              <StatCard
                label="精度"
                value={
                  data.stats.accuracyPercentage === "N/A"
                    ? "—"
                    : `${data.stats.accuracyPercentage}%`
                }
                color="blue"
              />
            </div>

            {/* By meal type */}
            <div className="mb-6 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
                食事タイプ別の精度
              </h2>
              {Object.keys(data.stats.byMealType).length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  まだデータがありません。
                </p>
              ) : (
                <div className="space-y-2">
                  {Object.entries(data.stats.byMealType).map(([meal, counts]) => {
                    const total = counts.accurate + counts.inaccurate;
                    const pct =
                      total > 0
                        ? ((counts.accurate / total) * 100).toFixed(0)
                        : "—";
                    return (
                      <div
                        key={meal}
                        className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 dark:bg-slate-800"
                      >
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                          {mealLabel(meal)}
                        </span>
                        <span className="text-sm text-slate-600 dark:text-slate-400">
                          {counts.accurate} / {total}{" "}
                          <span className="ml-2 font-mono text-xs">
                            ({pct}%)
                          </span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Refresh + token controls */}
            <div className="mb-6 flex items-center gap-3">
              <button
                onClick={fetchStats}
                disabled={loading}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                {loading ? "更新中..." : "再取得"}
              </button>
              <button
                onClick={handleClearToken}
                className="text-xs text-slate-500 underline hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-300"
              >
                トークンをクリア
              </button>
            </div>

            {/* Recent feedback */}
            <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <h2 className="border-b border-slate-200 px-6 py-4 text-sm font-semibold text-slate-700 dark:border-slate-800 dark:text-slate-300">
                直近のフィードバック ({data.recentFeedback.length} 件)
              </h2>
              {data.recentFeedback.length === 0 ? (
                <p className="px-6 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                  まだフィードバックがありません。
                </p>
              ) : (
                <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                  {data.recentFeedback.map((item) => (
                    <li key={item.id} className="px-6 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                item.accurate
                                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                                  : "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                              }`}
                            >
                              {item.accurate ? "✓ 正確" : "✗ 誤り"}
                            </span>
                            {/* v0.3.8: calculation version badge */}
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                VERSION_BADGE_BG[String(item.calculationVersion)] ??
                                "bg-slate-100 text-slate-700"
                              }`}
                              title={`計算バージョン: ${item.calculationVersion}`}
                            >
                              {VERSION_LABELS[String(item.calculationVersion)] ??
                                `v${item.calculationVersion}`}
                            </span>
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              {mealLabel(item.mealType)}
                            </span>
                            <span className="text-xs text-slate-400 dark:text-slate-500">
                              {new Date(item.createdAt + "Z").toLocaleString(
                                "ja-JP"
                              )}
                            </span>
                          </div>

                          <div className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                            <div>
                              <span className="font-medium">予測: </span>
                              <span className="text-slate-700 dark:text-slate-300">
                                {foodsToString(item.predictedFoods)}
                              </span>
                            </div>
                            {item.correctedFoods && (
                              <div className="mt-1">
                                <span className="font-medium">修正: </span>
                                <span className="text-amber-700 dark:text-amber-400">
                                  {item.correctedFoods.join(", ")}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: "slate" | "emerald" | "blue";
}) {
  const colorMap = {
    slate:
      "border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100",
    emerald:
      "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100",
    blue: "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100",
  };
  return (
    <div className={`rounded-xl border p-6 ${colorMap[color]}`}>
      <div className="text-xs font-medium uppercase tracking-wide opacity-75">
        {label}
      </div>
      <div className="mt-2 text-3xl font-bold">{value}</div>
    </div>
  );
}
