// migrate-d1.ts のロジックテスト
//
// fetch を mock して D1 REST API レスポンスを差し替え、PRAGMA 結果に応じた
// 適用判定の冪等性 (idempotency) を検証する。
//
// /plan-eng-review TODO 1: PR 2 のスコープ内で migrate-d1.test.ts を作る、と決定。

import { describe, it, expect, mock } from "bun:test";
import { D1Api, runMigrations, MIGRATIONS } from "./migrate-d1";

// Tests below scope to a single migration via [MIGRATIONS[0]] etc. so that
// adding new migrations doesn't break older test expectations.
const MIG_0003 = [MIGRATIONS[0]];

function makeMockFetch(responses: Array<{ matchSql: RegExp; result?: unknown[]; error?: { code: number; message: string } }>) {
  let callIndex = 0;
  const calls: Array<{ sql: string; params: unknown[] }> = [];

  const mockFetch: typeof fetch = async (_url, init) => {
    const body = JSON.parse(init!.body as string);
    calls.push(body);
    const matched = responses.find((r) => r.matchSql.test(body.sql));
    if (!matched) {
      throw new Error(`Mock fetch: no matching response for SQL: ${body.sql}`);
    }
    callIndex++;
    if (matched.error) {
      return new Response(
        JSON.stringify({ success: false, errors: [matched.error], result: [] }),
        { status: 200 }
      );
    }
    return new Response(
      JSON.stringify({
        success: true,
        errors: [],
        result: [{ results: matched.result ?? [], success: true }],
      }),
      { status: 200 }
    );
  };
  return { mockFetch, calls };
}

describe("D1Api", () => {
  it("tableInfo returns column list", async () => {
    const { mockFetch } = makeMockFetch([
      {
        matchSql: /PRAGMA table_info/,
        result: [
          { name: "id", type: "TEXT", notnull: 1, dflt_value: null, pk: 1 },
          { name: "meal_type", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
        ],
      },
    ]);
    const api = new D1Api("acct", "db", "token", mockFetch);
    const cols = await api.tableInfo("feedback");
    expect(cols.length).toBe(2);
    expect(cols[0].name).toBe("id");
  });

  it("query throws on D1 error response", async () => {
    const { mockFetch } = makeMockFetch([
      { matchSql: /SELECT/, error: { code: 7500, message: "table does not exist" } },
    ]);
    const api = new D1Api("acct", "db", "token", mockFetch);
    await expect(api.query("SELECT 1")).rejects.toThrow(/table does not exist/);
  });
});

describe("runMigrations - idempotency", () => {
  it("SKIPS migration when calculation_version column already exists", async () => {
    const { mockFetch, calls } = makeMockFetch([
      {
        matchSql: /PRAGMA table_info/,
        result: [
          { name: "id", type: "TEXT", notnull: 1, dflt_value: null, pk: 1 },
          { name: "calculation_version", type: "INTEGER", notnull: 1, dflt_value: "1", pk: 0 },
        ],
      },
    ]);
    const api = new D1Api("acct", "db", "token", mockFetch);
    const result = await runMigrations(api, MIG_0003);
    expect(result.skipped).toContain("0003_add_calculation_version.sql");
    expect(result.applied).toEqual([]);
    // PRAGMA だけ呼ばれて ALTER は呼ばれていないことを確認
    expect(calls.length).toBe(1);
    expect(calls[0].sql).toMatch(/PRAGMA/);
  });

  it("APPLIES migration when calculation_version column does NOT exist", async () => {
    const { mockFetch, calls } = makeMockFetch([
      {
        matchSql: /PRAGMA table_info/,
        result: [
          { name: "id", type: "TEXT", notnull: 1, dflt_value: null, pk: 1 },
          // calculation_version 列なし
        ],
      },
      { matchSql: /ALTER TABLE/, result: [] },
      { matchSql: /UPDATE feedback/, result: [] },
    ]);
    const api = new D1Api("acct", "db", "token", mockFetch);
    const result = await runMigrations(api, MIG_0003);
    expect(result.applied).toContain("0003_add_calculation_version.sql");
    expect(result.skipped).toEqual([]);
    // PRAGMA + ALTER + UPDATE の 3 回呼ばれる
    expect(calls.length).toBe(3);
    expect(calls[0].sql).toMatch(/PRAGMA/);
    expect(calls[1].sql).toMatch(/ALTER TABLE feedback/);
    expect(calls[2].sql).toMatch(/UPDATE feedback/);
  });

  it("propagates D1 errors during ALTER", async () => {
    const { mockFetch } = makeMockFetch([
      {
        matchSql: /PRAGMA table_info/,
        result: [{ name: "id", type: "TEXT", notnull: 1, dflt_value: null, pk: 1 }],
      },
      { matchSql: /ALTER TABLE/, error: { code: 1, message: "syntax error" } },
    ]);
    const api = new D1Api("acct", "db", "token", mockFetch);
    await expect(runMigrations(api, MIG_0003)).rejects.toThrow(/syntax error/);
  });

  it("propagates D1 errors during PRAGMA (network failure simulated)", async () => {
    const { mockFetch } = makeMockFetch([
      { matchSql: /PRAGMA/, error: { code: 503, message: "service unavailable" } },
    ]);
    const api = new D1Api("acct", "db", "token", mockFetch);
    await expect(runMigrations(api, MIG_0003)).rejects.toThrow(/service unavailable/);
  });
});
