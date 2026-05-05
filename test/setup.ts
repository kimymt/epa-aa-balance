// コンポーネントテスト共通セットアップ (v0.5.2)
//
// bun:test は素のままだと DOM globals (window/document/HTMLElement) を
// 持たないため、@happy-dom/global-registrator で注入する。
// これで `@testing-library/react` の render() が動く。
//
// 使い方: bunfig.toml の [test] preload で本ファイルを指定。

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterEach, beforeEach } from "bun:test";

// happy-dom の window/document/etc. を globalThis に登録。
// URL を渡しておくと location が壊れない (Next.js が一部使う)。
GlobalRegistrator.register({ url: "http://localhost:3000" });

// 各テスト前に DOM と localStorage をリセット (テスト間の状態漏れ防止)。
// React Testing Library の cleanup() は import 時に screen を document.body に
// バインドしてしまい、bun:test 環境では二度目以降の document アクセスが失敗
// するケースを観測した (v0.5.2 開発時)。よって手動で document.body.innerHTML
// クリア + localStorage.clear() を採用。
beforeEach(() => {
  if (typeof document !== "undefined") {
    document.body.innerHTML = "";
  }
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.clear();
    } catch {
      // happy-dom が localStorage を実装していない場合は無視
    }
  }
});

// 念のため afterEach でも DOM だけクリア (次テスト前の beforeEach と重複だが、
// テスト中の例外で beforeEach がスキップされるパスを救う)。
afterEach(() => {
  if (typeof document !== "undefined") {
    document.body.innerHTML = "";
  }
});
