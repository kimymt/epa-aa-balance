// data/foods.json schema 検証テスト (v0.3.0-alpha)
//
// 全 57 食材に脂肪酸フィールド (epa_mg, dha_mg, aa_mg, total_lipid_g) が
// 「定義済み or null」であることを保証。number でも null でも OK だが、
// undefined はバグ（マッピング忘れ）なので fail させる。
//
// MEXT 食品成分表 脂肪酸成分表編 2020 にデータが無い食材は明示的に null とする。
// 既知の null 食材は KNOWN_NULL_FOODS で許容、それ以外は number 必須。

import { describe, it, expect } from "bun:test";
import { listAllFoods, __resetCache } from "../lib/food-db";

// MEXT 食品成分表 脂肪酸成分表編 2020 にデータが無い食材
// (商業サプリ、漬物の一部、MEXT で「—」記号のもの等)
const KNOWN_NULL_FOODS = new Set([
  "ホエイプロテイン",   // 市販品、MEXT 外
  "たくあん",           // MEXT 脂肪酸成分表に未収録
  "玄米（炊飯後）",     // MEXT で全 脂肪酸 「—」記号
  "アーモンド",         // MEXT で EPA/DHA/AA すべて 「—」記号
  "豆腐（木綿）",       // MEXT で「—」
  "豆腐の味噌汁",       // 木綿豆腐 reference を使用、同じく null
  "そば（ゆで）",       // MEXT で「—」(そば row 172)
]);

// EPA/DHA/AA いずれか null を許容する食材（部分 null）
const PARTIAL_NULL_OK = new Set([
  "チーズ（プロセス）", // EPA/DHA null、AA は 0
  "味噌",               // EPA/AA null、DHA は 0
  "味噌汁",             // 味噌 reference
  "ほうれん草", "トマト", "玉ねぎ", "きゅうり", "なす", "大根", // 一部野菜の DHA が null
  "アボカド",           // EPA/DHA null
]);

describe("data/foods.json schema (v0.3.0-alpha)", () => {
  // モジュールキャッシュをクリアして fresh load を保証
  __resetCache();
  const foods = listAllFoods();

  it("contains exactly 57 foods", () => {
    expect(foods.length).toBe(57);
  });

  it("each food has the required base fields", () => {
    for (const f of foods) {
      expect(f.name, `${f.name}: missing name`).toBeTruthy();
      expect(Array.isArray(f.aliases), `${f.name}: aliases not array`).toBe(true);
      expect(typeof f.protein_g, `${f.name}: protein_g not number`).toBe("number");
      expect(f.category, `${f.name}: missing category`).toBeTruthy();
    }
  });

  it("each food has lipid fields defined (number or null, never undefined)", () => {
    for (const f of foods) {
      // undefined は許さない (マッピング忘れ防止)
      expect(f.epa_mg, `${f.name}: epa_mg undefined`).not.toBeUndefined();
      expect(f.dha_mg, `${f.name}: dha_mg undefined`).not.toBeUndefined();
      expect(f.aa_mg, `${f.name}: aa_mg undefined`).not.toBeUndefined();
      expect(f.total_lipid_g, `${f.name}: total_lipid_g undefined`).not.toBeUndefined();
    }
  });

  it("non-null lipid values are non-negative numbers", () => {
    for (const f of foods) {
      for (const [field, value] of Object.entries({
        epa_mg: f.epa_mg, dha_mg: f.dha_mg, aa_mg: f.aa_mg, total_lipid_g: f.total_lipid_g,
      })) {
        if (value === null) continue;
        expect(typeof value, `${f.name}.${field}: not number`).toBe("number");
        expect(value as number, `${f.name}.${field}: negative`).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("KNOWN_NULL_FOODS have all lipid fields null", () => {
    for (const f of foods) {
      if (!KNOWN_NULL_FOODS.has(f.name)) continue;
      expect(f.epa_mg, `${f.name}: should be null`).toBeNull();
      expect(f.dha_mg, `${f.name}: should be null`).toBeNull();
      expect(f.aa_mg, `${f.name}: should be null`).toBeNull();
    }
  });

  it("foods not in KNOWN_NULL_FOODS or PARTIAL_NULL_OK have all 3 fatty acids as numbers", () => {
    for (const f of foods) {
      if (KNOWN_NULL_FOODS.has(f.name) || PARTIAL_NULL_OK.has(f.name)) continue;
      expect(f.epa_mg, `${f.name}: epa_mg should be number, was null`).not.toBeNull();
      expect(f.dha_mg, `${f.name}: dha_mg should be number, was null`).not.toBeNull();
      expect(f.aa_mg, `${f.name}: aa_mg should be number, was null`).not.toBeNull();
    }
  });

  it("fish foods have higher EPA+DHA than meat foods on average", () => {
    // sanity check: 魚カテゴリは EPA+DHA が肉カテゴリより明確に高いはず
    const fishFoods = foods.filter(f => f.category === "fish" && f.epa_mg != null && f.dha_mg != null);
    const meatFoods = foods.filter(f => f.category === "meat" && f.epa_mg != null && f.dha_mg != null);
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const fishAvg = avg(fishFoods.map(f => (f.epa_mg as number) + (f.dha_mg as number)));
    const meatAvg = avg(meatFoods.map(f => (f.epa_mg as number) + (f.dha_mg as number)));
    expect(fishAvg, `fish avg EPA+DHA (${fishAvg}) should be >> meat avg (${meatAvg})`)
      .toBeGreaterThan(meatAvg * 5);
  });
});

describe("__resetCache", () => {
  it("can be called without error", () => {
    expect(() => __resetCache()).not.toThrow();
  });

  it("forces re-read of foods.json on next access", () => {
    __resetCache();
    const foods1 = listAllFoods();
    __resetCache();
    const foods2 = listAllFoods();
    expect(foods1).toEqual(foods2);
    // 同じデータが返ることのみ確認 (ファイル変更検知は範囲外)
  });
});
