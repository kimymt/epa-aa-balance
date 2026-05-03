import { NextResponse } from "next/server";
import { validateFeedbackBody } from "@/lib/feedback-validation";
// v0.4.2: D1 client を lib/d1.ts に抽出（rate-limit と共有）。
import { d1Query } from "@/lib/d1";
// v0.4.6: GET admin endpoint の token 比較を constant-time 化、
// brute-force 抑止のため rate limit も追加。
import { constantTimeStringEqual } from "@/lib/timing-safe";
import { checkRateLimit, getClientIp, hashIp, logRequest } from "@/lib/rate-limit";

export const runtime = "nodejs";

const ADMIN_GET_ENDPOINT = "/api/feedback-admin"; // request_log で POST と区別
// admin がダッシュボードを開く頻度には十分。token 32 文字ランダムなら brute-force 不可、
// 弱い token でも 30/h = 720/day に制限すれば計算的に総当たり困難。
const ADMIN_GET_RATE_LIMIT = Number(process.env.FEEDBACK_ADMIN_RATE_LIMIT ?? "30");
const ADMIN_GET_WINDOW_MS = 60 * 60 * 1000;

function isD1Configured(): boolean {
  return Boolean(
    process.env.CLOUDFLARE_ACCOUNT_ID &&
      process.env.CLOUDFLARE_D1_DATABASE_ID &&
      process.env.CLOUDFLARE_API_TOKEN
  );
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const validation = validateFeedbackBody(body);
    if (!validation.ok) {
      return NextResponse.json(
        { error: "リクエストの形式が不正です。" },
        { status: 400 }
      );
    }
    const { mealType, predictedFoods, accurate, correctedFoods, timestamp } =
      validation.body;

    const feedbackId = `feedback-${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 9)}`;

    await d1Query(
      // v0.3.0-beta: calculation_version=2 (lipid-based) を明示的にセット。
      // 過去 v0.2.0 レコードはマイグレーションで version=1 に backfill 済み。
      // 本コードがデプロイされた時点から、新規 feedback はすべて version=2。
      // (feature flag が OFF でも version=2 を記録する設計判断:
      //  「コードバージョン」を表すため、計算ロジックの flag とは独立。
      //  PR 3 で flag が ON になっても本ロジックは無変更で済む。)
      `INSERT INTO feedback (id, meal_type, predicted_foods, accurate, corrected_foods, timestamp, calculation_version)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        feedbackId,
        mealType,
        JSON.stringify(predictedFoods || []),
        accurate ? 1 : 0,
        correctedFoods ? JSON.stringify(correctedFoods) : null,
        timestamp || new Date().toISOString(),
        2,
      ]
    );

    return NextResponse.json({ ok: true, id: feedbackId });
  } catch (error) {
    console.error("Feedback error:", error);
    return NextResponse.json(
      { error: "フィードバックの保存に失敗しました。" },
      { status: 500 }
    );
  }
}

interface FeedbackRow {
  id: string;
  meal_type: string;
  predicted_foods: string;
  accurate: number;
  corrected_foods: string | null;
  timestamp: string;
  created_at: string;
  calculation_version: number;
}

/**
 * v0.3.8: GET /api/feedback supports optional ?version=1|2|all filter.
 * - 1: protein-based scoring (v0.2.0 records)
 * - 2: lipid-based scoring (v0.3.0+ records)
 * - all (default): include both
 *
 * Stats response includes byCalculationVersion breakdown so admin can
 * track v0.2.0 → v0.3.0 transition data quality.
 */
export async function GET(req: Request) {
  // v0.4.6: GET 全体に rate limit を適用（401 含む）。
  // 401 をログするので brute-force 試行が request_log で可視化できる。
  const ip = getClientIp(req);
  const ipHash = hashIp(ip);
  const rateLimitEnabled = isD1Configured();
  const logIfEnabled = (status: number): Promise<void> =>
    rateLimitEnabled
      ? logRequest({ endpoint: ADMIN_GET_ENDPOINT, ipHash, status })
      : Promise.resolve();

  if (rateLimitEnabled) {
    try {
      const rl = await checkRateLimit({
        endpoint: ADMIN_GET_ENDPOINT,
        ipHash,
        limit: ADMIN_GET_RATE_LIMIT,
        windowMs: ADMIN_GET_WINDOW_MS,
      });
      if (!rl.allowed) {
        await logIfEnabled(429);
        return NextResponse.json(
          { error: `リクエスト過多です。${rl.retryAfterSec} 秒後に再試行してください。` },
          {
            status: 429,
            headers: {
              "Retry-After": String(rl.retryAfterSec),
              "X-RateLimit-Limit": String(ADMIN_GET_RATE_LIMIT),
              "X-RateLimit-Remaining": "0",
            },
          }
        );
      }
    } catch (e) {
      console.warn("rate-limit check failed:", e instanceof Error ? e.message : e);
    }
  }

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    const versionFilter = url.searchParams.get("version") ?? "all"; // "1"|"2"|"all"

    // v0.4.6: タイミング攻撃対策で constant-time 比較。token 未設定 / env 未設定の
    // ガードは早期 return で OK（これらは攻撃者からは「常に」当てはまらないため
    // タイミング差で漏れる情報がない）。
    const expected = process.env.FEEDBACK_ADMIN_TOKEN;
    if (!token || !expected || !constantTimeStringEqual(token, expected)) {
      await logIfEnabled(401);
      return NextResponse.json(
        { error: "認証に失敗しました。" },
        { status: 401 }
      );
    }

    // SQL WHERE 句構築 (filter 値の whitelist で SQL injection 防止)
    let versionWhere = "";
    let versionParams: number[] = [];
    if (versionFilter === "1" || versionFilter === "2") {
      versionWhere = "WHERE calculation_version = ?";
      versionParams = [parseInt(versionFilter, 10)];
    }

    const statsResp = await d1Query<{
      total: number;
      accurate_count: number;
    }>(
      `SELECT COUNT(*) AS total, SUM(accurate) AS accurate_count FROM feedback ${versionWhere}`,
      versionParams
    );
    const stats = statsResp.result?.[0]?.results?.[0] ?? {
      total: 0,
      accurate_count: 0,
    };

    // Version breakdown は filter 適用前 (常に全体カウント表示)
    const byVersionResp = await d1Query<{
      calculation_version: number;
      cnt: number;
    }>(
      `SELECT calculation_version, COUNT(*) AS cnt FROM feedback GROUP BY calculation_version`
    );
    const byCalculationVersion: Record<string, number> = { "1": 0, "2": 0 };
    for (const row of byVersionResp.result?.[0]?.results ?? []) {
      byCalculationVersion[String(row.calculation_version)] = Number(row.cnt);
    }

    const byMealResp = await d1Query<{
      meal_type: string;
      accurate: number;
      cnt: number;
    }>(
      `SELECT meal_type, accurate, COUNT(*) AS cnt
       FROM feedback ${versionWhere}
       GROUP BY meal_type, accurate`,
      versionParams
    );
    const byMealRows = byMealResp.result?.[0]?.results ?? [];

    const byMealType: Record<string, { accurate: number; inaccurate: number }> =
      {};
    for (const row of byMealRows) {
      if (!byMealType[row.meal_type]) {
        byMealType[row.meal_type] = { accurate: 0, inaccurate: 0 };
      }
      if (row.accurate === 1) {
        byMealType[row.meal_type].accurate += row.cnt;
      } else {
        byMealType[row.meal_type].inaccurate += row.cnt;
      }
    }

    const recentResp = await d1Query<FeedbackRow>(
      `SELECT id, meal_type, predicted_foods, accurate, corrected_foods, timestamp, created_at, calculation_version
       FROM feedback ${versionWhere}
       ORDER BY created_at DESC
       LIMIT 20`,
      versionParams
    );
    const recent = (recentResp.result?.[0]?.results ?? []).map((r) => ({
      id: r.id,
      mealType: r.meal_type,
      predictedFoods: JSON.parse(r.predicted_foods),
      accurate: r.accurate === 1,
      correctedFoods: r.corrected_foods ? JSON.parse(r.corrected_foods) : null,
      timestamp: r.timestamp,
      createdAt: r.created_at,
      calculationVersion: r.calculation_version,
    }));

    const total = Number(stats.total) || 0;
    const accurateCount = Number(stats.accurate_count) || 0;
    const accuracyPercentage =
      total > 0 ? ((accurateCount / total) * 100).toFixed(1) : "N/A";

    await logIfEnabled(200);
    return NextResponse.json({
      filter: { version: versionFilter },
      stats: {
        totalFeedback: total,
        accurateFeedback: accurateCount,
        inaccurateFeedback: total - accurateCount,
        accuracyPercentage,
        byMealType,
        byCalculationVersion,
      },
      recentFeedback: recent,
    });
  } catch (error) {
    console.error("Feedback fetch error:", error);
    await logIfEnabled(500);
    return NextResponse.json(
      { error: "フィードバックの取得に失敗しました。" },
      { status: 500 }
    );
  }
}
