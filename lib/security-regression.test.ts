import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { reserveRateLimit, enforceRateLimit } from "./rate-limit";
import { d1Query } from "./d1";
import { validateCoachBody, buildPrompt } from "./coach";
import { validateFeedbackBody, safeStoredFoods } from "./feedback-validation";
import { createFeedbackReceipt, verifyFeedbackReceipt } from "./feedback-receipt";
import { readLimitedBody, readLimitedJson } from "./request-body";
import { POST as postFeedback, GET as getFeedback } from "../app/api/feedback/route";
import { POST as analyze } from "../app/api/analyze/route";
import { POST as coach } from "../app/api/coach/route";
import { GET as maintenance } from "../app/api/maintenance/route";

const originalFetch = globalThis.fetch;
const keys = ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_D1_DATABASE_ID", "CLOUDFLARE_API_TOKEN", "FEEDBACK_SIGNING_SECRET", "FEEDBACK_ADMIN_TOKEN", "CRON_SECRET", "GEMINI_API_KEY"];
let saved: Array<string | undefined>;
let db: Database;
let requests: Array<{ sql: string; params: (string | number | null)[] }>;
beforeEach(() => {
  saved = keys.map((k) => process.env[k]);
  keys.forEach((k) => { process.env[k] = "test-secret-".repeat(4); });
  db = new Database(":memory:");
  db.exec("CREATE TABLE request_log (id INTEGER PRIMARY KEY, created_at INTEGER)");
  db.exec(readFileSync("migrations/0008_security_admission.sql", "utf8"));
  db.exec("CREATE TABLE feedback (id TEXT PRIMARY KEY, meal_type TEXT, predicted_foods TEXT, accurate INTEGER, corrected_foods TEXT, timestamp TEXT, calculation_version INTEGER, created_at TEXT DEFAULT CURRENT_TIMESTAMP)");
  requests = [];
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    const query = JSON.parse(init?.body as string);
    requests.push(query);
    const results = db.query(query.sql).all(...query.params);
    return Response.json({ success: true, result: [{ success: true, results, meta: {} }], errors: [], messages: [] });
  }) as unknown as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  keys.forEach((k, i) => { if (saved[i] === undefined) delete process.env[k]; else process.env[k] = saved[i]; });
  db.close();
});
const policy = { endpoint: "/test", limit: 10, globalLimit: 100, burstLimit: 100 };
function req(body: unknown, ip = "203.0.113.1") {
  return new Request("https://example.test/api/feedback", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(body) });
}
const foods = [{ name: "サケ", grams: 100 }];
function feedback() { return { mealType: "dinner", accurate: true, predictedFoods: foods, feedbackToken: createFeedbackReceipt("dinner", foods) }; }

describe("atomic admission against real SQLite SQL", () => {
  test("20 overlapping reservations allow exactly 10; denials add no rows", async () => {
    const results = await Promise.all(Array.from({ length: 20 }, () => reserveRateLimit(policy, "same", 10000000)));
    expect(results.filter(Boolean)).toHaveLength(10);
    expect(db.query("SELECT COUNT(*) AS n FROM rate_reservations").get()).toEqual({ n: 10 });
  });
  test("global budgets cannot be bypassed by changing IP; image costs are weighted", async () => {
    const p = { ...policy, units: 9, globalLimit: 18, burstLimit: 100 };
    expect(await reserveRateLimit(p, "a", 10000000)).toBe(true);
    expect(await reserveRateLimit(p, "b", 10000000)).toBe(true);
    expect(await reserveRateLimit(p, "c", 10000000)).toBe(false);
    expect(await reserveRateLimit(p, "c", 10000000 + 3600000)).toBe(true);
  });
  test("burst expires at 60s independently of hourly cap", async () => {
    const p = { ...policy, burstLimit: 1 };
    expect(await reserveRateLimit(p, "a", 10000000)).toBe(true);
    expect(await reserveRateLimit(p, "b", 10000001)).toBe(false);
    expect(await reserveRateLimit(p, "b", 10060000)).toBe(true);
  });
  test("malformed limit config fails closed", async () => {
    expect((await enforceRateLimit(req({}), { ...policy, limit: NaN }))?.status).toBe(503);
  });
  test("missing D1 config blocks both AI routes before any upstream work", async () => {
    delete process.env.CLOUDFLARE_API_TOKEN;
    expect((await analyze(req({}))).status).toBe(503);
    expect((await coach(req({}))).status).toBe(503);
    expect(requests).toHaveLength(0);
  });
  test("HTTP 200 with D1 SQL errors fails closed", async () => {
    globalThis.fetch = (async () => Response.json({ success: false, errors: [{ code: 1 }], result: [] })) as unknown as typeof fetch;
    expect((await enforceRateLimit(req({}), policy))?.status).toBe(503);
  });
  test("nested D1 failure and missing result are rejected", async () => {
    for (const data of [{ success: true, result: [] }, { success: true, result: [{ success: false, results: [] }] }]) {
      globalThis.fetch = (async () => Response.json(data)) as unknown as typeof fetch;
      await expect(d1Query("SELECT 1")).rejects.toThrow();
    }
  });
});

