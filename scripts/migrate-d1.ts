#!/usr/bin/env bun
// D1 マイグレーションランナー (REST API ベース、Cloudflare Workers binding 不使用)
//
// 既存の app/api/feedback/route.ts と同じ Cloudflare REST API パターンで動く。
// wrangler CLI は使わない (理由: 既存コードベースに wrangler 依存がないため、
// 認証セットアップ手順を増やしたくない)。
//
// 冪等性 (idempotent): 各マイグレーションは ALTER TABLE / CREATE TABLE 等の
// schema 変更を含むが、PRAGMA table_info() で列存在を事前確認し、既に
// 適用済みならスキップする。何度実行しても安全。
//
// 使い方:
//   CLOUDFLARE_ACCOUNT_ID=xxx \
//   CLOUDFLARE_D1_DATABASE_ID=yyy \
//   CLOUDFLARE_API_TOKEN=zzz \
//   bun run scripts/migrate-d1.ts
//
// または環境変数を .env.local に設定して:
//   bun --env-file=.env.local run scripts/migrate-d1.ts

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const MIGRATIONS_DIR = path.join(process.cwd(), "migrations");

// 各マイグレーションは「適用判定 (predicate)」と「実行 SQL」のペア。
// predicate が true を返したらスキップ、false なら実行。
interface Migration {
  file: string;
  /** 適用済みか判定する。true なら skip。 */
  isAlreadyApplied: (api: D1Api) => Promise<boolean>;
}

export const MIGRATIONS: Migration[] = [
  {
    file: "0003_add_calculation_version.sql",
    isAlreadyApplied: async (api) => {
      const cols = await api.tableInfo("feedback");
      return cols.some((c) => c.name === "calculation_version");
    },
  },
  {
    // v0.4.2: rate limit / telemetry 用の request_log テーブル作成。
    // テーブル存在で適用判定（CREATE TABLE IF NOT EXISTS なので二重実行も
    // 安全だが、明示的に skip して APPLY ログを綺麗に保つ）。
    file: "0004_add_request_log.sql",
    isAlreadyApplied: async (api) => {
      const cols = await api.tableInfo("request_log");
      return cols.length > 0;
    },
  },
  {
    // v0.8.1: Anonymous user + Passkey credential + 暗号化履歴の基盤。
    // 4 つの新規テーブル (users, user_credentials, analyses, coach_proposals)。
    // users テーブルの存在で適用判定。
    file: "0005_add_users_credentials_history.sql",
    isAlreadyApplied: async (api) => {
      const cols = await api.tableInfo("users");
      return cols.length > 0;
    },
  },
];

// ---------- D1 REST API client (app/api/feedback/route.ts と同じ pattern) ----------

interface D1QueryResponse<T = unknown> {
  result?: Array<{ results: T[]; success: boolean }>;
  success: boolean;
  errors: Array<{ code: number; message: string }>;
}

export interface ColumnInfo {
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

export class D1Api {
  constructor(
    private accountId: string,
    private databaseId: string,
    private apiToken: string,
    private fetchImpl: typeof fetch = fetch
  ) {}

  async query<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
    const url = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/d1/database/${this.databaseId}/query`;
    const response = await this.fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sql, params }),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`D1 query failed (${response.status}): ${text}`);
    }
    const data = (await response.json()) as D1QueryResponse<T>;
    if (!data.success) {
      const msgs = data.errors.map((e) => e.message).join("; ");
      throw new Error(`D1 returned error: ${msgs}`);
    }
    return data.result?.[0]?.results ?? [];
  }

  async tableInfo(table: string): Promise<ColumnInfo[]> {
    return this.query<ColumnInfo>(`PRAGMA table_info(${table})`);
  }
}

// ---------- Migration runner ----------

interface RunResult {
  applied: string[];
  skipped: string[];
}

export async function runMigrations(api: D1Api, migrations: Migration[] = MIGRATIONS): Promise<RunResult> {
  const applied: string[] = [];
  const skipped: string[] = [];

  for (const mig of migrations) {
    if (await mig.isAlreadyApplied(api)) {
      console.log(`SKIP  ${mig.file} (already applied)`);
      skipped.push(mig.file);
      continue;
    }
    const sql = readFileSync(path.join(MIGRATIONS_DIR, mig.file), "utf8");
    // SQL ファイルを文 (statements) に分割して 1 文ずつ送る。
    // 各 chunk からコメント行 (-- で始まる行) を除いてから空判定する。
    const statements = sql
      .split(";")
      .map((chunk) => chunk
        .split("\n")
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n")
        .trim()
      )
      .filter((s) => s.length > 0);
    console.log(`APPLY ${mig.file} (${statements.length} statements)`);
    for (const stmt of statements) {
      await api.query(stmt);
    }
    applied.push(mig.file);
  }

  return { applied, skipped };
}

// ---------- CLI entrypoint ----------

async function main() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;

  if (!accountId || !databaseId || !apiToken) {
    console.error("ERROR: missing Cloudflare credentials in env vars.");
    console.error("  Required: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID, CLOUDFLARE_API_TOKEN");
    process.exit(1);
  }

  const api = new D1Api(accountId, databaseId, apiToken);
  console.log(`Found ${MIGRATIONS.length} migration(s) in ${MIGRATIONS_DIR}`);

  try {
    const result = await runMigrations(api);
    console.log(`\nDone. Applied: ${result.applied.length}, Skipped: ${result.skipped.length}`);
  } catch (e) {
    console.error("MIGRATION FAILED:", e instanceof Error ? e.message : e);
    process.exit(1);
  }
}

// Run main() only when invoked directly (not when imported by tests).
// `import.meta.main` is a Bun-specific extension; cast for TS.
if ((import.meta as { main?: boolean }).main) {
  main();
}
