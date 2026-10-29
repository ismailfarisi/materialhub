import type { CollectionCreateSchema } from "typesense/lib/Typesense/Collections.js";

export const serviceOfferingCollectionSchema: CollectionCreateSchema = {
  name: "service_offerings",
  default_sorting_field: "price_fils",
  fields: [
    { name: "name", type: "string" },
    { name: "description", type: "string", optional: true },
    { name: "slug", type: "string" },
    { name: "vendor_id", type: "string" },
    { name: "vendor_name", type: "string", facet: true },
    { name: "vendor_slug", type: "string", facet: true, optional: true },
    { name: "category_id", type: "string", optional: true },
    { name: "category_name", type: "string", facet: true },
    { name: "category_slug", type: "string", facet: true, optional: true },
    { name: "price_fils", type: "int32" },
    { name: "duration_minutes", type: "int32", facet: true },
    { name: "location_mode", type: "string", facet: true },
    { name: "payment_mode", type: "string", facet: true },
    // Mode-resolved: which areas THIS offering can actually be had in.
    { name: "area_ids", type: "string[]", facet: true },
    { name: "area_slugs", type: "string[]", facet: true },
    { name: "area_names", type: "string[]", facet: true },
    // Kept apart so a result card can say "at their salon in X" vs
    // "comes to you in X" instead of inferring it from location_mode.
    { name: "premises_area_ids", type: "string[]", optional: true },
    { name: "home_visit_area_ids", type: "string[]", optional: true },
    // Slug twins of the two id buckets. `area_slugs` is the UNION for an
    // "either" offering, so an `area` + `visit` query filtered on it matches
    // offerings the vendor can't actually serve that way — see
    // buildServiceSearchParams' bucket-scoped area clause.
    { name: "premises_area_slugs", type: "string[]", facet: true, optional: true },
    { name: "home_visit_area_slugs", type: "string[]", facet: true, optional: true },
    { name: "rating_avg", type: "float", facet: true, optional: true },
    { name: "rating_count", type: "int32", optional: true },
    { name: "media_urls", type: "string[]", optional: true },
    { name: "status", type: "string" },
    { name: "created_at", type: "int64" },
  ],
  token_separators: ["-", "/"],
  enable_nested_fields: false,
};

export interface AreaRef {
  id: string;
  slug: string;
  name: string;
}

/**
 * A vendor's two independent coverage sets. `premises` are the areas of the
 * vendor's ACTIVE branches (vendor_locations); `homeVisit` are the areas the
 * vendor travels to (service_areas). Which one applies to a given offering
 * depends on that offering's own location_mode — see resolveAreas below.
 */
export interface VendorAreaSets {
  premises: AreaRef[];
  homeVisit: AreaRef[];
}

export interface ServiceOfferingDocument {
  id: string;
  name: string;
  description?: string;
  slug: string;
  vendor_id: string;
  vendor_name: string;
  vendor_slug?: string;
  category_id?: string;
  category_name: string;
  category_slug?: string;
  price_fils: number;
  duration_minutes: number;
  location_mode: string;
  payment_mode: string;
  area_ids: string[];
  area_slugs: string[];
  area_names: string[];
  premises_area_ids?: string[];
  home_visit_area_ids?: string[];
  premises_area_slugs?: string[];
  home_visit_area_slugs?: string[];
  rating_avg?: number;
  rating_count?: number;
  media_urls?: string[];
  status: string;
  created_at: number;
}

function dedupeById(refs: AreaRef[]): AreaRef[] {
  const seen = new Set<string>();
  const out: AreaRef[] = [];
  for (const ref of refs) {
    if (seen.has(ref.id)) continue;
    seen.add(ref.id);
    out.push(ref);
  }
  return out;
}

/**
 * THE mode-aware rule, resolved once at index time so the read path is a
 * plain `area_ids:=<id>` term match rather than a conditional join.
 *
 *   at_premises -> the vendor's active branch areas
 *   home_visit  -> the areas the vendor travels to
 *   either      -> the union of both, de-duplicated
 */
export function resolveAreas(
  locationMode: string,
  areas: VendorAreaSets,
): { all: AreaRef[]; premises: AreaRef[]; homeVisit: AreaRef[] } {
  const premisesApplies = locationMode === "at_premises" || locationMode === "either";
  const homeVisitApplies = locationMode === "home_visit" || locationMode === "either";
  // A vendor with two branches in the same area (or two service_areas rows
  // for the same zone) yields duplicate refs from resolveVendorAreas — dedupe
  // each set individually, not just the combined `all` array, or a result
  // card renders "At their salon in Dubai Marina, Dubai Marina".
  const premises = premisesApplies ? dedupeById(areas.premises) : [];
  const homeVisit = homeVisitApplies ? dedupeById(areas.homeVisit) : [];
  return { all: dedupeById([...premises, ...homeVisit]), premises, homeVisit };
}

/**
 * What `serviceOfferingToDocument` actually reads: the scalar
 * `ServiceOffering` columns, plus the `vendor`/`category` refs that are
 * hydrated separately (the entity itself has no such relations — see
 * hydrate-offering-refs.ts). This is deliberately NOT the TypeORM entity
 * type: the hydrated shape only exists after that separate step runs.
 */
export interface ServiceOfferingForIndexing {
  id: string;
  name: string;
  description?: string | null;
  slug: string;
  vendor_id: string;
  category_id?: string | null;
  price_fils: number;
  duration_minutes: number;
  location_mode: string;
  payment_mode: string;
  media_urls?: string[];
  status: string;
  created_at: Date | string;
  vendor?: { name: string; slug: string };
  category?: { name: string; slug: string };
}

export function serviceOfferingToDocument(
  offering: ServiceOfferingForIndexing,
  areas: VendorAreaSets,
  rating?: { avg: number; count: number },
): ServiceOfferingDocument {
  const resolved = resolveAreas(offering.location_mode, areas);

  return {
    id: offering.id,
    name: offering.name,
    description: offering.description || undefined,
    slug: offering.slug,
    vendor_id: offering.vendor_id,
    vendor_name: offering.vendor?.name || "Unknown",
    vendor_slug: offering.vendor?.slug || undefined,
    category_id: offering.category_id || undefined,
    category_name: offering.category?.name || "Uncategorized",
    category_slug: offering.category?.slug || undefined,
    price_fils: offering.price_fils,
    duration_minutes: offering.duration_minutes,
    location_mode: offering.location_mode,
    payment_mode: offering.payment_mode,
    area_ids: resolved.all.map((a) => a.id),
    area_slugs: resolved.all.map((a) => a.slug),
    area_names: resolved.all.map((a) => a.name),
    premises_area_ids: resolved.premises.map((a) => a.id),
    home_visit_area_ids: resolved.homeVisit.map((a) => a.id),
    premises_area_slugs: resolved.premises.map((a) => a.slug),
    home_visit_area_slugs: resolved.homeVisit.map((a) => a.slug),
    rating_avg: rating ? rating.avg : undefined,
    rating_count: rating ? rating.count : undefined,
    media_urls: offering.media_urls?.length ? offering.media_urls : undefined,
    status: offering.status,
    created_at: Math.floor(new Date(offering.created_at).getTime() / 1000),
  };
}
