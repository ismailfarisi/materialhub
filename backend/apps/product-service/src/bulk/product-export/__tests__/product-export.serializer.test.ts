import { describe, expect, test } from "bun:test";
import ExcelJS from "exceljs";
import {
  type ProductExportReportRow,
  serializeProductExportCsv,
  serializeProductExportXlsx,
} from "../product-export.serializer.ts";
import type { ProductExportField } from "../product-export.types.ts";

const fields = [
  field("id", "Product ID", "identity", "products", "value"),
  field("name", "Name", "identity", "products", "value"),
  field("tags", "Tags", "classification", "products", "summary"),
  field("variant_count", "Variant count", "variants", "products", "summary"),
  field("internal_note", "Internal note", "identity", "products", "xlsx_only"),
  field("variant_sku", "Variant SKU", "variants", "variants", "xlsx_only"),
  field("variant_price", "Variant price", "variants", "variants", "xlsx_only"),
  field("warehouse", "Warehouse", "inventory", "inventory", "xlsx_only"),
  field("quantity_available", "Quantity available", "inventory", "inventory", "xlsx_only"),
  field("media_url", "Media URL", "media", "media", "xlsx_only"),
  field("alt_text", "Alt text", "media", "media", "xlsx_only"),
  field("attribute_name", "Attribute name", "attributes", "attributes", "xlsx_only"),
  field("attribute_value", "Attribute value", "attributes", "attributes", "xlsx_only"),
] satisfies ProductExportField[];

const rows: ProductExportReportRow[] = [
  {
    productId: "prod_1",
    values: {
      id: "prod_1",
      name: 'Moon, "Glow"\nLamp',
      internal_note: "not for CSV",
    },
    summaries: {
      tags: ["lighting", "home, decor"],
      variant_count: 2,
    },
    variants: [
      { variant_sku: "MOON-S", variant_price: 1500 },
      { variant_sku: "MOON-L", variant_price: 1900 },
    ],
    inventory: [
      { warehouse: "DXB", quantity_available: 7 },
      { warehouse: "AUH", quantity_available: 3 },
    ],
    media: [
      { media_url: "https://cdn.example.test/moon.jpg", alt_text: "Moon lamp" },
      { media_url: "https://cdn.example.test/moon-detail.jpg", alt_text: "" },
    ],
    attributes: [
      { attribute_name: "Material", attribute_value: "Glass" },
      { attribute_name: "Color", attribute_value: "Warm white" },
    ],
  },
];

