// food-db lookup の kana 正規化テスト (v0.3.2+)
//
// MEXT 由来の食材名はひらがな中心、Vision API 出力はカタカナ中心。
// 正規化なしだとスクリプト境界で substring match が外れる問題を防ぐ。

import { describe, it, expect, beforeEach } from "bun:test";
import { lookupFood, __resetCache } from "./food-db";

beforeEach(() => __resetCache());

describe("lookupFood - kana normalization (v0.3.2)", () => {
  it("matches katakana query against hiragana food name (ハマチ → MEXT entry)", () => {
    // ハマチ は MEXT に「はまち 養殖 皮なし 生」等として登録
    // 正規化なしだと curated「ブリ」(alias に「ハマチ」) でしかマッチしない。
    // 正規化ありだと両方マッチ可能。実装は curated 優先 (source order) で先勝ち。
    const r = lookupFood("ハマチ");
    expect(r).not.toBeNull();
    // 既存 curated「ブリ」が先勝ち (alias に "ハマチ" あり)
    expect(r!.entry.name).toBe("ブリ");
  });

  it("matches katakana query against hiragana-only MEXT entry (ホタテ → ほたてがい)", () => {
    // ホタテ は curated 57 に無い (alias リストにも無い)。
    // MEXT には「ほたてがい 生」「ほたてがい 貝柱 生」がある。
    // 正規化なしだと unmatched、正規化ありだとヒット。
    const r = lookupFood("ホタテ");
    expect(r).not.toBeNull();
    // MEXT 由来の何かにマッチするはず
    expect(r!.entry.aa_mg).not.toBeUndefined();
  });

  it("matches hiragana query against katakana food name (the reverse direction)", () => {
    // hand-curated に "サバ" があるので、"さば" でも引けるはず
    const r = lookupFood("さば");
    expect(r).not.toBeNull();
    expect(r!.entry.name).toBe("サバ");
  });

  it("matches mixed kanji+kana query (餃子 → ぎょうざ) [v0.3.3 fix]", () => {
    // v0.3.2 までは unmatched だった。v0.3.3 で kanji map により解決。
    const r = lookupFood("餃子");
    expect(r).not.toBeNull();
    // MEXT「中国料理 点心類 ぎょうざ」または同等の entry にマッチ
    expect(r!.entry.name.includes("ぎょうざ") || (r!.entry.aliases ?? []).some(a => a.includes("ぎょうざ"))).toBe(true);
  });

  it("normalize is case-insensitive for ascii", () => {
    // 英字食材名 ("chicken breast" alias) が大文字小文字両方でマッチ
    const r1 = lookupFood("CHICKEN BREAST");
    const r2 = lookupFood("chicken breast");
    expect(r1?.entry.name).toBe(r2?.entry.name);
    expect(r1?.entry.name).toBe("鶏むね肉（皮なし）");
  });
});

describe("lookupFood - kanji conversion (v0.3.3)", () => {
  // v0.3.2 で UNMATCHED だった漢字食材が v0.3.3 で全部 hit するか
  const cases: Array<{ q: string; mustMatch?: boolean }> = [
    { q: "鰊" },     // にしん
    { q: "鰆" },     // さわら
    { q: "鰻" },     // うなぎ
    { q: "蟹" },     // かに
    { q: "餃子" },   // ぎょうざ
    { q: "明太子" }, // めんたいこ
    { q: "林檎" },   // りんご
    { q: "鯖" },     // 既存 curated alias でも hit、漢字 map でも OK
    { q: "焼売" },   // しゅうまい
    { q: "饅頭" },   // まんじゅう
    { q: "牛蒡" },   // ごぼう
  ];
  for (const { q } of cases) {
    it(`maps ${q} to a hiragana MEXT entry`, () => {
      const r = lookupFood(q);
      expect(r, `${q} should match (was UNMATCHED in v0.3.2)`).not.toBeNull();
    });
  }

  it("preserves curated priority for kanji that exist as alias", () => {
    // 鯖 は curated 「サバ」 の alias に既にある → 鯖 → サバ で curated 勝ち
    // (kanji map で「さば」変換されてから match するルートでも結果は同じ)
    const r = lookupFood("鯖");
    expect(r?.entry.name).toBe("サバ");
  });

  it("handles compound kanji+okurigana (玉葱 → たまねぎ)", () => {
    const r = lookupFood("玉葱");
    expect(r?.entry.name).toBe("玉ねぎ"); // curated alias hit (玉葱 → たまねぎ → curated 「玉ねぎ」)
  });
});

