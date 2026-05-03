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

// @ts-ignore
import * as XLSX from "xlsx";
import * as fs from "node:fs";
import * as path from "node:path";

const MEXT_FILE = "/tmp/mext.xlsx";
const FOODS_FILE = path.join(process.cwd(), "data", "foods.json");

const COL = { group: 0, name: 3, fat: 6, aa: 53, epa: 54, dha: 60 };

type Category = "fish" | "meat" | "egg_dairy" | "plant_protein" | "other";

// 食品群コード → category マッピング
const GROUP_TO_CATEGORY: Record<string, Category> = {
  "10": "fish",        // 魚介類
  "11": "meat",        // 肉類
  "12": "egg_dairy",   // 卵類
  "13": "egg_dairy",   // 乳類
  "04": "plant_protein", // 豆類
  // 残り全部 "other": 穀類, いも・でん粉, 種実, 野菜, 果実, きのこ, 藻類,
  //                  油脂, 菓子, し好飲料, 調味料, 調理済み流通食品
};

function parseValue(v: any): number | null {
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

// === Main ingestion ===

const wb = XLSX.readFile(MEXT_FILE);
const sheet = wb.Sheets["表全体"];
const data = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: "" });

const existingFoodsRaw = JSON.parse(fs.readFileSync(FOODS_FILE, "utf8"));
const existingFoods = existingFoodsRaw.foods as any[];

// hand-curated 57 = source-order の先頭 57 件 (v0.3.1 で固定)。
// それ以外 (auto-ingested 1,914) は今回再生成して alias 強化する (rendaku)。
const HAND_CURATED_COUNT = 57;
const handCurated = existingFoods.slice(0, HAND_CURATED_COUNT);
const skipRows = new Set<number>(
  handCurated.map((f) => f._mext_row).filter((r): r is number => typeof r === "number")
);
console.error(`Hand-curated entries preserved: ${handCurated.length}, skipping their MEXT rows: ${skipRows.size}`);

// hand-curated から protein_g を削除 (v0.3.1 schema cleanup)
const cleanedExisting = handCurated.map((f) => {
  const { protein_g, ...rest } = f;
  return rest;
});

const newFoods: any[] = [];
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
  output.category_fallbacks = output.category_fallbacks.map((f: any) => {
    const { protein_g, ...rest } = f;
    return rest;
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
