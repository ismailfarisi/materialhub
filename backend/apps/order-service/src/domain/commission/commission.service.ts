import {
  AppDataSource,
  Commission,
  CommissionStatus,
  type OrderItem,
  OrderStatus,
  Product,
  Vendor as VendorEntity,
  VendorOrder,
} from "@materialhub/database";
import type { Category, SiteSetting, Vendor } from "@materialhub/database";
// commission.service.ts
import type { EntityManager, Repository } from "typeorm";
import { maxCommissionForNet } from "./commission-cap.ts";
import { resolveWindowDays } from "./settlement-window.ts";

const FALLBACK_COMMISSION_RATE = 10; // 10%
const GLOBAL_RATE_KEY = "global_commission_rate";
const SETTLEMENT_WINDOW_KEY = "payout_settlement_window_days";

export class CommissionService {
  constructor(
    private commissionRepo: Repository<Commission>,
    private vendorRepo: Repository<Vendor>,
    private categoryRepo: Repository<Category>,
    private siteSettingRepo: Repository<SiteSetting>,
  ) {}

  async getGlobalDefaultRate(): Promise<number> {
    const setting = await this.siteSettingRepo.findOne({ where: { key: GLOBAL_RATE_KEY } });
    return setting ? Number(setting.value) : FALLBACK_COMMISSION_RATE;
  }

  async getSettlementWindowDays(vendorId: string): Promise<number> {
    const [vendor, setting] = await Promise.all([
      this.vendorRepo.findOne({ where: { id: vendorId } as any }),
      this.siteSettingRepo.findOne({ where: { key: SETTLEMENT_WINDOW_KEY } }),
    ]);
    return resolveWindowDays(
      (vendor as any)?.settlement_window_days ?? null,
      setting ? Number(setting.value) : null,
    );
  }

  async setGlobalDefaultRate(rate: number): Promise<number> {
    const setting = await this.siteSettingRepo.findOne({ where: { key: GLOBAL_RATE_KEY } });
    if (setting) {
      setting.value = String(rate);
      await this.siteSettingRepo.save(setting);
    } else {
      await this.siteSettingRepo.save({
        key: GLOBAL_RATE_KEY,
        value: String(rate),
        value_type: "number",
        group: "commission",
        description:
          "Global default commission rate (%) applied when no vendor or category rate is set",
      } as any);
    }
    return rate;
  }

  async resolveRate(
    vendor: {
      commission_type: string | null;
      commission_value: number | null;
      commission_tiers: any[] | null;
    },
    category: { commission_rate: number | null } | null,
    itemTotal: number,
  ): Promise<{ type: string; rate: number }> {
    // Priority: vendor tier > vendor rate > category > global default
    const globalDefault = await this.getGlobalDefaultRate();

    if (vendor.commission_type === "tiered" && vendor.commission_tiers?.length) {
      const tier = vendor.commission_tiers.find(
        (t: any) => itemTotal >= t.minAmount && (t.maxAmount == null || itemTotal <= t.maxAmount),
      );
      return { type: "tiered", rate: tier?.rate ?? globalDefault };
    }

    if (vendor.commission_type && vendor.commission_value != null) {
      return { type: vendor.commission_type, rate: vendor.commission_value };
    }

    if (category?.commission_rate != null) {
      return { type: "percentage", rate: category.commission_rate };
    }

    return { type: "percentage", rate: globalDefault };
  }

  calculateAmount(itemTotal: number, rate: number, type: string): number {
    const raw = type === "fixed" ? Math.min(rate, itemTotal) : Math.round(itemTotal * (rate / 100));
    // Same ceiling the recompute path applies, from the same module — see
    // commission-cap.ts. Without it, a fixed fee at or above the net stored a
    // negative `vendor_earning` that recompute would never reproduce, and the
    // reversal clawbacks stopped summing to the original earning.
    return Math.min(raw, maxCommissionForNet(itemTotal));
  }

  async createForOrderItem(data: {
    vendorId: string;
    orderId: string;
    vendorOrderId: string;
    orderItemId: string;
    itemTotal: number;
    vendor: any;
    category: any;
  }): Promise<Commission> {
    return this.createForOrderItemInTx(this.commissionRepo.manager, data);
  }

