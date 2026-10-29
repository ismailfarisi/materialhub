import { config } from "@materialhub/config";
import Typesense from "typesense";
import {
  type ServiceOfferingDocument,
  serviceOfferingCollectionSchema,
} from "./service-offering.collection.ts";
import type {
  FacetCount,
  ServiceFilters,
  ServiceSearchFacets,
  ServiceSearchResult,
} from "./service-search.interface.ts";

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 50;

/**
 * Slug/enum values are interpolated directly into Typesense's `filter_by`
 * string, where a stray `|`, `&`, `,`, `:` or bracket can append or override
 * clauses — including the `status:=published` gate. These params are always
 * slugs or fixed enum values, so anything outside [a-z0-9-_] is rejected
 * rather than escaped.
 */
function safeFilterValue(value: string): string | null {
  return /^[a-zA-Z0-9_-]+$/.test(value) ? value : null;
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

export class ServiceSearchAdapter {
  private collectionName = config.typesense.servicesCollectionName;

  async ensureCollection(): Promise<void> {
    const ts = getClient();
    try {
      await ts.collections(this.collectionName).retrieve();
    } catch {
      await ts
        .collections()
        .create({ ...serviceOfferingCollectionSchema, name: this.collectionName });
    }
  }

  /**
   * Drops and recreates the collection — for a deliberate schema rebuild via
   * the CLI's opt-in `--recreate` flag only. The nightly reindex never calls
   * this; it upserts + prunes in place (see `reindexAll`'s doc comment).
   */
  async recreateCollection(): Promise<void> {
    const ts = getClient();
    try {
      await ts.collections(this.collectionName).delete();
    } catch {
      // Collection did not exist yet; creating it below is the whole job.
    }
    await ts
      .collections()
      .create({ ...serviceOfferingCollectionSchema, name: this.collectionName });
  }

  buildServiceSearchParams(filters: ServiceFilters): Record<string, any> {
    const filterParts: string[] = ["status:=published"];

    if (filters.area) {
      const area = safeFilterValue(filters.area);
      // For an "either" offering `area_slugs` is the UNION of the premises and
      // home-visit coverage sets, so pairing it with the visit filter matches
      // offerings the vendor can't be had that way in that area: a salon with
      // a Dubai Marina branch that only travels to JLT would answer
      // `?visit=home_visit&area=dubai-marina`. When the caller has picked a
      // side, filter on that side's own slug bucket instead of the union.
      if (area) {
        if (filters.visit === "at_premises") {
          filterParts.push(`premises_area_slugs:=${area}`);
        } else if (filters.visit === "home_visit") {
          filterParts.push(`home_visit_area_slugs:=${area}`);
        } else {
          filterParts.push(`area_slugs:=${area}`);
        }
      }
    }
    if (filters.category) {
      const category = safeFilterValue(filters.category);
      if (category) filterParts.push(`category_slug:=${category}`);
    }

    // The widening rule. An offering with location_mode "either" is obtainable
    // BOTH ways, so it must satisfy either visit filter — excluding it would
    // hide the most flexible services from both sides of the toggle.
    if (filters.visit === "at_premises") {
      filterParts.push("location_mode:=[at_premises,either]");
    } else if (filters.visit === "home_visit") {
      filterParts.push("location_mode:=[home_visit,either]");
    }

    if (filters.minPrice != null) filterParts.push(`price_fils:>= ${filters.minPrice}`);
    if (filters.maxPrice != null) filterParts.push(`price_fils:<= ${filters.maxPrice}`);
    if (filters.minDuration != null) {
      filterParts.push(`duration_minutes:>= ${filters.minDuration}`);
    }
    if (filters.maxDuration != null) {
      filterParts.push(`duration_minutes:<= ${filters.maxDuration}`);
    }

    // Guard `> 0` so an empty or zero value is a no-op rather than a
    // match-all clause (same posture as the product adapter's rating filter).
    if (filters.minRating != null) {
      const minRating = Number(filters.minRating);
      if (Number.isFinite(minRating) && minRating > 0) {
        filterParts.push(`rating_avg:>= ${minRating}`);
      }
    }

    if (filters.paymentMode) {
      const paymentMode = safeFilterValue(filters.paymentMode);
      if (paymentMode) filterParts.push(`payment_mode:=${paymentMode}`);
    }

    let sortBy: string;
    switch (filters.sortBy) {
      case "price_asc":
        sortBy = "price_fils:asc";
        break;
      case "price_desc":
        sortBy = "price_fils:desc";
        break;
      case "rating":
        sortBy = "rating_avg:desc";
        break;
      case "newest":
        sortBy = "created_at:desc";
        break;
      default:
        sortBy = filters.query ? "_text_match:desc,rating_avg:desc" : "created_at:desc";
    }

    return {
      q: filters.query || "*",
      query_by: "name,description,category_name,vendor_name,area_names",
      filter_by: filterParts.join(" && "),
      sort_by: sortBy,
      facet_by: "area_slugs,category_slug,location_mode,payment_mode,vendor_slug",
      max_facet_values: 50,
      per_page: Math.min(filters.limit || DEFAULT_LIMIT, MAX_LIMIT),
      page: Math.max(filters.page || 1, 1),
      typo_tokens_threshold: 2,
      num_typos: 2,
    };
  }

  async searchServices(filters: ServiceFilters): Promise<ServiceSearchResult> {
    const ts = getClient();
    const params = this.buildServiceSearchParams(filters);
    const result: any = await ts
      .collections(this.collectionName)
      .documents()
      .search(params as any);

    const raw: Record<string, FacetCount[]> = {};
    for (const fc of (result.facet_counts || []) as any[]) {
      raw[fc.field_name] = fc.counts.map((c: any) => ({ value: c.value, count: c.count }));
    }

    const facets: ServiceSearchFacets = {
      areas: raw.area_slugs ?? [],
      categories: raw.category_slug ?? [],
      visitTypes: raw.location_mode ?? [],
      paymentModes: raw.payment_mode ?? [],
      vendors: raw.vendor_slug ?? [],
    };

    return {
      data: (result.hits || []).map((h: any) => h.document as ServiceOfferingDocument),
      total: result.found || 0,
      page: params.page,
      limit: params.per_page,
      facets,
    };
  }

  async indexOffering(doc: ServiceOfferingDocument): Promise<void> {
    const ts = getClient();
    await ts.collections(this.collectionName).documents().upsert(doc);
  }

  async removeOffering(offeringId: string): Promise<void> {
    const ts = getClient();
    try {
      await ts.collections(this.collectionName).documents(offeringId).delete();
    } catch {
      // Already absent — deleting a document that was never indexed (a draft
      // that went straight to archived) is a no-op, not an error.
    }
  }

  /**
   * All ids currently present in the collection, paged out via
   * `include_fields: "id"` — same shape as the product adapter's
   * `searchProductIds`/`collectIds` in typesense-search.adapter.ts, but
   * uncapped since the nightly reconcile needs the full stale-doc set to
   * prune against, not a bounded page.
   */
  async listIndexedIds(): Promise<string[]> {
    const ts = getClient();
    const perPage = 250; // Typesense max per_page
    return collectAllIds(async (page) => {
      const res: any = await ts.collections(this.collectionName).documents().search({
        q: "*",
        query_by: "name",
        include_fields: "id",
        per_page: perPage,
        page,
      });
      return {
        ids: (res.hits || []).map((h: any) => h.document.id),
        found: res.found || 0,
      };
    }, perPage);
  }
}

// Pure pagination accumulator — mirrors collectIds in the sibling product
// adapter (typesense-search.adapter.ts). Exported for unit testing without a
// live Typesense connection.
export async function collectAllIds(
  fetchPage: (page: number) => Promise<{ ids: string[]; found: number }>,
  perPage: number,
): Promise<string[]> {
  const out: string[] = [];
  let page = 1;
  for (;;) {
    const { ids, found } = await fetchPage(page);
    if (ids.length === 0) break;
    out.push(...ids);
    if (page * perPage >= found) break;
    page += 1;
  }
  return out;
}
