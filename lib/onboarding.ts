// オンボーディング状態管理 (v0.4.8)
//
// 認証システムを持たないため、localStorage で「初回訪問 vs リピート」を判定する。
// localStorage は per-device / per-browser スコープ。複数端末で初回扱いになるが
// オンボーディング内容は読み返しても損が無いタイプなので問題なし。
//
// バージョン管理: STORAGE_KEY に suffix `-v1` を含む。将来オンボーディング内容を
// 大幅更新したいとき STORAGE_KEY を `-v2` に上げれば全ユーザーに再表示される。
//
// SSR 対応: localStorage は server で undefined。`typeof window === "undefined"`
// ガードを必ず通す。コンポーネント側は mounted flag で hydration mismatch を回避。

export const ONBOARDING_STORAGE_KEY = "eaa-onboarding-seen-v1";

/** SSR セーフに localStorage の値を読む。server / private browsing で例外なら null。 */
function safeGetItem(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    // Safari private browsing 等で localStorage アクセス例外
    return null;
  }
}

function safeSetItem(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // 容量超過 / private browsing 等。失敗しても UX は止めない。
  }
}

/** オンボーディング既読か？ false ならまだ見ていない（初回扱い）。 */
export function hasSeenOnboarding(): boolean {
  return safeGetItem(ONBOARDING_STORAGE_KEY) !== null;
}

/** オンボーディングを「見た」とマーク。タイムスタンプで保存（将来分析しやすく）。 */
export function markOnboardingSeen(): void {
  safeSetItem(ONBOARDING_STORAGE_KEY, new Date().toISOString());
}

/** テスト用 / ユーザーが「もう一度見たい」と言ったときのリセット。 */
export function resetOnboardingState(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(ONBOARDING_STORAGE_KEY);
  } catch {
    // ignore
  }
}