  /**
   * Same as createForOrderItem but uses the caller's EntityManager so the
   * commission row commits atomically with the surrounding transaction
   * (e.g. the order-creation flow). Commission is snapshotted at order
   * time per the multi-vendor order spec.
   *
   * Status starts as `held`. Delivery of the vendor_order stamps
   * `settle_after`, and the settlement job promotes the row to `pending`
   * once that matures. Only `pending` rows are payable.
   *
   * Product prices are VAT-inclusive (UAE 5% standard rate). The platform
   * collects the embedded VAT from the customer and remits it to the FTA.
   * Vendor commissions and earnings are computed on the net-of-VAT amount:
   *
   *   itemTotal       = gross customer paid (incl. VAT)
   *   netExVat        = round(itemTotal / 1.05)
   *   vatExtracted    = itemTotal - netExVat        (filed by platform)
   *   commissionAmount = round(netExVat * rate%)    (on the net)
   *   taxOnCommission = round(commissionAmount * 5%)
   *   vendorEarning   = netExVat - commissionAmount - taxOnCommission
   *
   * item_total stored on the row is the gross (what the customer paid).
   * The vat-extracted is implied and recoverable as
   * item_total - round(item_total / 1.05).
   */
  async createForOrderItemInTx(
    manager: EntityManager,
    data: {
      vendorId: string;
      orderId: string;
      vendorOrderId: string;
      orderItemId: string;
      itemTotal: number;
      vendor: any;
      category: any;
    },
  ): Promise<Commission> {
    const netExVat = Math.round(data.itemTotal / 1.05);
    const { type, rate } = await this.resolveRate(data.vendor, data.category, netExVat);
    const commissionAmount = this.calculateAmount(netExVat, rate, type);
    const taxOnCommission = Math.round(commissionAmount * 0.05); // 5% VAT on commission
    const vendorEarning = netExVat - commissionAmount - taxOnCommission;

    return manager.getRepository(Commission).save({
      vendor_id: data.vendorId,
      order_id: data.orderId,
      vendor_order_id: data.vendorOrderId,
      order_item_id: data.orderItemId,
      commission_type: type,
      commission_rate: rate,
      item_total: data.itemTotal,
      commission_amount: commissionAmount,
      tax_on_commission: taxOnCommission,
      vendor_earning: vendorEarning,
      currency: "AED",
      status: CommissionStatus.held,
    } as any);
  }

