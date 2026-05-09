// ヘッダー履歴ボタン (v0.8.4)
//
// 認証済の場合のみ右上に表示される floating button。
// クリックで小さなメニュー: 「履歴記録: ON」表示 + 「停止する」ボタン。
//
// 「停止する」 = clearSession() で memory を消し、以降の auto-save を止める。
// 再開するには次の解析時に「📒 この記録を残す」CTA をタップして再認証。
//
// 注: v0.8.5 で「履歴を見る」リンクが追加される予定。
//     現状は ON 表示と停止だけ提供。

"use client";

import { useState, useRef, useEffect } from "react";
import { useSession } from "@/lib/use-session";
import { clearSession } from "@/lib/auth-session";

export function HistoryHeaderButton() {
  const session = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // クリック外で閉じる
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // 未認証なら表示しない (CTA は ResultPanel 側にある)
  if (!session) return null;

  function handleStop() {
    clearSession();
    setOpen(false);
  }

  return (
    <div
      ref={ref}
      className="fixed top-3 right-3 sm:top-4 sm:right-4 z-30"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="履歴メニュー"
        aria-expanded={open}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow"
      >
        <span aria-hidden>📒</span>
        <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" aria-hidden />
        <span className="text-xs text-slate-600 dark:text-slate-400 hidden sm:inline">
          履歴 ON
        </span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-lg p-2">
          <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-700 mb-1">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              履歴記録
            </div>
            <div className="text-sm font-medium text-slate-900 dark:text-slate-100 flex items-center gap-1.5 mt-0.5">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" aria-hidden />
              ON (この tab を閉じると停止)
            </div>
          </div>
          <button
            type="button"
            onClick={handleStop}
            className="w-full text-left px-3 py-2 rounded text-sm text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
          >
            今後の保存を停止する
          </button>
          <p className="px-3 pt-1 pb-1 text-[10px] text-slate-400 leading-snug">
            再開は次の解析時に「この記録を残す」から。
          </p>
        </div>
      )}
    </div>
  );
}
