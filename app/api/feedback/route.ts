import { NextResponse } from "next/server";
import { validateFeedbackBody, safeStoredFoods } from "@/lib/feedback-validation";
// v0.4.2: D1 client を lib/d1.ts に抽出（rate-limit と共有）。
import { d1Query } from "@/lib/d1";
// v0.4.6: GET admin endpoint の token 比較を constant-time 化、
// brute-force 抑止のため rate limit も追加。
import { constantTimeStringEqual } from "@/lib/timing-safe";
import { enforceRateLimit } from "@/lib/rate-limit";
import { readLimitedJson, bodyErrorResponse } from "@/lib/request-body";
import { verifyFeedbackReceipt } from "@/lib/feedback-receipt";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const denied = await enforceRateLimit(req, { endpoint: "/api/feedback", limit: 30, globalLimit: 200, burstLimit: 30 });
  if (denied) return denied;
  let body: unknown;
  try { body = await readLimitedJson(req, 16384); } catch (error) { return bodyErrorResponse(error); }
  try {
    const validation = validateFeedbackBody(body);
    if (!validation.ok) {
      return NextResponse.json(
        { error: "リクエストの形式が不正です。" },
        { status: 400 }
      );
    }
    const { mealType, predictedFoods, accurate, correctedFoods, timestamp } =
      validation.body;

    const feedbackId = verifyFeedbackReceipt((body as Record<string, unknown>).feedbackToken, mealType, predictedFoods);
    if (!feedbackId) return NextResponse.json({ error: "解析結果の有効期限が切れているか、不正です。再度解析してください。" }, { status: 403 });

    const inserted = await d1Query<{ id: string }>(
      // v0.3.0-beta: calculation_version=2 (lipid-based) を明示的にセット。
      // 過去 v0.2.0 レコードはマイグレーションで version=1 に backfill 済み。
      // 本コードがデプロイされた時点から、新規 feedback はすべて version=2。
      // (feature flag が OFF でも version=2 を記録する設計判断:
      //  「コードバージョン」を表すため、計算ロジックの flag とは独立。
      //  PR 3 で flag が ON になっても本ロジックは無変更で済む。)
      `INSERT INTO feedback (id, meal_type, predicted_foods, accurate, corrected_foods, timestamp, calculation_version)
       VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING RETURNING id`,
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

    if (!inserted.result![0].results.length) return NextResponse.json({ error: "この解析結果には既に回答済みです。" }, { status: 409 });
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
  const denied = await enforceRateLimit(req, {
    endpoint: "/api/feedback-admin", limit: Number(process.env.FEEDBACK_ADMIN_RATE_LIMIT ?? "30"), globalLimit: 100, burstLimit: 20,
  });
  if (denied) return denied;
  try {
    const url = new URL(req.url);
    // URL credentials are deliberately unsupported.
    const authorization = req.headers.get("authorization");
    const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
    const versionFilter = url.searchParams.get("version") ?? "all"; // "1"|"2"|"all"

    // v0.4.6: タイミング攻撃対策で constant-time 比較。token 未設定 / env 未設定の
    // ガードは早期 return で OK（これらは攻撃者からは「常に」当てはまらないため
    // タイミング差で漏れる情報がない）。
    const expected = process.env.FEEDBACK_ADMIN_TOKEN;
    if (!token || !expected || !constantTimeStringEqual(token, expected)) {

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
      predictedFoods: safeStoredFoods(r.predicted_foods),
      accurate: r.accurate === 1,
      correctedFoods: safeStoredFoods(r.corrected_foods, true),
      timestamp: r.timestamp,
      createdAt: r.created_at,
      calculationVersion: r.calculation_version,
    }));

    const total = Number(stats.total) || 0;
    const accurateCount = Number(stats.accurate_count) || 0;
    const accuracyPercentage =
      total > 0 ? ((accurateCount / total) * 100).toFixed(1) : "N/A";

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
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Feedback fetch error:", error);

    return NextResponse.json(
      { error: "フィードバックの取得に失敗しました。" },
      { status: 500 }
    );
  }
}
