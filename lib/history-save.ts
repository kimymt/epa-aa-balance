// クライアント側 履歴保存ヘルパー (v0.8.4)
//
// 解析結果 (AnalysisResult[] 等) をクライアント側で AES-GCM 暗号化して
// /api/analyses に POST する。サーバー側は ciphertext のみ保存、内容は読めない。
//
// 状態遷移コールバックで保存中インジケータ UI を更新できるよう、
// onStateChange を提供する (saving → saved → idle、または error)。

import { getSession } from "./auth-session";
import { encryptJson } from "./crypto";
import type { AnalysisResult } from "./analyzer";
import type { CoachRequest } from "./coach";

/**
 * 暗号化対象の payload 形 (将来拡張余地を残して object 化、version field 付与)。
 * 履歴閲覧時に同じ shape を期待して decrypt する。
 */
export interface AnalysisHistoryPayload {
  /** schema version。将来 fields 追加時は v: 2 にして互換層を入れる */
  v: 1;
  /** 解析結果配列 (Vision API 出力 + EPA/DHA/AA 計算済) */
  results: AnalysisResult[];
  /** 集計値 (lipidPct, sums) — 既に results から計算可能だが冗長保存で UI 速化 */
  aggregate: CoachRequest["aggregate"];
  /** 解析時刻 (client-side、tz は UTC ではなく端末ローカル) */
  analyzedAt: number;
}

export type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; id: string }
  | { kind: "error"; message: string };

/**
 * 解析結果を暗号化して保存。認証済の場合のみ実行、未認証なら何もしない (no-op)。
 *
 * UI からは:
 *   const stop = saveAnalysis(payload, setState);
 *   // 進行中インジケータ
 *
 * 戻り値: 「abort 関数」(現実装では noop。将来 fetch abort 対応用 placeholder)。
 */
export async function saveAnalysis(
  payload: AnalysisHistoryPayload,
  onStateChange?: (state: SaveState) => void
): Promise<SaveState> {
  const session = getSession();
  if (!session) {
    // 未認証 → 何もしない (auto-save の前提が成立していない)
    onStateChange?.({ kind: "idle" });
    return { kind: "idle" };
  }

  onStateChange?.({ kind: "saving" });
  let cipherBlob: string;
  try {
    cipherBlob = await encryptJson(session.prfKey, payload);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "encrypt failed";
    const state: SaveState = { kind: "error", message: `暗号化失敗: ${msg}` };
    onStateChange?.(state);
    return state;
  }

  try {
    const res = await fetch("/api/analyses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.sessionToken}`,
      },
      body: JSON.stringify({ cipherBlob }),
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      const state: SaveState = {
        kind: "error",
        message: j.error ?? `保存失敗 (${res.status})`,
      };
      onStateChange?.(state);
      return state;
    }
    const { id } = (await res.json()) as { id: string };
    const state: SaveState = { kind: "saved", id };
    onStateChange?.(state);
    return state;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "network error";
    const state: SaveState = { kind: "error", message: msg };
    onStateChange?.(state);
    return state;
  }
}
