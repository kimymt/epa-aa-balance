#!/usr/bin/env bun
// MEXT 食品成分表 脂肪酸成分表編 2020 (可食部100g当たり) を data/foods.json にインジェスト。
//
// v0.3.1: 既存 57 hand-curated 食材を残し、未収録の MEXT 食材 (~1,800 件) を追加する。
//
// 戦略:
//   - 既存 foods.json の各 entry には _mext_row フィールドが付いている (PR 1 で追加)
//   - その row 番号を skipSet として記憶
//   - MEXT 全 1,973 行から skipSet を除いた残りを新規 entry として追加
//   - 既存 hand-curated は順番・aliases を変えない (Vision API のヒット率を維持)
//   - 新規 entry は MEXT 由来の primary name + 単語分解した aliases
//
// 使い方:
//   bun run scripts/ingest-mext-foods.ts
//   → data/foods.json を上書き (in-place、git diff で確認)
//
// 注意: protein_g フィールドは v0.3.1 で削除 (lipid migration 完了で unused)。
//       既存 57 食材からも protein_g を除去する。
//
// v0.5.0: xlsx@0.18.5 → exceljs@4.x に置換。
// xlsx の HIGH CVE 2 件 (Prototype Pollution + ReDoS) を解消する hygiene 移行。
// xlsx@0.19.3+ は SheetJS が npm 配布停止、CDN 経由のみのため実用的に更新困難
// だった。exceljs は active maintenance + npm 配布あり + 同等機能。

import ExcelJS from "exceljs";
import kuromoji, { type Tokenizer as KuromojiTokenizer } from "kuromoji";
import * as fs from "node:fs";
import * as path from "node:path";

const MEXT_FILE = "/tmp/mext.xlsx";
const FOODS_FILE = path.join(process.cwd(), "data", "foods.json");
const KUROMOJI_DICT = path.join(process.cwd(), "node_modules/kuromoji/dict");

const COL = { group: 0, name: 3, fat: 6, aa: 53, epa: 54, dha: 60 };

type Category = "fish" | "meat" | "egg_dairy" | "plant" | "other";

// MEXT 由来の食材エントリ。hand-curated の旧 protein_g は v0.3.1 cleanup で削除済み。
type Food = {
  name: string;
  aliases: string[];
  category: Category;
  epa_mg: number | null;
  dha_mg: number | null;
  aa_mg: number | null;
  total_lipid_g: number | null;
  protein_g?: number; // legacy: hand-curated に残存している場合があり、cleanup で除去する
  _mext_row?: number;
  _mext_name?: string;
  _mext_group?: string;
};

type FoodsFile = {
  _note?: string;
  _categories?: unknown;
  foods: Food[];
  category_fallbacks?: Food[];
};

// kuromoji の最小型定義は kuromoji.d.ts に置いてある (npm 公式 typings 不在のため)。

// 食品群コード → category マッピング
const GROUP_TO_CATEGORY: Record<string, Category> = {
  "10": "fish",        // 魚介類
  "11": "meat",        // 肉類
  "12": "egg_dairy",   // 卵類
  "13": "egg_dairy",   // 乳類
  "04": "plant",       // 豆類
  // 残り全部 "other": 穀類, いも・でん粉, 種実, 野菜, 果実, きのこ, 藻類,
  //                  油脂, 菓子, し好飲料, 調味料, 調理済み流通食品
};

function parseValue(v: unknown): number | null {
  if (v === "" || v === "-" || v === "−" || v == null) return null;
  if (typeof v === "string" && v.trim() === "Tr") return 0; // Cross-Model 2A
  if (typeof v === "string" && (v.includes("(") || v.includes("（"))) {
    const cleaned = v.replace(/[()（）]/g, "");
    const n = parseFloat(cleaned);
    return isNaN(n) ? null : n;
  }
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return isNaN(n) ? null : n;
}

/**
 * MEXT の長い食品名から「主名称」を抽出する。
 *   "＜魚類＞　（さば類）　まさば　生" → "まさば"
 *   "＜畜肉類＞　うし　［和牛肉］　もも　赤肉　生" → "うし もも 赤肉"
 *   "（キャベツ類）　キャベツ　結球葉　生" → "キャベツ 結球葉"
 *
 * 戦略: 山かっこ/角かっこ/丸かっこ/コメ印 で囲まれたカテゴリラベルを除去、
 *       全角空白を半角に、最後に料理状態 (生/ゆで/焼き/乾) を残す。
 */