  /**
   * Backfill commission rows for an order's items that don't already have
   * one. Used to seed commissions for orders placed before the
   * order-creation-time commission hook existed (PR #85), or to recover
   * after a partial failure. Idempotent by default — items with an existing
   * commission row are skipped.
   *
   * When `recalculate` is true, existing `held` commission rows are deleted
   * and recreated using the current formula. Useful after a
   * commission-formula change (e.g. PR #87 switched to net-of-VAT). Rows
   * with any other status — `pending`, `approved`, `paid`, `disputed`,
   * `cancelled` — are locked in and never touched even with
   * recalculate=true: anything past `held` has either already matured
   * toward payout or been settled/actioned, and overwriting it would
   * either re-issue a commission that's already payable or destroy one
   * that's already been paid/disputed/cancelled.
   *
   * A freshly recreated row always comes back `held` with
   * `settle_after: null` (createForOrderItemInTx never sets the clock). If
   * the row being recreated belonged to a vendor_order that's already
   * `delivered`, that `settle_after` was real and must be preserved —
   * nothing will ever re-run the delivered-transition logic for an order
   * that's already delivered, so a `null` here would strand the commission
   * unpayable forever. So after recreating, this re-stamps `settle_after`
   * to `delivered_at + settlement window` for any recreated commission
   * whose vendor_order has a non-null `delivered_at`, using the same
   * computation as `OrderStatusService.transitionVendorOrder`.
   */
  async backfillCommissionsForOrder(
    orderId: string,
    opts?: { recalculate?: boolean },
  ): Promise<{ created: number; recalculated: number; skipped: number; total: number }> {
    const recalculate = opts?.recalculate === true;

    return AppDataSource.transaction(async (manager) => {
      const orderItemRepo = manager.getRepository<OrderItem>("OrderItem" as any);
      const items = await orderItemRepo.find({
        where: { order_id: orderId } as any,
      });

      let created = 0;
      let recalculated = 0;
      let skipped = 0;
      const vendorCache = new Map<string, any>();
      const categoryByProductId = new Map<string, any>();
      const vendorOrderCache = new Map<string, any>();

      for (const item of items) {
        const existing = await manager
          .getRepository(Commission)
          .findOne({ where: { order_item_id: (item as any).id } as any });

        if (existing) {
          if (!recalculate) {
            skipped++;
            continue;
          }
          // Only `held` rows may be recalculated — pending/approved/paid/
          // disputed/cancelled are locked in.
          if ((existing as any).status !== CommissionStatus.held) {
            skipped++;
            continue;
          }
          await manager.getRepository(Commission).delete({ id: (existing as any).id });
        }

        const vendorId = (item as any).vendor_id;
        let vendor = vendorCache.get(vendorId);
        if (vendor === undefined) {
          vendor =
            (await manager.getRepository(VendorEntity).findOne({ where: { id: vendorId } })) ??
            null;
          vendorCache.set(vendorId, vendor);
        }
        if (!vendor) {
          skipped++;
          continue;
        }

        let category = categoryByProductId.get((item as any).product_id);
        if (category === undefined) {
          const product = await manager.getRepository(Product).findOne({
            where: { id: (item as any).product_id },
            relations: ["category"],
          });
          category = product?.category ?? null;
          categoryByProductId.set((item as any).product_id, category);
        }

        const recreatedCommission = await this.createForOrderItemInTx(manager, {
          vendorId,
          orderId,
          vendorOrderId: (item as any).vendor_order_id,
          orderItemId: (item as any).id,
          itemTotal: (item as any).line_total,
          vendor,
          category,
        });

        if (existing) {
          recalculated++;
          // `existing` only reached here with status `held` (checked
          // above). If its vendor_order already matured past delivery, the
          // clock it was carrying was real — re-stamp it on the recreated
          // row so it isn't stranded with settle_after: null forever.
          const vendorOrderId = (item as any).vendor_order_id;
          let vendorOrder = vendorOrderCache.get(vendorOrderId);
          if (vendorOrder === undefined) {
            vendorOrder =
              (await manager
                .getRepository(VendorOrder)
                .findOne({ where: { id: vendorOrderId } as any })) ?? null;
            vendorOrderCache.set(vendorOrderId, vendorOrder);
          }
          // Only re-stamp while the order is STILL delivered. `delivered_at` is
          // never cleared when an order leaves `delivered` (it stays as the
          // historical record), so keying off it alone would restart a clock
          // that a return deliberately stopped — making a refunded order's
          // commission payable again.
          if (
            (vendorOrder as any)?.delivered_at &&
            (vendorOrder as any)?.status === OrderStatus.delivered
          ) {
            const days = await this.getSettlementWindowDays(vendorId);
            const settleAfter = new Date(
              (vendorOrder as any).delivered_at.getTime() + days * 86_400_000,
            );
            await manager
              .getRepository(Commission)
              .update(
                { id: (recreatedCommission as any).id } as any,
                { settle_after: settleAfter } as any,
              );
          }
        } else {
          created++;
        }
      }

      return { created, recalculated, skipped, total: items.length };
    });
  }

