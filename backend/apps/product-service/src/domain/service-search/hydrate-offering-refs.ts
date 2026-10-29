/**
 * `service_offerings` has no TypeORM `vendor` / `category` relation — only
 * raw `vendor_id` / `category_id` columns (see
 * backend/libs/database/src/entities/service-offering.entity.ts). Asking
 * TypeORM to eager-load `relations: ["vendor", "category"]` throws
 * `EntityPropertyNotFoundError` at runtime, which is why every sync job and
 * reindex batch was failing silently before this fix.
 *
 * This helper hydrates the same `{ name, slug }` shape the mapper expects,
 * via two batched raw queries — never one query per row, since the reindex
 * path calls this once per 100-row page.
 */

export interface HydratableOffering {
  vendor_id: string | null;
  category_id?: string | null;
  vendor?: { name: string; slug: string };
  category?: { name: string; slug: string };
}

interface RefRow {
  id: string;
  name: string;
  slug: string;
}

export interface HydrateOfferingRefsDeps {
  loadVendorRefs: (vendorIds: string[]) => Promise<RefRow[]>;
  loadCategoryRefs: (categoryIds: string[]) => Promise<RefRow[]>;
}

export const defaultHydrateOfferingRefsDeps: HydrateOfferingRefsDeps = {
  loadVendorRefs: async (vendorIds: string[]) => {
    const { AppDataSource } = await import("@materialhub/database");
    return AppDataSource.query(
      "SELECT id, name, slug FROM vendors WHERE id = ANY($1) AND deleted_at IS NULL",
      [vendorIds],
    );
  },
  loadCategoryRefs: async (categoryIds: string[]) => {
    const { AppDataSource } = await import("@materialhub/database");
    return AppDataSource.query(
      "SELECT id, name, slug FROM categories WHERE id = ANY($1) AND deleted_at IS NULL",
      [categoryIds],
    );
  },
};

/**
 * Mutates each offering in place, attaching `vendor`/`category` refs. Leaves
 * them `undefined` for a null id or an id with no matching (or soft-deleted)
 * row, matching the "Unknown"/"Uncategorized" fallback in
 * serviceOfferingToDocument.
 */
export async function hydrateOfferingRefs(
  offerings: HydratableOffering[],
  deps: HydrateOfferingRefsDeps = defaultHydrateOfferingRefsDeps,
): Promise<void> {
  if (offerings.length === 0) return;

  const vendorIds = [
    ...new Set(offerings.map((o) => o.vendor_id).filter((id): id is string => Boolean(id))),
  ];
  const categoryIds = [
    ...new Set(offerings.map((o) => o.category_id).filter((id): id is string => Boolean(id))),
  ];

  const [vendorRows, categoryRows] = await Promise.all([
    vendorIds.length > 0 ? deps.loadVendorRefs(vendorIds) : Promise.resolve([] as RefRow[]),
    categoryIds.length > 0 ? deps.loadCategoryRefs(categoryIds) : Promise.resolve([] as RefRow[]),
  ]);

  const vendorById = new Map(vendorRows.map((r) => [r.id, { name: r.name, slug: r.slug }]));
  const categoryById = new Map(categoryRows.map((r) => [r.id, { name: r.name, slug: r.slug }]));

  for (const offering of offerings) {
    offering.vendor = offering.vendor_id ? vendorById.get(offering.vendor_id) : undefined;
    offering.category = offering.category_id ? categoryById.get(offering.category_id) : undefined;
  }
}
