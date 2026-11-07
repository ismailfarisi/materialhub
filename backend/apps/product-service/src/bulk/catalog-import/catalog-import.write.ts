import { BulkErrorCodes, type FollowUpTask, type WriteContext } from "@materialhub/bulk-jobs";
import {
  BulkImportMode,
  Product,
  ProductAttributeValue,
  ProductVariant,
} from "@materialhub/database";
import type { EntityManager } from "typeorm";
import { DriveFolderError } from "../image-fetch/image-fetch.drive-folder.ts";
import { expandSourceUrls } from "../image-fetch/image-fetch.expand.ts";
import { PostimgGalleryError } from "../image-fetch/image-fetch.postimg-gallery.ts";
import type { CatalogImportCtx } from "./catalog-import.context.ts";
import { UpdateTargetNotFoundError } from "./catalog-import.errors.ts";
import type { GroupLink } from "./catalog-import.group-link.ts";
import { seedSimpleProductInventory } from "./catalog-import.inventory.ts";
import type { CoercedProductRow, CoercedVariantRow } from "./catalog-import.schemas.ts";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 128);
}

type DeferredDiff = Parameters<WriteContext["logChange"]>[0];

/**
 * Wraps a WriteContext so pushFollowUp / logChange calls are buffered into local
 * arrays. The caller flushes them to the outer writeCtx ONLY after the
 * associated DB savepoint has been released — that way a row whose savepoint
 * was rolled back never leaves ghost diffs or follow-ups behind.
 */
function deferred(
  outer: WriteContext,
  manager: EntityManager,
): { ctx: WriteContext; flush: () => void } {
  const followUps: FollowUpTask[] = [];
  const diffs: DeferredDiff[] = [];
  const ctx: WriteContext = {
    ...outer,
    manager,
    pushFollowUp: (t) => followUps.push(t),
    logChange: (d) => diffs.push(d),
  };
  return {
    ctx,
    flush: () => {
      for (const f of followUps) outer.pushFollowUp(f);
      for (const d of diffs) outer.logChange(d);
    },
  };
}

/**
 * The status an import row may set, mirroring the vendor product API: a vendor
 * moves products between draft and review (or resubmits a rejected one) and
 * may archive; going live is only via moderation + publish. Returns undefined
 * to leave the current status alone.
 */
export function importStatusFor(
  current: string | null,
  requested: CoercedProductRow["status"] | undefined,
): Product["status"] | undefined {
  if (!requested) return undefined;
  if (requested === "archived") return "archived" as Product["status"];
  if (current === null || current === "draft" || current === "pending_review" || current === "rejected") {
    return requested as Product["status"];
  }
  return undefined;
}

/**
 * Process a batch of products (and their variants from the parsed file) into the database.
 *
 * Concurrency model: the worker base wraps `writeBatch` in ONE Postgres transaction.
 * Without isolation, a single row's constraint violation poisons the txn and every
 * subsequent query throws "current transaction is aborted" — and any TypeORM call
 * after batch end (e.g. the bulk-job-row-changes insert) escapes the per-row catch
 * and fails the job silently. Each product row therefore runs inside its own
 * SAVEPOINT, and each variant row runs inside a nested SAVEPOINT, so one bad row
 * (or one bad variant) only rolls back itself.
 *
 * For each row:
 *   - Insert or update products row.
 *   - Upsert product_attribute_values for non-variant attributes.
 *   - Insert or update product_variants rows keyed by (product_id, external_id|sku).
 *   - Seed inventory rows in the default warehouse.
 *   - Enqueue image-fetch tasks via pushFollowUp (deferred until savepoint releases).
 */
