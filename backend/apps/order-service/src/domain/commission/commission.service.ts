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
