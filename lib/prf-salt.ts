// PRF Extension の eval salt 定数 (v0.8.3)
//
// この値は server (lib/webauthn.ts の buildAuthenticationOptions) と
// client (将来 v0.8.3+ の crypto helpers) で **同じ値** を使う必要がある。
// Salt が変わると WebAuthn PRF が異なる鍵を返すため、過去データの復号が不能になる。
//
// バージョン suffix ("v1") を入れて将来の鍵ローテーション余地を残す。
// 鍵を更新したい場合は v2 を導入し、過去データの再暗号化マイグレーションを
// 実装する (今は不要)。
//
// 値: SHA-256 hash ではなく単純な ASCII 文字列を base64url した値。
// 32 bytes 以上ある必要はなく (PRF 仕様上は任意長)、識別子として機能すれば良い。
//
// 元の文字列: "eaa-scorer/v1/encryption-key"
// → base64url 化: "ZWFhLXNjb3Jlci92MS9lbmNyeXB0aW9uLWtleQ"

export const PRF_SALT_BASE64URL = "ZWFhLXNjb3Jlci92MS9lbmNyeXB0aW9uLWtleQ";
