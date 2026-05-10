// 食習慣パターン比較ビジュアル (v0.4.9)
//
// 目的: ユーザーの EPA+DHA 摂取量を世界の代表的食習慣 5 パターンと並べて、
// 「あなたはどこに位置するか」を一目で把握させる WOW 体験。
//
// 配置: ResultPanel の aggregate カード下、AI コーチセクション上。
//
// 表示ロジック:
//   1. 5 パターンを mg/日 昇順 (US → 地中海 → 日本 → ノルウェー → イヌイット) で
//      縦に並べる
//   2. ユーザーの daily 平均値の正しい位置に「あなたはここ」マーカーを inline 挿入
//   3. 超えたパターンには "✓"、次のパターンには「あと +N mg」を表示
//
// 1 日換算: 3 食 = 1 日 (lib/diet-patterns.ts の dailyAverageMg)
//
// **科学的注記**: 比較値は集団平均の代表値。個人差大。オンボーディングカードで
// プロキシ性を開示済みなので本コンポーネント内では強調しない設計。

import { Fragment } from "react";
import {
  DIET_PATTERNS,
  findPatternPosition,
  dailyAverageMg,
  type DietPattern,
} from "@/lib/diet-patterns";
// v0.4.13: WHO/AHA 公的推奨値の達成バッジを追加 (#17 対応)
import { evaluateAchievements } from "@/lib/recommendations";
// v0.4.16: 「全パターン超え」時の文言を中央集権 safety-notes から取得
import { SAFETY_NOTES } from "@/lib/safety-notes";

interface Props {
  totalEpaMg: number;
  totalDhaMg: number;
  /** 脂質計算可能だった食事数 (1 日換算分母に使う) */
  mealsWithData: number;
  /** lipidPct (%) — null なら表示できない */
  lipidPct: number | null;
}

function fmt(n: number): string {
  return n.toLocaleString("en-US"); // 14,000 のようにカンマ区切り
}