describe("lookupFood - rendaku query variants (v0.3.4)", () => {
  // 連濁 (rendaku): 複合語の後半要素が voiced consonant に変化する。
  // クエリ「かに」を「がに」variant も生成して「ずわいがに」「毛がに」alias の
  // 末尾でヒットさせる。alias.endsWith() に絞ることで内部誤マッチ
  // (「イングリッシュ」.includes(「ぐり」)) を回避。

  it("蟹/かに → matches real crab entry (毛がに or ずわいがに) not かに風味かまぼこ", () => {
    const r = lookupFood("蟹");
    expect(r).not.toBeNull();
    // 期待: 真のかに entry (alias が「がに」終わり)
    expect(r!.entry.name).toMatch(/がに/);
    expect(r!.entry.name).not.toContain("かまぼこ");
  });

  it("くり → 日本ぐり (rendaku ぐり) not クリーム系 substring false positive", () => {
    const r = lookupFood("くり");
    expect(r?.entry.name).toContain("ぐり");
    expect(r?.entry.name).not.toContain("クリーム");
  });

  it("たい → あまだい/あこうだい (rendaku だい) not 大根 (だいこん substring)", () => {
    const r = lookupFood("たい");
    expect(r?.entry.name).toMatch(/だい/);
    expect(r?.entry.name).not.toBe("大根");
  });

  it("さめ → あぶらつのざめ (rendaku ざめ)", () => {
    const r = lookupFood("さめ");
    expect(r?.entry.name).toContain("ざめ");
  });

  it("明太子 → からしめんたいこ (no regression from variant suffix priority)", () => {
    const r = lookupFood("明太子");
    expect(r?.entry.name).toContain("めんたいこ");
  });

  it("variant matching does not affect exact-match priority", () => {
    // 既存の curated entries への exact match は variant より優先
    expect(lookupFood("サバ")?.entry.name).toBe("サバ");
    expect(lookupFood("白米")?.entry.name).toBe("白米（炊飯後）");
    expect(lookupFood("鯖")?.entry.name).toBe("サバ");
  });
});

describe("lookupFood - kuromoji-generated aliases (v0.3.5)", () => {
  // ingestion 時に kuromoji で MEXT entry の連続 kana 読みを alias 追加。
  // Vision API が連結形式 (おしむぎ、げんこく) で出力した時の hit 率向上。

  it("おしむぎ → おおむぎ 押麦 系 (kuromoji alias)", () => {
    const r = lookupFood("おしむぎ");
    expect(r).not.toBeNull();
    expect(r!.entry.name).toContain("おおむぎ");
  });

  it("げんこく → アマランサス 玄穀 系 (kuromoji alias)", () => {
    const r = lookupFood("げんこく");
    expect(r).not.toBeNull();
    expect(r!.entry.name).toContain("玄穀");
  });

  it("kuromoji aliases do not break existing curated lookups", () => {
    // regression: 主要な curated lookup が壊れていないか
    expect(lookupFood("サバ")?.entry.name).toBe("サバ");
    expect(lookupFood("白米")?.entry.name).toBe("白米（炊飯後）");
    expect(lookupFood("鶏むね肉")?.entry.name).toBe("鶏むね肉（皮なし）");
  });
});
