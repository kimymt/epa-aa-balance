// React hook: auth-session.ts の状態を reactive に取り込む (v0.8.4)
//
// 使い方:
//   const session = useSession();
//   if (session) { /* 認証済 */ }

"use client";

import { useEffect, useState } from "react";
import {
  type AuthSession,
  getSession,
  subscribeSession,
} from "./auth-session";

export function useSession(): AuthSession | null {
  const [session, setSessionState] = useState<AuthSession | null>(() =>
    getSession()
  );
  useEffect(() => {
    return subscribeSession(setSessionState);
  }, []);
  return session;
}
