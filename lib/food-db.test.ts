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

  it("matches mixed kanji+kana query (餃子 → ぎょうざ)", () => {
    // 餃子 (kanji) を MEXT の「ぎょうざ」(hiragana) にマッチさせる。
    // 注: 漢字 ↔ ひらがなの変換はしないので、これは正規化だけでは解けない。
    // ただし MEXT のフルネーム「中国料理 点心類 ぎょうざ」を kana 正規化しても
    // 「餃子」を含まないので unmatched が期待値。
    // → このテストは現状の限界を文書化するためのもの。
    const r = lookupFood("餃子");
    expect(r).toBeNull();
    // 期待される将来挙動: 漢字辞書を導入すれば match。今は known limitation。
  });

  it("normalize is case-insensitive for ascii", () => {
    // 英字食材名 ("chicken breast" alias) が大文字小文字両方でマッチ
    const r1 = lookupFood("CHICKEN BREAST");
    const r2 = lookupFood("chicken breast");
    expect(r1?.entry.name).toBe(r2?.entry.name);
    expect(r1?.entry.name).toBe("鶏むね肉（皮なし）");
  });
});
