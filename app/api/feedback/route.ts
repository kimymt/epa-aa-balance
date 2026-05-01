import { NextResponse } from "next/server";
import { validateFeedbackBody } from "@/lib/feedback-validation";

export const runtime = "nodejs";

const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CF_D1_DATABASE_ID = process.env.CLOUDFLARE_D1_DATABASE_ID;
const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

interface D1Response<T = unknown> {
  result?: Array<{
    results: T[];
    success: boolean;
    meta: Record<string, unknown>;
  }>;
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  messages: unknown[];
}

async function d1Query<T = unknown>(
  sql: string,
  params: (string | number | null)[] = []
): Promise<D1Response<T>> {
  if (!CF_ACCOUNT_ID || !CF_D1_DATABASE_ID || !CF_API_TOKEN) {
    throw new Error(
      "Cloudflare D1 environment variables are not configured."
    );
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${CF_D1_DATABASE_ID}/query`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CF_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sql, params }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`D1 query failed (${response.status}): ${text}`);
  }

  return response.json();
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
      `INSERT INTO feedback (id, meal_type, predicted_foods, accurate, corrected_foods, timestamp)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        feedbackId,
        mealType,
        JSON.stringify(predictedFoods || []),
        accurate ? 1 : 0,
        correctedFoods ? JSON.stringify(correctedFoods) : null,
        timestamp || new Date().toISOString(),
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
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");

    if (!token || token !== process.env.FEEDBACK_ADMIN_TOKEN) {
      return NextResponse.json(
        { error: "認証に失敗しました。" },
        { status: 401 }
      );
    }

    const statsResp = await d1Query<{
      total: number;
      accurate_count: number;
    }>(
      `SELECT COUNT(*) AS total, SUM(accurate) AS accurate_count FROM feedback`
    );
    const stats = statsResp.result?.[0]?.results?.[0] ?? {
      total: 0,
      accurate_count: 0,
    };

    const byMealResp = await d1Query<{
      meal_type: string;
      accurate: number;
      cnt: number;
    }>(
      `SELECT meal_type, accurate, COUNT(*) AS cnt
       FROM feedback
       GROUP BY meal_type, accurate`
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
      `SELECT id, meal_type, predicted_foods, accurate, corrected_foods, timestamp, created_at
       FROM feedback
       ORDER BY created_at DESC
       LIMIT 20`
    );
    const recent = (recentResp.result?.[0]?.results ?? []).map((r) => ({
      id: r.id,
      mealType: r.meal_type,
      predictedFoods: JSON.parse(r.predicted_foods),
      accurate: r.accurate === 1,
      correctedFoods: r.corrected_foods ? JSON.parse(r.corrected_foods) : null,
      timestamp: r.timestamp,
      createdAt: r.created_at,
    }));

    const total = Number(stats.total) || 0;
    const accurateCount = Number(stats.accurate_count) || 0;
    const accuracyPercentage =
      total > 0 ? ((accurateCount / total) * 100).toFixed(1) : "N/A";

    return NextResponse.json({
      stats: {
        totalFeedback: total,
        accurateFeedback: accurateCount,
        inaccurateFeedback: total - accurateCount,
        accuracyPercentage,
        byMealType,
      },
      recentFeedback: recent,
    });
  } catch (error) {
    console.error("Feedback fetch error:", error);
    return NextResponse.json(
      { error: "フィードバックの取得に失敗しました。" },
      { status: 500 }
    );
  }
}
