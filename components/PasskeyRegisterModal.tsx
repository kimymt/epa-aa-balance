// Passkey 登録モーダル (v0.8.4)
//
// 表示位置: result panel の「📒 この記録を残す」CTA からトリガー
// 内容: 2 行の説明 + 「使う」「今は使わない」の二択
// 動作: 「使う」 → registerOrLogin() (login 優先、失敗時 register)
//       成功時に onSuccess を呼んで親に通知 (auto-save トリガーになる)
//
// PRF 非対応端末は "PRF_UNSUPPORTED" エラーを表示して機能無効を伝える。

"use client";

import { useState } from "react";
import {
  registerOrLogin,
  PasskeyError,
  isPasskeyAvailable,
} from "@/lib/webauthn-client";

interface Props {
  open: boolean;
  onClose: () => void;
  /** 登録/ログイン成功時に呼ばれる。親側で getSession() を読んで auto-save できる。 */
  onSuccess: (info: { userId: string; action: "registered" | "logged-in" }) => void;
}

type State =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "error"; message: string; code?: string };

export function PasskeyRegisterModal({ open, onClose, onSuccess }: Props) {
  const [state, setState] = useState<State>({ kind: "idle" });

  if (!open) return null;

  const passkeyAvailable = isPasskeyAvailable();

  async function handleStart() {
    setState({ kind: "running" });
    try {
      const result = await registerOrLogin();
      onSuccess(result);
      onClose();
      setState({ kind: "idle" });
    } catch (err) {
      const e = err instanceof PasskeyError ? err : null;
      const code = e?.code;
      let message = e?.message ?? "登録に失敗しました。";
      if (code === "USER_CANCELLED") {
        // ユーザーがキャンセルしただけなので静かに modal を閉じる
        setState({ kind: "idle" });
        onClose();
        return;
      }
      if (code === "PRF_UNSUPPORTED") {
        message =
          "このブラウザ・端末では履歴機能 (暗号化) に対応していません。Chrome 116+ や iOS 17.4+ をお試しください。";
      }
      setState({ kind: "error", message, code });
    }
  }

  function handleCancel() {
    if (state.kind === "running") return; // 進行中はキャンセル不可
    onClose();
    setState({ kind: "idle" });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="passkey-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm"
      onClick={handleCancel}
    >
      <div
        className="w-full max-w-md rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-5 sm:p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="passkey-modal-title"
          className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-3 flex items-center gap-2"
        >
          <span className="text-2xl">📒</span>
          履歴を保存しますか?
        </h2>
        <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed mb-2">
          解析履歴をこの端末の Passkey (FaceID 等) で暗号化して保存します。鍵は
          端末から出ないため、運営を含め他人は中身を読めません。
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-5">
          ※ Passkey を消すと履歴は復元できなくなります。
        </p>

        {!passkeyAvailable && (
          <div className="mb-4 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 p-3 text-sm text-amber-900 dark:text-amber-200">
            このブラウザは Passkey に対応していません。Chrome 116+ や Safari 17.4+
            をご利用ください。
          </div>
        )}

        {state.kind === "error" && (
          <div className="mb-4 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 p-3 text-sm text-rose-900 dark:text-rose-200">
            {state.message}
          </div>
        )}

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button
            type="button"
            onClick={handleCancel}
            disabled={state.kind === "running"}
            className="px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition disabled:opacity-50"
          >
            今は使わない
          </button>
          <button
            type="button"
            onClick={handleStart}
            disabled={!passkeyAvailable || state.kind === "running"}
            className="px-4 py-2.5 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-medium hover:bg-slate-800 dark:hover:bg-slate-200 transition disabled:opacity-50"
          >
            {state.kind === "running" ? "認証中..." : "使う"}
          </button>
        </div>
      </div>
    </div>
  );
}
