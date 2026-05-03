import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
// v0.4.14: グローバルフッター (GitHub + Q&A)
import { Footer } from "@/components/Footer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "EPA/AAバランス — 食事写真から魚タンパク質割合を判定",
  description:
    "食事の写真をアップロードするだけで、魚タンパク質と非魚タンパク質の比率を信号機で判定します。EPA/AA比の食事面の目安に。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-slate-50 dark:bg-slate-950">
        {children}
        <Footer />
      </body>
    </html>
  );
}
