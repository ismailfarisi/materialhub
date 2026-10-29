import { describe, expect, test } from "bun:test";
import ExcelJS from "exceljs";
import { generateCsvTemplate, generateXlsxTemplate } from "../../src/templates/generate.ts";
import type { TemplateDescriptor } from "../../src/types/job-type.ts";

const descriptor: TemplateDescriptor = {
  jobType: "test",
  sheets: [
    {
      name: "Inv",
      columns: [
        { key: "sku", label: "SKU", required: true, example: "ABC-1" },
        { key: "qty", label: "Quantity", required: true, example: "100" },
        { key: "note", label: "Note", required: false, example: "morning sync" },
      ],
    },
  ],
  readme: ["Line 1", "Line 2"],
};

describe("generateCsvTemplate", () => {
  test("produces a 2-line file: headers and example row", () => {
    const csv = generateCsvTemplate(descriptor);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("sku,qty,note");
    expect(lines[1]).toBe("ABC-1,100,morning sync");
  });
});

describe("generateXlsxTemplate", () => {
  test("produces a workbook with README + named sheet + header + example", async () => {
    const buf = await generateXlsxTemplate(descriptor);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    expect(wb.getWorksheet("README")).toBeTruthy();
    const inv = wb.getWorksheet("Inv");
    expect(inv).toBeTruthy();
    expect(inv!.getCell("A1").value).toBe("sku");
    expect(inv!.getCell("A2").value).toBe("ABC-1");
    expect(inv!.getCell("B2").value).toBe("100");
  });
});
