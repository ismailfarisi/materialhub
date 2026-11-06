// delivery-estimate.service.ts — loads warehouse, product, rate and holiday
// rows and hands them to the pure estimator.
import type { Product, PublicHoliday, ShippingRate, Warehouse } from "@materialhub/database";
import { HttpError, NotFoundError } from "@materialhub/plugins";
import type { Repository } from "typeorm";
import {
  type DeliveryEstimate,
  type OriginSettings,
  type TransitDays,
  dayToIsoDate,
  dubaiDayNumber,
  estimateDelivery,
  normaliseEmirate,
  parseCutoff,
} from "./delivery-estimate.ts";

export const MAX_BATCH_GROUPS = 50;
const HOLIDAY_CACHE_MS = 10 * 60_000;
/** Holidays further out than this cannot move an estimate in practice. */
const HOLIDAY_WINDOW_DAYS = 180;

export interface EstimateRequest {
  vendorId?: string | null;
  warehouseId?: string | null;
  emirate: string;
  productIds?: string[];
  method?: string | null;
  now?: Date;
}

export interface EstimateResult extends DeliveryEstimate {
  vendor_id: string | null;
  warehouse_id: string;
  origin_emirate: string;
  destination_emirate: string;
}

export interface WarehouseDeliverySettings {
  dispatch_cutoff_time: string;
  handling_days: number;
  working_days: number[];
  same_day_emirates: string[];
  next_day_emirates: string[];
}

type RateWithZone = ShippingRate & { zone?: { emirate?: string | null } | null };

export function originFromWarehouse(
  wh: Pick<Warehouse, "emirate"> & WarehouseDeliverySettings,
): OriginSettings {
  return {
    emirate: wh.emirate,
    dispatchCutoffTime: wh.dispatch_cutoff_time ?? "14:00",
    handlingDays: Number(wh.handling_days ?? 1),
    workingDays: (wh.working_days ?? [1, 2, 3, 4, 5]).map(Number),
    sameDayEmirates: wh.same_day_emirates ?? [],
    nextDayEmirates: wh.next_day_emirates ?? [],
  };
}

/**
 * Pick the transit days of the most specific active rate that states them:
 * vendor rate before platform rate, destination-emirate zone before an
 * any-zone rate. Only rates for the requested method (default "standard")
 * count, so an express rate never makes a standard promise look faster.
 */
export function pickRateTransit(
  rates: RateWithZone[],
  vendorId: string | null,
  emirate: string,
  method?: string | null,
): TransitDays | null {
  const wanted = method || "standard";
  let best: { score: number; days: TransitDays } | null = null;
  for (const r of rates) {
    if (!r.is_active || r.estimated_days_min == null || r.estimated_days_max == null) continue;
    if (r.vendor_id && r.vendor_id !== vendorId) continue;
    const zoneEmirate = r.zone ? normaliseEmirate(r.zone.emirate ?? null) : null;
    if (r.zone_id && zoneEmirate !== emirate) continue;
    if (r.method !== wanted) continue;
    const score = (r.vendor_id ? 2 : 0) + (r.zone_id ? 1 : 0);
    if (!best || score > best.score) {
      best = {
        score,
        days: { min: Number(r.estimated_days_min), max: Number(r.estimated_days_max) },
      };
    }
  }
  return best?.days ?? null;
}

export function validateDeliverySettings(s: Partial<WarehouseDeliverySettings>): void {
  if (s.dispatch_cutoff_time !== undefined) {
    try {
      parseCutoff(s.dispatch_cutoff_time);
    } catch {
      throw new HttpError(422, "Dispatch cutoff must be HH:MM (24-hour)", "INVALID_CUTOFF");
    }
  }
  if (s.handling_days !== undefined) {
    if (!Number.isInteger(s.handling_days) || s.handling_days < 0 || s.handling_days > 60) {
      throw new HttpError(422, "Handling days must be 0 to 60", "INVALID_HANDLING_DAYS");
    }
  }
  if (s.working_days !== undefined) {
    const ok = s.working_days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6);
    if (!ok || s.working_days.length === 0) {
      throw new HttpError(422, "Pick at least one working day", "INVALID_WORKING_DAYS");
    }
  }
  for (const key of ["same_day_emirates", "next_day_emirates"] as const) {
    const list = s[key];
    if (list === undefined) continue;
    if (list.some((e) => normaliseEmirate(e) === null)) {
      throw new HttpError(422, `Unknown emirate in ${key}`, "INVALID_EMIRATE");
    }
  }
}

