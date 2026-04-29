import { readFileSync } from "node:fs";
import path from "node:path";
import type { EAAKey } from "./standards";

export interface FoodEntry {
  name: string;
  aliases: string[];
  protein_g: number;
  eaa: Record<EAAKey, number>;
}

export interface CategoryFallback {
  category: string;
  matchers: string[];
  protein_g: number;
  eaa: Record<EAAKey, number>;
}

export interface LookupResult {
  entry: FoodEntry;
  /** カテゴリfallbackがヒットした場合 true（具体食材ではなくカテゴリ平均値） */
  isFallback: boolean;
}

interface FoodsFile {
  foods: FoodEntry[];
  category_fallbacks?: CategoryFallback[];
}

let cache: FoodsFile | null = null;

function loadFoods(): FoodsFile {
  if (cache) return cache;
  const file = path.join(process.cwd(), "data", "foods.json");
  const raw = readFileSync(file, "utf8");
  cache = JSON.parse(raw) as FoodsFile;
  return cache;
}

/**
 * 食材名から食品エントリを検索する。
 *
 * 優先順位:
 *   1. 完全一致（name または aliases）
 *   2. 双方向の部分文字列一致（クエリ ↔ name/alias）
 *   3. category_fallbacks から matchers の双方向部分文字列一致でカテゴリ平均値を返す
 *      （isFallback: true）
 *
 * いずれにもヒットしなければ null。
 */
export function lookupFood(query: string): LookupResult | null {
  const data = loadFoods();
  const q = query.trim().toLowerCase();
  if (!q) return null;

  // 1. exact match
  for (const f of data.foods) {
    if (f.name.toLowerCase() === q) return { entry: f, isFallback: false };
    if (f.aliases.some((a) => a.toLowerCase() === q))
      return { entry: f, isFallback: false };
  }

  // 2. substring match (両方向)
  for (const f of data.foods) {
    const candidates = [f.name, ...f.aliases];
    for (const c of candidates) {
      const lower = c.toLowerCase();
      if (lower.includes(q) || q.includes(lower)) {
        return { entry: f, isFallback: false };
      }
    }
  }

  // 3. category fallback
  for (const fb of data.category_fallbacks ?? []) {
    for (const matcher of fb.matchers) {
      const lower = matcher.toLowerCase();
      if (lower.includes(q) || q.includes(lower)) {
        return {
          entry: {
            name: fb.category,
            aliases: fb.matchers,
            protein_g: fb.protein_g,
            eaa: fb.eaa,
          },
          isFallback: true,
        };
      }
    }
  }

  return null;
}

export function listAllFoods(): FoodEntry[] {
  return loadFoods().foods;
}
