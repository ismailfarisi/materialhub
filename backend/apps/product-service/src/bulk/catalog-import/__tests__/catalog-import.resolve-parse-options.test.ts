import { describe, expect, test } from "bun:test";
import { type BulkImportJob, BulkImportMode } from "@materialhub/database";
import { catalogImportJobType } from "../catalog-import.job-type.ts";

function job(mode: BulkImportMode): BulkImportJob {
  return { import_mode: mode } as BulkImportJob;
}

describe("catalogImportJobType.resolveParseOptions", () => {
  test("upsert mode keeps required columns", () => {
    const opts = catalogImportJobType.resolveParseOptions!(job(BulkImportMode.Upsert));
    expect(opts.requiredColumnsPerSheet.Products).toEqual(["price", "name", "category_slug"]);
  });

  test("update mode drops required columns", () => {
    const opts = catalogImportJobType.resolveParseOptions!(job(BulkImportMode.Update));
    expect(opts.requiredColumnsPerSheet.Products).toEqual([]);
    expect(opts.requiredColumnsPerSheet.Variants).toEqual([]);
    expect(opts.requiredColumnsPerSheet[""]).toEqual([]);
    expect(opts.expectedSheets).toEqual(["Products", "Variants"]);
  });
});