export async function writeProductsBatch(
  products: CoercedProductRow[],
  allVariants: CoercedVariantRow[],
  ctx: CatalogImportCtx,
  writeCtx: WriteContext,
): Promise<{
  succeededRowNumbers: number[];
  skippedRowNumbers: Array<{ rowNumber: number; reason: string; errorCode?: string }>;
}> {
  const outerManager: EntityManager = writeCtx.manager;
  const succeeded: number[] = [];
  const skipped: Array<{ rowNumber: number; reason: string; errorCode?: string }> = [];

  const productIdByKey = new Map<string, string>();

  for (const p of products) {
    const productSavepoint = `cat_p_${p.rowNumber}`;
    await outerManager.query(`SAVEPOINT ${productSavepoint}`);
    const productScope = deferred(writeCtx, outerManager);
    let productOk = false;
    try {
      const productId = await writeProductRow(p, ctx, productScope.ctx);
      // Keep search in step (an archived/edited product must not linger).
      productScope.ctx.pushFollowUp({ queue: "search-reindex", payload: { productId } });
      productIdByKey.set(p.externalId ?? `sku:${p.sku}`, productId);
      recordGroupLink(p, productId, ctx, writeCtx);

      const matchingVariants = allVariants.filter(
        (v) =>
          (v.productExternalId && v.productExternalId === p.externalId) ||
          (v.productSku && v.productSku === p.sku),
      );
      for (const v of matchingVariants) {
        const variantSavepoint = `cat_v_${v.rowNumber}`;
        await outerManager.query(`SAVEPOINT ${variantSavepoint}`);
        const variantScope = deferred(productScope.ctx, outerManager);
        try {
          await writeVariantRow(v, productId, ctx, variantScope.ctx);
          await outerManager.query(`RELEASE SAVEPOINT ${variantSavepoint}`);
          variantScope.flush();
          succeeded.push(v.rowNumber);
        } catch (err) {
          await outerManager.query(`ROLLBACK TO SAVEPOINT ${variantSavepoint}`);
          const errorCode =
            err instanceof DriveFolderError ||
            err instanceof PostimgGalleryError ||
            err instanceof UpdateTargetNotFoundError
              ? err.code
              : undefined;
          skipped.push({ rowNumber: v.rowNumber, reason: (err as Error).message, errorCode });
        }
      }

      productOk = true;
    } catch (err) {
      const errorCode =
        err instanceof DriveFolderError ||
        err instanceof PostimgGalleryError ||
        err instanceof UpdateTargetNotFoundError
          ? err.code
          : undefined;
      skipped.push({ rowNumber: p.rowNumber, reason: (err as Error).message, errorCode });
    }

    if (productOk) {
      await outerManager.query(`RELEASE SAVEPOINT ${productSavepoint}`);
      productScope.flush();
      succeeded.push(p.rowNumber);
    } else {
      await outerManager.query(`ROLLBACK TO SAVEPOINT ${productSavepoint}`);
    }
  }

  return { succeededRowNumbers: succeeded, skippedRowNumbers: skipped };
}

/**
 * Update-mode write path: products and variants are updated INDEPENDENTLY.
 * A variant resolves its parent productId from ctx.productsByExternalId /
 * ctx.productsBySku (the DB-preloaded context), NOT from in-file products —
 * so variant-only files (and files where the parent isn't re-listed in the
 * Products sheet) still get written. crossValidate already guarantees the
 * parent + variant exist in update mode; the `!parent` branch below is
 * defense-in-depth.
 *
 * Each row (product or variant) runs in its own flat SAVEPOINT, since the
 * two are independent here (unlike upsert mode's nested product->variant
 * savepoints in writeProductsBatch).
 */
export async function writeUpdateBatch(
  products: CoercedProductRow[],
  variants: CoercedVariantRow[],
  ctx: CatalogImportCtx,
  writeCtx: WriteContext,
): Promise<{
  succeededRowNumbers: number[];
  skippedRowNumbers: Array<{ rowNumber: number; reason: string; errorCode?: string }>;
}> {
  const manager = writeCtx.manager;
  const succeeded: number[] = [];
  const skipped: Array<{ rowNumber: number; reason: string; errorCode?: string }> = [];

  for (const p of products) {
    const sp = `cat_up_${p.rowNumber}`;
    await manager.query(`SAVEPOINT ${sp}`);
    const scope = deferred(writeCtx, manager);
    try {
      const productId = await writeProductRow(p, ctx, scope.ctx);
      recordGroupLink(p, productId, ctx, writeCtx);
      await manager.query(`RELEASE SAVEPOINT ${sp}`);
      scope.flush();
      succeeded.push(p.rowNumber);
    } catch (err) {
      await manager.query(`ROLLBACK TO SAVEPOINT ${sp}`);
      const errorCode =
        err instanceof DriveFolderError ||
        err instanceof PostimgGalleryError ||
        err instanceof UpdateTargetNotFoundError
          ? err.code
          : undefined;
      skipped.push({ rowNumber: p.rowNumber, reason: (err as Error).message, errorCode });
    }
  }

  for (const v of variants) {
    const parent =
      (v.productExternalId && ctx.productsByExternalId.get(v.productExternalId)) ||
      (v.productSku && ctx.productsBySku.get(v.productSku)) ||
      null;
    if (!parent) {
      skipped.push({
        rowNumber: v.rowNumber,
        reason: `no existing product matches "${v.productExternalId ?? v.productSku}"`,
        errorCode: BulkErrorCodes.UPDATE_PRODUCT_NOT_FOUND,
      });
      continue;
    }
    const sp = `cat_uv_${v.rowNumber}`;
    await manager.query(`SAVEPOINT ${sp}`);
    const scope = deferred(writeCtx, manager);
    try {
      await writeVariantRow(v, parent.productId, ctx, scope.ctx);
      await manager.query(`RELEASE SAVEPOINT ${sp}`);
      scope.flush();
      succeeded.push(v.rowNumber);
    } catch (err) {
      await manager.query(`ROLLBACK TO SAVEPOINT ${sp}`);
      const errorCode =
        err instanceof DriveFolderError ||
        err instanceof PostimgGalleryError ||
        err instanceof UpdateTargetNotFoundError
          ? err.code
          : undefined;
      skipped.push({ rowNumber: v.rowNumber, reason: (err as Error).message, errorCode });
    }
  }

  return { succeededRowNumbers: succeeded, skippedRowNumbers: skipped };
}

