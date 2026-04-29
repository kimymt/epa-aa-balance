import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // data/foods.json をサーバーサイドで fs.readFileSync するため、
  // Vercelのファンクションバンドルに含めるよう明示的に指定する。
  // Next.js 16 で experimental から昇格してトップレベルオプションになった。
  outputFileTracingIncludes: {
    "/api/analyze": ["./data/**"],
  },
};

export default nextConfig;
