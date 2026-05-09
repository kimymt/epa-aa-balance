// クライアント側 認証セッション (memory-only) (v0.8.3)
//
// 設計方針:
//   - PRF 派生 CryptoKey と session token を **メモリのみ** に保持
//   - localStorage / sessionStorage / IndexedDB / Cookie を使わない
//   - tab 閉じる / refresh で消える = ユーザーは再 Passkey 認証
//   - 「鍵は端末から出ない」「再認証コストは FaceID 1 タップ」のバランス
//
// 用途:
//   - login/finish 成功直後に setSession() で保持
//   - encrypt/decrypt が必要なときに getSession() で取り出す
//   - logout / clear ボタンで clearSession()
//
// 注意:
//   - Server-side import 不可 (Node でも動くが、サーバ側で session を持つ意味がない)
//   - 本モジュールは client component からのみ import すること
//   - シングルトン的な module-scoped state を採用 (React Context にしないのは、
//     fetch ヘルパー等から非 React コードでも参照したいため)

export interface AuthSession {
  /** 匿名ユーザー ID (UUID v7、PII 含まず) */
  userId: string;
  /** API 呼び出し時に Authorization: Bearer に乗せる token */
  sessionToken: string;
  /** AES-256-GCM CryptoKey (extractable: false、PRF 派生) */
  prfKey: CryptoKey;
}

let _session: AuthSession | null = null;

type Listener = (session: AuthSession | null) => void;
const _listeners = new Set<Listener>();

function _emit(): void {
  for (const l of _listeners) {
    try {
      l(_session);
    } catch (err) {
      console.warn("auth-session listener error:", err);
    }
  }
}

/** 認証成功直後、login/finish or register/finish の後に呼ぶ */
export function setSession(session: AuthSession): void {
  _session = session;
  _emit();
}

/** 認証済みなら返す。未認証なら null。 */
export function getSession(): AuthSession | null {
  return _session;
}

/** ログアウト or 全データ削除時に呼ぶ。memory が clear されるだけ */
export function clearSession(): void {
  _session = null;
  _emit();
}

/** 認証されているか (boolean、UI のガード判定用) */
export function isAuthenticated(): boolean {
  return _session !== null;
}

/**
 * セッション変化を購読 (UI 連動用)。
 * 戻り値の関数を呼ぶと購読解除。React の useEffect cleanup と相性良い。
 */
export function subscribeSession(listener: Listener): () => void {
  _listeners.add(listener);
  return () => {
    _listeners.delete(listener);
  };
}
