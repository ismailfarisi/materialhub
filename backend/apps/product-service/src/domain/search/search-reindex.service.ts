import { config } from "@materialhub/config";
import {
  AppDataSource,
  Category,
  FlashDeal,
  Product,
  ProductGroupMember,
} from "@materialhub/database";
import { In } from "typeorm";
import Typesense from "typesense";
import {
  type ActiveDealForIndex,
  type CategoryAncestors,
  type GroupInfoForIndex,
  productCollectionSchema,
  productToDocument,
} from "./typesense.collection.ts";

async function buildCategoryAncestryMap(): Promise<Map<string, CategoryAncestors>> {
  const all = await AppDataSource.getRepository(Category).find({
    select: ["id", "slug", "parent_id"],
  });
  const byId = new Map(all.map((c) => [c.id, c]));
  const result = new Map<string, CategoryAncestors>();
  for (const cat of all) {
    const ids: string[] = [];
    const slugs: string[] = [];
    let current: typeof cat | undefined = cat;
    const seen = new Set<string>();
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      ids.push(current.id);
      slugs.push(current.slug);
      current = current.parent_id ? byId.get(current.parent_id) : undefined;
    }
    result.set(cat.id, { ids, slugs });
  }
  return result;
}

const BATCH_SIZE = 100;

export interface ReindexProgress {
  processed: number;
  total: number;
}

export class SearchReindexService {
  /**
   * Drops the Typesense `products` collection, recreates it from the current
   * schema, then upserts every `status=published` product from Postgres in
   * batches. `onProgress` is invoked after each batch so callers (BullMQ
   * worker, CLI script) can surface live progress.
   */
  async reindexAll(onProgress?: (p: ReindexProgress) => void | Promise<void>): Promise<number> {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const tsClient = new Typesense.Client({
      nodes: [
        {
          host: config.typesense.host,
          port: config.typesense.port,
          protocol: config.typesense.protocol,
        },
      ],
      apiKey: config.typesense.apiKey,
      connectionTimeoutSeconds: 5,
    });

    const collectionName = config.typesense.collectionName;

    try {
      await tsClient.collections(collectionName).delete();
    } catch {
      // collection may not exist yet — fine
    }
    await tsClient.collections().create(productCollectionSchema);

    const ancestryMap = await buildCategoryAncestryMap();

    const repo = AppDataSource.getRepository(Product);
    // Gift-only products must not appear in the storefront search index.
    const indexWhere = { status: "published" as any, is_gift_only: false };
    const total = await repo.count({ where: indexWhere });

    let processed = 0;
    let offset = 0;

    while (offset < total) {
      const products = await repo.find({
        where: indexWhere,
        relations: [
          "category",
          "brand",
          "vendor",
          "variants",
          "inventoryRecords",
          "images",
          "attributeValues",
          "attributeValues.attribute",
          "attributeValues.attributeValue",
        ],
        skip: offset,
        take: BATCH_SIZE,
        order: { created_at: "ASC" },
      });

      if (products.length === 0) break;

      // Batch-load active deals for this page so productToDocument has each
      // product's deal in hand without N+1 queries.
      const productIds = products.map((p) => p.id);
      const activeDeals = await AppDataSource.getRepository(FlashDeal)
        .createQueryBuilder("fd")
        .where("fd.product_id IN (:...productIds)", { productIds })
        .andWhere("fd.is_active = true")
        .andWhere("fd.starts_at <= NOW()")
        .andWhere("fd.expires_at > NOW()")
        .andWhere("fd.deleted_at IS NULL")
        .andWhere("(fd.quantity_limit IS NULL OR fd.quantity_sold < fd.quantity_limit)")
        .orderBy("fd.product_id", "ASC")
        .addOrderBy("fd.variant_id", "DESC", "NULLS LAST")
        .addOrderBy("fd.starts_at", "DESC")
        .getMany();

      const dealByProductId = new Map<string, ActiveDealForIndex>();
      for (const d of activeDeals) {
        if (!dealByProductId.has(d.product_id)) {
          dealByProductId.set(d.product_id, {
            id: d.id,
            deal_price: d.deal_price,
            original_price: d.original_price,
            expires_at: d.expires_at,
          });
        }
      }

      // Batch-load group membership for products in this page so productToDocument
      // can emit group_id/listing_mode/primary/swatches/from_price without N+1 queries.
      const memberRows = await AppDataSource.getRepository(ProductGroupMember).find({
        where: { product_id: In(productIds) },
        relations: ["group"],
      });
      const groupIds = [...new Set(memberRows.map((m) => m.group_id))];
      const allGroupMembers = groupIds.length
        ? await AppDataSource.getRepository(ProductGroupMember).find({
            where: { group_id: In(groupIds) },
            relations: ["product", "attributeValue"],
          })
        : [];
      const byGroup = new Map<string, typeof allGroupMembers>();
      for (const m of allGroupMembers) {
        const list = byGroup.get(m.group_id) ?? [];
        list.push(m);
        byGroup.set(m.group_id, list);
      }
      const groupMap = new Map<string, GroupInfoForIndex>();
      for (const m of memberRows) {
        const siblings = byGroup.get(m.group_id) ?? [];
        groupMap.set(m.product_id, {
          group_id: m.group_id,
          listing_mode: m.group.listing_mode,
          is_primary: m.is_primary,
          swatches: siblings
            .map((s) => s.attributeValue?.color_hex)
            .filter((h): h is string => !!h),
          from_price: Math.min(
            ...siblings.map((s) => s.product?.price ?? Number.POSITIVE_INFINITY),
          ),
        });
      }

      const documents = products.map((p) =>
        productToDocument(
          p,
          p.category_id ? ancestryMap.get(p.category_id) : undefined,
          dealByProductId.get(p.id) ?? null,
          groupMap.get(p.id) ?? null,
        ),
      );
      await tsClient
        .collections(collectionName)
        .documents()
        .import(documents as unknown as Record<string, unknown>[], { action: "upsert" });

      processed += products.length;
      offset += BATCH_SIZE;

      if (onProgress) {
        await onProgress({ processed, total });
      }
    }

    return processed;
  }
}
