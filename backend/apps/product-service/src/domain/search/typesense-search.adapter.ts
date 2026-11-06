import { config } from "@materialhub/config";
import type { PaginatedResult } from "@materialhub/utils";
import Typesense from "typesense";
import type { ProductFilters, SearchService, SuggestProduct } from "./search.interface.ts";
import {
  type CategoryAncestors,
  type GroupInfoForIndex,
  productCollectionSchema,
  productToDocument,
} from "./typesense.collection.ts";

async function loadCategoryAncestors(categoryId: string): Promise<CategoryAncestors> {
  // Lazy import keeps the adapter unit-testable without a live data source —
  // the only DB dependency in this file is the recursive CTE below.
  const { AppDataSource } = await import("@materialhub/database");
  const rows: Array<{ id: string; slug: string }> = await AppDataSource.query(
    `WITH RECURSIVE chain AS (
       SELECT id, slug, parent_id, 0 AS depth
         FROM categories
         WHERE id = $1 AND deleted_at IS NULL
       UNION ALL
       SELECT c.id, c.slug, c.parent_id, chain.depth + 1
         FROM categories c
         JOIN chain ON c.id = chain.parent_id
         WHERE c.deleted_at IS NULL
     )
     SELECT id, slug FROM chain ORDER BY depth ASC`,
    [categoryId],
  );
  return {
    ids: rows.map((r) => r.id),
    slugs: rows.map((r) => r.slug),
  };
}

let client: InstanceType<typeof Typesense.Client> | null = null;

function getClient(): InstanceType<typeof Typesense.Client> {
  if (!client) {
    client = new Typesense.Client({
      nodes: [
        {
          host: config.typesense.host,
          port: config.typesense.port,
          protocol: config.typesense.protocol,
        },
      ],
      apiKey: config.typesense.apiKey,
      connectionTimeoutSeconds: 2,
    });
  }
  return client;
}

function normalizeLocale(locale?: string | null): "ar" | "en" {
  const first = locale?.split(",")[0]?.trim().toLowerCase();
  if (first?.startsWith("ar")) return "ar";
  return "en";
}

/**
 * Pure helper: given a raw Typesense search result for a didYouMean query,
 * extract the best correction token. Exported so it can be unit-tested
 * without a live Typesense connection.
 */
export function extractDidYouMean(result: any): string | null {
  if (!result?.found || result.found === 0) return null;
  const hit = result.hits?.[0];
  const snippet: string | undefined = hit?.highlights?.[0]?.snippet;
  if (snippet) {
    const m = snippet.match(/<mark>([^<]+)<\/mark>/);
    if (m?.[1]) return m[1];
  }
  const name: string | undefined = hit?.document?.name;
  return name?.split(/\s+/)[0]?.toLowerCase() ?? null;
}

// Pure pagination accumulator — exported for unit testing without a live client.
export async function collectIds(
  fetchPage: (page: number) => Promise<{ ids: string[]; found: number }>,
  opts: { cap: number; perPage: number },
): Promise<string[]> {
  if (opts.cap <= 0) return [];
  const out: string[] = [];
  let page = 1;
  while (out.length < opts.cap) {
    const { ids, found } = await fetchPage(page);
    if (ids.length === 0) break;
    out.push(...ids);
    if (page * opts.perPage >= found) break;
    page += 1;
  }
  return out.slice(0, opts.cap);
}

export class TypesenseSearchAdapter implements SearchService {
  private collectionName = config.typesense.collectionName;

  async ensureCollection(): Promise<void> {
    const ts = getClient();
    try {
      await ts.collections(this.collectionName).retrieve();
    } catch {
      await ts.collections().create(productCollectionSchema);
    }
  }

