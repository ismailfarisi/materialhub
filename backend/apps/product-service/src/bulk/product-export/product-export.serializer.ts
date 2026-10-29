import ExcelJS from "exceljs";
import type { ProductExportField, ResolvedProductExportFields } from "./product-export.types.ts";

type ProductExportSheet = ResolvedProductExportFields["sheets"][number];
type ProductExportCellValue = string | number | boolean | Date | null | undefined;
type ProductExportDetailRow = Record<string, ProductExportCellValue>;

export interface ProductExportReportRow {
  productId: string;
  values: Record<string, ProductExportCellValue>;
  summaries?: Record<string, ProductExportCellValue | ProductExportCellValue[]>;
  variants?: ProductExportDetailRow[];
  inventory?: ProductExportDetailRow[];
  media?: ProductExportDetailRow[];
  attributes?: ProductExportDetailRow[];
}

export interface SerializeProductExportCsvArgs {
  fields: ProductExportField[];
  rows: ProductExportReportRow[];
}

export interface SerializeProductExportXlsxArgs extends SerializeProductExportCsvArgs {
  sheets: ProductExportSheet[];
}

const DETAIL_SHEETS = new Set<ProductExportSheet>(["variants", "inventory", "media", "attributes"]);
const CSV_FORMULA_TRIGGERS = new Set(["=", "+", "-", "@"]);

const SHEET_NAMES = {
  products: "Products",
  variants: "Variants",
  inventory: "Inventory",
  media: "Media",
  attributes: "Attributes",
} satisfies Record<ProductExportSheet, string>;

export function serializeProductExportCsv(args: SerializeProductExportCsvArgs): string {
  const fields = args.fields.filter(
    (field) =>
      field.sheet === "products" && (field.csvMode === "value" || field.csvMode === "summary"),
  );
  const lines = [fields.map((field) => csvEscape(field.label)).join(",")];

  for (const row of args.rows) {
    lines.push(fields.map((field) => csvEscape(readProductField(row, field))).join(","));
  }

  return lines.join("\n");
}

export async function serializeProductExportXlsx(
  args: SerializeProductExportXlsxArgs,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "MaterialHub";
  workbook.created = new Date();

  for (const sheet of args.sheets) {
    addSheet(workbook, sheet, args.fields, args.rows);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function addSheet(
  workbook: ExcelJS.Workbook,
  sheet: ProductExportSheet,
  allFields: ProductExportField[],
  rows: ProductExportReportRow[],
): void {
  const worksheet = workbook.addWorksheet(SHEET_NAMES[sheet]);
  const fields = allFields.filter((field) => field.sheet === sheet);
  const headerFields = sheet === "products" ? fields : [productIdField(), ...fields];

  worksheet.columns = headerFields.map((field) => ({
    header: field.label,
    key: field.key,
    width: columnWidth(field.label),
  }));
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  worksheet.getRow(1).font = { bold: true };
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: Math.max(headerFields.length, 1) },
  };

  if (sheet === "products") {
    for (const row of rows) {
      worksheet.addRow(fields.map((field) => toWorksheetValue(readProductField(row, field))));
    }
  } else if (DETAIL_SHEETS.has(sheet)) {
    for (const row of rows) {
      for (const detailRow of row[sheet] ?? []) {
        worksheet.addRow([
          toWorksheetValue(row.productId),
          // Detail serializers are intentionally permissive; the query layer owns field completeness.
          ...fields.map((field) => toWorksheetValue(detailRow[field.key])),
        ]);
      }
    }
  }
}

function productIdField(): ProductExportField {
  return {
    key: "product_id",
    label: "Product ID",
    group: "identity",
    sheet: "products",
    csvMode: "value",
  };
}

function readProductField(
  row: ProductExportReportRow,
  field: ProductExportField,
): ProductExportCellValue | ProductExportCellValue[] {
  if (field.csvMode === "summary" && row.summaries && field.key in row.summaries) {
    return row.summaries[field.key];
  }

  return row.values[field.key];
}

function csvEscape(value: ProductExportCellValue | ProductExportCellValue[]): string {
  const rendered = spreadsheetSafeCsvValue(renderValue(value));

  if (/[",\r\n]/.test(rendered)) {
    return `"${rendered.replaceAll('"', '""')}"`;
  }

  return rendered;
}

function spreadsheetSafeCsvValue(rendered: string): string {
  let firstVisibleIndex = 0;
  while (firstVisibleIndex < rendered.length && rendered.charCodeAt(firstVisibleIndex) <= 31) {
    firstVisibleIndex += 1;
  }

  if (CSV_FORMULA_TRIGGERS.has(rendered[firstVisibleIndex] ?? "")) {
    return `'${rendered}`;
  }

  return rendered;
}

function toWorksheetValue(
  value: ProductExportCellValue | ProductExportCellValue[],
): ProductExportCellValue {
  if (Array.isArray(value)) {
    return renderValue(value);
  }

  return value ?? "";
}

function renderValue(value: ProductExportCellValue | ProductExportCellValue[]): string {
  if (Array.isArray(value)) {
    return value
      .map((item) => renderValue(item))
      .filter(Boolean)
      .join(", ");
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value === null || value === undefined) {
    return "";
  }

  return String(value);
}

function columnWidth(label: string): number {
  return Math.min(Math.max(label.length + 4, 12), 36);
}