function derivePrimaryName(mextName: string): string {
  let s = mextName;
  s = s.replace(/[＜<].*?[＞>]/g, " "); // 山かっこ
  s = s.replace(/[［\[].*?[］\]]/g, " "); // 角かっこ (大カテゴリ)
  s = s.replace(/[（(].*?[）)]/g, " "); // 丸かっこ (中カテゴリ・補足)
  s = s.replace(/\s+/g, " ").trim();    // 全角・連続スペースを正規化
  return s || mextName.trim();
}

/**
 * 主名称から検索用 aliases を生成する。
 *   "まさば 生" → ["まさば", "生"] → ["まさば"] (生/ゆで等を除外)
 *   "うし もも 赤肉 生" → ["うし", "もも", "赤肉"]
 *
 * 注: 連濁 (rendaku) 対応は v0.3.4 で実装したが、bare 2-char 連濁 alias
 * (「ずわいがに」 entry に「かに」alias 追加) は別エントリの長 query を
 * 誤マッチ (「めんたいこ」.includes(「たい」)) する false positive を生むため
 * 食材 side では行わない。代わりに runtime 側 (lib/food-db.ts) で
 * クエリの連濁 variant を生成して照合する。
 */
function deriveAliases(primaryName: string): string[] {
  const COOKING_STATES = new Set(["生", "ゆで", "焼き", "蒸し", "乾", "煮", "揚げ", "干し"]);
  const words = primaryName.split(/\s+/).filter((w) => w && !COOKING_STATES.has(w));
  return words.filter((w) => w.length >= 2);
}

/**
 * Kuromoji で漢字を含む primary name の連続 kana 読みを生成する (v0.3.5)。
 *
 * 入力例: "豚 大型種肉 ばら 脂身つき 生" (空白区切り、漢字含む)
 * 出力例: "ぶたおおがたしゅにくばらしみつきなま"
 *
 * 用途: Vision API が「豚バラ」のように連結形式で出力した時に substring match
 * させる。MEXT は単語空白区切り、Vision は連結 — このギャップを埋める。
 *
 * 制限:
 *   - kuromoji は珍しい漢字や固有名詞で誤った読みを返すことあり (鯱 → ホコ vs シャチ)
 *   - 食品文脈に固有の読みは外す可能性あり
 *   → 全 alias を上書きせず、新規 alias として「追加」のみ。既存 alias で十分マッチ
 *      する case が大半なので、kuromoji 由来 alias は補助的。
 *   - 漢字含まない primary (純 kana) は kuromoji 不要、skip。
 */
function deriveKuromojiAlias(tokenizer: KuromojiTokenizer, primaryName: string): string | null {
  if (!/[一-鿿]/.test(primaryName)) return null; // 漢字なし → skip
  try {
    const tokens = tokenizer.tokenize(primaryName);
    let reading = "";
    for (const t of tokens) {
      // reading は katakana で返ってくる; surface_form fallback (記号等)
      reading += t.reading || t.surface_form || "";
    }
    // katakana → hiragana 変換
    const hira = reading.replace(/[ァ-ヶ]/g, (m) =>
      String.fromCharCode(m.charCodeAt(0) - 0x60)
    );
    // 空白除去 (「ぶた おおがた」→「ぶたおおがた」)
    return hira.replace(/\s+/g, "").trim() || null;
  } catch {
    return null;
  }
}

// === Main ingestion ===

// Kuromoji tokenizer ビルド (非同期、約 2-3 秒)
const tokenizer = await new Promise<KuromojiTokenizer>((resolve, reject) => {
  kuromoji.builder({ dicPath: KUROMOJI_DICT }).build((err, t) => {
    if (err) reject(err);
    else resolve(t);
  });
});
console.error("Kuromoji tokenizer ready.");

// v0.5.0: exceljs ベース。xlsx の sheet_to_json({header:1}) と同じ「2D 配列、
// 0-indexed、行内も 0-indexed」になるよう手動構築する。これで _mext_row 等の
// 既存 row index 参照が壊れない。
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(MEXT_FILE);
const sheet = wb.getWorksheet("表全体");
if (!sheet) {
  throw new Error('Worksheet "表全体" not found in MEXT file');
}
const data: unknown[][] = [];
for (let r = 1; r <= sheet.rowCount; r++) {
  const row = sheet.getRow(r);
  // exceljs の row.values は 1-indexed (index 0 は undefined)、slice(1) で
  // 0-indexed に揃える (xlsx sheet_to_json の出力と同じ shape)
  data.push(((row.values as unknown as unknown[]) ?? []).slice(1));
}