  buildSearchParams(filters: ProductFilters): Record<string, any> {
    const filterParts: string[] = ["status:=published"];

    // Collapse grouped families: in `collapsed` mode show only the primary member.
    // Non-grouped (group_listing_mode:"none") and `individual`-mode members pass.
    filterParts.push("(group_listing_mode:!=collapsed || is_group_primary:=true)");

    if (filters.ids?.length) {
      filterParts.push(
        filters.ids.length > 1 ? `id:=[${filters.ids.join(",")}]` : `id:=${filters.ids[0]}`,
      );
    }

    if (filters.categoryId) {
      const ids = Array.isArray(filters.categoryId) ? filters.categoryId : [filters.categoryId];
      filterParts.push(
        ids.length > 1 ? `category_ids:=[${ids.join(",")}]` : `category_ids:=${ids[0]}`,
      );
    } else if (filters.category) {
      const slugs = Array.isArray(filters.category)
        ? filters.category
        : filters.category.split(",");
      filterParts.push(
        slugs.length > 1 ? `category_slugs:=[${slugs.join(",")}]` : `category_slugs:=${slugs[0]}`,
      );
    }

    if (filters.brandId) {
      const ids = Array.isArray(filters.brandId) ? filters.brandId : [filters.brandId];
      filterParts.push(ids.length > 1 ? `brand_id:=[${ids.join(",")}]` : `brand_id:=${ids[0]}`);
    } else if (filters.brand) {
      const slugs = Array.isArray(filters.brand) ? filters.brand : filters.brand.split(",");
      filterParts.push(
        slugs.length > 1 ? `brand_slug:=[${slugs.join(",")}]` : `brand_slug:=${slugs[0]}`,
      );
    }

    if (filters.vendorId) {
      const ids = Array.isArray(filters.vendorId) ? filters.vendorId : [filters.vendorId];
      filterParts.push(ids.length > 1 ? `vendor_id:=[${ids.join(",")}]` : `vendor_id:=${ids[0]}`);
    } else if (filters.vendor) {
      const slugs = Array.isArray(filters.vendor) ? filters.vendor : filters.vendor.split(",");
      filterParts.push(
        slugs.length > 1 ? `vendor_slug:=[${slugs.join(",")}]` : `vendor_slug:=${slugs[0]}`,
      );
    }
    if (filters.deliveryVendorIds) {
      // An empty list means no supplier qualifies: match nothing.
      const ids = filters.deliveryVendorIds.length ? filters.deliveryVendorIds : ["__none__"];
      filterParts.push(`vendor_id:=[${ids.join(",")}]`);
      if (filters.deliveryExcludeProductIds?.length) {
        filterParts.push(`id:!=[${filters.deliveryExcludeProductIds.join(",")}]`);
      }
    }
    if (filters.minPrice != null) filterParts.push(`price_min:>= ${filters.minPrice}`);
    if (filters.maxPrice != null) filterParts.push(`price_max:<= ${filters.maxPrice}`);
    // Rating filter: URL param arrives as a string ("4"); coerce so the Typesense
    // numeric comparison is unambiguous. `>=` matches the "4.0 & up" UI semantics.
    // Guard `> 0` so an empty/zero value is a no-op rather than a match-all clause.
    if (filters.minRating != null) {
      const minRating = Number(filters.minRating);
      if (Number.isFinite(minRating) && minRating > 0) {
        filterParts.push(`rating_avg:>= ${minRating}`);
      }
    }
    if (filters.inStock != null) filterParts.push(`in_stock:=${filters.inStock}`);
    if (filters.tags?.length) {
      filterParts.push(`tags:=[${filters.tags.join(",")}]`);
    }
    if (filters.skus?.length) {
      filterParts.push(`skus:=[${filters.skus.join(",")}]`);
    }
    if (filters.attributes?.length) {
      for (const attr of filters.attributes) {
        switch (attr.kind) {
          case "checkbox": {
            // Array form `attributes:=[a:v1, a:v2]` matches docs whose
            // multi-valued `attributes` field contains ANY of the listed
            // tokens (OR within the same attribute). Emitting one clause
            // per valueId joined by `&&` would force AND semantics and a
            // product would have to carry every selected value at once.
            if (!attr.valueIds.length) break;
            const tokens = attr.valueIds.map((v) => `${attr.attributeId}:${v}`);
            filterParts.push(`attributes:=[${tokens.join(",")}]`);
            break;
          }
          case "radio":
            filterParts.push(`attributes:=${attr.attributeId}:${attr.valueId}`);
            break;
          case "range":
            if (attr.min != null) filterParts.push(`attr_${attr.attributeSlug}:>=${attr.min}`);
            if (attr.max != null) filterParts.push(`attr_${attr.attributeSlug}:<=${attr.max}`);
            break;
          case "toggle":
            filterParts.push(`attr_${attr.attributeSlug}:=${attr.value}`);
            break;
        }
      }
    }

    let sortBy: string;
    switch (filters.sortBy) {
      case "price_asc":
        sortBy = "price_min:asc";
        break;
      case "price_desc":
        sortBy = "price_min:desc";
        break;
      case "newest":
        sortBy = "created_at:desc";
        break;
      case "rating":
        sortBy = "rating_avg:desc";
        break;
      default:
        sortBy = filters.query ? "_text_match:desc,rating_avg:desc" : "created_at:desc";
    }

    return {
      q: filters.query || "*",
      query_by: "name,description,tags,category_name,brand_name",
      filter_by: filterParts.join(" && "),
      sort_by: sortBy,
      facet_by: "category_name,brand_slug,attributes,vendor_slug,in_stock",
      max_facet_values: 50,
      per_page: filters.limit || 20,
      page: filters.cursor ? Number(filters.cursor) : 1,
      typo_tokens_threshold: 2,
      num_typos: 2,
      highlight_full_fields: "name,description",
    };
  }