describe("bounded untrusted input", () => {
  test("rejects huge food names, too many foods and non-finite quantities", () => {
    const body = { aggregate: { epaMg: 0, dhaMg: 0, aaMg: 0, lipidPct: null }, recentFoods: foods };
    expect(validateCoachBody(body).ok).toBe(true);
    expect(buildPrompt(body).length).toBeLessThan(10000);
    expect(validateCoachBody({ ...body, recentFoods: [{ name: "a".repeat(1000000), grams: 1 }] }).ok).toBe(false);
    expect(validateCoachBody({ ...body, recentFoods: Array(181).fill(foods[0]) }).ok).toBe(false);
    expect(validateCoachBody({ ...body, aggregate: { ...body.aggregate, epaMg: Infinity } }).ok).toBe(false);
  });
  test("rejects chunked oversize body without Content-Length and cancels reader", async () => {
    let canceled = false;
    const stream = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(8)); c.enqueue(new Uint8Array(8)); }, cancel() { canceled = true; } });
    const request = new Request("https://example.test", { method: "POST", body: stream, duplex: "half" } as RequestInit);
    await expect(readLimitedBody(request, 10)).rejects.toMatchObject({ status: 413 });
    expect(canceled).toBe(true);
  });
  test("rejects lying Content-Length and accepts valid JSON", async () => {
    const request = new Request("https://example.test", { method: "POST", headers: { "content-length": "1" }, body: "a".repeat(30) });
    await expect(readLimitedBody(request, 10)).rejects.toMatchObject({ status: 413 });
    expect(await readLimitedJson(req({ hello: "world" }))).toEqual({ hello: "world" });
  });
  test("malformed feedback and legacy stored shapes cannot reach array rendering", () => {
    expect(validateFeedbackBody({ ...feedback(), correctedFoods: { length: 1 } }).ok).toBe(false);
    expect(validateFeedbackBody({ ...feedback(), predictedFoods: { length: 1 } }).ok).toBe(false);
    for (const value of ["{", "null", "{}", '{"length":1}', '[{}]']) {
      expect(safeStoredFoods(value)).toEqual([]);
      expect(safeStoredFoods(value, true)).toEqual([]);
    }
  });
});

describe("feedback authenticity and admin protection", () => {
  test("successful image analysis issues a receipt accepted by feedback API", async () => {
    const d1Fetch = globalThis.fetch;
    globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
      if (String(url).includes("generativelanguage.googleapis.com")) {
        return Response.json({ candidates: [{ content: { role: "model", parts: [{ text: JSON.stringify(foods) }] }, finishReason: "STOP" }] });
      }
      return d1Fetch(url as string, init);
    }) as unknown as typeof fetch;
    const form = new FormData();
    form.append("photo", new Blob([new Uint8Array([255, 216, 255])], { type: "image/jpeg" }), "test.jpg");
    form.append("mealType", "dinner");
    const response = await analyze(new Request("https://example.test/api/analyze", { method: "POST", body: form }));
    expect(response.status).toBe(200);
    const meal = (await response.json()).result.meals[0];
    expect(typeof meal.feedbackToken).toBe("string");
    expect((await postFeedback(req({ mealType: meal.mealType, predictedFoods: meal.foods, feedbackToken: meal.feedbackToken, accurate: true }))).status).toBe(200);
  });

  test("receipt binds foods and meal, rejects tampering and expiry", () => {
    const token = createFeedbackReceipt("dinner", foods, 10000000);
    expect(verifyFeedbackReceipt(token, "dinner", foods, 10000000)).toStartWith("feedback-");
    expect(verifyFeedbackReceipt(token + "x", "dinner", foods, 10000000)).toBeNull();
    expect(verifyFeedbackReceipt(token, "lunch", foods, 10000000)).toBeNull();
    expect(verifyFeedbackReceipt(token, "dinner", [], 10000000)).toBeNull();
    expect(verifyFeedbackReceipt(token, "dinner", foods, 13600000)).toBeNull();
  });
  test("one signed analysis accepts one concurrent submission", async () => {
    const body = feedback();
    const responses = await Promise.all([postFeedback(req(body)), postFeedback(req(body))]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(db.query("SELECT COUNT(*) AS n FROM feedback").get()).toEqual({ n: 1 });
  });
  test("unsigned and malformed submissions never insert feedback", async () => {
    expect((await postFeedback(req({ mealType: "dinner", accurate: true, predictedFoods: foods }))).status).toBe(403);
    expect((await postFeedback(req({ ...feedback(), correctedFoods: {} }))).status).toBe(400);
    expect(db.query("SELECT COUNT(*) AS n FROM feedback").get()).toEqual({ n: 0 });
  });
  test("URL token is rejected; bearer works and legacy invalid JSON is sanitized", async () => {
    expect((await getFeedback(new Request("https://example.test/api/feedback?token=" + process.env.FEEDBACK_ADMIN_TOKEN))).status).toBe(401);
    db.exec("INSERT INTO feedback VALUES ('old', 'dinner', '{', 1, '{}', '', 2, CURRENT_TIMESTAMP)");
    const response = await getFeedback(new Request("https://example.test/api/feedback", { headers: { authorization: "Bearer " + process.env.FEEDBACK_ADMIN_TOKEN } }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.json()).recentFeedback[0].predictedFoods).toEqual([]);
  });
  test("maintenance requires secret and deletes only expired rows", async () => {
    const now = Date.now();
    db.query("INSERT INTO request_log VALUES (1, ?), (2, ?)").run(now - 31 * 86400000, now);
    await reserveRateLimit(policy, "old", now - 3 * 86400000);
    await reserveRateLimit(policy, "new", now);
    expect((await maintenance(new Request("https://example.test/api/maintenance"))).status).toBe(401);
    expect((await maintenance(new Request("https://example.test/api/maintenance", { headers: { authorization: "Bearer " + process.env.CRON_SECRET } }))).status).toBe(200);
    expect(db.query("SELECT COUNT(*) AS n FROM rate_reservations").get()).toEqual({ n: 1 });
    expect(db.query("SELECT COUNT(*) AS n FROM request_log").get()).toEqual({ n: 1 });
  });
});
