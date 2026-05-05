import type { NextConfig } from "next";

// v0.5.1: セキュリティヘッダー (CSP + X-Frame-Options + 他)。
//
// CSP 設計方針:
// - script-src: 'self' + 'unsafe-inline' (Next.js のハイドレーションスクリプトと
//   Vercel Speed Insights 用に必須)
// - style-src: 'self' + 'unsafe-inline' (Tailwind の inline style 注入 + Next.js
//   の自動生成 style)
// - img-src: 'self' + data: + blob: (アップロード画像のサムネイル表示は
//   URL.createObjectURL 経由で blob:、Next/Image 最適化は data:)
// - frame-src: youtube-nocookie のみ (v0.4.3 フィッシュ啓蒙動画の iframe 用)
// - connect-src: 'self' のみ (API は同一オリジン、外部 API 呼び出しなし)
// - frame-ancestors: 'none' (clickjacking 防止、X-Frame-Options DENY と同義)
// - object-src: 'none' (Flash 等の plugin embed は不要)
//
// 'unsafe-eval' は dev mode のみ許可 (Next.js + React の HMR / デバッグ用)。
// 本番では eval() を一切使わないため strict に維持し、actual hardening を担保。
const isDev = process.env.NODE_ENV !== "production";
const scriptSrc = isDev
  ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
  : "script-src 'self' 'unsafe-inline'";

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      scriptSrc,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-src https://www.youtube-nocookie.com",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
  // 古いブラウザ向け clickjacking 対策 (frame-ancestors と冗長だが defense-in-depth)
  { key: "X-Frame-Options", value: "DENY" },
  // MIME sniffing 抑止 (主に IE/古い Edge、現代ブラウザでも一部効く)
  { key: "X-Content-Type-Options", value: "nosniff" },
  // 外部リンク (GitHub / Notion Q&A) クリック時に referrer を制限的に渡す
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // 不要なブラウザ API への権限を絞る (geolocation / camera / microphone は使わない)
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  // data/foods.json をサーバーサイドで fs.readFileSync するため、
  // Vercelのファンクションバンドルに含めるよう明示的に指定する。
  // Next.js 16 で experimental から昇格してトップレベルオプションになった。
  outputFileTracingIncludes: {
    "/api/analyze": ["./data/**"],
  },

  // v0.5.1: 全ルートに security headers を付与
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