  async searchProducts(filters: ProductFilters): Promise<PaginatedResult<any>> {
    const ts = getClient();
    const params = this.buildSearchParams(filters);
    const result = await ts.collections(this.collectionName).documents().search(params);

    const items = (result.hits || []).map((hit: any) => hit.document);
    const page = params.page;
    const hasMore = page * params.per_page < (result.found || 0);

    const rawFacets: Record<string, Array<{ value: string; count: number }>> = {};
    if (result.facet_counts) {
      for (const fc of result.facet_counts as any[]) {
        rawFacets[fc.field_name] = fc.counts.map((c: any) => ({
          value: c.value,
          count: c.count,
        }));
      }
    }

    const brandFacets = await this.hydrateBrandFacets(rawFacets.brand_slug ?? []);
    const vendorFacets = await this.hydrateVendorFacets(rawFacets.vendor_slug ?? []);
    const attributeFacets = await this.hydrateAttributeFacets(
      rawFacets.attributes ?? [],
      filters.locale,
    );

    const facets = {
      ...rawFacets,
      brands: brandFacets,
      vendors: vendorFacets,
      attributes: attributeFacets,
    };

    return {
      data: items,
      total: result.found || 0,
      cursor: hasMore ? String(page + 1) : undefined,
      facets,
    } as any;
  }

  async searchProductIds(filters: ProductFilters, cap: number): Promise<string[]> {
    const ts = getClient();
    const perPage = 250; // Typesense max per_page
    const base = this.buildSearchParams({ ...filters, limit: perPage });
    return collectIds(
      async (page) => {
        const res = await ts
          .collections(this.collectionName)
          .documents()
          .search({
            ...base,
            page,
            per_page: perPage,
            include_fields: "id",
            facet_by: "",
            highlight_fields: "none",
          });
        return {
          ids: (res.hits || []).map((h: any) => h.document.id),
          found: res.found || 0,
        };
      },
      { cap, perPage },
    );
  }

  private async hydrateAttributeFacets(
    raw: Array<{ value: string; count: number }>,
    locale?: string | null,
  ): Promise<
    Array<{
      key: string; // attribute slug — frontend URL param name
      attributeId: string; // attribute UUID — for Typesense filter writes
      name: string;
      filter_input_type: string | null;
      values: Array<{
        value: string; // attribute value slug — URL token
        label: string;
        count: number;
        color_hex?: string | null;
        swatch_image_url?: string | null;
      }>;
    }>
  > {
    if (!raw.length) return [];

    // Typesense bucket values are "attrId:valId" strings
    const buckets = new Map<string, Map<string, number>>();
    for (const { value, count } of raw) {
      const [attrId, valId] = value.split(":");
      if (!attrId || !valId) continue;
      if (!buckets.has(attrId)) buckets.set(attrId, new Map());
      buckets.get(attrId)!.set(valId, count);
    }

    const { AppDataSource, Attribute, AttributeTranslation, AttributeValueTranslation } =
      await import("@materialhub/database");
    const attrIds = [...buckets.keys()];
    if (!attrIds.length) return [];

    const attrs = await AppDataSource.getRepository(Attribute).find({
      where: attrIds.map((id) => ({ id, is_filterable: true as any })),
      relations: ["values"],
    });
    const resolvedLocale = normalizeLocale(locale);
    const attrTranslations =
      resolvedLocale === "ar"
        ? await AppDataSource.getRepository(AttributeTranslation).find({
            where: attrIds.map((id) => ({ attribute_id: id, locale: resolvedLocale })),
          })
        : [];
    const attrNameById = new Map(
      attrTranslations.map((translation: any) => [translation.attribute_id, translation.name]),
    );
    const valueIds = attrs.flatMap((a) => [...(buckets.get(a.id)?.keys() ?? [])]);
    const valueTranslations =
      resolvedLocale === "ar" && valueIds.length
        ? await AppDataSource.getRepository(AttributeValueTranslation).find({
            where: valueIds.map((id) => ({
              attribute_value_id: id,
              locale: resolvedLocale,
            })),
          })
        : [];
    const valueLabelById = new Map(
      valueTranslations.map((translation: any) => [
        translation.attribute_value_id,
        translation.display_value ?? translation.value,
      ]),
    );

    return attrs
      .filter((a) => a.filter_input_type !== null)
      .map((a) => {
        const valueCounts = buckets.get(a.id) ?? new Map<string, number>();
        const values = (a.values ?? [])
          .filter((v) => valueCounts.has(v.id))
          .map((v) => ({
            value: v.slug,
            label: valueLabelById.get(v.id) ?? v.display_value ?? v.value,
            count: valueCounts.get(v.id) ?? 0,
            color_hex: v.color_hex,
            swatch_image_url: v.swatch_image_url,
          }));
        return {
          key: a.slug,
          attributeId: a.id,
          name: attrNameById.get(a.id) ?? a.name,
          filter_input_type: a.filter_input_type,
          values,
        };
      });
  }

