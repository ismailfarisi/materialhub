// delivery-filter.ts — resolves the same-day / next-day search filter (workstream 5).
// Rules live in delivery-eligibility.ts.
import { AppDataSource, Product, Warehouse } from "@materialhub/database";
import { In, IsNull, Not } from "typeorm";
import {
  type DeliverySpeedFilter,
  isDeliveryEligible,
  normaliseEmirate,
} from "./delivery-eligibility.ts";

export { parseDeliverySpeed } from "./delivery-eligibility.ts";

export interface DeliveryFilterResult {
  vendorIds: string[];
  excludeProductIds: string[];
}

/** Suppliers whose default warehouse qualifies, minus made-to-order products that don't. */
export async function resolveDeliveryFilter(
  speed: DeliverySpeedFilter,
  emirateInput: unknown,
): Promise<DeliveryFilterResult | null> {
  const emirate = normaliseEmirate(emirateInput);
  if (!emirate) return null;

  const warehouses = await AppDataSource.getRepository(Warehouse)
    .createQueryBuilder("w")
    .distinctOn(["w.vendor_id"])
    .where("w.is_active = true AND w.vendor_id IS NOT NULL")
    .orderBy("w.vendor_id")
    .addOrderBy("w.is_default", "DESC")
    .addOrderBy("w.created_at", "ASC")
    .getMany();
  const byVendor = new Map(
    warehouses
      .filter((w) => isDeliveryEligible(w, speed, emirate))
      .map((w) => [w.vendor_id as string, w]),
  );
  const vendorIds = [...byVendor.keys()];
  if (vendorIds.length === 0) return { vendorIds, excludeProductIds: [] };

  const overridden = await AppDataSource.getRepository(Product).find({
    where: { vendor_id: In(vendorIds), handling_days_override: Not(IsNull()) },
    select: { id: true, vendor_id: true, handling_days_override: true },
  });
  const excludeProductIds = overridden
    .filter((p) => {
      const wh = byVendor.get(p.vendor_id);
      return !wh || !isDeliveryEligible(wh, speed, emirate, p.handling_days_override);
    })
    .map((p) => p.id);
  return { vendorIds, excludeProductIds };
}