/** Canonicalise and dedupe emirate lists; sort working days. */
export function normaliseDeliverySettings<T extends Partial<WarehouseDeliverySettings>>(s: T): T {
  const out: T = { ...s };
  if (s.working_days) out.working_days = [...new Set(s.working_days)].sort((a, b) => a - b);
  for (const key of ["same_day_emirates", "next_day_emirates"] as const) {
    const list = s[key];
    if (list) out[key] = [...new Set(list.map((e) => normaliseEmirate(e) as string))];
  }
  if (out.same_day_emirates && out.next_day_emirates) {
    const same = new Set(out.same_day_emirates);
    out.next_day_emirates = out.next_day_emirates.filter((e) => !same.has(e));
  }
  return out;
}

export class DeliveryEstimateService {
  private holidayCache: { at: number; map: Map<string, boolean> } | null = null;

  constructor(
    private warehouseRepo: Repository<Warehouse>,
    private productRepo: Repository<Product>,
    private rateRepo: Repository<ShippingRate>,
    private holidayRepo: Repository<PublicHoliday>,
  ) {}

  invalidateHolidays(): void {
    this.holidayCache = null;
  }

  async loadHolidays(now: Date): Promise<Map<string, boolean>> {
    if (this.holidayCache && Date.now() - this.holidayCache.at < HOLIDAY_CACHE_MS) {
      return this.holidayCache.map;
    }
    const today = dubaiDayNumber(now);
    const rows = await this.holidayRepo
      .createQueryBuilder("h")
      .where("h.is_active = true AND h.country_code = 'AE'")
      .andWhere("h.holiday_date BETWEEN :from AND :to", {
        from: dayToIsoDate(today - 1),
        to: dayToIsoDate(today + HOLIDAY_WINDOW_DAYS),
      })
      .getMany();
    const map = new Map<string, boolean>();
    for (const r of rows) map.set(String(r.holiday_date).slice(0, 10), Boolean(r.is_estimate));
    this.holidayCache = { at: Date.now(), map };
    return map;
  }

  /** The warehouse a vendor ships from: their active default, else oldest active. */
  async resolveWarehouse(
    vendorId?: string | null,
    warehouseId?: string | null,
  ): Promise<Warehouse> {
    if (warehouseId) {
      const wh = await this.warehouseRepo.findOne({
        where: { id: warehouseId, is_active: true } as any,
      });
      if (!wh) throw new NotFoundError("Warehouse not found");
      return wh;
    }
    if (!vendorId)
      throw new HttpError(400, "vendor_id or warehouse_id is required", "MISSING_ORIGIN");
    const wh = await this.warehouseRepo.findOne({
      where: { vendor_id: vendorId, is_active: true } as any,
      order: { is_default: "DESC", created_at: "ASC" } as any,
    });
    if (!wh) throw new NotFoundError("This supplier has no active warehouse");
    return wh;
  }

  private async handlingOverride(productIds?: string[]): Promise<number | null> {
    const ids = [...new Set((productIds ?? []).filter(Boolean))];
    if (ids.length === 0) return null;
    const rows = await this.productRepo
      .createQueryBuilder("p")
      .select(["p.id", "p.handling_days_override"])
      .where("p.id IN (:...ids)", { ids })
      .getMany();
    const values = rows
      .map((p) => p.handling_days_override)
      .filter((v): v is number => v != null)
      .map(Number);
    return values.length > 0 ? Math.max(...values) : null;
  }

  private async loadRates(vendorIds: (string | null)[]): Promise<RateWithZone[]> {
    const ids = [...new Set(vendorIds.filter((v): v is string => !!v))];
    const qb = this.rateRepo
      .createQueryBuilder("r")
      .leftJoinAndSelect("r.zone", "zone")
      .where("r.deleted_at IS NULL AND r.is_active = true")
      .andWhere("r.estimated_days_min IS NOT NULL AND r.estimated_days_max IS NOT NULL");
    if (ids.length > 0) qb.andWhere("(r.vendor_id IN (:...ids) OR r.vendor_id IS NULL)", { ids });
    else qb.andWhere("r.vendor_id IS NULL");
    return (await qb.getMany()) as RateWithZone[];
  }