describe("product export serializers", () => {
  test("serializes CSV with escaped product fields only", () => {
    const csv = serializeProductExportCsv({ fields, rows });

    expect(csv).toBe(
      [
        "Product ID,Name,Tags,Variant count",
        'prod_1,"Moon, ""Glow""\nLamp","lighting, home, decor",2',
      ].join("\n"),
    );
    expect(csv).not.toContain("Internal note");
    expect(csv).not.toContain("Variant SKU");
    expect(csv).not.toContain("not for CSV");
  });

  test("serializes empty CSV with headers", () => {
    expect(serializeProductExportCsv({ fields, rows: [] })).toBe(
      "Product ID,Name,Tags,Variant count",
    );
  });

  test("prefixes formula-like CSV cells before escaping", () => {
    const formulaRows: ProductExportReportRow[] = [
      rowWithName("prod_formula_1", '=HYPERLINK("https://example.test")'),
      rowWithName("prod_formula_2", "+SUM(1,2)"),
      rowWithName("prod_formula_3", "-10+20"),
      rowWithName("prod_formula_4", "@SUM(1,2)"),
      rowWithName("prod_formula_5", "\t=cmd|' /C calc'!A0"),
    ];

    expect(serializeProductExportCsv({ fields, rows: formulaRows })).toBe(
      [
        "Product ID,Name,Tags,Variant count",
        'prod_formula_1,"\'=HYPERLINK(""https://example.test"")",,',
        'prod_formula_2,"\'+SUM(1,2)",,',
        "prod_formula_3,'-10+20,,",
        'prod_formula_4,"\'@SUM(1,2)",,',
        "prod_formula_5,'\t=cmd|' /C calc'!A0,,",
      ].join("\n"),
    );
  });

  test("serializes XLSX with product and detail sheet headers", async () => {
    const workbook = await loadWorkbook(
      await serializeProductExportXlsx({
        fields,
        rows,
        sheets: ["products", "variants", "inventory", "media", "attributes"],
      }),
    );

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "Products",
      "Variants",
      "Inventory",
      "Media",
      "Attributes",
    ]);
    expect(readRow(workbook.getWorksheet("Products"), 1)).toEqual([
      "Product ID",
      "Name",
      "Tags",
      "Variant count",
      "Internal note",
    ]);
    expect(readRow(workbook.getWorksheet("Variants"), 1)).toEqual([
      "Product ID",
      "Variant SKU",
      "Variant price",
    ]);
    expect(readRow(workbook.getWorksheet("Inventory"), 1)).toEqual([
      "Product ID",
      "Warehouse",
      "Quantity available",
    ]);
    expect(readRow(workbook.getWorksheet("Media"), 1)).toEqual([
      "Product ID",
      "Media URL",
      "Alt text",
    ]);
    expect(readRow(workbook.getWorksheet("Attributes"), 1)).toEqual([
      "Product ID",
      "Attribute name",
      "Attribute value",
    ]);

    const products = workbook.getWorksheet("Products");
    expect(products?.views[0]?.state).toBe("frozen");
    expect((products?.views[0] as { ySplit?: number } | undefined)?.ySplit).toBe(1);
    expect(products?.getRow(1).font?.bold).toBe(true);
    expect(products?.autoFilter).toEqual("A1:E1");
  });

  test("serializes XLSX by expanding detail rows", async () => {
    const workbook = await loadWorkbook(
      await serializeProductExportXlsx({
        fields,
        rows,
        sheets: ["products", "variants", "inventory", "media", "attributes"],
      }),
    );

    expect(readRow(workbook.getWorksheet("Products"), 2)).toEqual([
      "prod_1",
      'Moon, "Glow"\nLamp',
      "lighting, home, decor",
      2,
      "not for CSV",
    ]);
    expect(readRow(workbook.getWorksheet("Variants"), 2)).toEqual(["prod_1", "MOON-S", 1500]);
    expect(readRow(workbook.getWorksheet("Variants"), 3)).toEqual(["prod_1", "MOON-L", 1900]);
    expect(readRow(workbook.getWorksheet("Inventory"), 2)).toEqual(["prod_1", "DXB", 7]);
    expect(readRow(workbook.getWorksheet("Inventory"), 3)).toEqual(["prod_1", "AUH", 3]);
    expect(readRow(workbook.getWorksheet("Media"), 2)).toEqual([
      "prod_1",
      "https://cdn.example.test/moon.jpg",
      "Moon lamp",
    ]);
    expect(readRow(workbook.getWorksheet("Media"), 3)).toEqual([
      "prod_1",
      "https://cdn.example.test/moon-detail.jpg",
      "",
    ]);
    expect(readRow(workbook.getWorksheet("Attributes"), 2)).toEqual([
      "prod_1",
      "Material",
      "Glass",
    ]);
    expect(readRow(workbook.getWorksheet("Attributes"), 3)).toEqual([
      "prod_1",
      "Color",
      "Warm white",
    ]);
  });

  test("serializes detail rows with productId instead of values id", async () => {
    const workbook = await loadWorkbook(
      await serializeProductExportXlsx({
        fields,
        rows: [
          {
            productId: "canonical_product_id",
            values: { id: "display_product_id", name: "Display product" },
            variants: [{ variant_sku: "DISPLAY-S", variant_price: 2500 }],
          },
        ],
        sheets: ["products", "variants"],
      }),
    );

    expect(readRow(workbook.getWorksheet("Products"), 2)[0]).toBe("display_product_id");
    expect(readRow(workbook.getWorksheet("Variants"), 2)[0]).toBe("canonical_product_id");
  });

  test("serializes empty XLSX sheets with headers", async () => {
    const workbook = await loadWorkbook(
      await serializeProductExportXlsx({
        fields,
        rows: [],
        sheets: ["products", "variants", "inventory", "media", "attributes"],
      }),
    );

    expect(workbook.getWorksheet("Products")?.rowCount).toBe(1);
    expect(workbook.getWorksheet("Variants")?.rowCount).toBe(1);
    expect(readRow(workbook.getWorksheet("Products"), 1)).toContain("Product ID");
    expect(readRow(workbook.getWorksheet("Variants"), 1)).toContain("Variant SKU");
  });
});

function field(
  key: string,
  label: string,
  group: string,
  sheet: ProductExportField["sheet"],
  csvMode: ProductExportField["csvMode"],
): ProductExportField {
  return { key, label, group, sheet, csvMode };
}

function rowWithName(productId: string, name: string): ProductExportReportRow {
  return {
    productId,
    values: { id: productId, name },
  };
}

async function loadWorkbook(buffer: Buffer<ArrayBufferLike>): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await (workbook.xlsx.load as (input: unknown) => Promise<ExcelJS.Workbook>)(buffer);
  return workbook;
}

function readRow(sheet: ExcelJS.Worksheet | undefined, rowNumber: number): unknown[] {
  if (!sheet) {
    throw new Error("Expected worksheet to exist");
  }

  const values = sheet.getRow(rowNumber).values;
  return Array.isArray(values) ? values.slice(1).map((value: unknown) => value ?? "") : [];
}
