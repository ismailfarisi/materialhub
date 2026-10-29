// commission.service.test.ts
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import {
  AppDataSource,
  Commission,
  CommissionStatus,
  Product,
  Vendor as VendorEntity,
  VendorOrder,
} from "@materialhub/database";
import { recomputeCommissionForSurvivingQty } from "../order/item-cancellation-calc.ts";
import { CommissionService } from "./commission.service.ts";

describe("CommissionService", () => {
  const mockCommissionRepo = {
    save: mock((c: any) => Promise.resolve({ id: "cm1", ...c })),
    find: mock(() => Promise.resolve([])),
    findAndCount: mock(() => Promise.resolve([[], 0])),
  };
  const mockVendorRepo = {
    findOne: mock(() => Promise.resolve(null)),
    save: mock((v: any) => Promise.resolve(v)),
  };
  const mockCategoryRepo = {
    findOne: mock(() => Promise.resolve(null)),
  };
  const mockSiteSettingRepo = {
    findOne: mock((_args?: any): Promise<any> => Promise.resolve(null)),
    save: mock((s: any) => Promise.resolve({ id: "ss1", ...s })),
  };

  let service: CommissionService;

  beforeEach(() => {
    Object.values(mockCommissionRepo).forEach((m) => m.mockClear());
    mockVendorRepo.findOne.mockClear();
    mockVendorRepo.save.mockClear();
    mockCategoryRepo.findOne.mockClear();
    mockSiteSettingRepo.findOne.mockClear();
    mockSiteSettingRepo.save.mockClear();
    service = new CommissionService(
      mockCommissionRepo as any,
      mockVendorRepo as any,
      mockCategoryRepo as any,
      mockSiteSettingRepo as any,
    );
  });

  it("uses vendor-specific commission rate when set", async () => {
    const result = await service.resolveRate(
      { commission_type: "percentage", commission_value: 12, commission_tiers: null } as any,
      null,
      10000,
    );
    expect(result).toEqual({ type: "percentage", rate: 12 });
  });

  it("falls back to category rate when vendor has none", async () => {
    const result = await service.resolveRate(
      { commission_type: null, commission_value: null, commission_tiers: null } as any,
      { commission_rate: 8 } as any,
      10000,
    );
    expect(result).toEqual({ type: "percentage", rate: 8 });
  });

  it("falls back to global default (10%) when nothing configured", async () => {
    const result = await service.resolveRate(
      { commission_type: null, commission_value: null, commission_tiers: null } as any,
      null,
      10000,
    );
    expect(result).toEqual({ type: "percentage", rate: 10 });
  });

  it("uses DB global rate when set", async () => {
    mockSiteSettingRepo.findOne.mockResolvedValueOnce({
      key: "global_commission_rate",
      value: "15",
    });
    const result = await service.resolveRate(
      { commission_type: null, commission_value: null, commission_tiers: null } as any,
      null,
      10000,
    );
    expect(result).toEqual({ type: "percentage", rate: 15 });
  });

  it("resolves tiered commission correctly", async () => {
    const tiers = [
      { minAmount: 0, maxAmount: 5000, rate: 15 },
      { minAmount: 5001, maxAmount: 20000, rate: 10 },
      { minAmount: 20001, maxAmount: null, rate: 8 },
    ];
    const result = await service.resolveRate(
      { commission_type: "tiered", commission_value: null, commission_tiers: tiers } as any,
      null,
      15000,
    );
    expect(result).toEqual({ type: "tiered", rate: 10 });
  });

  it("calculates commission amount", () => {
    expect(service.calculateAmount(10000, 12, "percentage")).toBe(1200);
    expect(service.calculateAmount(10000, 500, "fixed")).toBe(500);
  });

  // R3 follow-up: the recompute path gained a `floor(net/1.05)` ceiling so
  // vendor_earning could never go negative, but creation did not — so a fixed
  // fee at or above the item's net stored an earning the recompute path would
  // never reproduce. That identity is exactly what makes the reversal
  // clawbacks telescope to the original earning, so it is asserted directly
  // here rather than through the symptom.
  it("stored earning equals recompute(full line total), including a fixed fee above the net", () => {
    for (const [lineTotal, rate, type] of [
      [1050, 1200, "fixed"], // fee ABOVE the net — the regressed case
      [1050, 1000, "fixed"], // fee exactly AT the net
      [10500, 5000, "fixed"],
      [76710, 15, "percentage"],
      [1003, 10, "percentage"],
    ] as const) {
      const netExVat = Math.round(lineTotal / 1.05);
      const commissionAmount = service.calculateAmount(netExVat, rate, type);
      const storedEarning = netExVat - commissionAmount - Math.round(commissionAmount * 0.05);

      const recomputed = recomputeCommissionForSurvivingQty({
        survivingItemTotal: lineTotal,
        type,
        rate,
      });

      expect(storedEarning).toBe(recomputed.vendor_earning);
      expect(storedEarning).toBeGreaterThanOrEqual(0);
    }
  });

  it("getGlobalDefaultRate returns fallback when no setting exists", async () => {
    const rate = await service.getGlobalDefaultRate();
    expect(rate).toBe(10);
  });

  it("setGlobalDefaultRate creates setting when none exists", async () => {
    const rate = await service.setGlobalDefaultRate(18);
    expect(rate).toBe(18);
    expect(mockSiteSettingRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ key: "global_commission_rate", value: "18" }),
    );
  });

  it("setGlobalDefaultRate updates existing setting", async () => {
    const existing = { id: "ss1", key: "global_commission_rate", value: "10" };
    mockSiteSettingRepo.findOne.mockResolvedValueOnce(existing);
    const rate = await service.setGlobalDefaultRate(20);
    expect(rate).toBe(20);
    expect(existing.value).toBe("20");
  });

  // ── backfillCommissionsForOrder ────────────────────────────────────────
  describe("backfillCommissionsForOrder", () => {
    const ORDER_ID = "order-1";
    const ITEM_ID = "item-1";
    const VENDOR_ORDER_ID = "vo-1";
    const VENDOR_ID = "vendor-1";
    const PRODUCT_ID = "product-1";

    let transactionSpy: ReturnType<typeof spyOn>;

    beforeEach(() => {
      // backfillCommissionsForOrder runs the whole method inside
      // AppDataSource.transaction(cb) — spy on it (never a live connection)
      // and hand the callback our fake manager.
      transactionSpy = spyOn(AppDataSource, "transaction") as any;
    });

    afterEach(() => {
      transactionSpy?.mockRestore();
    });

    function makeItem(overrides: any = {}) {
      return {
        id: ITEM_ID,
        order_id: ORDER_ID,
        vendor_id: VENDOR_ID,
        vendor_order_id: VENDOR_ORDER_ID,
        product_id: PRODUCT_ID,
        line_total: 10500,
        ...overrides,
      };
    }

    function setup(opts: {
      items?: any[];
      existingCommissions?: Record<string, any>;
      vendorOrders?: Record<string, any>;
      vendor?: any;
    }) {
      const {
        items = [makeItem()],
        existingCommissions = {},
        vendorOrders = { [VENDOR_ORDER_ID]: { id: VENDOR_ORDER_ID, delivered_at: null } },
        vendor = {
          id: VENDOR_ID,
          commission_type: null,
          commission_value: null,
          commission_tiers: null,
        },
      } = opts;

      const orderItemRepo = { find: mock(() => Promise.resolve(items)) };

      const commissionFindOne = mock(({ where }: any) =>
        Promise.resolve(existingCommissions[where.order_item_id] ?? null),
      );
      const commissionDelete = mock(() => Promise.resolve({}));
      const commissionUpdate = mock(() => Promise.resolve({}));
      let saveCounter = 0;
      const commissionSave = mock((row: any) => {
        saveCounter++;
        return Promise.resolve({ id: `cm-new-${saveCounter}`, settle_after: null, ...row });
      });
      const commissionRepo = {
        findOne: commissionFindOne,
        delete: commissionDelete,
        update: commissionUpdate,
        save: commissionSave,
      };

      const vendorRepo = { findOne: mock(() => Promise.resolve(vendor)) };
      const productRepo = { findOne: mock(() => Promise.resolve(null)) };
      const vendorOrderRepo = {
        findOne: mock(({ where }: any) => Promise.resolve(vendorOrders[where.id] ?? null)),
      };

      const manager = {
        getRepository: mock((entity: any) => {
          if (entity === "OrderItem") return orderItemRepo;
          if (entity === Commission) return commissionRepo;
          if (entity === VendorEntity) return vendorRepo;
          if (entity === Product) return productRepo;
          if (entity === VendorOrder) return vendorOrderRepo;
          throw new Error(`unexpected entity passed to manager.getRepository: ${entity}`);
        }),
      };

      transactionSpy.mockImplementation((cb: any) => cb(manager));

      return { commissionFindOne, commissionDelete, commissionUpdate, commissionSave, manager };
    }

    it("recalculates a held commission on an undelivered vendor_order and keeps settle_after null", async () => {
      const existing = { id: "cm-old-1", order_item_id: ITEM_ID, status: CommissionStatus.held };
      const { commissionDelete, commissionSave, commissionUpdate } = setup({
        existingCommissions: { [ITEM_ID]: existing },
        vendorOrders: { [VENDOR_ORDER_ID]: { id: VENDOR_ORDER_ID, delivered_at: null } },
      });

      const result = await service.backfillCommissionsForOrder(ORDER_ID, { recalculate: true });

      expect(result).toEqual({ created: 0, recalculated: 1, skipped: 0, total: 1 });
      expect(commissionDelete).toHaveBeenCalledWith({ id: "cm-old-1" });
      expect(commissionSave).toHaveBeenCalledTimes(1);
      const savedRow = (await commissionSave.mock.results[0]?.value) as any;
      expect(savedRow.status).toBe(CommissionStatus.held);
      expect(savedRow.settle_after).toBeNull();
      // No delivered_at on the vendor_order — settle_after must never be
      // re-stamped.
      expect(commissionUpdate).not.toHaveBeenCalled();
    });

    it("recalculates a held commission on a delivered vendor_order and re-stamps settle_after to delivered_at + window", async () => {
      const existing = { id: "cm-old-2", order_item_id: ITEM_ID, status: CommissionStatus.held };
      const deliveredAt = new Date("2026-07-01T00:00:00.000Z");
      const { commissionUpdate } = setup({
        existingCommissions: { [ITEM_ID]: existing },
        vendorOrders: {
          [VENDOR_ORDER_ID]: {
            id: VENDOR_ORDER_ID,
            delivered_at: deliveredAt,
            status: "delivered",
          },
        },
      });
      // Default global/vendor settlement window resolves to the hard
      // default of 7 days (no site_setting, no vendor override configured
      // in the outer beforeEach's mockVendorRepo/mockSiteSettingRepo).
      const expectedSettleAfter = new Date(deliveredAt.getTime() + 7 * 86_400_000);

      const result = await service.backfillCommissionsForOrder(ORDER_ID, { recalculate: true });

      expect(result).toEqual({ created: 0, recalculated: 1, skipped: 0, total: 1 });
      expect(commissionUpdate).toHaveBeenCalledTimes(1);
      const [idFilter, patch] = commissionUpdate.mock.calls[0] as any;
      expect(idFilter).toEqual({ id: "cm-new-1" });
      expect(patch.settle_after).toEqual(expectedSettleAfter);
    });

    it("does not restart a clock that leaving `delivered` deliberately stopped", async () => {
      // A returned/refunded order keeps its historical delivered_at but its
      // settle_after was cleared on the way out of `delivered`. Recalculating
      // must not resurrect the clock and make the vendor payable again.
      const existing = { id: "cm-old-3", order_item_id: ITEM_ID, status: CommissionStatus.held };
      const { commissionUpdate } = setup({
        existingCommissions: { [ITEM_ID]: existing },
        vendorOrders: {
          [VENDOR_ORDER_ID]: {
            id: VENDOR_ORDER_ID,
            delivered_at: new Date("2026-07-01T00:00:00.000Z"),
            status: "refunded",
          },
        },
      });

      const result = await service.backfillCommissionsForOrder(ORDER_ID, { recalculate: true });

      expect(result).toEqual({ created: 0, recalculated: 1, skipped: 0, total: 1 });
      expect(commissionUpdate).not.toHaveBeenCalled();
    });

    it("skips a pending commission instead of deleting and recreating it", async () => {
      const existing = {
        id: "cm-pending-1",
        order_item_id: ITEM_ID,
        status: CommissionStatus.pending,
      };
      const { commissionDelete, commissionSave } = setup({
        existingCommissions: { [ITEM_ID]: existing },
      });

      const result = await service.backfillCommissionsForOrder(ORDER_ID, { recalculate: true });

      expect(result).toEqual({ created: 0, recalculated: 0, skipped: 1, total: 1 });
      expect(commissionDelete).not.toHaveBeenCalled();
      expect(commissionSave).not.toHaveBeenCalled();
    });

    it("skips paid and disputed commissions instead of touching them", async () => {
      const items = [
        makeItem({ id: "item-paid", vendor_order_id: "vo-paid" }),
        makeItem({ id: "item-disputed", vendor_order_id: "vo-disputed" }),
      ];
      const existingCommissions = {
        "item-paid": { id: "cm-paid", order_item_id: "item-paid", status: CommissionStatus.paid },
        "item-disputed": {
          id: "cm-disputed",
          order_item_id: "item-disputed",
          status: CommissionStatus.disputed,
        },
      };
      const { commissionDelete, commissionSave } = setup({ items, existingCommissions });

      const result = await service.backfillCommissionsForOrder(ORDER_ID, { recalculate: true });

      expect(result).toEqual({ created: 0, recalculated: 0, skipped: 2, total: 2 });
      expect(commissionDelete).not.toHaveBeenCalled();
      expect(commissionSave).not.toHaveBeenCalled();
    });

    it("non-recalculate (default) path only creates rows for items missing a commission, and never deletes", async () => {
      const items = [
        makeItem({ id: "item-missing", vendor_order_id: "vo-a" }),
        makeItem({ id: "item-has-one", vendor_order_id: "vo-b" }),
      ];
      const existingCommissions = {
        "item-has-one": {
          id: "cm-existing",
          order_item_id: "item-has-one",
          status: CommissionStatus.held,
        },
      };
      const { commissionDelete, commissionSave, commissionUpdate } = setup({
        items,
        existingCommissions,
      });

      const result = await service.backfillCommissionsForOrder(ORDER_ID);

      expect(result).toEqual({ created: 1, recalculated: 0, skipped: 1, total: 2 });
      expect(commissionDelete).not.toHaveBeenCalled();
      expect(commissionUpdate).not.toHaveBeenCalled();
      expect(commissionSave).toHaveBeenCalledTimes(1);
    });
  });
});