function recordGroupLink(
  p: CoercedProductRow,
  productId: string,
  ctx: CatalogImportCtx,
  writeCtx: WriteContext,
): void {
  if (!p.groupName || !p.groupAttribute) return;

  const ginfo = ctx.attributesBySlug.get(p.groupAttribute);
  const gval = p.attributes.find((a) => a.slug === p.groupAttribute);
  const resolved = ginfo && gval ? ginfo.valuesBySlug.get(gval.value.toLowerCase()) : undefined;
  if (!ginfo || !resolved) return;

  const summary = writeCtx.job.summary as
    | ({ buffered?: { groupLinks?: GroupLink[] } } & Record<string, unknown>)
    | null;
  if (!summary?.buffered?.groupLinks) return;

  summary.buffered.groupLinks.push({
    productId,
    groupName: p.groupName,
    groupingAttributeId: ginfo.id,
    attributeValueId: resolved.id,
    rowNumber: p.rowNumber,
  });
}

async function writeProductRow(
  p: CoercedProductRow,
  ctx: CatalogImportCtx,
  writeCtx: WriteContext,
): Promise<string> {
  const manager = writeCtx.manager;
  const category = p.categorySlug ? (ctx.categoriesBySlug.get(p.categorySlug) ?? null) : null;
  const brandId = p.brandSlug ? (ctx.brandsBySlug.get(p.brandSlug)?.id ?? null) : null;

  const existing =
    (p.externalId && ctx.productsByExternalId.get(p.externalId)) ||
    (p.sku && ctx.productsBySku.get(p.sku)) ||
    null;

  let productId: string;
  if (existing) {
    productId = existing.productId;
    const current = await manager.getRepository(Product).findOne({ where: { id: productId } });
    if (!current) throw new Error(`product ${productId} disappeared`);

    const updates: Partial<Product> = {};
    const diffs: Array<{ field: string; oldValue: unknown; newValue: unknown }> = [];
    const fieldsToMaybeUpdate: Array<[keyof Product, unknown]> = [
      ["name", p.name],
      ["short_description", p.shortDescription],
      ["description", p.description],
      ["ingredients", p.ingredients],
      ["usage_instructions", p.usageInstructions],
      ["price", p.price],
      ["compare_at_price", p.compareAtPrice],
      ["cost_price", p.costPrice],
      ["currency", p.currency],
      ["has_variants", p.hasVariants],
      ["track_inventory", p.trackInventory],
      ["allow_backorder", p.allowBackorder],
      ["requires_shipping", p.requiresShipping],
      ["weight_grams", p.weightGrams],
      ["barcode", p.barcode],
      ["mpn", p.mpn],
      ["meta_title", p.metaTitle],
      ["meta_description", p.metaDescription],
      ["meta_keywords", p.metaKeywords],
      ["status", importStatusFor(current.status, p.status)],
      ["category_id", category?.id],
      ["brand_id", brandId],
      ["external_id", p.externalId],
      ["sku", p.sku],
    ];
    for (const [field, newVal] of fieldsToMaybeUpdate) {
      if (newVal !== undefined && newVal !== null && (current as never)[field] !== newVal) {
        (updates as Record<string, unknown>)[field as string] = newVal;
        diffs.push({
          field: String(field),
          oldValue: (current as never)[field],
          newValue: newVal,
        });
      }
    }
    if (Object.keys(updates).length > 0) {
      await manager.getRepository(Product).update(productId, updates as Record<string, unknown>);
      for (const d of diffs) {
        writeCtx.logChange({
          rowNumber: p.rowNumber,
          entityType: "product",
          entityId: productId,
          ...d,
        });
      }
    }
  } else {
    if (ctx.mode === BulkImportMode.Update) {
      throw new UpdateTargetNotFoundError("product", p.externalId ?? p.sku);
    }
    const slug = (p.slug ?? slugify(p.name ?? "product")).slice(0, 128);
    const insertResult = await manager.getRepository(Product).insert({
      vendor_id: ctx.vendorId,
      name: p.name!,
      slug,
      short_description: p.shortDescription,
      description: p.description,
      ingredients: p.ingredients,
      usage_instructions: p.usageInstructions,
      status: (importStatusFor(null, p.status) ?? "draft") as Product["status"],
      price: p.price!,
      compare_at_price: p.compareAtPrice,
      cost_price: p.costPrice,
      currency: p.currency ?? "AED",
      has_variants: p.hasVariants ?? false,
      track_inventory: p.trackInventory ?? true,
      allow_backorder: p.allowBackorder ?? false,
      requires_shipping: p.requiresShipping ?? true,
      weight_grams: p.weightGrams,
      barcode: p.barcode,
      mpn: p.mpn,
      meta_title: p.metaTitle,
      meta_description: p.metaDescription,
      meta_keywords: p.metaKeywords,
      category_id: category!.id,
      brand_id: brandId,
      sku: p.sku,
      external_id: p.externalId,
    });
    productId = insertResult.identifiers[0]!.id as string;
  }

  // Attributes (non-variant)
  for (const a of p.attributes) {
    const info = ctx.attributesBySlug.get(a.slug)!;
    const valueRow =
      info.valuesBySlug.size > 0 ? (info.valuesBySlug.get(a.value.toLowerCase()) ?? null) : null;
    await manager.query(
      "DELETE FROM product_attribute_values WHERE product_id = $1 AND attribute_id = $2 AND variant_id IS NULL",
      [productId, info.id],
    );
    await manager.getRepository(ProductAttributeValue).insert({
      product_id: productId,
      attribute_id: info.id,
      attribute_value_id: valueRow?.id ?? null,
      text_value: valueRow ? null : a.value,
      variant_id: null,
    });
  }

  // Image tasks for product-level images (expand Drive folder URLs first)
  const expandedProductUrls = await expandSourceUrls(p.imageUrls, ctx);
  expandedProductUrls.forEach((url, idx) => {
    writeCtx.pushFollowUp({
      queue: "bulk-import-image-fetch",
      payload: {
        taskRecord: {
          jobId: writeCtx.job.id,
          rowNumber: p.rowNumber,
          productId,
          variantId: null,
          sourceUrl: url,
          sortOrder: idx,
        },
      },
    });
  });

  // Inventory seed for simple products
  if (!(p.hasVariants ?? false) && p.initialQuantity != null && ctx.defaultWarehouseId) {
    await seedSimpleProductInventory(manager, {
      productId,
      vendorId: ctx.vendorId,
      warehouseId: ctx.defaultWarehouseId,
      quantity: p.initialQuantity,
    });
  }

  return productId;
}

