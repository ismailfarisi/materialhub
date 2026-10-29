import ExcelJS from "exceljs";
import type { TemplateDescriptor } from "../types/job-type.ts";

function csvEscape(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function generateCsvTemplate(desc: TemplateDescriptor): string {
  // Single-sheet only for CSV; use the first sheet.
  const sheet = desc.sheets[0];
  if (!sheet) throw new Error(`Template "${desc.jobType}" has no sheets defined`);
  const header = sheet.columns.map((c) => csvEscape(c.key)).join(",");
  const example = sheet.columns.map((c) => csvEscape(c.example)).join(",");
  return `${header}\n${example}`;
}

export async function generateXlsxTemplate(desc: TemplateDescriptor): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const readme = wb.addWorksheet("README");
  readme.addRow([`Template: ${desc.jobType}`]);
  readme.addRow([]);
  for (const line of desc.readme) readme.addRow([line]);

  for (const s of desc.sheets) {
    const ws = wb.addWorksheet(s.name);
    ws.addRow(s.columns.map((c) => c.key));
    const exampleRows = s.exampleRows ?? [s.columns.map((c) => c.example)];
    for (const row of exampleRows) ws.addRow(row);
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: "frozen", ySplit: 1 }];
    s.columns.forEach((c, i) => {
      const col = ws.getColumn(i + 1);
      col.width = Math.max(12, c.label.length + 2);
      if (c.xlsxValidation) {
        for (let r = 3; r <= 1000; r++) {
          ws.getCell(r, i + 1).dataValidation = {
            type: "list",
            allowBlank: c.xlsxValidation.allowBlank ?? true,
            formulae: c.xlsxValidation.formulae,
          };
        }
      }
    });
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
