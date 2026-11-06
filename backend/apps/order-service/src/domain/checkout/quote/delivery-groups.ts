import { type SampleShippingRule, capForSamples } from "../../cart/pricing/sample-shipping.ts";
import type { ApiShippingMethod } from "./defaults.ts";

export interface DgItem {
  id: string; // cart_items.id
  vendor_id: string; // vendors.id
  product_id: string;
  quantity: number;
  unit_price: number;
}

export interface DgRate {
  id: string;
  vendor_id: string | null; // null = platform-default
  zone_id: string | null; // null = any zone
  method: string; // free-form varchar
  base_cost: number;
  per_kg_cost: number | null;
  free_above: number | null;
  estimated_days_min: number | null;
  estimated_days_max: number | null;
}

export interface DgGroupMethod {
  id: ApiShippingMethod;
  price_fils: number;
  estimated_days: { min: number; max: number };
  free_threshold_fils: number | null;
}

export interface DgGroup {
  group_id: string;
  vendorIds: string[];
  itemIds: string[];
  methods: DgGroupMethod[];
  blocking: boolean;
}

const API_METHODS: readonly ApiShippingMethod[] = ["standard", "express", "same_day", "pickup"];

function rateScore(r: DgRate, vendorId: string, zoneId: string | null): number {
  // Precedence: (v=v, z=z) > (v=v, z=null) > (v=null, z=z) > (v=null, z=null).
  const v = r.vendor_id === vendorId ? 1 : r.vendor_id === null ? 0 : -1;
  const z = r.zone_id === zoneId ? 1 : r.zone_id === null ? 0 : -1;
  if (v < 0 || z < 0) return -1;
  return v * 2 + z;
}

function effectiveRates(
  vendorId: string,
  zoneId: string | null,
  allRates: DgRate[],
  subtotalFils: number,
  sampleShipping?: SampleShippingRule,
): Map<ApiShippingMethod, DgGroupMethod> {
  const byMethod = new Map<string, { rate: DgRate; score: number }>();
  for (const r of allRates) {
    const score = rateScore(r, vendorId, zoneId);
    if (score < 0) continue;
    const prev = byMethod.get(r.method);
    if (!prev || score > prev.score) byMethod.set(r.method, { rate: r, score });
  }
  const out = new Map<ApiShippingMethod, DgGroupMethod>();
  for (const { rate } of byMethod.values()) {
    if (!API_METHODS.includes(rate.method as ApiShippingMethod)) continue;
    const isFree = rate.free_above != null && subtotalFils >= rate.free_above;
    out.set(rate.method as ApiShippingMethod, {
      id: rate.method as ApiShippingMethod,
      price_fils: capForSamples(isFree ? 0 : rate.base_cost, vendorId, sampleShipping),
      estimated_days: {
        min: rate.estimated_days_min ?? 0,
        max: rate.estimated_days_max ?? 0,
      },
      free_threshold_fils: rate.free_above,
    });
  }
  return out;
}

export interface FormDeliveryGroupsInput {
  items: DgItem[];
  rates: DgRate[];
  zoneId: string | null;
  vendorHolidays: Set<string>;
  subtotalFils: number;
  /** Trade pricing: suppliers shipping only samples pay at most the sample rate per method. */
  sampleShipping?: SampleShippingRule;
}

export function formDeliveryGroups(input: FormDeliveryGroupsInput): DgGroup[] {
  const { items, rates, zoneId, vendorHolidays, subtotalFils, sampleShipping } = input;

  // 1. Distinct vendor IDs.
  const vendorIds = Array.from(new Set(items.map((i) => i.vendor_id)));

  // 2. Effective rates per vendor.
  const perVendor = new Map<string, Map<ApiShippingMethod, DgGroupMethod>>();
  for (const v of vendorIds) {
    if (vendorHolidays.has(v)) {
      perVendor.set(v, new Map());
    } else {
      perVendor.set(v, effectiveRates(v, zoneId, rates, subtotalFils, sampleShipping));
    }
  }

  // 3. Bucket vendors by availability-set key.
  interface Bucket {
    key: string;
    vendorIds: string[];
    methodsPerVendor: Map<string, Map<ApiShippingMethod, DgGroupMethod>>;
  }
  const buckets = new Map<string, Bucket>();
  for (const v of vendorIds) {
    const methods = perVendor.get(v) ?? new Map<ApiShippingMethod, DgGroupMethod>();
    const key = `${Array.from(methods.keys()).sort().join("|")}#zone=${zoneId ?? "none"}`;
    let b = buckets.get(key);
    if (!b) {
      b = { key, vendorIds: [], methodsPerVendor: new Map() };
      buckets.set(key, b);
    }
    b.vendorIds.push(v);
    b.methodsPerVendor.set(v, methods);
  }

  // 4. Emit one group per bucket, summing prices across vendors.
  const groups: DgGroup[] = [];
  let idx = 1;
  for (const b of buckets.values()) {
    const itemIds = items.filter((i) => b.vendorIds.includes(i.vendor_id)).map((i) => i.id);

    const firstVendorId = b.vendorIds[0];
    const firstVendorMethods = firstVendorId ? b.methodsPerVendor.get(firstVendorId) : undefined;
    const methods: DgGroupMethod[] = [];
    if (firstVendorMethods) {
      for (const m of firstVendorMethods.keys()) {
        let price = 0;
        let freeThreshold: number | null = null;
        let minDays = 0;
        let maxDays = 0;
        let present = true;
        for (const v of b.vendorIds) {
          const entry = b.methodsPerVendor.get(v)?.get(m);
          if (!entry) {
            present = false;
            break;
          }
          price += entry.price_fils;
          if (entry.free_threshold_fils != null) freeThreshold = entry.free_threshold_fils;
          minDays = Math.max(minDays, entry.estimated_days.min);
          maxDays = Math.max(maxDays, entry.estimated_days.max);
        }
        if (!present) continue;
        methods.push({
          id: m,
          price_fils: price,
          estimated_days: { min: minDays, max: maxDays },
          free_threshold_fils: freeThreshold,
        });
      }
    }

    groups.push({
      group_id: `g${idx++}`,
      vendorIds: b.vendorIds,
      itemIds,
      methods,
      blocking: methods.length === 0,
    });
  }

  return groups;
}