  /**
   * Booking-sourced commission accrual (Phase 4 Task 9; spec §5.3 "commission
   * snapshotted at booking, accrued into the vendor_payout pipeline on
   * completed"). Unlike createForOrderItemInTx, this does NOT resolve a rate —
   * the booking's `commission_rate`/`commission_fils` were already snapshotted
   * at booking time (booking-service's CommissionSnapshotService, Task 5) so a
   * later vendor/category rate change can't alter a customer's existing deal.
   * Re-resolving here would defeat that guarantee, so `data.commissionRate` /
   * `data.commissionAmountFils` are taken as authoritative — subject only to
   * the shared commission ceiling (R4-I6, applied below), which can lower an
   * amount that would otherwise store a negative vendor earning but can never
   * raise one.
   *
   * `commission_type` is stored using `data.commissionType` when the caller
   * supplies it (booking-service now snapshots the resolved type on the
   * booking row and threads it through — Task 9 review fix, see
   * `commission-snapshot.service.ts` / `booking-completion.service.ts`),
   * falling back to `"percentage"` only for a caller that predates that field
   * (the DTO field is Optional, for backward compatibility). That fallback
   * affects only the informational `commission_type` label, never payout
   * math: `commission_amount` is the snapshot value verbatim, except where
   * the shared ceiling lowers it.
   *
   * Idempotent on `booking_id` at TWO layers (review fix 2 — money-safety
   * BLOCKER): the `findOne` pre-check below is the cheap common-case retry
   * skip, but under genuine concurrency (two callers racing
   * `completeBooking()`/`/complete` for the SAME booking — allowed by design,
   * see `BookingStatusService.completeBooking`'s comment) both could pass
   * that pre-check under READ COMMITTED before either commits. The real
   * safety net is the DB: `uq_commissions_booking` (a genuinely UNIQUE
   * partial index, `1782300000000-CommissionBookingAccrual`).
   *
   * This whole method runs INSIDE an ambient `AppDataSource.transaction(...)`
   * started by the caller (`internal-booking-payment.routes.ts`'s `/complete`
   * handler), together with the capture-status update — they must commit or
   * roll back as one unit. That rules out a plain `save()` + `catch (23505)`:
   * a Postgres unique-violation puts the WHOLE transaction/connection into
   * the ABORTED state, and every subsequent statement on that SAME manager —
   * including a recovery `findOne` — then throws `25P02` ("current
   * transaction is aborted"), which propagates to the HTTP caller instead of
   * being swallowed (a prior version of this fix made exactly that mistake).
   *
   * Instead, the INSERT itself uses `ON CONFLICT ... DO NOTHING`, repeating
   * `uq_commissions_booking`'s exact partial-index predicate as the conflict
   * target (Postgres will NOT match a partial unique index without it). A
   * concurrent duplicate is then a silent no-op — no exception, no aborted
   * transaction — so the follow-up `findOne` on the SAME manager is safe, and
   * the outer transaction (capture + accrual) still commits for the winner.
   *
   * Settlement clock (review fix — money-safety BLOCKER, C3): a booking has
   * no `vendor_order`, so none of the three `settle_after` writers that
   * order-sourced commissions rely on (delivery transition, cancel-voiding,
   * backfill re-stamp — all keyed on `vendor_order_id`) ever run for one.
   * Without a clock of its own a booking commission would sit `held` forever
   * — `settle_after IS NULL` never satisfies the settlement job's
   * `settle_after <= now()` — so it can never be promoted to `pending` and
   * never becomes payable. A booking has no delivery event; its completion
   * (this call — /complete is invoked synchronously off `booking-service`'s
   * completion transition, see internal-booking-payment.routes.ts) is the
   * closest analogue, so this stamps `settle_after` from "now" using the
   * SAME per-vendor settlement window as order commissions
   * (`getSettlementWindowDays`), and inserts `held` (not `pending`) so the
   * row follows the identical held -> settlement-job -> pending -> payable
   * path as an order commission instead of a bespoke one.
   */
  async createForBookingInTx(
    manager: EntityManager,
    data: {
      bookingId: string;
      vendorId: string;
      commissionRate: number;
      commissionAmountFils: number;
      commissionType?: string;
      itemTotalFils: number;
      netExVatFils: number;
    },
  ): Promise<{ commission: Commission; created: boolean }> {
    const existing = await manager
      .getRepository(Commission)
      .findOne({ where: { booking_id: data.bookingId } as any });
    if (existing) return { commission: existing, created: false };

    // Same 5%-VAT-on-commission convention as createForOrderItemInTx —
    // and, R4-I6, the same ceiling. The amount arrives over the wire from
    // booking-service's snapshot, which now caps it too, but this is the
    // path that writes the ledger row: capping it HERE is what guarantees no
    // booking commission can store a negative `vendor_earning` (which would
    // subtract from every other commission in that vendor's payout),
    // whatever the caller sends — including jobs enqueued or payloads built
    // before that snapshot fix shipped.
    const commissionAmountFils = Math.min(
      data.commissionAmountFils,
      maxCommissionForNet(data.netExVatFils),
    );
    const taxOnCommission = Math.round(commissionAmountFils * 0.05);
    const vendorEarning = data.netExVatFils - commissionAmountFils - taxOnCommission;
    const commissionType = data.commissionType ?? "percentage";
    const windowDays = await this.getSettlementWindowDays(data.vendorId);
    const settleAfter = new Date(Date.now() + windowDays * 86_400_000);

    const inserted = await manager.query(
      `INSERT INTO "commissions"
         ("vendor_id", "booking_id", "commission_type", "commission_rate",
          "item_total", "commission_amount", "tax_on_commission", "vendor_earning",
          "currency", "status", "settle_after")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'AED', 'held', $9)
       ON CONFLICT ("booking_id") WHERE "booking_id" IS NOT NULL DO NOTHING
       RETURNING *`,
      [
        data.vendorId,
        data.bookingId,
        commissionType,
        data.commissionRate,
        data.itemTotalFils,
        commissionAmountFils,
        taxOnCommission,
        vendorEarning,
        settleAfter,
      ],
    );

    if (inserted.length > 0) {
      return { commission: inserted[0] as Commission, created: true };
    }

    // Conflict: a concurrent call for the SAME booking_id won the race.
    // DO NOTHING did not raise, so the transaction is still live — this
    // findOne (on the SAME manager) is safe.
    const winner = await manager
      .getRepository(Commission)
      .findOne({ where: { booking_id: data.bookingId } as any });
    if (winner) return { commission: winner, created: false };

    // Unreachable in practice: DO NOTHING fired (no row returned) yet no
    // commission row exists for this booking_id. Surface loudly instead of
    // silently returning an undefined commission.
    throw new Error(
      `createForBookingInTx: INSERT ON CONFLICT DO NOTHING returned no row and no existing commission found for booking_id=${data.bookingId}`,
    );
  }