export function DietPatternComparison({
  totalEpaMg,
  totalDhaMg,
  mealsWithData,
  lipidPct,
}: Props) {
  const totalMg = totalEpaMg + totalDhaMg;
  const totalG = totalMg / 1000;
  const dailyAvgMg = Math.round(dailyAverageMg(totalMg, mealsWithData));
  const position = findPatternPosition(dailyAvgMg);
  // v0.4.13: WHO/AHA 達成度評価
  const achievements = evaluateAchievements(dailyAvgMg);

  // ガード: lipidPct が null なら「該当データなし」
  if (lipidPct === null || mealsWithData === 0) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 dark:border-slate-700 dark:bg-slate-900/50">
        <div className="text-base font-semibold text-slate-700 dark:text-slate-300">
          🌍 食習慣との比較
        </div>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          脂質計算可能なデータが無いため比較できません。魚介を含む食事をアップロードしてみましょう。
        </p>
      </section>
    );
  }

  // マーカーを挿入する位置 (DIET_PATTERNS 配列のインデックス基準):
  //   surpassedIdx = -1 (全未満) → リスト先頭の前にマーカー
  //   surpassedIdx = 0..3        → そのパターンの直後にマーカー
  //   surpassedIdx = 4 (全超え)  → リスト末尾の後にマーカー (= 全パターン後)
  const surpassedIdx = position.surpassed
    ? DIET_PATTERNS.findIndex((p) => p.id === position.surpassed!.id)
    : -1;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 dark:border-slate-700 dark:bg-slate-900/50">
      {/* ヘッダー: ユーザーの食事ステータス */}
      <header className="mb-4 border-b border-slate-200 pb-4 dark:border-slate-700">
        <div className="text-base font-semibold text-slate-700 dark:text-slate-300">
          🌍 食習慣との比較
        </div>
        <div className="mt-3 space-y-1">
          <div className="text-sm text-slate-700 dark:text-slate-300">
            あなたの食事の魚由来脂質割合:{" "}
            <strong className="text-slate-900 dark:text-slate-100">
              {Math.round(lipidPct)}%
            </strong>
          </div>
          <div className="text-sm text-slate-700 dark:text-slate-300">
            EPA+DHA 摂取量:{" "}
            <strong className="text-slate-900 dark:text-slate-100">
              {totalG.toFixed(2)} g
            </strong>
            <span className="ml-2 text-slate-500 dark:text-slate-400">
              （平均 {fmt(dailyAvgMg)} mg/日）
            </span>
          </div>
          {/* v0.4.13: WHO/AHA 公的推奨値の達成バッジ。lipidPct ratio より
              科学的根拠が強い anchor (絶対 mg/日) を併記する。 */}
          <div className="mt-3 flex flex-wrap gap-2">
            {achievements.map((a) => (
              <AchievementChip key={a.recommendation.id} achievement={a} />
            ))}
          </div>
        </div>
      </header>

      {/* パターンリスト + ユーザーマーカーを inline 挿入 */}
      <div className="space-y-2">
        {/* 全未満ケース: リスト先頭の前にマーカー */}
        {surpassedIdx === -1 && <UserMarker dailyAvgMg={dailyAvgMg} />}

        {DIET_PATTERNS.map((pattern, idx) => {
          const isSurpassed =
            position.surpassed !== null &&
            pattern.epaDhaMgPerDay <= position.surpassed.epaDhaMgPerDay;
          const isNext = position.next?.id === pattern.id;

          return (
            <Fragment key={pattern.id}>
              <PatternRow
                pattern={pattern}
                surpassed={isSurpassed}
                next={isNext}
                gapToNextMg={isNext ? position.gapToNextMg : null}
              />
              {idx === surpassedIdx && <UserMarker dailyAvgMg={dailyAvgMg} />}
            </Fragment>
          );
        })}
      </div>

      {/* フッター: 次の milestone callout */}
      {position.next && position.gapToNextMg !== null && (
        <p className="mt-4 rounded-lg bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:bg-sky-950/30 dark:text-sky-100">
          <strong>{position.next.name}</strong>まであと{" "}
          <strong>+{fmt(position.gapToNextMg)} mg/日</strong>。
          {gapHint(position.gapToNextMg)}
        </p>
      )}
      {/* v0.4.16: 称賛 (🏆) ではなく「ここから先は維持が大事」のスタンスへ書き換え。
          高摂取が必ずしも追加の健康上の利益にならない、サプリ高用量 + 抗凝固薬
          併用等の状況では注意が必要な点を反映 (lib/safety-notes.ts に文言集約)。 */}
      {position.next === null && (
        <p className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          <span aria-hidden className="mr-1">ℹ</span>
          {SAFETY_NOTES.HIGH_INTAKE_MAINTENANCE.body}
        </p>
      )}
    </section>
  );
}

