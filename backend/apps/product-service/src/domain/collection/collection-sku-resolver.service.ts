import { AppDataSource, Product, ProductCollectionKind, ProductVariant } from "@materialhub/database";
import { In } from "typeorm";

export interface SkuResolution {
  matched: { sku: string; id: string; name?: string }[];
  unmatched: string[];
  duplicates: string[];
}

/** Pure ordering/dedup logic; `lookup` maps a sku to an id or null. */
export function resolveSkuList(
  skus: string[],
  lookup: (sku: string) => string | null,
): SkuResolution {
  const matched: { sku: string; id: string }[] = [];
  const unmatched: string[] = [];
  const duplicates: string[] = [];
  const seen = new Set<string>();
  for (const raw of skus) {
    const sku = raw.trim();
    if (!sku) continue;
    if (seen.has(sku)) {
      duplicates.push(sku);
      continue;
    }
    seen.add(sku);
    const id = lookup(sku);
    if (id) matched.push({ sku, id });
    else unmatched.push(sku);
  }
  return { matched, unmatched, duplicates };
}

export class CollectionSkuResolverService {
  async resolve(kind: ProductCollectionKind, skus: string[]): Promise<SkuResolution> {
    const cleaned = [...new Set(skus.map((s) => s.trim()).filter(Boolean))];
    const skuToId = new Map<string, { id: string; name?: string }>();

    // Chunked IN lookups (~500/chunk) to handle 1000+ pasted SKUs.
    const chunk = 500;
    for (let i = 0; i < cleaned.length; i += chunk) {
      const slice = cleaned.slice(i, i + chunk);
      if (kind === ProductCollectionKind.variant) {
        const rows = await AppDataSource.getRepository(ProductVariant).find({
          where: { sku: In(slice) },
          select: ["id", "sku"],
        });
        for (const r of rows) if (r.sku) skuToId.set(r.sku, { id: r.id });
      } else {
        // Product-level: match products.sku OR variant.sku -> owning product.
        const prodRows = await AppDataSource.getRepository(Product).find({
          where: { sku: In(slice) },
          select: ["id", "sku", "name"],
        });
        for (const r of prodRows) if (r.sku) skuToId.set(r.sku, { id: r.id, name: r.name });
        const varRows = await AppDataSource.getRepository(ProductVariant).find({
          where: { sku: In(slice) },
          select: ["sku", "product_id"],
        });
        for (const r of varRows) {
          if (r.sku && !skuToId.has(r.sku)) skuToId.set(r.sku, { id: r.product_id });
        }
      }
    }

    const res = resolveSkuList(skus, (s) => skuToId.get(s.trim())?.id ?? null);
    // Attach names where known.
    res.matched = res.matched.map((m) => ({ ...m, name: skuToId.get(m.sku)?.name }));
    return res;
  }
}