const existingFoodsRaw = JSON.parse(fs.readFileSync(FOODS_FILE, "utf8")) as FoodsFile;
const existingFoods: Food[] = existingFoodsRaw.foods;

// hand-curated 57 = source-order の先頭 57 件 (v0.3.1 で固定)。
// それ以外 (auto-ingested 1,914) は今回再生成して alias 強化する (rendaku)。
const HAND_CURATED_COUNT = 57;
const handCurated = existingFoods.slice(0, HAND_CURATED_COUNT);
const skipRows = new Set<number>(
  handCurated.map((f) => f._mext_row).filter((r): r is number => typeof r === "number")
);
console.error(`Hand-curated entries preserved: ${handCurated.length}, skipping their MEXT rows: ${skipRows.size}`);

// hand-curated から protein_g を削除 (v0.3.1 schema cleanup)
const cleanedExisting: Food[] = handCurated.map((f) => {
  const rest = { ...f };
  delete rest.protein_g;
  return rest as Food;
});

const newFoods: Food[] = [];
let totalRows = 0, skipped = 0, addedRows = 0, noDataRows = 0;

for (let i = 6; i < data.length; i++) {
  const r = data[i];
  if (!r || !r[COL.name]) continue;
  totalRows++;

  if (skipRows.has(i)) {
    skipped++;
    continue;
  }

  const mextName = String(r[COL.name]).trim();
  const groupCode = String(r[COL.group]).trim();
  const fat = parseValue(r[COL.fat]);
  const epa = parseValue(r[COL.epa]);
  const dha = parseValue(r[COL.dha]);
  const aa = parseValue(r[COL.aa]);

  // データ全 null は意味が無いのでスキップ
  if (fat === null && epa === null && dha === null && aa === null) {
    noDataRows++;
    continue;
  }

  const category = GROUP_TO_CATEGORY[groupCode] || "other";
  const primaryName = derivePrimaryName(mextName);
  const aliases = deriveAliases(primaryName);

  // v0.3.5: kuromoji で連続 kana 読みを生成、既存 alias と異なれば追加
  const kuromojiAlias = deriveKuromojiAlias(tokenizer, primaryName);
  if (kuromojiAlias && kuromojiAlias.length >= 3 && !aliases.includes(kuromojiAlias)) {
    aliases.push(kuromojiAlias);
  }

  newFoods.push({
    name: primaryName,
    aliases,
    category,
    epa_mg: epa,
    dha_mg: dha,
    aa_mg: aa,
    total_lipid_g: fat,
    _mext_row: i,
    _mext_name: mextName,
    _mext_group: groupCode,
  });
  addedRows++;
}

const output = {
  ...existingFoodsRaw,
  _note:
    "Hand-curated entries (first 57) followed by MEXT auto-ingested entries (v0.3.1+). " +
    "Lookup priority: hand-curated takes precedence due to source-order iteration in food-db.ts. " +
    "Lipid data from MEXT 食品成分表 脂肪酸成分表編 2020 (可食部100g当たり). Tr → 0 mg, '—' → null.",
  _categories: existingFoodsRaw._categories,
  foods: [...cleanedExisting, ...newFoods],
  category_fallbacks: existingFoodsRaw.category_fallbacks,
};

// category_fallbacks も protein_g 削除
if (output.category_fallbacks) {
  output.category_fallbacks = output.category_fallbacks.map((f: Food) => {
    const rest = { ...f };
    delete rest.protein_g;
    return rest as Food;
  });
}

fs.writeFileSync(FOODS_FILE, JSON.stringify(output, null, 2) + "\n");

console.error(`\n=== Ingestion complete ===`);
console.error(`Total MEXT rows scanned:    ${totalRows}`);
console.error(`Skipped (already curated):  ${skipped}`);
console.error(`Skipped (no useful data):   ${noDataRows}`);
console.error(`Added to foods.json:        ${addedRows}`);
console.error(`Final foods count:          ${cleanedExisting.length + newFoods.length}`);
console.error(`Output file size:           ${(fs.statSync(FOODS_FILE).size / 1024).toFixed(1)} KB`);
