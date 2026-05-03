// data/foods.json schema 検証テスト (v0.3.1+)
//
// 全食材に脂肪酸フィールド (epa_mg, dha_mg, aa_mg, total_lipid_g) が
// 「定義済み or null」であることを保証。number でも null でも OK だが、
// undefined はバグなので fail させる。
//
// v0.3.1 で MEXT 全食品 (~1,900) を ingest し、protein_g フィールドを削除した。
// 個別の null 許容リストは保守不能になったので、ロジカル不変性 (型・非負・分布) で検証する。

import { describe, it, expect } from "bun:test";
import { listAllFoods, __resetCache } from "../lib/food-db";

describe("data/foods.json schema (v0.3.1+)", () => {
  __resetCache();
  const foods = listAllFoods();

  it("contains the hand-curated 57 plus MEXT-ingested entries (1900+ total)", () => {
    expect(foods.length).toBeGreaterThanOrEqual(1900);
    expect(foods.length).toBeLessThanOrEqual(2100);
  });

  it("each food has required base fields (name, aliases, category)", () => {
    for (const f of foods) {
      expect(f.name, `${f.name}: missing name`).toBeTruthy();
      expect(Array.isArray(f.aliases), `${f.name}: aliases not array`).toBe(true);
      expect(f.category, `${f.name}: missing category`).toBeTruthy();
    }
  });

  it("protein_g field has been removed (v0.3.1 schema cleanup)", () => {
    for (const f of foods) {
      expect((f as { protein_g?: unknown }).protein_g, `${f.name}: protein_g should be removed`).toBeUndefined();
    }
  });

  it("each food has lipid fields defined (number or null, never undefined)", () => {
    for (const f of foods) {
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

  it("category is one of the 5 valid values", () => {
    const validCategories = new Set(["fish", "meat", "egg_dairy", "plant", "other"]);
    for (const f of foods) {
      expect(validCategories.has(f.category), `${f.name}: invalid category ${f.category}`).toBe(true);
    }
  });

  it("fish foods have higher EPA+DHA than meat foods on average", () => {
    // 不変性 sanity check: 魚カテゴリは EPA+DHA が肉カテゴリより明確に高いはず
    const fishFoods = foods.filter(f => f.category === "fish" && f.epa_mg != null && f.dha_mg != null);
    const meatFoods = foods.filter(f => f.category === "meat" && f.epa_mg != null && f.dha_mg != null);
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const fishAvg = avg(fishFoods.map(f => (f.epa_mg as number) + (f.dha_mg as number)));
    const meatAvg = avg(meatFoods.map(f => (f.epa_mg as number) + (f.dha_mg as number)));
    expect(fishAvg, `fish avg EPA+DHA (${fishAvg.toFixed(0)}) should be >> meat avg (${meatAvg.toFixed(0)})`)
      .toBeGreaterThan(meatAvg * 5);
  });

  it("hand-curated 57 entries are preserved at the start (lookup priority)", () => {
    // 既存の 57 hand-curated エントリが foods 配列の先頭に来ていることを保証。
    // food-db.ts の lookup は配列先頭から走査するため、hand-curated が先勝ち。
    expect(foods[0].name).toBe("鶏むね肉（皮なし）");
    expect(foods[56].name).toBe("アーモンド");
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