  async listForAdmin(query: {
    vendorId?: string;
    page?: number;
    limit?: number;
  }): Promise<{ data: Commission[]; total: number }> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const where: any = {};
    if (query.vendorId) where.vendor_id = query.vendorId;

    const [data, total] = await this.commissionRepo.findAndCount({
      where,
      order: { created_at: "DESC" },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total };
  }

  async getCommissionConfig() {
    const defaultRate = await this.getGlobalDefaultRate();

    const vendors = await this.vendorRepo
      .createQueryBuilder("v")
      .select(["v.id", "v.name", "v.commission_type", "v.commission_value", "v.commission_tiers"])
      .where("v.commission_type IS NOT NULL")
      .andWhere("v.deleted_at IS NULL")
      .getMany();

    const categories = await this.categoryRepo
      .createQueryBuilder("c")
      .select(["c.id", "c.name", "c.commission_rate"])
      .where("c.commission_rate IS NOT NULL")
      .andWhere("c.deleted_at IS NULL")
      .getMany();

    return {
      default_rate: defaultRate,
      category_overrides: categories.map((c) => ({
        id: c.id,
        category_id: c.id,
        category_name: c.name,
        rate: Number(c.commission_rate),
      })),
      vendor_overrides: vendors.map((v) => ({
        id: v.id,
        vendor_id: v.id,
        vendor_name: v.name,
        rate: Number(v.commission_value) || 0,
        tiers: (v.commission_tiers as any[]) ?? [],
      })),
    };
  }

  async updateVendorRate(
    vendorId: string,
    data: {
      type: string;
      value: number;
      tiers?: { minAmount: number; maxAmount?: number; rate: number }[];
    },
  ) {
    const vendor = await this.vendorRepo.findOne({ where: { id: vendorId } });
    if (!vendor) {
      const { HttpError } = await import("@materialhub/plugins");
      throw new HttpError(404, "Vendor not found", "VENDOR_NOT_FOUND");
    }
    vendor.commission_type = data.type as any;
    vendor.commission_value = data.value as any;
    vendor.commission_tiers = (data.tiers ?? null) as any;
    await this.vendorRepo.save(vendor);
    return {
      vendor_id: vendorId,
      commission_type: vendor.commission_type,
      commission_value: vendor.commission_value,
      commission_tiers: vendor.commission_tiers,
    };
  }
}
