import { readFileSync } from "node:fs";
import path from "node:path";
import type { ProteinCategory } from "./standards";

export interface FoodEntry {
  name: string;
  aliases: string[];
  protein_g: number;
  category: ProteinCategory;
  /**
   * 脂肪酸成分 (per 100g、MEXT 食品成分表 脂肪酸成分表編 2020 由来)。
   * v0.3.0-alpha 追加。null は「データなし」(MEXT で「—」「Tr 以外の空欄」表記)。
   * MEXT で「Tr」(検出限界以下) 表記は 0 mg として保存（栄養学慣習に従う）。
   */
  epa_mg?: number | null;
  dha_mg?: number | null;
  aa_mg?: number | null;
  /** 総脂質量 (g/100g、参考用)。MEXT の「脂質」(FAT-) 列由来。 */
  total_lipid_g?: number | null;
}

export interface CategoryFallback {
  category_name: string;
  matchers: string[];
  protein_g: number;
  category: ProteinCategory;
  // 脂肪酸データはカテゴリ平均では不正確になるため fallback には含めない。
  // lookupFood が fallback を返した場合、計算側で lipid 値は null として扱う。
}

export interface LookupResult {
  entry: FoodEntry;
  /** category_fallbacks がヒットした場合 true（具体食材ではなくカテゴリ平均値） */
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
 * テスト専用：モジュールレベルキャッシュを reset する。
 * テストが食材データを mock したい場合（例: lipid-scoring.test.ts）に
 * `beforeEach(__resetCache)` で使う。本番コードからは呼ばないこと。
 */
export function __resetCache(): void {
  cache = null;
}

/**
 * 食材名から食品エントリを検索する。
 *
 * 優先順位:
 *   1. 完全一致（name または aliases）
 *   2. 双方向の部分文字列一致
 *   3. category_fallbacks の matchers との部分文字列一致（isFallback: true）
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
            name: fb.category_name,
            aliases: fb.matchers,
            protein_g: fb.protein_g,
            category: fb.category,
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
