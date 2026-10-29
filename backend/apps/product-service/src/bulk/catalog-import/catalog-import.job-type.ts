import type {
  BatchResult,
  JobType,
  ParsedRow,
  RowError,
  WriteContext,
} from "@materialhub/bulk-jobs";
import { type BulkImportJob, BulkImportMode, BulkJobStrictness } from "@materialhub/database";
import { coerceProductRow, coerceVariantRow } from "./catalog-import.coerce.ts";
import type { CatalogImportCtx } from "./catalog-import.context.ts";
import { buildCatalogImportContext } from "./catalog-import.context.ts";
import { type GroupLink, linkProductGroups } from "./catalog-import.group-link.ts";
import type { CoercedProductRow, CoercedVariantRow } from "./catalog-import.schemas.ts";
import { ProductRowSchema } from "./catalog-import.schemas.ts";
import { catalogImportTemplate } from "./catalog-import.template.ts";
import { crossValidate } from "./catalog-import.validate.ts";
import { writeProductsBatch, writeUpdateBatch } from "./catalog-import.write.ts";

type CatalogCoerced =
  | { kind: "product"; value: CoercedProductRow }
  | { kind: "variant"; value: CoercedVariantRow };

interface BufferedRows {
  variants: CoercedVariantRow[];
  products: CoercedProductRow[];
  groupLinks: GroupLink[];
}

/** Read the preloaded ctx the dispatcher stashes under writeCtx.job.summary.context. */
function getCtx(writeCtx: WriteContext): CatalogImportCtx {
  const summary = writeCtx.job.summary as { context?: CatalogImportCtx } | null;
  if (!summary?.context) throw new Error("catalog_import: context not preloaded");
  return summary.context;
}

/**
 * TODO(cleanup): threading buffered rows through `writeCtx.job.summary` is gross.
 * A cleaner design would be a per-job module-scoped Map keyed by jobId, but summary
 * threading is consistent with Phase 1.
 */
function getBuffered(writeCtx: WriteContext): BufferedRows {
  const s = writeCtx.job.summary as ({ buffered?: BufferedRows } & Record<string, unknown>) | null;
  if (!s) {
    (writeCtx.job.summary as Record<string, unknown> | null) = {
      buffered: { variants: [], products: [], groupLinks: [] },
    };
    return (writeCtx.job.summary as unknown as { buffered: BufferedRows }).buffered;
  }
  if (!s.buffered) s.buffered = { variants: [], products: [], groupLinks: [] };
  s.buffered.groupLinks ??= [];
  return s.buffered;
}

export const catalogImportJobType: JobType<CatalogCoerced, string, CatalogImportCtx> = {
  key: "catalog_import",
  defaultStrictness: BulkJobStrictness.BestEffort,
  template: catalogImportTemplate,
  parseOptions: {
    expectedSheets: ["Products", "Variants"],
    requiredColumnsPerSheet: {
      Products: ["price", "name", "category_slug"],
      Variants: [],
      "": ["price", "name", "category_slug"],
    },
  },
  resolveParseOptions(job: BulkImportJob) {
    if (job.import_mode !== BulkImportMode.Update) return this.parseOptions;
    return {
      expectedSheets: ["Products", "Variants"],
      requiredColumnsPerSheet: { Products: [], Variants: [], "": [] },
    };
  },

  rowSchema: ProductRowSchema,

  async buildValidationContext({ dataSource, vendorId, importMode }) {
    return buildCatalogImportContext({ dataSource, vendorId, importMode });
  },

  coerceRow(row: ParsedRow, ctx) {
    if (row.sheetName === "Variants") {
      const r = coerceVariantRow(row, ctx.mode);
      if (!r.ok) return { ok: false, errors: r.errors };
      return { ok: true, value: { kind: "variant", value: r.value } };
    }
    const r = coerceProductRow(row, ctx.mode);
    if (!r.ok) return { ok: false, errors: r.errors };
    return { ok: true, value: { kind: "product", value: r.value } };
  },

  preValidate(rows, ctx) {
    // The BulkJobWorker calls preValidate ONCE with all rows (ParsedRow[]). We run cross-sheet logic.
    const products: CoercedProductRow[] = [];
    const variants: CoercedVariantRow[] = [];
    for (const parsed of rows) {
      if (parsed.sheetName === "Variants") {
        const c = coerceVariantRow(parsed, ctx.mode);
        if (c.ok) variants.push(c.value);
      } else {
        const c = coerceProductRow(parsed, ctx.mode);
        if (c.ok) products.push(c.value);
      }
    }
    const cv = crossValidate(products, variants, ctx);
    return cv.errors as RowError[];
  },

  async writeBatch(rows, writeCtx): Promise<BatchResult<string>> {
    const ctx = getCtx(writeCtx);

    const products = rows
      .filter((r): r is { kind: "product"; value: CoercedProductRow } => r.kind === "product")
      .map((r) => r.value);
    const variants = rows
      .filter((r): r is { kind: "variant"; value: CoercedVariantRow } => r.kind === "variant")
      .map((r) => r.value);

    // Accumulate variants into the job-level buffer so writeProductsBatch can attach them by parent.
    const buffer = getBuffered(writeCtx);
    buffer.variants.push(...variants);
    buffer.products.push(...products);

    if (ctx.mode === BulkImportMode.Update) {
      const { succeededRowNumbers, skippedRowNumbers } = await writeUpdateBatch(
        products,
        variants,
        ctx,
        writeCtx,
      );
      return {
        succeeded: succeededRowNumbers.map((n) => String(n)),
        skipped: skippedRowNumbers,
      };
    }

    if (products.length === 0) {
      return { succeeded: [], skipped: [] };
    }

    const { succeededRowNumbers, skippedRowNumbers } = await writeProductsBatch(
      products,
      buffer.variants,
      ctx,
      writeCtx,
    );
    return {
      succeeded: succeededRowNumbers.map((n) => String(n)),
      skipped: skippedRowNumbers,
    };
  },

  async postComplete(writeCtx): Promise<void> {
    const links = getBuffered(writeCtx).groupLinks;
    if (links.length === 0) return;

    const ctx = getCtx(writeCtx);
    const affected = await linkProductGroups(writeCtx.manager, ctx.vendorId, links);
    for (const productId of affected) {
      writeCtx.pushFollowUp({ queue: "search-reindex", payload: { productId } });
      writeCtx.pushFollowUp({ queue: "product-cache-invalidate", payload: { productId } });
    }
  },
};
