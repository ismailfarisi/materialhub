import { describe, expect, test } from "bun:test";
import { BulkJobFileFormat } from "@materialhub/database";
import ExcelJS from "exceljs";
import { parseFile } from "../../src/parsers/parse-file.ts";

describe("parseFile", () => {
  test("routes CSV to csv parser", async () => {
    const buf = Buffer.from("sku,qty\nA,1\n");
    const result = await parseFile({
      buffer: buf,
      format: BulkJobFileFormat.Csv,
      parseOptions: { expectedSheets: [], requiredColumnsPerSheet: { "": ["sku", "qty"] } },
    });
    expect(result.rows).toHaveLength(1);
    expect(result.fileLevelErrors).toEqual([]);
  });

  test("flags MISSING_REQUIRED_COLUMN when a required column is absent", async () => {
    const buf = Buffer.from("sku\nA\n");
    const result = await parseFile({
      buffer: buf,
      format: BulkJobFileFormat.Csv,
      parseOptions: { expectedSheets: [], requiredColumnsPerSheet: { "": ["sku", "qty"] } },
    });
    expect(result.rows).toEqual([]);
    expect(result.fileLevelErrors[0].errorCode).toBe("missing_required_column");
    expect(result.fileLevelErrors[0].errorMessage).toContain("qty");
  });

  test("routes XLSX via sheet key", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Inv");
    ws.addRow(["sku", "qty"]);
    ws.addRow(["A", "1"]);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const result = await parseFile({
      buffer: buf,
      format: BulkJobFileFormat.Xlsx,
      parseOptions: { expectedSheets: ["Inv"], requiredColumnsPerSheet: { Inv: ["sku", "qty"] } },
    });
    expect(result.rows).toHaveLength(1);
  });
});
