import type { AreaRef, VendorAreaSets } from "./service-offering.collection.ts";

export interface VendorAreaRow {
  vendor_id: string;
  area_id: string;
  slug: string;
  name: string;
}

export interface VendorAreaDeps {
  loadBranchAreas: (vendorIds: string[]) => Promise<VendorAreaRow[]>;
  loadServiceAreas: (vendorIds: string[]) => Promise<VendorAreaRow[]>;
}

/**
 * Only ACTIVE, non-deleted branches with an area_id count as premises
 * coverage — a deactivated branch must not keep a service listed in that
 * area. Service areas are soft-deletable, so the same deleted_at guard
 * applies there.
 */
export const defaultVendorAreaDeps: VendorAreaDeps = {
  loadBranchAreas: async (vendorIds: string[]) => {
    const { AppDataSource } = await import("@materialhub/database");
    return AppDataSource.query(
      `SELECT vl.vendor_id, vl.area_id, dz.slug, dz.name
         FROM vendor_locations vl
         JOIN delivery_zones dz ON dz.id = vl.area_id AND dz.deleted_at IS NULL
        WHERE vl.vendor_id = ANY($1)
          AND vl.deleted_at IS NULL
          AND vl.is_active = true
          AND vl.area_id IS NOT NULL`,
      [vendorIds],
    );
  },
  loadServiceAreas: async (vendorIds: string[]) => {
    const { AppDataSource } = await import("@materialhub/database");
    return AppDataSource.query(
      `SELECT sa.vendor_id, sa.area_id, dz.slug, dz.name
         FROM service_areas sa
         JOIN delivery_zones dz ON dz.id = sa.area_id AND dz.deleted_at IS NULL
        WHERE sa.vendor_id = ANY($1)
          AND sa.deleted_at IS NULL`,
      [vendorIds],
    );
  },
};

export async function resolveVendorAreas(
  vendorIds: string[],
  deps: VendorAreaDeps = defaultVendorAreaDeps,
): Promise<Map<string, VendorAreaSets>> {
  const result = new Map<string, VendorAreaSets>();
  if (vendorIds.length === 0) return result;

  // Seed every requested vendor so a vendor with zero coverage yields an
  // empty set rather than `undefined` at the call site.
  for (const id of vendorIds) result.set(id, { premises: [], homeVisit: [] });

  const [branches, areas] = await Promise.all([
    deps.loadBranchAreas(vendorIds),
    deps.loadServiceAreas(vendorIds),
  ]);

  const toRef = (row: VendorAreaRow): AreaRef => ({
    id: row.area_id,
    slug: row.slug,
    name: row.name,
  });

  for (const row of branches) result.get(row.vendor_id)?.premises.push(toRef(row));
  for (const row of areas) result.get(row.vendor_id)?.homeVisit.push(toRef(row));

  return result;
}
