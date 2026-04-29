import { readFileSync } from "node:fs";
import path from "node:path";
import type { EAAKey } from "./standards";

export interface FoodEntry {
  name: string;
  aliases: string[];
  protein_g: number;
  eaa: Record<EAAKey, number>;
}

interface FoodsFile {
  foods: FoodEntry[];
}

let cache: FoodEntry[] | null = null;

function loadFoods(): FoodEntry[] {
  if (cache) return cache;
  const file = path.join(process.cwd(), "data", "foods.json");
  const raw = readFileSync(file, "utf8");
  const parsed: FoodsFile = JSON.parse(raw);
  cache = parsed.foods;
  return cache;
}

/**
 * 食材名から food entry を検索する。
 *
 * 優先順位:
 *   1. 完全一致（name または aliases）
 *   2. クエリが name または alias を部分文字列として含む（あるいは含まれる）
 *
 * 見つからなければ null を返す。
 */
export function lookupFood(query: string): FoodEntry | null {
  const foods = loadFoods();
  const q = query.trim().toLowerCase();
  if (!q) return null;

  // 1. exact match
  for (const f of foods) {
    if (f.name.toLowerCase() === q) return f;
    if (f.aliases.some((a) => a.toLowerCase() === q)) return f;
  }

  // 2. substring match (両方向)
  for (const f of foods) {
    const candidates = [f.name, ...f.aliases];
    for (const c of candidates) {
      const lower = c.toLowerCase();
      if (lower.includes(q) || q.includes(lower)) return f;
    }
  }

  return null;
}

export function listAllFoods(): FoodEntry[] {
  return loadFoods();
}