  private destination(emirate: string): string {
    const d = normaliseEmirate(emirate);
    if (!d) throw new HttpError(422, `Unknown emirate "${emirate}"`, "INVALID_EMIRATE");
    return d;
  }

  async estimate(req: EstimateRequest): Promise<EstimateResult> {
    const now = req.now ?? new Date();
    const destination = this.destination(req.emirate);
    const wh = await this.resolveWarehouse(req.vendorId, req.warehouseId);
    const [holidays, override, rates] = await Promise.all([
      this.loadHolidays(now),
      this.handlingOverride(req.productIds),
      this.loadRates([wh.vendor_id]),
    ]);
    return this.compute(wh, destination, now, holidays, override, rates, req.method);
  }

  /** One estimate per supplier group; a failing group returns an error, not a 500. */
  async estimateBatch(input: {
    emirate: string;
    method?: string | null;
    now?: Date;
    groups: {
      vendor_id?: string | null;
      warehouse_id?: string | null;
      product_ids?: string[];
      method?: string | null;
    }[];
  }): Promise<
    Array<{
      vendor_id: string | null;
      warehouse_id: string | null;
      estimate: EstimateResult | null;
      error: string | null;
    }>
  > {
    if (input.groups.length > MAX_BATCH_GROUPS) {
      throw new HttpError(422, `At most ${MAX_BATCH_GROUPS} groups per request`, "TOO_MANY_GROUPS");
    }
    const now = input.now ?? new Date();
    const destination = this.destination(input.emirate);
    const holidays = await this.loadHolidays(now);
    const warehouses = await Promise.all(
      input.groups.map((g) =>
        this.resolveWarehouse(g.vendor_id, g.warehouse_id).catch((e: Error) => e),
      ),
    );
    const rates = await this.loadRates(
      warehouses.map((w) => (w instanceof Error ? null : w.vendor_id)),
    );
    return Promise.all(
      input.groups.map(async (g, i) => {
        const wh = warehouses[i];
        const base = { vendor_id: g.vendor_id ?? null, warehouse_id: g.warehouse_id ?? null };
        if (wh instanceof Error) return { ...base, estimate: null, error: wh.message };
        if (!wh) return { ...base, estimate: null, error: "Warehouse not found" };
        try {
          const override = await this.handlingOverride(g.product_ids);
          const estimate = this.compute(
            wh,
            destination,
            now,
            holidays,
            override,
            rates,
            g.method ?? input.method,
          );
          return { ...base, warehouse_id: wh.id, estimate, error: null };
        } catch (e) {
          return { ...base, warehouse_id: wh.id, estimate: null, error: (e as Error).message };
        }
      }),
    );
  }

  /** Vendor dashboard live preview: unsaved settings over the saved warehouse. */
  async preview(
    warehouse: Warehouse,
    draft: Partial<WarehouseDeliverySettings>,
    emirate: string,
    now = new Date(),
  ): Promise<EstimateResult> {
    validateDeliverySettings(draft);
    const merged = { ...warehouse, ...normaliseDeliverySettings(draft) } as Warehouse;
    const destination = this.destination(emirate);
    const [holidays, rates] = await Promise.all([
      this.loadHolidays(now),
      this.loadRates([warehouse.vendor_id]),
    ]);
    return this.compute(merged, destination, now, holidays, null, rates, null);
  }

  private compute(
    wh: Warehouse,
    destination: string,
    now: Date,
    holidays: Map<string, boolean>,
    override: number | null,
    rates: RateWithZone[],
    method?: string | null,
  ): EstimateResult {
    const estimate = estimateDelivery({
      now,
      origin: originFromWarehouse(wh),
      destinationEmirate: destination,
      handlingDaysOverride: override,
      rateTransit: pickRateTransit(rates, wh.vendor_id, destination, method),
      preferRateTransit: Boolean(method),
      holidays,
    });
    return {
      ...estimate,
      vendor_id: wh.vendor_id,
      warehouse_id: wh.id,
      origin_emirate: normaliseEmirate(wh.emirate) ?? wh.emirate,
      destination_emirate: destination,
    };
  }
}