  private async hydrateBrandFacets(
    raw: Array<{ value: string; count: number }>,
  ): Promise<Array<{ value: string; label: string; count: number }>> {
    const slugs = raw.map(({ value }) => value).filter(Boolean);
    if (!slugs.length) return [];

    const { AppDataSource, Brand, BrandStatus } = await import("@materialhub/database");
    const brands = await AppDataSource.getRepository(Brand).find({
      // A brand awaiting review must not surface as a facet label, even if a
      // vendor already has products indexed against it.
      where: slugs.map((slug) => ({ slug, status: BrandStatus.approved })),
      select: { slug: true, name: true },
    });
    const nameBySlug = new Map(brands.map((brand: any) => [brand.slug, brand.name]));

    return raw
      .filter(({ value }) => !!value)
      .map(({ value, count }) => ({
        value,
        label: nameBySlug.get(value) ?? value,
        count,
      }));
  }

  // Vendor facets are keyed by vendor_slug (the filter URL token: `?vendor=<slug>`
  // maps to `vendor_slug:=<slug>`). We hydrate the display name from the vendors
  // table so the sidebar shows the vendor's name, not its slug. The frontend's
  // FacetConfig.vendors consumes `{ value: slug, label: name }`.
  private async hydrateVendorFacets(
    raw: Array<{ value: string; count: number }>,
  ): Promise<Array<{ value: string; label: string; count: number }>> {
    const slugs = raw.map(({ value }) => value).filter(Boolean);
    if (!slugs.length) return [];

    const { AppDataSource, Vendor } = await import("@materialhub/database");
    const vendors = await AppDataSource.getRepository(Vendor).find({
      where: slugs.map((slug) => ({ slug })),
      select: { slug: true, name: true },
    });
    const nameBySlug = new Map(vendors.map((vendor: any) => [vendor.slug, vendor.name]));

    return raw
      .filter(({ value }) => !!value)
      .map(({ value, count }) => ({
        value,
        label: nameBySlug.get(value) ?? value,
        count,
      }));
  }

  async indexProduct(product: any): Promise<void> {
    const ts = getClient();
    const ancestors = product.category_id
      ? await loadCategoryAncestors(product.category_id)
      : undefined;

    // Load group membership for this single product (no batch available here).
    const { AppDataSource, ProductGroupMember } = await import("@materialhub/database");
    const membership = await AppDataSource.getRepository(ProductGroupMember).findOne({
      where: { product_id: product.id },
      relations: ["group"],
    });
    let groupInfo: GroupInfoForIndex | null = null;
    if (membership) {
      const siblings = await AppDataSource.getRepository(ProductGroupMember).find({
        where: { group_id: membership.group_id },
        relations: ["product", "attributeValue"],
      });
      groupInfo = {
        group_id: membership.group_id,
        listing_mode: membership.group.listing_mode,
        is_primary: membership.is_primary,
        swatches: siblings.map((s) => s.attributeValue?.color_hex).filter((h): h is string => !!h),
        from_price: Math.min(...siblings.map((s) => s.product?.price ?? Number.POSITIVE_INFINITY)),
      };
    }

    const doc = productToDocument(product, ancestors, groupInfo);
    await ts
      .collections(this.collectionName)
      .documents()
      .upsert(doc as any);
  }

  async removeProduct(productId: string): Promise<void> {
    const ts = getClient();
    try {
      await ts.collections(this.collectionName).documents(productId).delete();
    } catch {
      // Document may not exist
    }
  }

  async didYouMean(query: string): Promise<string | null> {
    if (!query?.trim()) return null;
    const ts = getClient();
    const result: any = await ts.collections(this.collectionName).documents().search({
      q: query,
      query_by: "name,brand_name,category_name",
      per_page: 1,
      prefix: false,
      num_typos: 4,
    });
    return extractDidYouMean(result);
  }

  async suggest(query: string, limit = 5): Promise<SuggestProduct[]> {
    const ts = getClient();
    const result = await ts.collections(this.collectionName).documents().search({
      q: query,
      query_by: "name,brand_name,category_name",
      per_page: limit,
      prefix: true,
      num_typos: 1,
    });

    return (result.hits || []).map((hit: any) => {
      const d = hit.document;
      return {
        id: d.id,
        slug: d.slug,
        name: d.name,
        image_url: Array.isArray(d.images) && d.images.length ? (d.images[0] ?? null) : null,
        price_min: Number(d.price_min ?? 0),
        price_max: Number(d.price_max ?? d.price_min ?? 0),
      } satisfies SuggestProduct;
    });
  }
}