function PatternRow({
  pattern,
  surpassed,
  next,
  gapToNextMg,
}: {
  pattern: DietPattern;
  surpassed: boolean;
  next: boolean;
  gapToNextMg: number | null;
}) {
  // F-026 (v0.8.10): historical=true (現状はイヌイット 14,000 mg/日) は
  // 達成目標ではなく歴史的アンカー。row 全体を opacity-60 + 細い grayscale 系
  // で他の現代的な比較値と階層を分け、「歴史的参考値」chip を name の脇に出す。
  const isHistorical = pattern.historical === true;

  const stateClass = isHistorical
    ? "bg-slate-50/60 border-slate-200 dark:bg-slate-900/20 dark:border-slate-800"
    : surpassed
      ? "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800/40"
      : next
        ? "bg-sky-50 border-sky-200 dark:bg-sky-950/20 dark:border-sky-800/40"
        : "bg-slate-50 border-slate-200 dark:bg-slate-900/30 dark:border-slate-700";

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${stateClass} ${isHistorical ? "opacity-70" : ""}`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={`text-sm font-medium ${isHistorical ? "text-slate-700 dark:text-slate-300" : "text-slate-900 dark:text-slate-100"}`}>
            {pattern.name}
          </span>
          {isHistorical && (
            <span className="inline-flex items-center rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-700 dark:text-slate-300">
              歴史的参考値
            </span>
          )}
          {!isHistorical && surpassed && (
            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
              ✓ 超えました
            </span>
          )}
          {!isHistorical && next && gapToNextMg !== null && (
            <span className="text-xs font-semibold text-sky-700 dark:text-sky-300">
              あと +{gapToNextMg.toLocaleString("en-US")} mg
            </span>
          )}
        </div>
        <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          {pattern.caption}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className={`text-sm font-semibold tabular-nums ${isHistorical ? "text-slate-600 dark:text-slate-400" : "text-slate-900 dark:text-slate-100"}`}>
          {pattern.epaDhaMgPerDay.toLocaleString("en-US")}
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400">mg/日</div>
      </div>
    </div>
  );
}

function UserMarker({ dailyAvgMg }: { dailyAvgMg: number }) {
  // F-025 (v0.8.8): 👉 emoji + dashed border は AI Slop pattern + list rhythm
  // を壊していた (周囲の PatternRow は solid border)。emoji を削除、border を
  // solid に揃え、左に bg-amber-400 の太いバーを置いて「ここ」を視覚的に強調する。
  // tag chip 「あなたはここ」も追加して情報性を担保。row height は他と同じ。
  return (
    <div className="my-1 flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 dark:border-amber-700/60 dark:bg-amber-950/30 relative">
      <span
        aria-hidden
        className="absolute left-0 top-2 bottom-2 w-1 rounded-r bg-amber-400 dark:bg-amber-500"
      />
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="inline-flex items-center rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900 dark:bg-amber-800/60 dark:text-amber-100">
            あなたはここ
          </span>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-sm font-bold tabular-nums text-amber-900 dark:text-amber-100">
          {dailyAvgMg.toLocaleString("en-US")}
        </div>
        <div className="text-xs text-amber-700 dark:text-amber-300">mg/日</div>
      </div>
    </div>
  );
}

/**
 * v0.4.13: WHO/AHA 推奨達成チップ。達成 = emerald + ✓、未達 = slate + 進捗 %。
 * description は title 属性 (tooltip) で表示、出典付きで読める。
 */
function AchievementChip({
  achievement,
}: {
  achievement: ReturnType<typeof evaluateAchievements>[number];
}) {
  const { recommendation, achieved, ratio } = achievement;
  const pct = Math.round(Math.min(ratio, 9.99) * 100);
  return (
    <span
      title={recommendation.description}
      className={
        achieved
          ? "inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800 dark:border-emerald-800/40 dark:bg-emerald-950/30 dark:text-emerald-200"
          : "inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400"
      }
    >
      <span aria-hidden>{achieved ? "✓" : "○"}</span>
      <span>{recommendation.label}</span>
      <span className="text-[10px] opacity-75">
        {recommendation.thresholdMgPerDay} mg/日
      </span>
      {!achieved && (
        <span className="text-[10px] opacity-75">({pct}%)</span>
      )}
    </span>
  );
}

/** "あと +X mg" の補足ヒント。具体的な食材を示唆して行動につなげる。 */
function gapHint(gapMg: number): string {
  if (gapMg < 200) return "サバ缶 1/4 ほどで届きます。";
  if (gapMg < 600) return "サバ缶 1 つ追加で届きます。";
  if (gapMg < 1500) return "サバ・サンマ 1 切れ追加で届く範囲です。";
  if (gapMg < 5000) return "魚を毎食含めると徐々に近づきます。";
  return "歴史的に極めて高い水準で、現代的な食事では到達困難です。";
}
