// オンボーディングカード (v0.4.8)
//
// 目的: 初回訪問ユーザーに「このアプリで何が分かるか・何の指標か・限界は何か」を
// 30 秒で説明する。プロキシ性も honesty を持って明示する。
//
// 表示形式 (design-consultation で決定): inline collapsible card
//   - 初回訪問: 展開 (full content + dismiss button)
//   - リピート訪問: 折りたたみ (summary 1 行 + 再展開ボタン)
//   - localStorage で状態管理 (lib/onboarding.ts)
//
// SSR 対策: localStorage は client only。mounted フラグで hydration mismatch
// を回避する (mounted=false の間は何も描画しない)。

"use client";

import { useEffect, useState } from "react";
import { hasSeenOnboarding, markOnboardingSeen } from "@/lib/onboarding";
// v0.4.16: 抗凝固薬服用者・手術予定者向けの相談推奨を inline 表示。
// fear-mongering ではなく事実通告のスタンス (Q&A と整合)。
import { SAFETY_NOTES } from "@/lib/safety-notes";

interface Props {
  /**
   * F-017 (v0.8.9): 親側 (page.tsx) から「すでにユーザーは engage した」と
   * 通知するためのフラグ。`files.length > 0` か `state.kind !== "idle"`
   * のとき true。true で渡されると onboarding を collapsed mode に切り替え
   * (内部 expanded は false)、同時に localStorage に seen を記録する
   * (= 次回訪問でも collapsed のまま)。
   *
   * 旧仕様: 「わかった、写真をアップロード →」ボタンを明示的に押した時のみ
   * markOnboardingSeen が走っていた。実際のユーザーはボタンを押さずに
   * upload zone へ直接ファイルを drop することが多く、結果として何度
   * 訪れてもカードが full size で開いたままだった (audit screenshot 参照)。
   */
  forceCollapsed?: boolean;
}

export function OnboardingCard({ forceCollapsed = false }: Props) {
  // SSR では localStorage が undefined なので、mounted 後に判定する。
  // mounted=false の間は null 返し → hydration mismatch 回避。
  const [mounted, setMounted] = useState(false);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    setMounted(true);
    if (hasSeenOnboarding()) {
      setExpanded(false);
    }
  }, []);

  // F-017: forceCollapsed が true のときは localStorage に「seen」を記録
  // (次回訪問でも閉じたまま開く)。expanded state は触らず、render 側で
  // forceCollapsed を直接評価する (set-state-in-effect の anti-pattern を避ける)。
  useEffect(() => {
    if (forceCollapsed) {
      markOnboardingSeen();
    }
  }, [forceCollapsed]);

  function handleDismiss() {
    markOnboardingSeen();
    setExpanded(false);
  }

  function handleReExpand() {
    setExpanded(true);
    // 再展開時は localStorage を更新しない: ユーザーが「あとで読みたい」だけの
    // ケースで、再閉じるまで dismiss を発火しない設計
  }

  if (!mounted) return null;

  // F-017: forceCollapsed のときは internal expanded を無視して collapsed mode へ。
  // ユーザーが engage 済 (files 選択 / loading / error) ならカードは小さくしたい。
  const isCollapsed = forceCollapsed || !expanded;

  if (isCollapsed) {
    return (
      <button
        type="button"
        onClick={handleReExpand}
        disabled={forceCollapsed}
        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-left text-sm text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400 dark:hover:bg-slate-800 dark:disabled:hover:bg-slate-900/50"
        aria-expanded="false"
      >
        <span className="mr-2">🐟</span>
        <span>
          EPA/AA バランスとは？{" "}
          <span className="text-slate-400 dark:text-slate-500">
            {forceCollapsed ? "（後で確認できます）" : "（クリックで展開）"}
          </span>
        </span>
      </button>
    );
  }

  return (
    <section
      className="rounded-xl border border-sky-200 bg-sky-50 p-5 sm:p-6 dark:border-sky-800/40 dark:bg-sky-950/30"
      aria-expanded="true"
    >
      <div className="mb-3 flex items-center gap-2">
        <span className="text-2xl">🐟</span>
        <h2 className="text-base font-semibold text-sky-900 sm:text-lg dark:text-sky-100">
          EPA/AA バランスとは？
        </h2>
      </div>

      <div className="space-y-3 text-sm leading-relaxed text-sky-900 dark:text-sky-100">
        <p>
          血液中の <strong>EPA（魚由来）</strong>と <strong>AA（肉由来）</strong>のバランスは、
          心臓・血管の健康に関わるとされています
          （特に EPA・DHA の摂取量と心血管疾患リスクの関係は多くの研究で示されています）。
        </p>

        <p className="text-xs leading-relaxed text-sky-800/80 dark:text-sky-200/80">
          ただし、写真から計算できるのは「<strong>食事中の脂肪酸の比率</strong>」で、
          血液検査の代わりにはなりません。あくまで食習慣の傾向把握用です。
        </p>

        <ul className="ml-4 list-disc space-y-1 text-sm">
          <li><strong>EPA・DHA</strong>: サバ・イワシ・サンマなどの青魚に豊富</li>
          <li><strong>AA（アラキドン酸）</strong>: 肉・卵・乳製品に豊富</li>
        </ul>
      </div>

      {/* v0.4.16: 抗凝固薬服用者・手術予定者向けの注意 (該当者のみアクション可能、
          一般ユーザーには情報提供にとどまる)。lib/safety-notes.ts で一元管理。 */}
      <div className="mt-4 rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs leading-relaxed text-amber-900 dark:border-amber-800/40 dark:bg-amber-950/20 dark:text-amber-200">
        <span aria-hidden className="mr-1">⚠</span>
        {SAFETY_NOTES.ANTICOAGULANT_CONSULT.body}
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={handleDismiss}
          className="min-h-[44px] rounded-md bg-sky-100 px-4 py-2.5 text-sm font-medium text-sky-900 hover:bg-sky-200 active:bg-sky-300 dark:bg-sky-900/60 dark:text-sky-100 dark:hover:bg-sky-900"
        >
          わかった、写真をアップロード →
        </button>
      </div>
    </section>
  );
}
