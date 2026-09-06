import { test, expect } from "bun:test";
import ExcelJS from "exceljs";

test("ExcelJS reads and writes food cells and UUID-backed conditional formatting", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("foods");
  sheet.addRows([["食材", "EPA"], ["さば", 690]]);
  sheet.addConditionalFormatting({ ref: "B2:B2", rules: [{
    type: "dataBar", priority: 1, cfvo: [{ type: "min" }, { type: "max" }],
    gradient: true,
  }] });
  const bytes = await workbook.xlsx.writeBuffer();
  const loaded = new ExcelJS.Workbook();
  await loaded.xlsx.load(bytes);
  expect(loaded.worksheets[0].getRow(2).values).toEqual([undefined, "さば", 690]);
  // 条件付き書式を含むブックは再保存も成功することを確認する。
  expect((await loaded.xlsx.writeBuffer()).byteLength).toBeGreaterThan(0);
});
