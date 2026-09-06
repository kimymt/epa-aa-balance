import { d1Query } from "@/lib/d1";
import { constantTimeStringEqual } from "@/lib/timing-safe";
export const runtime = "nodejs";
export const maxDuration = 45;

// Daily Vercel cron. Retain reservations for 2 days and legacy telemetry for 30.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !constantTimeStringEqual(req.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const now = Date.now();
    await d1Query("DELETE FROM rate_reservations WHERE created_at <= ?", [now - 2 * 86400000]);
    await d1Query("DELETE FROM request_log WHERE created_at <= ?", [now - 30 * 86400000]);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Cleanup failed" }, { status: 503 });
  }
}
