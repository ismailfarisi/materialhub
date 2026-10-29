import type { CollectionRules, ProductCollection, ProductCollectionSort } from "@materialhub/database";
import type { ProductFilters, SearchService } from "../search/search.interface.ts";
import { DEFAULT_COLLECTION_CEILING, orderMembers, paginate } from "./collection-order.ts";
import type { CollectionService } from "./collection.service.ts";

export function rulesToFilters(
  rules: CollectionRules | null,
  sort: ProductCollectionSort,
): ProductFilters {
  const c = rules?.conditions ?? {};
  const sortBy =
    sort === "custom" ? undefined : (sort as "price_asc" | "price_desc" | "newest" | "rating");
  return {
    category: c.category_slugs,
    brand: c.brand_slugs,
    tags: c.tags,
    skus: c.sku_in,
    minPrice: c.price_min,
    maxPrice: c.price_max,
    inStock: c.in_stock,
    sortBy,
  };
}

export interface ResolveOpts {
  sort?: ProductCollectionSort;
  page: number;
  perPage: number;
}

export class CollectionResolver {
  constructor(
    private search: SearchService,
    private items: Pick<CollectionService, "loadPinsAndExcludes">,
  ) {}

  async resolve(
    collection: Pick<ProductCollection, "id" | "rules" | "default_sort" | "max_products">,
    opts: ResolveOpts,
  ): Promise<{ items: any[]; total: number; page: number; perPage: number; hasMore: boolean }> {
    const sort = opts.sort ?? collection.default_sort;
    const cap = collection.max_products ?? DEFAULT_COLLECTION_CEILING;
    const perPage = Math.min(opts.perPage, 250); // Typesense per_page hard limit

    const { pinIds, excludeIds } = await this.items.loadPinsAndExcludes(collection.id);

    let ruleIds: string[] = [];
    if (collection.rules && Object.keys(collection.rules.conditions ?? {}).length > 0) {
      const filters = rulesToFilters(collection.rules, sort);
      ruleIds = await this.search.searchProductIds(filters, cap);
    }

    const ordered = orderMembers({ pinIds, ruleIds, excludeIds, cap });
    if (ordered.length >= cap) {
      console.warn(`[collection ${collection.id}] hit resolution ceiling ${cap}`);
    }

    const total = ordered.length;
    const hasMore = opts.page * perPage < ordered.length;
    const pageIds = paginate(ordered, opts.page, perPage);
    if (pageIds.length === 0) {
      return { items: [], total, page: opts.page, perPage, hasMore };
    }

    // Hydrate the page from Typesense (published-only enforced by the adapter's
    // base filter). Reorder to match our custom order — Typesense does not
    // preserve the id-list order.
    const res = await this.search.searchProducts({ ids: pageIds, limit: pageIds.length });
    const byId = new Map<string, any>(res.data.map((d: any) => [d.id, d]));
    const items = pageIds.map((id) => byId.get(id)).filter(Boolean);

    return { items, total, page: opts.page, perPage, hasMore };
  }
}