async function writeVariantRow(
  v: CoercedVariantRow,
  productId: string,
  ctx: CatalogImportCtx,
  writeCtx: WriteContext,
): Promise<void> {
  const manager = writeCtx.manager;
  const existingVarEntry =
    (v.variantExternalId &&
      ctx.variantsByProductAndExternalId.get(`${productId}|${v.variantExternalId}`)) ||
    (v.variantSku && ctx.variantsByProductAndSku.get(`${productId}|${v.variantSku}`)) ||
    null;

  const optionValues: Record<string, string> = {};
  for (const o of v.optionValues) {
    optionValues[o.slug] = o.value;
  }

  let variantId: string;
  if (existingVarEntry) {
    variantId = existingVarEntry.variantId;
    const current = await manager
      .getRepository(ProductVariant)
      .findOne({ where: { id: variantId } });
    const updates: Partial<ProductVariant> = {};
    const diffs: Array<{ field: string; oldValue: unknown; newValue: unknown }> = [];
    const fields: Array<[keyof ProductVariant, unknown]> = [
      ["name", v.name],
      ["price", v.price],
      ["compare_at_price", v.compareAtPrice],
      ["cost_price", v.costPrice],
      ["weight_grams", v.weightGrams],
      ["barcode", v.barcode],
      ["is_active", v.isActive],
      ["sort_order", v.sortOrder],
      ["sku", v.variantSku],
      ["external_id", v.variantExternalId],
    ];
    if (v.optionValues.length > 0) fields.push(["option_values", optionValues]);
    for (const [field, newVal] of fields) {
      if (
        newVal !== undefined &&
        newVal !== null &&
        JSON.stringify((current as never)[field]) !== JSON.stringify(newVal)
      ) {
        (updates as Record<string, unknown>)[field as string] = newVal;
        diffs.push({
          field: String(field),
          oldValue: (current as never)[field],
          newValue: newVal,
        });
      }
    }
    if (Object.keys(updates).length > 0) {
      await manager
        .getRepository(ProductVariant)
        .update(variantId, updates as Record<string, unknown>);
      for (const d of diffs) {
        writeCtx.logChange({
          rowNumber: v.rowNumber,
          entityType: "product_variant",
          entityId: variantId,
          ...d,
        });
      }
    }
  } else {
    if (ctx.mode === BulkImportMode.Update) {
      throw new UpdateTargetNotFoundError("variant", v.variantExternalId ?? v.variantSku);
    }
    const ins = await manager.getRepository(ProductVariant).insert({
      product_id: productId,
      name: v.name ?? "",
      sku: v.variantSku,
      external_id: v.variantExternalId,
      barcode: v.barcode,
      option_values: optionValues,
      price: v.price as number,
      compare_at_price: v.compareAtPrice,
      cost_price: v.costPrice,
      weight_grams: v.weightGrams,
      is_active: v.isActive ?? true,
      sort_order: v.sortOrder ?? 0,
    });
    variantId = ins.identifiers[0]!.id as string;
  }

  for (const o of v.optionValues) {
    const info = ctx.attributesBySlug.get(o.slug)!;
    const valueRow = info.valuesBySlug.get(o.value.toLowerCase())!;
    await manager.query(
      "DELETE FROM product_attribute_values WHERE product_id = $1 AND attribute_id = $2 AND variant_id = $3",
      [productId, info.id, variantId],
    );
    await manager.getRepository(ProductAttributeValue).insert({
      product_id: productId,
      variant_id: variantId,
      attribute_id: info.id,
      attribute_value_id: valueRow.id,
      text_value: null,
    });
  }

  if (v.initialQuantity != null && ctx.defaultWarehouseId) {
    // quantity_available is a denormalized copy; seed it so the row isn't born
    // disagreeing with on_hand - reserved. ON CONFLICT DO NOTHING now has a real
    // arbiter (uq_inventory_product_variant_warehouse_active) so a re-import
    // leaves the existing row untouched instead of appending a duplicate.
    await manager.query(
      `INSERT INTO inventory (product_id, variant_id, vendor_id, warehouse_id, quantity_on_hand, quantity_reserved, quantity_available, low_stock_threshold)
       VALUES ($1, $2, $3, $4, $5, 0, $5, 0)
       ON CONFLICT DO NOTHING`,
      [productId, variantId, ctx.vendorId, ctx.defaultWarehouseId, v.initialQuantity],
    );
  }

  const expandedVariantUrls = await expandSourceUrls(v.imageUrls, ctx);
  expandedVariantUrls.forEach((url, idx) => {
    writeCtx.pushFollowUp({
      queue: "bulk-import-image-fetch",
      payload: {
        taskRecord: {
          jobId: writeCtx.job.id,
          rowNumber: v.rowNumber,
          productId,
          variantId,
          sourceUrl: url,
          sortOrder: idx,
        },
      },
    });
  });
}

/** After all batches commit, materialize image tasks in bulk_import_job_image_tasks. */
export async function persistImageTasks(
  jobId: string,
  taskPayloads: Array<{
    rowNumber: number;
    productId: string;
    variantId: string | null;
    sourceUrl: string;
    sortOrder: number;
  }>,
  manager: EntityManager,
): Promise<number> {
  if (taskPayloads.length === 0) return 0;
  const rows = taskPayloads.map((t) => ({
    job_id: jobId,
    row_number: t.rowNumber,
    product_id: t.productId,
    variant_id: t.variantId,
    source_url: t.sourceUrl,
    sort_order: t.sortOrder,
  }));
  await manager
    .createQueryBuilder()
    .insert()
    .into("bulk_import_job_image_tasks")
    .values(rows)
    .execute();
  return rows.length;
}
