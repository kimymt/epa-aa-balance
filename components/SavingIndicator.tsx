// 保存中インジケータ (v0.8.4)
//
// 解析結果を D1 に保存中・保存完了を控えめに表示する transient toast。
// 配置: fixed bottom-right。auto-dismiss after success.
//
// state は親から prop で渡す (lib/history-save.ts SaveState を直接受け入れる)。

"use client";

import { useEffect, useState } from "react";
import type { SaveState } from "@/lib/history-save";

interface Props {
  state: SaveState;
}

export function SavingIndicator({ state }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (state.kind === "saving") {
      setVisible(true);
      return;
    }
    if (state.kind === "saved") {
      setVisible(true);
      // 2 秒後に消す
      const id = setTimeout(() => setVisible(false), 2000);
      return () => clearTimeout(id);
    }
    if (state.kind === "error") {
      setVisible(true);
      // エラーは長めに 5 秒
      const id = setTimeout(() => setVisible(false), 5000);
      return () => clearTimeout(id);
    }
    setVisible(false);
  }, [state]);

  if (!visible || state.kind === "idle") return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-40 pointer-events-none"
    >
      {state.kind === "saving" && (
        <div className="rounded-lg bg-slate-900/90 dark:bg-slate-100/90 text-white dark:text-slate-900 px-3 py-2 text-sm font-medium shadow-lg flex items-center gap-2">
          <span className="inline-block w-3 h-3 border-2 border-white/40 dark:border-slate-900/40 border-t-white dark:border-t-slate-900 rounded-full animate-spin" />
          保存中...
        </div>
      )}
      {state.kind === "saved" && (
        <div className="rounded-lg bg-emerald-600 text-white px-3 py-2 text-sm font-medium shadow-lg flex items-center gap-2">
          <span aria-hidden>✓</span>
          保存しました
        </div>
      )}
      {state.kind === "error" && (
        <div className="rounded-lg bg-rose-600 text-white px-3 py-2 text-sm font-medium shadow-lg max-w-xs">
          <span aria-hidden>⚠ </span>
          保存できませんでした: {state.message}
        </div>
      )}
    </div>
  );
}
