import { describe, expect, test } from "bun:test";
import ExcelJS from "exceljs";
import { parseXlsx } from "../../src/parsers/xlsx-parser.ts";

async function buildWorkbook(sheets: Array<{ name: string; rows: string[][] }>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name);
    for (const r of s.rows) ws.addRow(r);
  }
  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}

describe("parseXlsx", () => {
  test("reads rows from multiple named sheets", async () => {
    const buf = await buildWorkbook([
      {
        name: "Products",
        rows: [
          ["sku", "name"],
          ["A", "Alpha"],
          ["B", "Beta"],
        ],
      },
      {
        name: "Variants",
        rows: [
          ["product_sku", "variant_sku"],
          ["A", "A-1"],
        ],
      },
    ]);
    const result = await parseXlsx(buf, { sheetsToRead: ["Products", "Variants"] });
    expect(result.fileLevelErrors).toEqual([]);
    const byName: Record<string, number> = {};
    for (const r of result.rows) byName[r.sheetName ?? "?"] = (byName[r.sheetName ?? "?"] ?? 0) + 1;
    expect(byName).toEqual({ Products: 2, Variants: 1 });
  });

  test("reports MISSING_SHEET when an expected sheet is absent", async () => {
    const buf = await buildWorkbook([{ name: "Products", rows: [["sku"], ["A"]] }]);
    const result = await parseXlsx(buf, { sheetsToRead: ["Products", "Variants"] });
    expect(result.fileLevelErrors).toHaveLength(1);
    expect(result.fileLevelErrors[0].errorCode).toBe("missing_sheet");
    expect(result.fileLevelErrors[0].errorMessage).toContain("Variants");
  });

  test("ignores hidden sheets", async () => {
    const wb = new ExcelJS.Workbook();
    const vis = wb.addWorksheet("Products");
    vis.addRow(["sku"]);
    vis.addRow(["A"]);
    const hidden = wb.addWorksheet("hidden_internal");
    hidden.state = "hidden";
    hidden.addRow(["secret"]);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const result = await parseXlsx(buf, { sheetsToRead: ["Products"] });
    expect(result.rows.every((r) => r.sheetName === "Products")).toBe(true);
  });

  test("coerces numeric cells to strings", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Inv");
    ws.addRow(["sku", "qty"]);
    ws.addRow(["A", 42]); // number, not string
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const result = await parseXlsx(buf, { sheetsToRead: ["Inv"] });
    expect(result.rows[0].values.qty).toBe("42");
  });
});
