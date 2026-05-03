import { readFileSync } from "node:fs";
import path from "node:path";
import type { ProteinCategory } from "./standards";

export interface FoodEntry {
  name: string;
  aliases: string[];
  category: ProteinCategory;
  /**
   * 脂肪酸成分 (per 100g、MEXT 食品成分表 脂肪酸成分表編 2020 由来)。
   * null は「データなし」(MEXT で「—」「Tr 以外の空欄」表記)。
   * MEXT で「Tr」(検出限界以下) 表記は 0 mg として保存（栄養学慣習に従う）。
   *
   * v0.3.1: 旧 protein_g フィールド削除 (lipid migration 完了で unused)。
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
 * 食材で頻出する漢字 → ひらがな読みのマップ (v0.3.3)。
 *
 * Vision API は漢字で食材名を出力することがあり (鯖、餃子、明太子 など)、
 * MEXT は多くがひらがな (さば、ぎょうざ、めんたいこ)。kana 正規化だけでは
 * 跨げないため、よく使われる漢字を読み仮名に変換するマップを用意する。
 *
 * 注意:
 *   1. 長い文字列ほど先に置換する必要がある (replace は順序依存)。
 *      → KANJI_TO_KANA_ENTRIES は length desc でソート済み。
 *   2. 漢字 1 字で複数の読みがある場合 (例: 「鮭」=さけ/しゃけ) は、
 *      MEXT に存在する読みを採用 (= さけ)。
 *   3. 過度に generic な漢字 (「葉」「根」「皮」など) は意図せぬ置換を
 *      起こすので含めない。
 *   4. 既に curated 57 のエイリアスでカバー済みの漢字も、防御的に重複登録
 *      しておく (curated が先勝ちするので副作用なし)。
 *
 * 拡張ロードマップ:
 *   - v0.3.4 候補: kuromoji.js で形態素解析、未収録漢字も自動変換
 *   - 当面は「Vision API がよく出す + MEXT が hiragana」のペアに集中
 */
const KANJI_TO_KANA: Record<string, string> = {
  // === 多文字 (longest first 順序を強制するため最初に置く) ===
  "明太子": "めんたいこ",
  "辛子明太子": "からしめんたいこ",
  "玉葱": "たまねぎ",
  "海老": "えび",
  "烏賊": "いか",
  "蜜柑": "みかん",
  "葡萄": "ぶどう",
  "林檎": "りんご",
  "西瓜": "すいか",
  "辣油": "らーゆ",
  "饂飩": "うどん",
  "焼魚": "やきさかな",
  "刺身": "さしみ",

  // === 魚介 (1 字漢字) ===
  "鯖": "さば",
  "鮭": "さけ",
  "鯛": "たい",
  "鰤": "ぶり",
  "鯵": "あじ", "鰺": "あじ",
  "鰯": "いわし",
  "鮪": "まぐろ",
  "鰹": "かつお",
  "鯨": "くじら",
  "鰻": "うなぎ",
  "鱒": "ます",
  "鱈": "たら",
  "鰊": "にしん", "鯡": "にしん",
  "鰆": "さわら",
  "鯥": "むつ",
  "鯏": "あさり",
  "鮟": "あんこう",
  "鯱": "しゃち",
  "鯣": "するめ",
  "鮫": "さめ",
  "鰰": "はたはた",
  "鯒": "こち",
  "鯔": "ぼら",
  "鯰": "なまず",
  "鮒": "ふな",
  "鮃": "ひらめ", "平目": "ひらめ",
  "鰈": "かれい",
  "鱚": "きす",
  "鱸": "すずき",
  "蛸": "たこ",
  "蟹": "かに",
  "蝦": "えび",
  "鱧": "はも",
  "鯑": "かずのこ",
  "鮎": "あゆ",
  "鰍": "かじか",

  // === 肉・卵・乳 ===
  "鶏": "とり",
  "豚": "ぶた",
  "牛": "うし",
  "羊": "ひつじ",
  "鴨": "かも",
  "鹿": "しか",
  "猪": "いのしし",
  "卵": "たまご",

  // === 料理・加工品 ===
  "餃子": "ぎょうざ",
  "焼売": "しゅうまい",
  "饅頭": "まんじゅう",
  "蕎麦": "そば",
  "寿司": "すし",
  "丼": "どん",

  // === 野菜・果物 (1 字漢字、generic でないもの) ===
  "蕪": "かぶ",
  "茄子": "なす",
  "葱": "ねぎ",
  "苺": "いちご",
  "桃": "もも",
  "梨": "なし",
  "柿": "かき",
  "栗": "くり",
  "茸": "きのこ",
  "茗荷": "みょうが",
  "韮": "にら",
  "韭": "にら",
  "牛蒡": "ごぼう",
  "蓮根": "れんこん",
  "蓮": "はす",
  "蕗": "ふき",
  "筍": "たけのこ",
  "蕨": "わらび",
  "薇": "ぜんまい",

  // === 調味・その他 ===
  "醤油": "しょうゆ",
  "味噌": "みそ",
  "塩": "しお",
  "酢": "す",
  "酒": "さけ", // 注: 鮭 と衝突するが「酒」読みは "さけ" で同じなので OK
  "麹": "こうじ",
  "麦": "むぎ",
  "蕎": "そば",
};

// 長い key を先に置換するため事前ソート (replace は短い key が先に hit すると壊れる)
const KANJI_KEYS_SORTED = Object.keys(KANJI_TO_KANA).sort((a, b) => b.length - a.length);

/**
 * 文字列正規化:
 *   1. lowercase
 *   2. 漢字 → ひらがな (KANJI_TO_KANA、長い順に置換)
 *   3. カタカナ → ひらがな (U+30A1〜U+30F6 を 0x60 シフト)
 *
 * v0.3.2: katakana → hiragana 変換 (Vision API 出力 vs MEXT 名のスクリプト差)
 * v0.3.3: 漢字 → ひらがな 変換 (Vision の漢字出力 vs MEXT の hiragana)
 */
function normalize(s: string): string {
  let result = s.toLowerCase();
  for (const k of KANJI_KEYS_SORTED) {
    if (result.includes(k)) result = result.split(k).join(KANJI_TO_KANA[k]);
  }
  return result.replace(/[ァ-ヶ]/g, (m) =>
    String.fromCharCode(m.charCodeAt(0) - 0x60)
  );
}

/**
 * 連濁 (rendaku) のための初頭子音 voiced 変換マップ (v0.3.4)。
 * 複合語の後半要素で起きる音韻変化を query side で再現する。
 */
const RENDAKU_INITIAL_VOICED: Record<string, string> = {
  "か": "が", "き": "ぎ", "く": "ぐ", "け": "げ", "こ": "ご",
  "さ": "ざ", "し": "じ", "す": "ず", "せ": "ぜ", "そ": "ぞ",
  "た": "だ", "ち": "ぢ", "つ": "づ", "て": "で", "と": "ど",
  "は": "ば", "ひ": "び", "ふ": "ぶ", "へ": "べ", "ほ": "ぼ",
};

/**
 * クエリ文字列から検索 variant を生成する (v0.3.4)。
 * - 元のクエリ
 * - 初頭子音を voiced に変えた連濁形 (「かに」→「がに」、「さけ」→「ざけ」)
 *
 * 用途: substring 検索で複合語食材 (「ずわいがに」「ぎんざけ」) にヒットさせる。
 * 食材 side に bare な base 形 (「かに」alias) を加えると別 entry の長クエリを
 * 誤マッチ (「めんたいこ」.includes(「たい」)) するため、変換は query side で行う。
 *
 * Substring 検索のみで使用、exact match では使わない (誤マッチ防止)。
 */
function getQueryVariants(q: string): string[] {
  const variants = [q];
  if (q.length >= 2) {
    const voicedFirst = RENDAKU_INITIAL_VOICED[q[0]];
    if (voicedFirst) variants.push(voicedFirst + q.slice(1));
  }
  return variants;
}

/**
 * 食材名から食品エントリを検索する。
 *
 * 優先順位:
 *   1. 完全一致（name または aliases、kana 正規化後）
 *   2. 双方向の部分文字列一致（kana 正規化後）
 *   3. category_fallbacks の matchers との部分文字列一致（isFallback: true）
 */
export function lookupFood(query: string): LookupResult | null {
  const data = loadFoods();
  const q = normalize(query.trim());
  if (!q) return null;

  // 1. exact match
  for (const f of data.foods) {
    if (normalize(f.name) === q) return { entry: f, isFallback: false };
    if (f.aliases.some((a) => normalize(a) === q))
      return { entry: f, isFallback: false };
  }

  // 2. 連濁 variant (voiced 初頭子音) を alias 末尾でマッチ
  // 用途: 「かに」→「がに」を「ずわいがに」alias の末尾でヒット
  // 短いクエリの compound 食材 priority のため original substring の前に配置。
  // word-end のみに絞ることで「イングリッシュ」.includes(「ぐり」) みたいな
  // 内部誤マッチを避ける。
  const variants = getQueryVariants(q).slice(1); // skip original q
  for (const f of data.foods) {
    for (const a of f.aliases) {
      const lower = normalize(a);
      for (const qv of variants) {
        if (lower.endsWith(qv)) return { entry: f, isFallback: false };
      }
    }
  }

  // 3. substring match (両方向、original query)
  for (const f of data.foods) {
    const candidates = [f.name, ...f.aliases];
    for (const c of candidates) {
      const lower = normalize(c);
      if (lower.includes(q) || q.includes(lower)) {
        return { entry: f, isFallback: false };
      }
    }
  }

  // 3. category fallback (variant は使わない、fallback は最後の手段なので保守的に)
  for (const fb of data.category_fallbacks ?? []) {
    for (const matcher of fb.matchers) {
      const lower = normalize(matcher);
      if (lower.includes(q) || q.includes(lower)) {
        return {
          entry: {
            name: fb.category_name,
            aliases: fb.matchers,
            category: fb.category,
            // fallback には脂肪酸データを含めない (カテゴリ平均は不正確)
            // lookupFood の呼び出し側 (computeLipidScore) で isFallback=true をチェックして除外
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
