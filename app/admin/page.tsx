"use client";

import { useEffect, useState } from "react";
import { MEAL_TYPES } from "@/lib/session";

interface FeedbackItem {
  id: string;
  mealType: string;
  predictedFoods: Array<{ name: string; grams: number } | string>;
  accurate: boolean;
  correctedFoods: string[] | null;
  timestamp: string;
  createdAt: string;
}

interface Stats {
  totalFeedback: number;
  accurateFeedback: number;
  inaccurateFeedback: number;
  accuracyPercentage: string;
  byMealType: Record<string, { accurate: number; inaccurate: number }>;
}

interface FeedbackResponse {
  stats: Stats;
  recentFeedback: FeedbackItem[];
}

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
  const [token, setToken] = useState<string>("");
  const [tokenInput, setTokenInput] = useState<string>("");
  const [data, setData] = useState<FeedbackResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Restore token from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (saved) {
      setToken(saved);
      setTokenInput(saved);
    }
  }, []);

  // Auto-fetch when token is set
  useEffect(() => {
    if (!token) return;
    void fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function fetchStats() {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/feedback?token=${encodeURIComponent(token)}`
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
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "通信エラー");
    } finally {
      setLoading(false);
    }
  }

  function handleSaveToken() {
    const trimmed = tokenInput.trim();
    if (!trimmed) return;
    localStorage.setItem(TOKEN_STORAGE_KEY, trimmed);
    setToken(trimmed);
  }

  function handleClearToken() {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
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
              FEEDBACK_ADMIN_TOKEN 環境変数の値を入力（ブラウザのlocalStorageに保存）
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
                保存して取得
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
                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                item.accurate
                                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                                  : "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                              }`}
                            >
                              {item.accurate ? "✓ 正確" : "✗ 誤り"}
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
