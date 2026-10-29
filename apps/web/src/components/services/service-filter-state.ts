export interface ServiceFacetOption {
  value: string;
  label: string;
  count?: number;
}

export interface ServiceFacetConfig {
  areas: ServiceFacetOption[];
  categories: ServiceFacetOption[];
  priceRange: { min: number; max: number };
}

export type ServiceFilterDraft = Record<string, string>;

export interface ActiveServicePill {
  group: string;
  value: string;
  label: string;
}

/** Display/paging params, never filters. */
const NON_FILTER_PARAMS = new Set(["sort", "view", "page", "q"]);

/** Every param this UI can actually produce. Anything else is ignored. */
const KNOWN_GROUPS = new Set([
  "area",
  "category",
  "visit",
  "paymentMode",
  "minPrice",
  "maxPrice",
  "minDuration",
  "maxDuration",
  "minRating",
]);

export function computeActiveServiceFilters(
  config: ServiceFacetConfig,
  params: URLSearchParams,
): { pills: ActiveServicePill[]; count: number } {
  const pills: ActiveServicePill[] = [];
  let priceCounted = false;
  let durationCounted = false;

  for (const [key, value] of params.entries()) {
    if (!value) continue;
    if (NON_FILTER_PARAMS.has(key)) continue;
    // Unlike the product-side equivalent, an unrecognised param is DROPPED
    // rather than assumed to be an attribute — services have no attribute
    // facets, so treating `?mystery=1` as one would render a bogus pill.
    if (!KNOWN_GROUPS.has(key)) continue;

    if (key === "minPrice" || key === "maxPrice") {
      if (priceCounted) continue;
      priceCounted = true;
      const min = params.get("minPrice");
      const max = params.get("maxPrice");
      pills.push({
        group: "price",
        value: "price",
        label: `${min ?? config.priceRange.min / 100}–${max ?? "∞"}`,
      });
      continue;
    }

    if (key === "minDuration" || key === "maxDuration") {
      if (durationCounted) continue;
      durationCounted = true;
      pills.push({
        group: "duration",
        value: "duration",
        label: `${params.get("minDuration") ?? 0}–${params.get("maxDuration") ?? "∞"}`,
      });
      continue;
    }

    if (key === "area") {
      const opt = config.areas.find((a) => a.value === value);
      pills.push({ group: "area", value, label: opt?.label ?? value });
      continue;
    }

    if (key === "category") {
      const opt = config.categories.find((c) => c.value === value);
      pills.push({ group: "category", value, label: opt?.label ?? value });
      continue;
    }

    pills.push({ group: key, value, label: value });
  }

  return { pills, count: pills.length };
}
