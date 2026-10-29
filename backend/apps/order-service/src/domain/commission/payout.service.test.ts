// payout.service.test.ts
import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import * as realTypeorm from "typeorm";

// createDraft (below) claims commissions/adjustments via typeorm's In(), whose
// real FindOperator carries internal fields (_useParameter, _getSql, ...) that
// break a plain toEqual on the where-clause shape. Mocked here to the bare
// {_type, _value} shape those tests assert on; every other export passes
// through untouched. Restored in afterAll so later test files in the same
// bun process (directory-wide `bun test` runs) see the real module again.
mock.module("typeorm", () => ({
  ...realTypeorm,
  In: (value: unknown[]) => ({ _type: "in", _value: value }),
}));

import {
  AuditLog,
  Commission,
  PayoutRail,
  PayoutStatus,
  VendorPayoutAdjustment,
} from "@materialhub/database";

// Mock the BullMQ queue module so tests never open real Redis connections
const mockQueueAdd = mock(() => Promise.resolve({ id: "job1" }));
mock.module("./payout.job.ts", () => ({
  PAYOUT_QUEUE: "vendor-payouts",
  getPayoutQueue: () => ({ add: mockQueueAdd }),
  createPayoutWorker: mock(() => ({})),
}));

import { PayoutService } from "./payout.service.ts";

afterAll(() => {
  mock.module("typeorm", () => realTypeorm);
});

describe("PayoutService", () => {
  const mockPayoutRepoQB = {
    createQueryBuilder: mock(() => {
      const qb: any = {};
      qb.leftJoinAndSelect = mock(() => qb);
      qb.andWhere = mock(() => qb);
      qb.orderBy = mock(() => qb);
      qb.skip = mock(() => qb);
      qb.take = mock(() => qb);
      qb.getManyAndCount = mock(() => Promise.resolve([[], 0]));
      return qb;
    }),
  };
  const mockPayoutRepo = {
    save: mock((p: any) => Promise.resolve({ id: "po1", ...p })),
    find: mock(() => Promise.resolve([])),
    findOne: mock((_args?: any) => Promise.resolve(null)),
    // `_args` is declared so listForVendor's tests can read the find options
    // off mock.calls — a zero-arg mock types its call tuple as [].
    findAndCount: mock((_args?: any) => Promise.resolve([[], 0])),
    count: mock(() => Promise.resolve(0)),
    // FIX 1: addDraftAdjustment now writes only {net_amount, adjustment_total}
    // via a column-targeted UPDATE rather than a full-entity save().
    update: mock((_criteria: any, _partialEntity: any) =>
      Promise.resolve({ affected: 1, raw: [], generatedMaps: [] }),
    ),
    // generatePayoutReference() reads nextval('payout_reference_seq') via the
    // entity manager — not a mock fn, so it's skipped by mockClear sweeps below.
    manager: {
      query: mock((): Promise<any[]> => Promise.resolve([{ nextval: "1" }])),
      // R4-I1: markPaid now marks the payout's claimed commissions paid in
      // the same transaction, so this manager needs a transaction that hands
      // out an entity-aware repository. `markPaidCommissionUpdates` records
      // the commission-side update for assertions.
      // addDraftAdjustment also runs inside this transaction and asks for a
      // VendorPayoutAdjustment repo (create+save) and an AuditLog repo
      // (writeAudit's `manager: txMgr` path) — mirrors mockMarkPaidCommissionRepo.
      transaction: mock((cb: any) =>
        cb({
          getRepository: (target: any) => {
            if (target === Commission) return mockMarkPaidCommissionRepo;
            if (target === VendorPayoutAdjustment) return mockDraftAdjustmentRepo;
            if (target === AuditLog) return mockAuditLogRepo;
            return mockPayoutRepo;
          },
          query: mock((): Promise<any[]> => Promise.resolve([])),
        }),
      ),
    },
    ...mockPayoutRepoQB,
  };
  const markPaidCommissionUpdates: any[] = [];
  const mockMarkPaidCommissionRepo = {
    update: mock((where: any, set: any) => {
      markPaidCommissionUpdates.push([where, set]);
      return Promise.resolve({ affected: markPaidCommissionUpdates.length ? 2 : 0 });
    }),
  };
  // addDraftAdjustment's transaction asks for a VendorPayoutAdjustment repo
  // to record the draft-scoped ledger row it creates alongside the payout update.
  const draftAdjustmentSaves: any[] = [];
  const mockDraftAdjustmentRepo = {
    create: mock((entity: any) => entity),
    save: mock((entity: any) => {
      draftAdjustmentSaves.push(entity);
      return Promise.resolve({ id: "adj1", ...entity });
    }),
  };
  const mockCommissionRepo = {
    find: mock((_args?: any): Promise<any[]> => Promise.resolve([])),
    save: mock((c: any) => Promise.resolve(c)),
    findAndCount: mock(() => Promise.resolve([[], 0])),
    createQueryBuilder: mock(() => {
      const qb: any = {};
      qb.select = mock(() => qb);
      qb.where = mock(() => qb);
      qb.andWhere = mock(() => qb);
      qb.getRawOne = mock(() => Promise.resolve({ total: "0" }));
      return qb;
    }),
    // estimateForVendor (via computePayoutTotals) reads the shipments
    // carrier-cost sum via the entity manager (raw SQL).
    manager: {
      query: mock((): Promise<any[]> => Promise.resolve([])),
      transaction: mock((cb: any) =>
        cb({
          getRepository: () => mockPayoutRepo,
          query: mock((): Promise<any[]> => Promise.resolve([])),
        }),
      ),
    },
  };
  const mockStripe = {
    transfers: {
      create: mock(() => Promise.resolve({ id: "tr_test" })),
    },
  };
  const mockVendorOrderRepo = {
    find: mock((_args?: any): Promise<any[]> => Promise.resolve([])),
  };
  const mockAuditLogRepo = {
    save: mock((entry: any) => Promise.resolve({ id: "al1", ...entry })),
    create: mock((entry: any) => entry),
    find: mock(() => Promise.resolve([])),
  };
  const mockVendorRepo = {
    findOne: mock(() => Promise.resolve(null)),
  };
  const mockVendorBankAccountRepo = {
    findOne: mock(() => Promise.resolve(null)),
  };
  const mockAdjustmentRepo = {
    find: mock((_args?: any): Promise<any[]> => Promise.resolve([])),
  };

  let service: PayoutService;

  beforeEach(() => {
    // `manager` is a nested object (not a mock fn); skip it with optional-call.
    Object.values(mockPayoutRepo).forEach((m: any) => m.mockClear?.());
    mockPayoutRepo.manager.query.mockClear();
    mockPayoutRepo.manager.transaction.mockClear();
    mockMarkPaidCommissionRepo.update.mockClear();
    markPaidCommissionUpdates.length = 0;
    Object.values(mockCommissionRepo).forEach((m: any) => m.mockClear?.());
    Object.values(mockVendorOrderRepo).forEach((m) => m.mockClear());
    Object.values(mockAuditLogRepo).forEach((m) => m.mockClear());
    Object.values(mockVendorRepo).forEach((m) => m.mockClear());
    Object.values(mockVendorBankAccountRepo).forEach((m) => m.mockClear());
    Object.values(mockAdjustmentRepo).forEach((m) => m.mockClear());
    Object.values(mockDraftAdjustmentRepo).forEach((m: any) => m.mockClear?.());
    draftAdjustmentSaves.length = 0;
    mockStripe.transfers.create.mockClear();
    mockQueueAdd.mockClear();
    service = new PayoutService(
      mockPayoutRepo as any,
      mockCommissionRepo as any,
      mockStripe as any,
      mockVendorOrderRepo as any,
      mockAuditLogRepo as any,
      mockVendorRepo as any,
      mockVendorBankAccountRepo as any,
      mockAdjustmentRepo as any,
    );
  });

  /**
   * Lightweight fixture for computePayoutTotals-focused tests: builds a
   * PayoutService wired to its own isolated mocks (rather than the shared
   * ones above) so each test can hand in exactly the commissions/vendor
   * orders/adjustments it cares about. `__commissionFindArgs` exposes every
   * `where` passed to commissionRepo.find, for asserting the payable
   * predicate itself.
   */
  function makeService(
    opts: {
      commissions?: any[];
      vendorOrders?: any[];
      adjustments?: any[];
      carrierCostSum?: number;
    } = {},
  ) {
    const commissionFindArgs: any[] = [];
    const commissionRepo = {
      find: mock((args?: any) => {
        commissionFindArgs.push(args);
        return Promise.resolve(opts.commissions ?? []);
      }),
      manager: {
        // computePayoutTotals issues one raw query through this manager: the
        // shipments carrier-cost sum.
        query: mock((sql: string): Promise<any[]> => {
          if (typeof sql === "string" && sql.includes("shipments")) {
            return Promise.resolve([{ sum: String(opts.carrierCostSum ?? 0) }]);
          }
          return Promise.resolve([]);
        }),
      },
    };
    const vendorOrderRepo = {
      find: mock((): Promise<any[]> => Promise.resolve(opts.vendorOrders ?? [])),
    };
    const adjustmentRepo = {
      find: mock((): Promise<any[]> => Promise.resolve(opts.adjustments ?? [])),
    };
    const svc: any = new PayoutService(
      mockPayoutRepo as any,
      commissionRepo as any,
      mockStripe as any,
      vendorOrderRepo as any,
      mockAuditLogRepo as any,
      mockVendorRepo as any,
      mockVendorBankAccountRepo as any,
      adjustmentRepo as any,
    );
    svc.__commissionFindArgs = commissionFindArgs;
    svc.__managerQueryMock = commissionRepo.manager.query;
    return svc;
  }

  it("generates payout reference in PAY-YYYY-NNNNNN format", async () => {
    mockPayoutRepo.manager.query.mockResolvedValueOnce([{ nextval: "1" }]);
    const ref = await (service as any).generatePayoutReference();
    expect(ref).toMatch(/^PAY-\d{4}-\d{6}$/);
  });

  /**
   * The vendor payouts page has always shipped a Status dropdown, and it has
   * never done anything: the page sent `?status=paid`, the route's query
   * schema didn't declare `status` so Elysia stripped it, and this method
   * filtered on `vendor_id` alone — so every selection returned the full
   * unfiltered list with an HTTP 200. `listForAdmin` has applied its status
   * filter all along; this is the vendor-side equivalent.
   */
  describe("listForVendor", () => {
    it("narrows to the requested status", async () => {
      await service.listForVendor("v1", { page: 1, limit: 20, status: PayoutStatus.paid });

      const args = mockPayoutRepo.findAndCount.mock.calls[0]![0] as any;
      expect(args.where).toEqual({ vendor_id: "v1", status: "paid" });
    });

    it("returns every status when none is requested", async () => {
      await service.listForVendor("v1", { page: 1, limit: 20 });

      const args = mockPayoutRepo.findAndCount.mock.calls[0]![0] as any;
      expect(args.where).toEqual({ vendor_id: "v1" });
    });

    it("treats an empty-string status as 'no filter', not as status = ''", async () => {
      // The page's "All Statuses" option has value "" and the hook drops it,
      // but a hand-built request could still send `?status=`. Matching on ''
      // would return zero rows and read as "this vendor has no payouts".
      await service.listForVendor("v1", { page: 1, limit: 20, status: "" as any });

      const args = mockPayoutRepo.findAndCount.mock.calls[0]![0] as any;
      expect(args.where).toEqual({ vendor_id: "v1" });
    });

    it("keeps the vendor scope when a status is applied", async () => {
      // The status filter must never widen the query across vendors.
      await service.listForVendor("v1", { page: 2, limit: 5, status: PayoutStatus.failed });

      const args = mockPayoutRepo.findAndCount.mock.calls[0]![0] as any;
      expect(args.where.vendor_id).toBe("v1");
      expect(args.skip).toBe(5);
      expect(args.take).toBe(5);
    });
  });

  describe("computePayoutTotals", () => {
    it("computes gross VAT-inclusive with vat_total surfaced separately", async () => {
      const svc = makeService({
        commissions: [
          {
            id: "c1",
            item_total: 10_500,
            commission_amount: 1_000,
            vendor_earning: 8_950,
            vendor_order_id: "vo1",
          },
        ],
        vendorOrders: [{ id: "vo1", carrier_cost: 400, shipping_contribution: 300 }],
      });

      const t = await svc.computePayoutTotals("v1", "2026-07-31");

      expect(t.gross_amount).toBe(10_500);
      expect(t.vat_total).toBe(500);
      expect(t.commission_total).toBe(1_000);
      expect(t.shipping_contribution_total).toBe(300);
      expect(t.net_amount).toBe(8_650); // 8950 - 300
      expect(t.commission_ids).toEqual(["c1"]);
    });

    it("estimateForVendor and computePayoutTotals report the same gross", async () => {
      const svc = makeService({
        commissions: [
          {
            id: "c1",
            item_total: 10_500,
            commission_amount: 1_000,
            vendor_earning: 8_950,
            vendor_order_id: "vo1",
          },
        ],
        vendorOrders: [{ id: "vo1", carrier_cost: 0, shipping_contribution: 0 }],
      });

      const est = await svc.estimateForVendor("v1");
      const totals = await svc.computePayoutTotals("v1", "2999-01-01");

      expect(est.gross_amount).toBe(totals.gross_amount);
      expect(est.net_amount).toBe(totals.net_amount);
    });

    it("applies signed adjustments to the net", async () => {
      const svc = makeService({
        commissions: [
          {
            id: "c1",
            item_total: 10_500,
            commission_amount: 1_000,
            vendor_earning: 8_950,
            vendor_order_id: "vo1",
          },
        ],
        vendorOrders: [{ id: "vo1", carrier_cost: 0, shipping_contribution: 0 }],
        adjustments: [{ id: "a1", amount_fils: -1_000 }],
      });

      const t = await svc.computePayoutTotals("v1", "2999-01-01");

      expect(t.adjustment_total).toBe(-1_000);
      expect(t.net_amount).toBe(7_950);
      expect(t.adjustment_ids).toEqual(["a1"]);
    });

    it("only counts commissions that are pending, unclaimed, and matured by periodEnd", async () => {
      const svc = makeService({ commissions: [], vendorOrders: [] });
      await svc.computePayoutTotals("v1", "2026-07-31");
      const where = svc.__commissionFindArgs[0].where;
      expect(where.status).toBe("pending");
      expect(where.payout_id).toBeDefined(); // IsNull()
      expect(where.settle_after).toBeDefined(); // LessThanOrEqual(periodEnd)
    });
  });

  describe("carrier_cost_total sourcing", () => {
    const commissions = [
      {
        id: "c1",
        vendor_order_id: "vo1",
        item_total: 10_500,
        commission_amount: 1_000,
        vendor_earning: 9_000,
      },
    ];

    it("sums shipments, not vendor_orders.carrier_cost", async () => {
      // vendor_orders.carrier_cost is deliberately non-zero here: if the old
      // source were still in use this would read 999 instead of 2600.
      const svc = makeService({
        commissions,
        vendorOrders: [{ id: "vo1", carrier_cost: 999, shipping_contribution: 500 }],
        carrierCostSum: 2_600, // two shipments at 1300
      });

      const totals = await svc.computePayoutTotals("v1", "2999-12-31");

      expect(totals.carrier_cost_total).toBe(2_600);
    });

    it("reads 0 when the vendor's orders have no shipments", async () => {
      const svc = makeService({
        commissions,
        vendorOrders: [{ id: "vo1", carrier_cost: 999, shipping_contribution: 500 }],
        carrierCostSum: 0,
      });

      const totals = await svc.computePayoutTotals("v1", "2999-12-31");

      expect(totals.carrier_cost_total).toBe(0);
    });

    it("scopes the sum to this payout's vendor orders and spells out the soft-delete predicate", async () => {
      const svc = makeService({
        commissions,
        vendorOrders: [{ id: "vo1", carrier_cost: 0, shipping_contribution: 500 }],
        carrierCostSum: 1_300,
      });

      await svc.computePayoutTotals("v1", "2999-12-31");

      const shipmentCall = (svc as any).__managerQueryMock.mock.calls.find(
        (c: any[]) => typeof c[0] === "string" && c[0].includes("shipments"),
      );
      expect(shipmentCall).toBeDefined();
      // Raw SQL bypasses TypeORM's soft-delete filter, so the predicate has to
      // be in the query text itself.
      expect(shipmentCall![0]).toContain("deleted_at IS NULL");
      // The predicate alone doesn't prove the sum is scoped to this vendor's
      // orders — an unscoped `SELECT SUM(carrier_cost_fils) FROM shipments
      // WHERE deleted_at IS NULL` would satisfy the assertion above just as
      // happily, and would report every vendor the whole platform's carrier
      // cost. Pin the bind parameter too: it must be exactly this payout's
      // vendor_order_id set.
      expect(shipmentCall![1]).toEqual([["vo1"]]);
    });

    it("does NOT change net_amount — carrier cost is informational", async () => {
      // items_net 9000 - shipping_contribution 500 + adjustments 0
      const withCarrier = makeService({
        commissions,
        vendorOrders: [{ id: "vo1", carrier_cost: 0, shipping_contribution: 500 }],
        carrierCostSum: 2_600,
      });
      const withoutCarrier = makeService({
        commissions,
        vendorOrders: [{ id: "vo1", carrier_cost: 0, shipping_contribution: 500 }],
        carrierCostSum: 0,
      });

      const a = await withCarrier.computePayoutTotals("v1", "2999-12-31");
      const b = await withoutCarrier.computePayoutTotals("v1", "2999-12-31");

      expect(a.net_amount).toBe(8_500);
      expect(a.net_amount).toBe(b.net_amount); // carrier cost must not move it
    });
  });

  it("estimateForVendor deducts shipping_contribution and surfaces both totals", async () => {
    mockCommissionRepo.find.mockResolvedValueOnce([
      {
        vendor_order_id: "vo1",
        vendor_earning: 8000,
        item_total: 8400,
        commission_amount: 400,
        adjustment_amount: 0,
      },
    ]);
    mockVendorOrderRepo.find.mockResolvedValueOnce([
      // carrier_cost: 1200 here is deliberately stale/unused — carrier_cost_total
      // is sourced from shipments now, not vendor_orders.carrier_cost. Left
      // non-zero to prove it's no longer read.
      { id: "vo1", carrier_cost: 1200, shipping_contribution: 500 },
    ]);
    // The manager.query call computePayoutTotals issues is the shipments
    // carrier-cost sum.
    mockCommissionRepo.manager.query.mockResolvedValueOnce([{ sum: "1300" }]);

    const est = await service.estimateForVendor("v1");
    expect(est.shipping_contribution_total).toBe(500);
    expect(est.carrier_cost_total).toBe(1300);
    expect(est.net_amount).toBe(7500); // 8000 items_net - 500 contribution
  });

  it("listForAdmin filters by vendorId, status, period, amount, reference", async () => {
    const qb: any = {};
    qb.leftJoinAndSelect = mock(() => qb);
    qb.andWhere = mock(() => qb);
    qb.orderBy = mock(() => qb);
    qb.skip = mock(() => qb);
    qb.take = mock(() => qb);
    qb.getManyAndCount = mock(() =>
      Promise.resolve([
        [
          {
            id: "po1",
            vendor_id: "v1",
            payout_reference: "PAY-2026-000001",
            status: "paid",
            gross_amount: 10000,
            commission_total: 1000,
            net_amount: 9000,
            period_start: "2026-04-01",
            period_end: "2026-04-30",
            created_at: new Date(),
            vendor: { id: "v1", business_name: "Acme" },
          },
        ],
        1,
      ]),
    );
    mockPayoutRepo.createQueryBuilder.mockReturnValueOnce(qb);

    const result = await service.listForAdmin({
      vendorId: "v1",
      status: "paid",
      periodFrom: "2026-04-01",
      periodTo: "2026-04-30",
      reference: "PAY-2026",
      minNet: 5000,
      maxNet: 100000,
      page: 1,
      limit: 20,
    });

    expect(result.total).toBe(1);
    expect(result.items[0]!.vendor_name).toBe("Acme");
    expect(qb.andWhere).toHaveBeenCalledTimes(7);
    expect(qb.skip).toHaveBeenCalledWith(0);
    expect(qb.take).toHaveBeenCalledWith(20);
  });

  it("getAdminSummary aggregates pending, paid-this-month, processing/failed counts", async () => {
    // Pending commissions sum
    const pendingQb: any = {};
    pendingQb.select = mock(() => pendingQb);
    pendingQb.where = mock(() => pendingQb);
    // R4 MINOR: the pending-sum query now also filters `payout_id IS NULL`,
    // so it chains one more andWhere.
    pendingQb.andWhere = mock(() => pendingQb);
    pendingQb.getRawOne = mock(() => Promise.resolve({ total: "3000" }));
    mockCommissionRepo.createQueryBuilder.mockReturnValueOnce(pendingQb);

    // Paid this month query
    const paidQb: any = {};
    paidQb.where = mock(() => paidQb);
    paidQb.andWhere = mock(() => paidQb);
    paidQb.select = mock(() => paidQb);
    paidQb.getRawOne = mock(() => Promise.resolve({ total: "5000" }));
    mockPayoutRepo.createQueryBuilder.mockReturnValueOnce(paidQb);

    mockPayoutRepo.count.mockResolvedValueOnce(2); // processing
    mockPayoutRepo.count.mockResolvedValueOnce(1); // failed

    const result = await service.getAdminSummary();
    expect(result.total_pending_fils).toBe(3000);
    expect(result.paid_this_month_fils).toBe(5000);
    expect(result.processing_count).toBe(2);
    expect(result.failed_count).toBe(1);
  });

  it("MINOR: getAdminSummary's pending sum excludes commissions already claimed by a draft", async () => {
    // Without `payout_id IS NULL` the tile counted money already locked into
    // an open draft, which the same dashboard shows again as that draft's
    // net_amount — the same fils twice on one screen.
    const pendingQb: any = {};
    pendingQb.select = mock(() => pendingQb);
    pendingQb.where = mock(() => pendingQb);
    pendingQb.andWhere = mock(() => pendingQb);
    pendingQb.getRawOne = mock(() => Promise.resolve({ total: "3000" }));
    mockCommissionRepo.createQueryBuilder.mockReturnValueOnce(pendingQb);
    const paidQb: any = {};
    paidQb.where = mock(() => paidQb);
    paidQb.andWhere = mock(() => paidQb);
    paidQb.select = mock(() => paidQb);
    paidQb.getRawOne = mock(() => Promise.resolve({ total: "0" }));
    mockPayoutRepo.createQueryBuilder.mockReturnValueOnce(paidQb);

    await service.getAdminSummary();

    expect(pendingQb.andWhere).toHaveBeenCalledWith("c.payout_id IS NULL");
  });

  it("MINOR: findByIdWithVendor reads soft-deleted payouts so a rejected draft's reason stays reachable", async () => {
    mockPayoutRepo.findOne.mockResolvedValueOnce({ id: "po1", deleted_at: new Date() } as any);
    await service.findByIdWithVendor("po1");
    expect(mockPayoutRepo.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ withDeleted: true }),
    );
  });

  it("findByIdWithVendor returns payout with vendor relation, null when missing", async () => {
    mockPayoutRepo.findOne.mockResolvedValueOnce({
      id: "po1",
      vendor: { id: "v1", business_name: "Acme" },
    } as any);
    const result = await service.findByIdWithVendor("po1");
    expect(result?.id).toBe("po1");
    expect((result as any)?.vendor?.business_name).toBe("Acme");

    mockPayoutRepo.findOne.mockResolvedValueOnce(null);
    expect(await service.findByIdWithVendor("missing")).toBeNull();
  });

  it("listCommissionsForPayout paginates by payout_id", async () => {
    mockCommissionRepo.findAndCount.mockResolvedValueOnce([
      [{ id: "c1", payout_id: "po1", item_total: 1000 }],
      1,
    ] as any);
    const result = await service.listCommissionsForPayout("po1", 1, 20);
    expect(result.total).toBe(1);
    expect(result.items[0]!.id).toBe("c1");
  });

  it("appendNote sets notes column and writes audit row", async () => {
    mockPayoutRepo.findOne.mockResolvedValueOnce({
      id: "po1",
      notes: null,
      vendor_id: "v1",
    } as any);
    mockPayoutRepo.save.mockResolvedValueOnce({
      id: "po1",
      notes: "hello",
      vendor_id: "v1",
    } as any);

    const updated = await service.appendNote("po1", "admin1", "hello");

    expect(updated.notes).toBe("hello");
    expect(mockAuditLogRepo.save).toHaveBeenCalled();
    const audit = mockAuditLogRepo.save.mock.calls[0]![0];
    expect(audit.action).toBe("payout.note_added");
    expect(audit.entity_type).toBe("vendor_payout");
    expect(audit.entity_id).toBe("po1");
    expect(audit.actor_id).toBe("admin1");
  });

  it("appendNote throws when payout missing", async () => {
    mockPayoutRepo.findOne.mockResolvedValueOnce(null);
    await expect(service.appendNote("nope", "admin1", "hi")).rejects.toThrow("Payout not found");
  });

  it("markPaid transitions processing -> paid, sets processed_at, writes audit", async () => {
    mockPayoutRepo.findOne.mockResolvedValueOnce({
      id: "po1",
      status: "processing",
      vendor_id: "v1",
      notes: null,
    } as any);
    mockPayoutRepo.save.mockImplementationOnce(async (p: any) => p);

    const updated = await service.markPaid("po1", "admin1", "Confirmed via Stripe dashboard");
    expect(updated.status).toBe(PayoutStatus.paid);
    expect(updated.processed_at).toBeInstanceOf(Date);
    expect(mockAuditLogRepo.save).toHaveBeenCalled();
    const audit = mockAuditLogRepo.save.mock.calls[0]![0];
    expect(audit.action).toBe("payout.status_changed");
    expect(audit.changes).toEqual({ status: { old: "processing", new: "paid" } });
  });

  /**
   * R4-I1 — markPaid used to flip only the payout row. Reachable whenever the
   * worker died before recordSuccessfulTransfer, or the operator settled the
   * vendor out of band: the payout reads `paid` while its commissions stay
   * `pending` with payout_id set and paid_at NULL — excluded from
   * computePayoutTotals forever AND counted forever in
   * getAdminSummary.total_pending_fils, with no operator action that corrects
   * it.
   */
  it("R4-I1: markPaid also marks the payout's still-pending claimed commissions paid, in the same transaction", async () => {
    mockPayoutRepo.findOne.mockResolvedValueOnce({
      id: "po1",
      status: "processing",
      vendor_id: "v1",
      notes: null,
    } as any);
    mockPayoutRepo.save.mockImplementationOnce(async (p: any) => p);

    await service.markPaid("po1", "admin1");

    expect(mockPayoutRepo.manager.transaction).toHaveBeenCalled();
    expect(markPaidCommissionUpdates).toHaveLength(1);
    const [where, set] = markPaidCommissionUpdates[0]!;
    // Scoped to `pending` for the same reason recordSuccessfulTransfer is: a
    // claimed commission that has since been cancelled must not be
    // resurrected to `paid`.
    expect(where).toEqual({ payout_id: "po1", status: "pending" });
    expect(set.status).toBe("paid");
    expect(set.paid_at).toBeInstanceOf(Date);
    const audit = mockAuditLogRepo.save.mock.calls[0]![0];
    expect(audit.metadata.marked_paid_count).toBe(2);
  });

  it("markPaid rejects when status is not processing", async () => {
    mockPayoutRepo.findOne.mockResolvedValueOnce({
      id: "po1",
      status: "paid",
    } as any);
    await expect(service.markPaid("po1", "admin1")).rejects.toThrow(/must be in 'processing'/i);
  });

  it("markFailed transitions processing -> failed, requires notes", async () => {
    mockPayoutRepo.findOne.mockResolvedValueOnce({
      id: "po1",
      status: "processing",
      vendor_id: "v1",
      notes: null,
    } as any);
    mockPayoutRepo.save.mockImplementationOnce(async (p: any) => p);

    const updated = await service.markFailed("po1", "admin1", "Stripe returned account_blocked");
    expect(updated.status).toBe(PayoutStatus.failed);
    expect(updated.notes).toBe("Stripe returned account_blocked");
  });

  it("markFailed rejects when notes missing", async () => {
    // markFailed validates notes before ever touching the repo, so no
    // mockPayoutRepo.findOne stub is consumed here — queuing one would leak
    // into (and misalign) whichever findOne-consuming test runs next.
    await expect(service.markFailed("po1", "admin1")).rejects.toThrow(/notes/i);
  });

  it("enqueueGenerate rejects when vendor has no default bank account", async () => {
    mockVendorRepo.findOne.mockResolvedValueOnce({
      id: "v1",
      stripe_account_id: "acct_test",
    } as any);
    mockVendorBankAccountRepo.findOne.mockResolvedValueOnce(null);
    await expect(
      service.enqueueGenerate({
        vendorId: "v1",
        periodStart: "2026-04-01",
        periodEnd: "2026-04-30",
        adminUserId: "a1",
      }),
    ).rejects.toThrow(/bank account/i);
  });

  it("enqueueGenerate rejects when there are no pending commissions", async () => {
    mockVendorRepo.findOne.mockResolvedValueOnce({
      id: "v1",
      stripe_account_id: "acct_test",
    } as any);
    mockVendorBankAccountRepo.findOne.mockResolvedValueOnce({ id: "ba1" } as any);
    // estimateForVendor uses commissionRepo.find — return empty
    mockCommissionRepo.find.mockResolvedValueOnce([]);
    await expect(
      service.enqueueGenerate({
        vendorId: "v1",
        periodStart: "2026-04-01",
        periodEnd: "2026-04-30",
        adminUserId: "a1",
      }),
    ).rejects.toThrow(/no pending commissions/i);
  });

  it("enqueueGenerate rejects on duplicate period", async () => {
    mockVendorRepo.findOne.mockResolvedValueOnce({
      id: "v1",
      stripe_account_id: "acct_test",
    } as any);
    mockVendorBankAccountRepo.findOne.mockResolvedValueOnce({ id: "ba1" } as any);
    mockCommissionRepo.find.mockResolvedValueOnce([
      { vendor_earning: 1000, item_total: 1100 },
    ] as any);
    // estimateForVendor also calls vendorOrderRepo.find — return empty
    mockVendorOrderRepo.find.mockResolvedValueOnce([] as any);
    mockPayoutRepo.findOne.mockResolvedValueOnce({ id: "existing", status: "pending" } as any);
    await expect(
      service.enqueueGenerate({
        vendorId: "v1",
        periodStart: "2026-04-01",
        periodEnd: "2026-04-30",
        adminUserId: "a1",
      }),
    ).rejects.toThrow(/already exists/i);
  });

  it("enqueueGenerate forwards force through to the queued create job", async () => {
    mockVendorRepo.findOne.mockResolvedValueOnce({
      id: "v1",
      stripe_account_id: "acct_test",
    } as any);
    mockVendorBankAccountRepo.findOne.mockResolvedValueOnce({ id: "ba1" } as any);
    mockCommissionRepo.find.mockResolvedValueOnce([
      { vendor_earning: 1000, item_total: 1100 },
    ] as any);
    mockVendorOrderRepo.find.mockResolvedValueOnce([] as any);
    mockPayoutRepo.findOne.mockResolvedValueOnce(null);

    await service.enqueueGenerate({
      vendorId: "v1",
      periodStart: "2026-04-01",
      periodEnd: "2026-04-30",
      adminUserId: "a1",
      force: true,
    });

    expect(mockQueueAdd).toHaveBeenCalledWith(
      "create",
      expect.objectContaining({ type: "create", force: true }),
    );
  });

  it("I4: enqueueGenerate passes the requested periodEnd into the estimate, not estimateForVendor's open-ended default", async () => {
    mockVendorRepo.findOne.mockResolvedValueOnce({
      id: "v1",
      stripe_account_id: "acct_test",
    } as any);
    mockVendorBankAccountRepo.findOne.mockResolvedValueOnce({ id: "ba1" } as any);
    mockPayoutRepo.findOne.mockResolvedValueOnce(null);
    const estimateSpy = mock(() => Promise.resolve({ pending_count: 1 }) as any);
    (service as any).estimateForVendor = estimateSpy;

    await service.enqueueGenerate({
      vendorId: "v1",
      periodStart: "2026-04-01",
      periodEnd: "2026-04-30",
      adminUserId: "a1",
    });

    expect(estimateSpy).toHaveBeenCalledWith("v1", "2026-04-30");
  });

  it("R4-I3: enqueueGenerate accepts a vendor whose only payable balance is an adjustment", async () => {
    mockVendorRepo.findOne.mockResolvedValueOnce({
      id: "v1",
      stripe_account_id: "acct_test",
    } as any);
    mockVendorBankAccountRepo.findOne.mockResolvedValueOnce({ id: "ba1" } as any);
    mockPayoutRepo.findOne.mockResolvedValueOnce(null);
    (service as any).estimateForVendor = mock(() =>
      Promise.resolve({ pending_count: 0, adjustment_ids: ["adj-1"], net_amount: 25_000 } as any),
    );

    const result = await service.enqueueGenerate({
      vendorId: "v1",
      periodStart: "2026-07-01",
      periodEnd: "2026-07-15",
      adminUserId: "a1",
    });

    expect(result.jobId).toBeTruthy();
  });

  it("enqueueGenerate still rejects a vendor with neither commissions nor adjustments", async () => {
    mockVendorRepo.findOne.mockResolvedValueOnce({
      id: "v1",
      stripe_account_id: "acct_test",
    } as any);
    mockVendorBankAccountRepo.findOne.mockResolvedValueOnce({ id: "ba1" } as any);
    (service as any).estimateForVendor = mock(() =>
      Promise.resolve({ pending_count: 0, adjustment_ids: [] } as any),
    );
    await expect(
      service.enqueueGenerate({
        vendorId: "v1",
        periodStart: "2026-07-01",
        periodEnd: "2026-07-15",
        adminUserId: "a1",
      }),
    ).rejects.toThrow(/no pending commissions/i);
  });

  it("FIX 5: enqueueGenerate succeeds for a vendor with NO Stripe account (same headline fix as createDraft)", async () => {
    mockVendorRepo.findOne.mockResolvedValueOnce({
      id: "v1",
      stripe_account_id: null,
    } as any);
    mockVendorBankAccountRepo.findOne.mockResolvedValueOnce({ id: "ba1" } as any);
    mockCommissionRepo.find.mockResolvedValueOnce([
      { vendor_earning: 1000, item_total: 1100 },
    ] as any);
    mockVendorOrderRepo.find.mockResolvedValueOnce([] as any);
    mockPayoutRepo.findOne.mockResolvedValueOnce(null);

    const result = await service.enqueueGenerate({
      vendorId: "v1",
      periodStart: "2026-04-01",
      periodEnd: "2026-04-30",
      adminUserId: "a1",
    });

    expect(result.jobId).toBeTruthy();
    expect(mockQueueAdd).toHaveBeenCalledWith(
      "create",
      expect.objectContaining({ vendorId: "v1", stripeAccountId: null }),
    );
  });

  it("retry rejects when payout not failed", async () => {
    mockPayoutRepo.findOne.mockResolvedValueOnce({ id: "po1", status: "paid" } as any);
    await expect(service.retry("po1", "admin1")).rejects.toThrow(/Only failed/i);
  });

  describe("markPaid on the manual rail", () => {
    it("requires a bank reference", async () => {
      mockPayoutRepo.findOne = mock(() =>
        Promise.resolve({
          id: "po1",
          status: "processing",
          payout_rail: "manual_bank_transfer",
          gateway_reference: null,
        } as any),
      );

      await expect(service.markPaid("po1", "admin1", "done")).rejects.toThrow(
        "a bank reference is required",
      );
    });

    it("stores the reference as the gateway_reference", async () => {
      mockPayoutRepo.findOne = mock(() =>
        Promise.resolve({
          id: "po1",
          status: "processing",
          payout_rail: "manual_bank_transfer",
          gateway_reference: null,
        } as any),
      );

      const updated = await service.markPaid("po1", "admin1", undefined, "FT26073012345");

      expect(updated.gateway_reference).toBe("FT26073012345");
      expect(updated.status).toBe(PayoutStatus.paid);
    });

    it("does not require a reference on the stripe rail", async () => {
      mockPayoutRepo.findOne = mock(() =>
        Promise.resolve({
          id: "po1",
          status: "processing",
          payout_rail: "stripe_connect",
          gateway_reference: "tr_123",
        } as any),
      );

      const updated = await service.markPaid("po1", "admin1");
      expect(updated.status).toBe(PayoutStatus.paid);
      expect(updated.gateway_reference).toBe("tr_123");
    });

    // The DTO accepts `reference` on every `status: "paid"` request, so a
    // future caller (e.g. Task 6's pay dialog) could plausibly send one
    // unconditionally. If the assignment were ever hoisted out of the
    // `payout_rail === manual_bank_transfer` branch, this is the test that
    // would catch it clobbering the real Stripe transfer id — the
    // codebase's only authoritative "money has left" signal and
    // reconciliation handle.
    it("ignores a reference supplied on the stripe rail — must not overwrite the existing gateway_reference", async () => {
      mockPayoutRepo.findOne = mock(() =>
        Promise.resolve({
          id: "po1",
          status: "processing",
          payout_rail: "stripe_connect",
          gateway_reference: "tr_123",
        } as any),
      );

      const updated = await service.markPaid("po1", "admin1", undefined, "FT-should-be-ignored");
      expect(updated.gateway_reference).toBe("tr_123");
    });
  });

  describe("retry on the manual rail", () => {
    it("refuses — there is no Stripe call to retry", async () => {
      mockPayoutRepo.findOne = mock(() =>
        Promise.resolve({
          id: "po1",
          status: "failed",
          payout_rail: "manual_bank_transfer",
          gateway_reference: null,
          payout_reference: "PAY-2026-000001",
        } as any),
      );

      await expect(service.retry("po1", "admin1")).rejects.toMatchObject({
        code: "PAYOUT_RETRY_INVALID_RAIL",
      });
    });
  });

  describe("createDraft", () => {
    /**
     * Draft-generation fixture: stubs computePayoutTotals directly (Task 5 is
     * covered by its own describe block above) and wires a fake transaction
     * manager whose getRepository() routes by entity class, mirroring what
     * txMgr.getRepository(target) resolves to for the draft insert in
     * production. Since the conditional claim (this task) went from
     * repo.update() to a raw `UPDATE ... WHERE ... IS NULL RETURNING id`
     * (mirroring the existing executeApprovedTransfer/executeRetryAndAudit
     * claim pattern, and returning the `[rows, count]` tuple TypeORM's
     * pg driver gives back for that shape — see
     * reference_typeorm_update_returning_tuple), the shared txQuery mock
     * below routes by table name: commission and adjustment claims are
     * captured separately (with a configurable claimed-count, to simulate a
     * concurrent draft having claimed some rows first).
     * __commissionClaims / __adjustmentClaims capture every
     * claim write for assertions; __stripe is the exact Stripe double passed
     * into the service so "never called" is a statement about the real
     * dependency, not a decoy.
     */
    function makeService(
      opts: {
        vendor?: any;
        totals?: Partial<Awaited<ReturnType<PayoutService["computePayoutTotals"]>>> & {
          net_amount: number;
          pending_count: number;
          commission_ids: string[];
          adjustment_ids: string[];
        };
        existingPayout?: any;
        /** Rows the mocked commission claim UPDATE reports as affected. Defaults to "claims everything requested". */
        commissionClaimedCount?: number;
        /** Rows the mocked adjustment claim UPDATE reports as affected. Defaults to "claims everything requested". */
        adjustmentClaimedCount?: number;
      } = {},
    ) {
      const vendor = opts.vendor ?? {
        id: "v1",
        stripe_account_id: "acct_1",
        minimum_payout: 0,
      };
      const totals = {
        gross_amount: 0,
        vat_total: 0,
        commission_total: 0,
        adjustment_total: 0,
        carrier_cost_total: 0,
        shipping_contribution_total: 0,
        ...opts.totals,
      };

      const vendorRepo = { findOne: mock(() => Promise.resolve(vendor)) };
      const bankRepo = {
        findOne: mock(() => Promise.resolve({ id: "ba1", vendor_id: vendor.id, is_primary: true })),
      };
      const stripe = { transfers: { create: mock(() => Promise.resolve({ id: "tr_test" })) } };

      const commissionClaims: any[] = [];
      const adjustmentClaims: any[] = [];

      let savedDraft: any = null;
      const payoutTxRepo = {
        save: mock((data: any) => {
          savedDraft = { id: "draft1", ...data };
          return Promise.resolve(savedDraft);
        }),
      };
      // R4 MINOR: createDraft's audit row is written through the DRAFT's own
      // transaction now (so a rolled-back draft cannot leave a
      // `payout.draft_created` row behind), which means this manager has to
      // resolve AuditLog to something other than the payout repository.
      const txAudits: any[] = [];
      const txAuditRepo = {
        create: mock((entry: any) => entry),
        save: mock((entry: any) => {
          txAudits.push(entry);
          return Promise.resolve({ id: "al1", ...entry });
        }),
      };
      const txQuery = mock((sql: string, params?: any[]) => {
        if (sql.includes("UPDATE commissions")) {
          commissionClaims.push([sql, params]);
          const ids: string[] = (params?.[1] as string[]) ?? [];
          const claimed = opts.commissionClaimedCount ?? ids.length;
          return Promise.resolve([ids.slice(0, claimed).map((id) => ({ id })), claimed]);
        }
        if (sql.includes("UPDATE vendor_payout_adjustments")) {
          adjustmentClaims.push([sql, params]);
          const ids: string[] = (params?.[1] as string[]) ?? [];
          const claimed = opts.adjustmentClaimedCount ?? ids.length;
          return Promise.resolve([ids.slice(0, claimed).map((id) => ({ id })), claimed]);
        }
        return Promise.resolve([[], 0]);
      });

      const payoutTarget = {}; // sentinel: distinct from the Commission/VendorPayoutAdjustment classes
      const payoutRepo = {
        target: payoutTarget,
        findOne: mock(() => Promise.resolve(opts.existingPayout ?? null)),
        manager: {
          query: mock(() => Promise.resolve([{ nextval: "1" }])),
          transaction: mock((cb: any) =>
            cb({
              getRepository: (target: any) => (target === AuditLog ? txAuditRepo : payoutTxRepo),
              query: txQuery,
            }),
          ),
        },
      };

      const auditLogRepo = {
        save: mock((entry: any) => Promise.resolve({ id: "al1", ...entry })),
        create: mock((entry: any) => entry),
      };

      const svc: any = new PayoutService(
        payoutRepo as any,
        {} as any, // commissionRepo — unused; computePayoutTotals is stubbed below
        stripe as any,
        {} as any, // vendorOrderRepo — unused
        auditLogRepo as any,
        vendorRepo as any,
        bankRepo as any,
        {} as any, // adjustmentRepo — unused
      );

      svc.computePayoutTotals = mock(() => Promise.resolve(totals));
      svc.__stripe = stripe;
      svc.__commissionClaims = commissionClaims;
      svc.__adjustmentClaims = adjustmentClaims;
      svc.__txAudits = txAudits;
      return svc;
    }

    it("creates a pending draft with no gateway reference and never calls stripe", async () => {
      const svc = makeService({
        totals: {
          net_amount: 50_000,
          pending_count: 2,
          commission_ids: ["c1", "c2"],
          adjustment_ids: [],
        },
      });

      const draft = await svc.createDraft({
        vendorId: "v1",
        periodStart: "2026-07-01",
        periodEnd: "2026-07-15",
        adminUserId: "a1",
      });

      expect(draft!.status).toBe("pending");
      expect(draft!.gateway_reference).toBeNull();
      expect(svc.__stripe.transfers.create).not.toHaveBeenCalled();
    });

    it("claims its commissions by stamping payout_id, conditioned on payout_id still being NULL", async () => {
      const svc = makeService({
        totals: {
          net_amount: 50_000,
          pending_count: 2,
          commission_ids: ["c1", "c2"],
          adjustment_ids: ["a1"],
        },
      });

      const draft = await svc.createDraft({
        vendorId: "v1",
        periodStart: "2026-07-01",
        periodEnd: "2026-07-15",
        adminUserId: "a1",
      });

      const [sql, params] = svc.__commissionClaims[0];
      expect(sql).toMatch(/payout_id IS NULL/);
      expect(params[0]).toBe(draft!.id);
      expect(params[1]).toEqual(["c1", "c2"]);

      const [adjSql, adjParams] = svc.__adjustmentClaims[0];
      expect(adjSql).toMatch(/settled_payout_id IS NULL/);
      expect(adjParams[0]).toBe(draft!.id);
      expect(adjParams[1]).toEqual(["a1"]);
    });

    it("R3-I2: the commission claim also predicates on status = 'pending', matching the read it came from", async () => {
      // computePayoutTotals reads `status='pending' AND payout_id IS NULL`;
      // the claim used to check only `payout_id IS NULL`. A commission
      // cancelOrder voided in the tens of milliseconds between the two was
      // still claimed, with its earning already baked into net_amount —
      // cancelOrder's stale-claim scan had already run (payout_id was NULL
      // then) and reconciliation only compares the draft's own stored
      // columns, so nothing else caught it.
      const svc = makeService({
        totals: {
          net_amount: 50_000,
          pending_count: 2,
          commission_ids: ["c1", "c2"],
          adjustment_ids: [],
        },
      });

      await svc.createDraft({
        vendorId: "v1",
        periodStart: "2026-07-01",
        periodEnd: "2026-07-15",
        adminUserId: "a1",
      });

      const [sql] = svc.__commissionClaims[0];
      expect(sql).toMatch(/status = 'pending'/);
    });

    it("throws PAYOUT_DUPLICATE up front when a non-deleted payout already exists for this vendor and period", async () => {
      const svc = makeService({
        existingPayout: { id: "existing1", status: "pending" },
        totals: {
          net_amount: 50_000,
          pending_count: 2,
          commission_ids: ["c1", "c2"],
          adjustment_ids: [],
        },
      });

      const err = await svc
        .createDraft({
          vendorId: "v1",
          periodStart: "2026-07-01",
          periodEnd: "2026-07-15",
          adminUserId: "a1",
        })
        .catch((e: any) => e);

      expect(err).toBeInstanceOf(Error);
      expect(err.code).toBe("PAYOUT_DUPLICATE");
      // Never reached the transaction: no claim attempted.
      expect(svc.__commissionClaims).toHaveLength(0);
    });

    it("rolls back the whole draft when the commission claim races and claims fewer rows than expected", async () => {
      const svc = makeService({
        totals: {
          net_amount: 50_000,
          pending_count: 2,
          commission_ids: ["c1", "c2"],
          adjustment_ids: [],
        },
        // Simulates a concurrent createDraft call claiming "c2" first.
        commissionClaimedCount: 1,
      });

      await expect(
        svc.createDraft({
          vendorId: "v1",
          periodStart: "2026-07-01",
          periodEnd: "2026-07-15",
          adminUserId: "a1",
        }),
      ).rejects.toThrow(/concurrent|raced|claimed/i);
    });

    it("rolls back the whole draft when the adjustment claim races and claims fewer rows than expected", async () => {
      const svc = makeService({
        totals: {
          net_amount: 50_000,
          pending_count: 1,
          commission_ids: ["c1"],
          adjustment_ids: ["a1", "a2"],
        },
        // Simulates a concurrent createDraft call claiming "a2" first.
        adjustmentClaimedCount: 1,
      });

      await expect(
        svc.createDraft({
          vendorId: "v1",
          periodStart: "2026-07-01",
          periodEnd: "2026-07-15",
          adminUserId: "a1",
        }),
      ).rejects.toThrow(/concurrent|raced|claimed/i);
    });

    it("returns null when there is nothing payable", async () => {
      const svc = makeService({
        totals: { net_amount: 0, pending_count: 0, commission_ids: [], adjustment_ids: [] },
      });
      const draft = await svc.createDraft({
        vendorId: "v1",
        periodStart: "2026-07-01",
        periodEnd: "2026-07-15",
        adminUserId: null,
      });
      expect(draft).toBeNull();
    });

    it("refuses a draft below the vendor's minimum_payout", async () => {
      const svc = makeService({
        vendor: { id: "v1", minimum_payout: 100_000, stripe_account_id: "acct_1" },
        totals: {
          net_amount: 50_000,
          pending_count: 1,
          commission_ids: ["c1"],
          adjustment_ids: [],
        },
      });

      await expect(
        svc.createDraft({
          vendorId: "v1",
          periodStart: "2026-07-01",
          periodEnd: "2026-07-15",
          adminUserId: "a1",
        }),
      ).rejects.toThrow(/minimum payout/i);
    });

    it("allows force to bypass the minimum", async () => {
      const svc = makeService({
        vendor: { id: "v1", minimum_payout: 100_000, stripe_account_id: "acct_1" },
        totals: {
          net_amount: 50_000,
          pending_count: 1,
          commission_ids: ["c1"],
          adjustment_ids: [],
        },
      });

      const draft = await svc.createDraft({
        vendorId: "v1",
        periodStart: "2026-07-01",
        periodEnd: "2026-07-15",
        adminUserId: "a1",
        force: true,
      });

      expect(draft!.net_amount).toBe(50_000);
    });

    /**
     * R4-I3 — the adjustment ledger is this branch's designated compensation
     * lever (recordSuccessfulTransfer tells the operator to correct things
     * through it), but `pending_count === 0 -> return null` meant a draft
     * could not exist without at least one payable commission. A credit to a
     * vendor with no new sales — a closed shop, exactly when compensation is
     * needed — was therefore unpayable forever. Negative adjustments were
     * always fine; only positive ones were unreachable.
     */
    it("R4-I3: builds a draft from unsettled adjustments alone when there are no payable commissions", async () => {
      const svc = makeService({
        totals: {
          net_amount: 25_000,
          pending_count: 0,
          commission_ids: [],
          adjustment_ids: ["adj-1"],
          adjustment_total: 25_000,
        },
      });

      const draft = await svc.createDraft({
        vendorId: "v1",
        periodStart: "2026-07-01",
        periodEnd: "2026-07-15",
        adminUserId: "a1",
      });

      expect(draft).not.toBeNull();
      expect(draft!.net_amount).toBe(25_000);
      // No commission claim is attempted at all (an empty ANY($2::uuid[])
      // would claim nothing and then trip the affected-row check).
      expect(svc.__commissionClaims).toHaveLength(0);
      expect(svc.__adjustmentClaims).toHaveLength(1);
      expect(svc.__stripe.transfers.create).not.toHaveBeenCalled();
    });

    it("still returns null when there is neither a payable commission nor an adjustment", async () => {
      const svc = makeService({
        totals: { net_amount: 0, pending_count: 0, commission_ids: [], adjustment_ids: [] },
      });
      const draft = await svc.createDraft({
        vendorId: "v1",
        periodStart: "2026-07-01",
        periodEnd: "2026-07-15",
        adminUserId: null,
      });
      expect(draft).toBeNull();
    });

    it("MINOR: the draft_created audit row is written through the draft's own transaction", async () => {
      const svc = makeService({
        totals: {
          net_amount: 50_000,
          pending_count: 1,
          commission_ids: ["c1"],
          adjustment_ids: [],
        },
      });
      await svc.createDraft({
        vendorId: "v1",
        periodStart: "2026-07-01",
        periodEnd: "2026-07-15",
        adminUserId: "a1",
      });
      // Written through txMgr, not the service's own auditLogRepo — so it
      // rolls back with the draft it describes.
      expect(svc.__txAudits).toHaveLength(1);
      expect(svc.__txAudits[0].action).toBe("payout.draft_created");
    });

    it("refuses a non-positive net", async () => {
      const svc = makeService({
        totals: { net_amount: -500, pending_count: 1, commission_ids: ["c1"], adjustment_ids: [] },
      });
      const draft = await svc.createDraft({
        vendorId: "v1",
        periodStart: "2026-07-01",
        periodEnd: "2026-07-15",
        adminUserId: null,
      });
      expect(draft).toBeNull();
    });

    it("FIX 5: succeeds for a vendor with NO Stripe account — the headline bug this branch fixes (the Stripe requirement lives on approveDraft's stripe_connect branch, not here)", async () => {
      const svc = makeService({
        vendor: { id: "v1", stripe_account_id: null, minimum_payout: 0 },
        totals: {
          net_amount: 50_000,
          pending_count: 2,
          commission_ids: ["c1", "c2"],
          adjustment_ids: [],
        },
      });

      const draft = await svc.createDraft({
        vendorId: "v1",
        periodStart: "2026-07-01",
        periodEnd: "2026-07-15",
        adminUserId: "a1",
      });

      expect(draft).not.toBeNull();
      expect(draft!.status).toBe("pending");
      expect(draft!.gateway_reference).toBeNull();
      expect(svc.__stripe.transfers.create).not.toHaveBeenCalled();
    });
  });

  describe("approveDraft / executeApprovedTransfer / rejectDraft", () => {
    /**
     * Approve/transfer/reject fixture: findOne returns the given payout (with
     * an optional vendor relation), manager.transaction routes getRepository()
     * by entity class exactly like the createDraft fixture above, and
     * __commissionUpdates / __adjustmentUpdates / __payoutSaved
     * capture every write for assertions. __stripe is the exact double passed
     * into the service.
     *
     * `shipping_contribution_total`/`adjustment_total` default to 0 so the
     * C1 reconciliation backstop's identity
     * (net_amount + shipping_contribution_total - adjustment_total) holds by
     * default against `claimedEarningSum` (see `claimQuery` below), i.e. every
     * test in this block reconciles cleanly unless it opts into a mismatch via
     * `claimedEarningSum`.
     */
    function makeService(
      opts: {
        payout?: any;
        claimResult?: "claimed" | "not_claimed";
        /** Overrides what the mocked reconciliation SELECT reports as the claimed commissions' vendor_earning sum (C1 backstop). Defaults to reconciling exactly with the payout's stored figures. */
        claimedEarningSum?: number;
        /** R3-I1: how many claimed commissions the reconciliation SELECT reports as still 'pending'. */
        pendingCount?: number;
        /** R3-I1: how many rows the bulk mark-paid UPDATE reports as affected. */
        markPaidAffected?: number;
        /** R3-C3: whether rejectDraft's in-transaction compare-and-set wins its race. */
        rejectClaimResult?: "claimed" | "not_claimed";
      } = {},
    ) {
      const payout =
        "payout" in opts
          ? opts.payout
          : {
              id: "p1",
              status: "pending",
              net_amount: 50_000,
              shipping_contribution_total: 0,
              adjustment_total: 0,
              currency: "AED",
              vendor_id: "v1",
              vendor: { stripe_account_id: "acct_1" },
            };

      const stripe = { transfers: { create: mock(() => Promise.resolve({ id: "tr_test" })) } };

      const commissionUpdates: any[] = [];
      const adjustmentUpdates: any[] = [];
      const txQueries: Array<{ sql: string; params?: any[] }> = [];
      let payoutSaved: any = null;

      const txCommissionRepo = {
        update: mock((where: any, set: any) => {
          commissionUpdates.push([where, set]);
          return Promise.resolve({
            affected: opts.markPaidAffected ?? 0,
            raw: [],
            generatedMaps: [],
          });
        }),
      };
      const txAdjustmentRepo = {
        update: mock((where: any, set: any) => {
          adjustmentUpdates.push([where, set]);
          return Promise.resolve({ affected: 0, raw: [], generatedMaps: [] });
        }),
      };
      const payoutTxRepo = {
        save: mock((data: any) => {
          payoutSaved = { ...data };
          return Promise.resolve(payoutSaved);
        }),
      };
      // R3-C3: rejectDraft now claims the payout row with the SAME conditional
      // `UPDATE vendor_payouts ... WHERE status='pending' RETURNING id` that
      // invalidateDraftForReversal uses, INSIDE its transaction and BEFORE any
      // commission write — so the in-transaction manager's query() has to
      // answer that too, in TypeORM's [rows, rowCount] tuple shape.
      // `rejectClaimResult: "not_claimed"` simulates losing that race.
      const txQuery = mock((sql: string, params?: any[]) => {
        if (sql.includes("UPDATE vendor_payouts")) {
          txQueries.push({ sql, params });
          const rows = opts.rejectClaimResult === "not_claimed" ? [] : [{ id: params?.[0] }];
          return Promise.resolve([rows, rows.length]);
        }
        return Promise.resolve([]);
      });

      // Simulates both the raw `UPDATE ... WHERE status = 'pending'
      // RETURNING id` conditional claim (mirrors TypeORM's `[rows, rowCount]`
      // tuple shape — see reference_typeorm_update_returning_tuple) AND the
      // C1 reconciliation backstop's plain SELECT (a bare row array, no
      // tuple, per a normal non-RETURNING query).
      const claimQuery = mock((sql: string, params?: any[]) => {
        if (sql.includes("SUM(vendor_earning)")) {
          const sum =
            opts.claimedEarningSum ??
            (payout?.net_amount ?? 0) +
              (payout?.shipping_contribution_total ?? 0) -
              (payout?.adjustment_total ?? 0);
          return Promise.resolve([{ sum, pending_count: opts.pendingCount ?? 0 }]);
        }
        if (opts.claimResult === "not_claimed") return Promise.resolve([[], 0]);
        return Promise.resolve([[{ id: params?.[0] }], 1]);
      });

      const audits: any[] = [];
      const auditLogRepo = {
        save: mock((entry: any) => {
          audits.push(entry);
          return Promise.resolve({ id: "al1", ...entry });
        }),
        create: mock((entry: any) => entry),
      };

      const payoutTarget = {}; // sentinel: distinct from Commission/VendorPayoutAdjustment classes
      const payoutRepo = {
        target: payoutTarget,
        findOne: mock(() => Promise.resolve(payout)),
        save: mock((data: any) => {
          payoutSaved = { ...data };
          return Promise.resolve(payoutSaved);
        }),
        manager: {
          query: claimQuery,
          transaction: mock((cb: any) =>
            cb({
              getRepository: (target: any) => {
                if (target === Commission) return txCommissionRepo;
                if (target === VendorPayoutAdjustment) return txAdjustmentRepo;
                // R4 MINOR: writeAudit runs through the caller's manager when
                // one is given (voidFailedPayout does), so AuditLog must not
                // fall through to the payout repository and clobber
                // __payoutSaved.
                if (target === AuditLog) return auditLogRepo;
                return payoutTxRepo;
              },
              query: txQuery,
            }),
          ),
        },
      };

      const svc: any = new PayoutService(
        payoutRepo as any,
        {} as any, // commissionRepo — unused; these paths never recompute totals
        stripe as any,
        {} as any, // vendorOrderRepo — unused
        auditLogRepo as any,
        {} as any, // vendorRepo — unused
        {} as any, // vendorBankAccountRepo — unused
        {} as any, // adjustmentRepo — unused
      );

      svc.__stripe = stripe;
      svc.__commissionUpdates = commissionUpdates;
      svc.__adjustmentUpdates = adjustmentUpdates;
      svc.__claimQuery = claimQuery;
      svc.__txQueries = txQueries;
      svc.__audits = audits;
      svc.__payoutRepo = payoutRepo;
      Object.defineProperty(svc, "__payoutSaved", { get: () => payoutSaved });
      return svc;
    }

    it("transfers the draft's stored net_amount, not a recomputed one", async () => {
      const svc = makeService({
        payout: {
          id: "p1",
          status: "pending",
          net_amount: 50_000,
          shipping_contribution_total: 0,
          adjustment_total: 0,
          currency: "AED",
          vendor_id: "v1",
          vendor: { stripe_account_id: "acct_1" },
        },
      });
      svc.computePayoutTotals = mock(async () => {
        throw new Error("must not recompute");
      });

      await svc.executeApprovedTransfer("p1");

      expect(svc.__stripe.transfers.create).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 50_000, currency: "aed", destination: "acct_1" }),
        { idempotencyKey: "payout-transfer-p1" },
      );
    });

    it("carries a Stripe idempotency key derived from the payout id", async () => {
      const svc = makeService({
        payout: {
          id: "p1",
          status: "pending",
          net_amount: 50_000,
          shipping_contribution_total: 0,
          adjustment_total: 0,
          currency: "AED",
          vendor_id: "v1",
          vendor: { stripe_account_id: "acct_1" },
        },
      });

      await svc.executeApprovedTransfer("p1");

      expect(svc.__stripe.transfers.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ idempotencyKey: "payout-transfer-p1" }),
      );
    });

    it("claims the payout via a conditional UPDATE before ever touching Stripe", async () => {
      const svc = makeService();
      await svc.executeApprovedTransfer("p1");
      expect(svc.__claimQuery).toHaveBeenCalled();
      // the claim happened before the Stripe call: if it hadn't, the mocked
      // claim would still resolve (it's unconditional here), so this test is
      // reinforced by the "0 rows claimed" test below for the causal order.
    });

    it("never calls Stripe when the conditional claim affects 0 rows", async () => {
      const svc = makeService({ claimResult: "not_claimed" });

      const result = await svc.executeApprovedTransfer("p1");

      expect(svc.__stripe.transfers.create).not.toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it("a Stripe call that succeeds but whose post-transfer DB write fails, followed by a retry, calls Stripe exactly once", async () => {
      let dbStatus = "pending";
      let transactionCallCount = 0;
      const payoutRow: any = {
        id: "p1",
        status: "pending",
        net_amount: 50_000,
        shipping_contribution_total: 0,
        adjustment_total: 0,
        currency: "AED",
        vendor_id: "v1",
        vendor: { stripe_account_id: "acct_1" },
      };
      const stripe = { transfers: { create: mock(() => Promise.resolve({ id: "tr_test" })) } };
      const payoutTxRepo = { save: mock((data: any) => Promise.resolve(data)) };
      const txCommissionRepo = {
        update: mock(() => Promise.resolve({ affected: 0, raw: [], generatedMaps: [] })),
      };

      const payoutRepo: any = {
        target: {},
        findOne: mock(() => Promise.resolve({ ...payoutRow, status: dbStatus })),
        save: mock((data: any) => {
          dbStatus = data.status;
          return Promise.resolve(data);
        }),
        manager: {
          // Mirrors a real conditional UPDATE: only succeeds while the row is
          // still "pending", and — critically — commits immediately (it isn't
          // wrapped in the transaction that fails below), exactly like a real
          // autocommitted UPDATE outside an explicit transaction. The C1
          // reconciliation SELECT is routed separately so it doesn't consume
          // the dbStatus-driven claim branch below.
          query: mock((sql: string, params?: any[]) => {
            if (sql.includes("SUM(vendor_earning)")) {
              return Promise.resolve([{ sum: 50_000 }]); // reconciles with payoutRow.net_amount
            }
            if (dbStatus !== "pending") return Promise.resolve([[], 0]);
            dbStatus = "processing";
            return Promise.resolve([[{ id: params?.[0] }], 1]);
          }),
          transaction: mock((cb: any) => {
            transactionCallCount += 1;
            if (transactionCallCount === 1) {
              // Simulates the transient DB blip from the finding: the Stripe
              // transfer has already gone out, but the post-transfer commit
              // (status -> processing, gateway_reference, paid commissions)
              // never lands.
              throw new Error("connection reset by peer");
            }
            return cb({
              getRepository: (target: any) =>
                target === Commission ? txCommissionRepo : payoutTxRepo,
              query: mock(() => Promise.resolve([])),
            });
          }),
        },
      };

      const svc: any = new PayoutService(
        payoutRepo,
        {} as any,
        stripe as any,
        {} as any,
        { save: mock(() => Promise.resolve({})), create: mock((e: any) => e) } as any,
        {} as any,
        {} as any,
        {} as any,
      );

      // Attempt 1 (the original job run): Stripe succeeds, then the
      // post-transfer transaction throws — this is what causes BullMQ to
      // schedule attempt 2.
      await expect(svc.executeApprovedTransfer("p1")).rejects.toThrow(/connection reset/);
      expect(stripe.transfers.create).toHaveBeenCalledTimes(1);

      // Attempt 2 (BullMQ's retry): the conditional claim it performs first
      // sees the payout is no longer "pending" — attempt 1's raw UPDATE
      // already committed independently of the failed transaction — so it
      // no-ops instead of transferring a second time.
      await expect(svc.executeApprovedTransfer("p1")).resolves.toBeDefined();
      expect(stripe.transfers.create).toHaveBeenCalledTimes(1);
    });

    it("marks exactly the claimed commissions paid, in one update", async () => {
      const svc = makeService({
        payout: {
          id: "p1",
          status: "pending",
          net_amount: 50_000,
          shipping_contribution_total: 0,
          adjustment_total: 0,
          currency: "AED",
          vendor_id: "v1",
          vendor: { stripe_account_id: "acct_1" },
        },
      });

      await svc.executeApprovedTransfer("p1");

      expect(svc.__commissionUpdates).toHaveLength(1);
      const [where, set] = svc.__commissionUpdates[0];
      // C1: scoped to status='pending' too — a commission that left
      // 'pending' for any reason (most importantly, cancelOrder voiding it
      // to 'cancelled') must never be resurrected to 'paid' just because it
      // still carries this payout's id.
      expect(where).toEqual({ payout_id: "p1", status: "pending" });
      expect(set.status).toBe("paid");
      expect(set.paid_at).toBeInstanceOf(Date);
    });

    it("refuses to approve anything that is not a pending draft", async () => {
      const svc = makeService({ payout: { id: "p1", status: "paid" } });
      await expect(svc.approveDraft("p1", "admin-1")).rejects.toThrow(/only pending drafts/i);
    });

    it("rejecting a draft releases its commissions and adjustments", async () => {
      const svc = makeService({ payout: { id: "p1", status: "pending", vendor_id: "v1" } });

      await svc.rejectDraft("p1", "admin-1", "wrong period");

      expect(svc.__commissionUpdates[0]).toEqual([{ payout_id: "p1" }, { payout_id: null }]);
      expect(svc.__adjustmentUpdates[0]).toEqual([
        { settled_payout_id: "p1" },
        { settled_payout_id: null },
      ]);
      // R3-C3: the soft-delete is the compare-and-set UPDATE itself, not an
      // ORM save of the (possibly stale) entity loaded before the
      // transaction. This assertion used to read
      // `svc.__payoutSaved.deleted_at` — which passed precisely BECAUSE the
      // buggy implementation re-saved a stale row (writing `status` back to
      // 'pending' over whatever the approval path had set).
      const claim = svc.__txQueries.find((q: any) => q.sql.includes("UPDATE vendor_payouts"));
      // R4-C1 widened the shared CAS predicate from `status = 'pending'` to
      // "no transfer exists for this payout" — see
      // claimDraftForInvalidation. rejectDraft still refuses anything but a
      // pending draft up front; this asserts the shared claim's own shape.
      expect(claim?.sql).toContain("status IN ('pending', 'failed')");
      expect(claim?.sql).toContain("gateway_reference IS NULL");
      expect(claim?.sql).toContain("deleted_at IS NULL");
      expect(claim?.sql).toContain("SET deleted_at = now()");
      expect(claim?.params).toEqual(["p1", "wrong period"]);
    });

    describe("R3-C3 — rejectDraft is a compare-and-set, not a read-then-write", () => {
      it("claims the payout row BEFORE touching any commission (lock order: vendor_payouts -> commissions)", async () => {
        // R3-I3: releaseClaims used to run FIRST and save the payout row LAST
        // — the exact inverse of recordSuccessfulTransfer's and
        // invalidateDraftForReversal's order, which is what made reject and
        // reversal able to deadlock each other. Postgres aborting the
        // reversal side is CRITICAL 5 with no crash required.
        const svc = makeService({ payout: { id: "p1", status: "pending", vendor_id: "v1" } });
        const order: string[] = [];
        const originalRelease = (svc as any).releaseClaims.bind(svc);
        (svc as any).releaseClaims = async (...args: any[]) => {
          order.push("releaseClaims");
          return originalRelease(...args);
        };
        const originalClaim = (svc as any).claimDraftForInvalidation.bind(svc);
        (svc as any).claimDraftForInvalidation = async (...args: any[]) => {
          order.push("claimPayoutRow");
          return originalClaim(...args);
        };

        await svc.rejectDraft("p1", "admin-1", "wrong period");

        expect(order).toEqual(["claimPayoutRow", "releaseClaims"]);
      });

      it("releases NOTHING when the payout was claimed concurrently between the status read and the transaction", async () => {
        // The round-3 finding, concretely: findOne reads draft D as
        // 'pending'; the payout worker CASes D pending -> processing and
        // enters its ~500 ms stripe.transfers.create; this transaction then
        // commits. Under the old read-then-write it released every
        // commission (payout_id = NULL) while the transfer was in flight, so
        // the next nightly draft PAID THEM AGAIN.
        const svc = makeService({
          payout: { id: "p1", status: "pending", vendor_id: "v1" },
          rejectClaimResult: "not_claimed",
        });

        await expect(svc.rejectDraft("p1", "admin-1", "wrong period")).rejects.toThrow(
          /pending drafts/i,
        );

        expect(svc.__commissionUpdates).toHaveLength(0);
        expect(svc.__adjustmentUpdates).toHaveLength(0);
      });
    });

    describe("R3-I1 — the mark-paid update's affected-row count is checked", () => {
      it("audits and alarms (without throwing away the transfer) when fewer commissions were marked paid than reconciliation expected", async () => {
        // The money is already gone: the transfer succeeded, and only THEN
        // did the bulk `WHERE payout_id = :id AND status = 'pending'` update
        // come up short — meaning a claimed commission was cancelled or
        // released in between. That shortfall is the alarm; it must be
        // recorded, not swallowed, and the payout must keep its
        // gateway_reference so a human can reconcile it.
        const svc = makeService({
          payout: {
            id: "p1",
            status: "pending",
            net_amount: 50_000,
            shipping_contribution_total: 0,
            adjustment_total: 0,
            currency: "AED",
            vendor_id: "v1",
            vendor: { stripe_account_id: "acct_1" },
          },
          pendingCount: 3,
          markPaidAffected: 2,
        });

        const result = await svc.executeApprovedTransfer("p1");

        expect(result).toBeDefined();
        expect(svc.__payoutSaved.gateway_reference).toBe("tr_test");
        const audits = svc.__audits as any[];
        expect(audits.some((a: any) => a.action === "payout.commission_mark_paid_mismatch")).toBe(
          true,
        );
        const mismatch = audits.find(
          (a: any) => a.action === "payout.commission_mark_paid_mismatch",
        );
        expect(mismatch.metadata).toMatchObject({
          gateway_reference: "tr_test",
          expected_commission_count: 3,
          marked_paid_count: 2,
        });
      });

      it("writes no mismatch audit when every expected commission was marked paid", async () => {
        const svc = makeService({
          payout: {
            id: "p1",
            status: "pending",
            net_amount: 50_000,
            shipping_contribution_total: 0,
            adjustment_total: 0,
            currency: "AED",
            vendor_id: "v1",
            vendor: { stripe_account_id: "acct_1" },
          },
          pendingCount: 3,
          markPaidAffected: 3,
        });

        await svc.executeApprovedTransfer("p1");

        const audits = svc.__audits as any[];
        expect(audits.some((a: any) => a.action === "payout.commission_mark_paid_mismatch")).toBe(
          false,
        );
      });
    });

    describe("R3-C2 — the reconciliation SELECT excludes cancelled commissions", () => {
      it("filters the claimed-earning sum on status so a cancelled-but-still-claimed commission is actually detected", async () => {
        const svc = makeService();

        await svc.executeApprovedTransfer("p1");

        const reconcileCall = svc.__claimQuery.mock.calls.find((c: any[]) =>
          String(c[0]).includes("SUM(vendor_earning)"),
        );
        // Without a status filter, cancelling a commission (which touches
        // neither vendor_earning nor payout_id) leaves the sum byte-identical
        // — the "backstop" could never fire for the case it exists to catch.
        expect(String(reconcileCall?.[0])).toContain("status <> 'cancelled'");
      });

      it("refuses to transfer when a claimed commission was cancelled by an order cancellation (61_550 fils)", async () => {
        // The finding's exact figures: earning 61_550 claimed by payout P,
        // the order is cancelled and fully refunded, the commission goes
        // 'cancelled' but keeps payout_id. The status-filtered sum now drops
        // to 0 against an expected 61_550.
        const svc = makeService({
          payout: {
            id: "p1",
            status: "pending",
            net_amount: 61_550,
            shipping_contribution_total: 0,
            adjustment_total: 0,
            currency: "AED",
            vendor_id: "v1",
            vendor: { stripe_account_id: "acct_1" },
          },
          claimedEarningSum: 0,
        });

        await expect(svc.executeApprovedTransfer("p1")).rejects.toThrow(/reconciliation failed/i);
        expect(svc.__stripe.transfers.create).not.toHaveBeenCalled();
      });
    });

    it("approveDraft queues a transfer job and returns its id", async () => {
      const svc = makeService({
        payout: { id: "p1", status: "pending", vendor_id: "v1", net_amount: 50_000 },
      });
      // This fixture's local vendorRepo is unwired (`{} as any`) since no
      // other test in this describe exercises the stripe_connect gate — wire
      // it here so approveDraft's vendor lookup resolves an account.
      (svc as any).vendorRepo = {
        findOne: mock(() => Promise.resolve({ id: "v1", stripe_account_id: "acct_1" })),
      };

      const result = await svc.approveDraft("p1", "admin-1", PayoutRail.stripe_connect);

      expect(result).toEqual({ jobId: "job1", rail: PayoutRail.stripe_connect });
      expect(mockQueueAdd).toHaveBeenCalledWith(
        "transfer",
        expect.objectContaining({ type: "transfer", payoutId: "p1", adminUserId: "admin-1" }),
      );
    });

    it("marks the payout failed and rethrows when the Stripe transfer fails", async () => {
      const svc = makeService({
        payout: {
          id: "p1",
          status: "pending",
          net_amount: 50_000,
          shipping_contribution_total: 0,
          adjustment_total: 0,
          currency: "AED",
          vendor_id: "v1",
          vendor: { stripe_account_id: "acct_1" },
        },
      });
      // R5-C1: must be a DEFINITIVE rejection to reach the `failed` write.
      // Stripe told us it created nothing, so the row is safely retryable.
      const declined: any = new Error("card_declined");
      declined.type = "StripeInvalidRequestError";
      declined.statusCode = 400;
      svc.__stripe.transfers.create.mockImplementationOnce(() => Promise.reject(declined));

      await expect(svc.executeApprovedTransfer("p1")).rejects.toThrow("card_declined");
      expect(svc.__payoutSaved.status).toBe("failed");
      // The bulk commission update never runs — the DB transaction is only
      // entered after the Stripe call succeeds.
      expect(svc.__commissionUpdates).toHaveLength(0);
    });

    // R5-C1. The approval path marked the payout `failed` for ANY throw. On an
    // ambiguous failure — Stripe accepted the transfer but the response was
    // lost — that produces a row that says `failed` with gateway_reference
    // NULL, which is exactly the shape retry()/markFailed/both claim UPDATEs
    // read as "no transfer exists". One Retry click then sends the money
    // again under a deliberately-fresh idempotency key, and no webhook in this
    // repo would ever notice.
    // R5-I1. `claimDraftForInvalidation` (reject / reversal) invalidates a
    // draft by setting `deleted_at` and LEAVING `status = 'pending'`, and this
    // claim is raw SQL, which does not get TypeORM's soft-delete scoping. A
    // draft invalidated between the findOne and the claim was therefore still
    // claimable — and `assertClaimedSetReconciles` cannot catch it, because
    // its identity reduces to `items_net`: for an adjustment-only draft both
    // sides are 0 and it passes, so a rejected draft's money goes out while
    // its released adjustments are paid again by the next draft.
    it("R5-I1: the transfer claim refuses a soft-deleted (invalidated) draft", async () => {
      const svc = makeService();
      await svc.executeApprovedTransfer("p1");

      const claimSql = (svc.__claimQuery as any).mock.calls
        .map((c: any) => String(c[0]))
        .find((s: string) => s.includes("UPDATE vendor_payouts"));
      expect(claimSql).toBeDefined();
      expect(claimSql).toContain("deleted_at IS NULL");
    });

    describe("R5-C1 indeterminate Stripe failures", () => {
      const makePending = () => ({
        id: "p1",
        status: "pending",
        net_amount: 50_000,
        shipping_contribution_total: 0,
        adjustment_total: 0,
        currency: "AED",
        vendor_id: "v1",
        vendor: { stripe_account_id: "acct_1" },
        gateway_reference: null,
      });

      it("does NOT mark the payout failed when the transfer outcome is unknown", async () => {
        const svc = makeService({ payout: makePending() });
        const lost: any = new Error("socket hang up");
        lost.type = "StripeConnectionError";
        svc.__stripe.transfers.create.mockImplementationOnce(() => Promise.reject(lost));

        await expect(svc.executeApprovedTransfer("p1")).rejects.toThrow("socket hang up");

        // Left in 'processing' — the one state nothing here moves money from.
        expect(svc.__payoutSaved.status).toBe("processing");
        expect(svc.__payoutSaved.status).not.toBe("failed");
        expect(svc.__payoutSaved.notes).toContain("UNKNOWN");
        expect(svc.__commissionUpdates).toHaveLength(0);
      });

      it("treats a Stripe 5xx as unknown even when it carries a definitive-looking type", async () => {
        const svc = makeService({ payout: makePending() });
        const boom: any = new Error("upstream error");
        boom.type = "StripeInvalidRequestError";
        boom.statusCode = 503;
        svc.__stripe.transfers.create.mockImplementationOnce(() => Promise.reject(boom));

        await expect(svc.executeApprovedTransfer("p1")).rejects.toThrow("upstream error");
        expect(svc.__payoutSaved.status).toBe("processing");
      });

      it("fails closed: an unrecognised error is treated as unknown, not as a rejection", async () => {
        const svc = makeService({ payout: makePending() });
        svc.__stripe.transfers.create.mockImplementationOnce(() =>
          Promise.reject(new Error("worker killed")),
        );

        await expect(svc.executeApprovedTransfer("p1")).rejects.toThrow("worker killed");
        expect(svc.__payoutSaved.status).toBe("processing");
      });

      it("writes back 'processing', never the stale pre-claim status the entity still holds", async () => {
        // The claim UPDATE is raw SQL, so the in-memory entity still says
        // 'pending' here. Saving it unset would undo the claim and hand the
        // row back to the approver.
        const svc = makeService({ payout: makePending() });
        const lost: any = new Error("ETIMEDOUT");
        lost.type = "StripeConnectionError";
        svc.__stripe.transfers.create.mockImplementationOnce(() => Promise.reject(lost));

        await expect(svc.executeApprovedTransfer("p1")).rejects.toThrow("ETIMEDOUT");
        expect(svc.__payoutSaved.status).not.toBe("pending");
        expect(svc.__payoutSaved.status).toBe("processing");
      });
    });

    describe("C1 reconciliation backstop", () => {
      it("refuses to transfer when the claimed commission set no longer reconciles with the draft's stored figures", async () => {
        const svc = makeService({
          payout: {
            id: "p1",
            status: "pending",
            net_amount: 17_900,
            shipping_contribution_total: 0,
            adjustment_total: 0,
            currency: "AED",
            vendor_id: "v1",
            vendor: { stripe_account_id: "acct_1" },
          },
          // A reversal released one of the two claimed commissions after the
          // draft was built (C1): only 8_950 of the expected 17_900 is still
          // actually claimed by this payout.
          claimedEarningSum: 8_950,
        });

        await expect(svc.executeApprovedTransfer("p1")).rejects.toThrow(/reconciliation failed/i);
        expect(svc.__stripe.transfers.create).not.toHaveBeenCalled();
        expect(svc.__payoutSaved.status).toBe("failed");
      });

      it("reconciles and transfers normally when the claimed set still matches (shipping + adjustments included)", async () => {
        const svc = makeService({
          payout: {
            id: "p1",
            status: "pending",
            net_amount: 7_950, // items_net(8950) - shipping(300) + adjustments(-700)
            shipping_contribution_total: 300,
            adjustment_total: -700,
            currency: "AED",
            vendor_id: "v1",
            vendor: { stripe_account_id: "acct_1" },
          },
          // items_net = net_amount + shipping_contribution_total - adjustment_total
          //           = 7950 + 300 - (-700) = 8950
          claimedEarningSum: 8_950,
        });

        await expect(svc.executeApprovedTransfer("p1")).resolves.toBeDefined();
        expect(svc.__stripe.transfers.create).toHaveBeenCalledWith(
          expect.objectContaining({ amount: 7_950 }),
          expect.anything(),
        );
      });
    });

    it("refuses to reject anything that is not a pending draft", async () => {
      const svc = makeService({ payout: { id: "p1", status: "paid" } });
      await expect(svc.rejectDraft("p1", "admin-1", "wrong period")).rejects.toThrow(
        /only pending drafts/i,
      );
    });

    it("rejectDraft requires a non-empty reason", async () => {
      const svc = makeService({ payout: { id: "p1", status: "pending" } });
      await expect(svc.rejectDraft("p1", "admin-1", "   ")).rejects.toThrow(/reason/i);
    });

    /**
     * R4-C1 — `failed` used to be an absorbing state. `payout_id` is nulled
     * in exactly one place (releaseClaims), reachable only behind a CAS that
     * required `pending`, so a payout that failed at Stripe held its
     * commissions forever: no release path existed at all, and after R3's
     * fixes any retry of it failed reconciliation identically, forever.
     *
     * The timeline these tests encode is the reviewers': draft P claims 20
     * commissions worth 500,000 fils, Stripe throws, P is `failed`, a
     * customer returns one item so that commission recomputes 8,950 -> 0
     * with `payout_id` still set, and every subsequent retry then compares
     * a claimed 491,050 against an expected 500,000 and refuses. Void is
     * what gets the other 491,050 fils of genuinely earned money back into
     * the payable pool.
     */
    describe("R4-C1 — voidFailedPayout releases a failed payout that never sent money", () => {
      const failedPayout = {
        id: "p1",
        status: "failed",
        net_amount: 500_000,
        shipping_contribution_total: 0,
        adjustment_total: 0,
        currency: "AED",
        vendor_id: "v1",
        payout_reference: "PAY-2026-000001",
        gateway_reference: null,
        notes: "Reconciliation failed before transfer: ... 491050 ... 500000",
      };

      it("releases commissions and adjustments and soft-deletes the payout with the reason", async () => {
        const svc = makeService({ payout: { ...failedPayout } });

        await svc.voidFailedPayout("p1", "admin-1", "Stripe account fixed; rebuilding the draft");

        // Lock order: vendor_payouts claimed FIRST, then commissions ->
        // adjustments, same as every other path.
        const claim = svc.__txQueries.find((q: any) => q.sql.includes("UPDATE vendor_payouts"));
        expect(claim?.sql).toContain("status IN ('pending', 'failed')");
        expect(claim?.sql).toContain("gateway_reference IS NULL");
        expect(claim?.sql).toContain("SET deleted_at = now()");
        expect(claim?.params?.[1]).toContain("Stripe account fixed");
        expect(svc.__commissionUpdates[0]).toEqual([{ payout_id: "p1" }, { payout_id: null }]);
        expect(svc.__adjustmentUpdates[0]).toEqual([
          { settled_payout_id: "p1" },
          { settled_payout_id: null },
        ]);
        const audit = svc.__audits.find((a: any) => a.action === "payout.voided");
        expect(audit).toBeTruthy();
        expect(audit.entity_id).toBe("p1");
        expect(audit.actor_id).toBe("admin-1");
        expect(audit.actor_role).toBe("admin");
        expect(audit.metadata.net_amount).toBe(500_000);
      });

      it("refuses a payout that is not failed (409 PAYOUT_NOT_VOIDABLE) and releases nothing", async () => {
        const svc = makeService({ payout: { ...failedPayout, status: "processing" } });
        await expect(svc.voidFailedPayout("p1", "admin-1", "why not")).rejects.toMatchObject({
          code: "PAYOUT_NOT_VOIDABLE",
        });
        expect(svc.__commissionUpdates).toHaveLength(0);
        expect(svc.__txQueries).toHaveLength(0);
      });

      it("refuses a failed payout whose transfer DID go out, and releases nothing", async () => {
        // The money-safety core: gateway_reference set means Stripe accepted
        // a transfer for this payout. Releasing its commissions would let a
        // future draft pay the same money a second time.
        const svc = makeService({
          payout: { ...failedPayout, gateway_reference: "tr_already_sent" },
        });
        await expect(svc.voidFailedPayout("p1", "admin-1", "please release")).rejects.toMatchObject(
          { code: "PAYOUT_NOT_VOIDABLE" },
        );
        expect(svc.__commissionUpdates).toHaveLength(0);
        expect(svc.__adjustmentUpdates).toHaveLength(0);
        expect(svc.__txQueries).toHaveLength(0);
      });

      it("requires a non-empty reason", async () => {
        const svc = makeService({ payout: { ...failedPayout } });
        await expect(svc.voidFailedPayout("p1", "admin-1", "   ")).rejects.toMatchObject({
          code: "PAYOUT_VOID_REASON_REQUIRED",
        });
      });

      it("throws Payout not found for an unknown id", async () => {
        const svc = makeService({ payout: null });
        await expect(svc.voidFailedPayout("nope", "admin-1", "reason")).rejects.toThrow(
          "Payout not found",
        );
      });

      it("releases NOTHING when the compare-and-set loses its race", async () => {
        // A retry claimed the row back to `processing` between the status
        // read and the CAS. Zero affected rows is the only source of truth.
        const svc = makeService({
          payout: { ...failedPayout },
          rejectClaimResult: "not_claimed",
        });
        await expect(svc.voidFailedPayout("p1", "admin-1", "reason")).rejects.toMatchObject({
          code: "PAYOUT_NOT_VOIDABLE",
        });
        expect(svc.__commissionUpdates).toHaveLength(0);
        expect(svc.__adjustmentUpdates).toHaveLength(0);
      });
    });

    /**
     * R4-C2 — "Mark Failed" then "Retry" on a payout whose transfer already
     * succeeded sends net_amount a SECOND time. recordSuccessfulTransfer
     * leaves the payout `processing` WITH a gateway_reference and nothing
     * promotes it to `paid` automatically, so the detail page offers both
     * buttons for exactly that row; the retry idempotency key is deliberately
     * fresh per operator retry (R3-C1) so Stripe will not dedupe it, and the
     * reconciliation passes because it counts `paid` commissions on purpose.
     */
    describe("R4-C2 — a payout whose transfer already went out can be neither failed nor retried", () => {
      const sentPayout = {
        id: "p1",
        status: "processing",
        net_amount: 50_000,
        shipping_contribution_total: 0,
        adjustment_total: 0,
        currency: "AED",
        vendor_id: "v1",
        payout_reference: "PAY-2026-000001",
        gateway_reference: "tr_sent_once",
      };

      it("markFailed refuses a processing payout that carries a gateway_reference", async () => {
        const svc = makeService({ payout: { ...sentPayout } });
        await expect(svc.markFailed("p1", "admin-1", "looks stuck to me")).rejects.toMatchObject({
          code: "PAYOUT_TRANSFER_ALREADY_SENT",
        });
        expect(svc.__payoutSaved).toBeNull();
      });

      it("markFailed still works for a processing payout with no transfer", async () => {
        const svc = makeService({ payout: { ...sentPayout, gateway_reference: null } });
        const updated = await svc.markFailed("p1", "admin-1", "bank rejected it");
        expect(updated.status).toBe("failed");
      });

      it("retry refuses a failed payout that carries a gateway_reference, and queues nothing", async () => {
        const svc = makeService({
          payout: { ...sentPayout, status: "failed" },
        });
        mockQueueAdd.mockClear();
        await expect(svc.retry("p1", "admin-1")).rejects.toMatchObject({
          code: "PAYOUT_TRANSFER_ALREADY_SENT",
        });
        expect(mockQueueAdd).not.toHaveBeenCalled();
      });

      it("the worker-side retry claim also refuses it: the UPDATE predicates on gateway_reference IS NULL", async () => {
        const svc = makeService({
          payout: { ...sentPayout, status: "failed", vendor: { stripe_account_id: "acct_1" } },
        });
        // claimResult defaults to "claimed" here, so if the predicate were
        // missing the transfer WOULD go out; the assertion is on the SQL the
        // database is actually asked to run.
        await svc.executeRetryAndAudit("p1", "token-1");
        const claim = (svc.__payoutRepo.manager.query as any).mock.calls
          .map((c: any[]) => c[0] as string)
          .find((sql: string) => sql.includes("status = 'failed'"));
        expect(claim).toContain("gateway_reference IS NULL");
      });

      it("the approval claim carries the same predicate (sibling path parity)", async () => {
        const svc = makeService();
        await svc.executeApprovedTransfer("p1");
        const claim = (svc.__payoutRepo.manager.query as any).mock.calls
          .map((c: any[]) => c[0] as string)
          .find((sql: string) => sql.includes("status = 'pending'"));
        expect(claim).toContain("gateway_reference IS NULL");
      });
    });
  });

  describe("invalidateDraftForReversal — C2 compare-and-set", () => {
    /**
     * `invalidateDraftForReversal` takes the `manager` the CALLER hands in
     * (CommissionReversalService, sometimes mid another transaction) rather
     * than opening its own — so this fixture builds a bare fake
     * EntityManager, not the payoutRepo.manager.transaction() harness the
     * approve/reject tests above use. `claimedRows` controls what the raw
     * conditional `UPDATE ... RETURNING id` reports back.
     */
    function makeManager(opts: { claimedRows?: Array<{ id: string }>; currentStatus?: string }) {
      const commissionUpdates: any[] = [];
      const adjustmentUpdates: any[] = [];
      const queries: Array<{ sql: string; params?: any[] }> = [];

      const commissionRepo = {
        update: mock((where: any, set: any) => {
          commissionUpdates.push([where, set]);
          return Promise.resolve({ affected: 0, raw: [], generatedMaps: [] });
        }),
      };
      const adjustmentRepo = {
        update: mock((where: any, set: any) => {
          adjustmentUpdates.push([where, set]);
          return Promise.resolve({ affected: 0, raw: [], generatedMaps: [] });
        }),
      };
      const payoutRepo = {
        findOne: mock(() =>
          Promise.resolve(
            "currentStatus" in opts ? { id: "p1", status: opts.currentStatus } : null,
          ),
        ),
      };
      const auditRepo = {
        create: mock((d: any) => ({ ...d })),
        save: mock((a: any) => Promise.resolve(a)),
      };

      const manager: any = {
        query: mock((sql: string, params?: any[]) => {
          queries.push({ sql, params });
          if (sql.includes("UPDATE vendor_payouts")) {
            const rows = opts.claimedRows ?? [{ id: params?.[0] }];
            return Promise.resolve([rows, rows.length]);
          }
          return Promise.resolve([]);
        }),
        getRepository: mock((target: any) => {
          if (target === Commission) return commissionRepo;
          if (target === VendorPayoutAdjustment) return adjustmentRepo;
          // R4 MINOR: the success-path audit row is written through this
          // manager now, so it must resolve AuditLog to something saveable.
          if (target === AuditLog) return auditRepo;
          return payoutRepo;
        }),
      };

      return {
        manager,
        commissionUpdates,
        adjustmentUpdates,
        queries,
        payoutRepo,
        auditRepo,
      };
    }

    it("claims via a conditional UPDATE gated on 'no transfer exists' ... RETURNING id, and releases commissions/adjustments only when it wins", async () => {
      const { manager, commissionUpdates, adjustmentUpdates, queries, auditRepo } = makeManager({
        claimedRows: [{ id: "p1" }],
      });

      const result = await service.invalidateDraftForReversal(
        manager,
        "p1",
        "superseded by return r1",
      );

      expect(result.invalidated).toBe(true);
      const claimCall = queries.find((q) => q.sql.includes("UPDATE vendor_payouts"));
      // R4-C1 CHANGED THIS ASSERTION DELIBERATELY. It used to require
      // `status = 'pending'`, which is what made `failed` an absorbing state
      // with no release path at all. The safety condition is not the status
      // but whether a transfer exists.
      expect(claimCall?.sql).toContain("status IN ('pending', 'failed')");
      expect(claimCall?.sql).toContain("gateway_reference IS NULL");
      expect(claimCall?.sql).toContain("deleted_at IS NULL");
      expect(claimCall?.params).toEqual(["p1", "superseded by return r1"]);
      expect(commissionUpdates).toEqual([[{ payout_id: "p1" }, { payout_id: null }]]);
      expect(adjustmentUpdates).toEqual([
        [{ settled_payout_id: "p1" }, { settled_payout_id: null }],
      ]);
      // The audit row goes through the caller's manager now, not the
      // service's own repository (R4 MINOR: writeAudit honours the caller's
      // EntityManager so it rolls back with the change it describes).
      expect(auditRepo.save).toHaveBeenCalled();
    });

    it("releases nothing when the conditional update affects 0 rows", async () => {
      // C2: the old read-then-write implementation released claims based on
      // an earlier `findOne` observing 'pending' — which could already be
      // stale by the time the write ran (the approval path claims the row
      // in between). The conditional UPDATE is the only source of truth for
      // whether this call actually owns the release; 0 rows back means it
      // lost the race (or the draft was never pending), and nothing else
      // may be touched.
      const { manager, commissionUpdates, adjustmentUpdates, auditRepo } = makeManager({
        claimedRows: [],
        currentStatus: "processing",
      });

      const result = await service.invalidateDraftForReversal(
        manager,
        "p1",
        "superseded by return r1",
      );

      expect(result).toEqual({ invalidated: false, payoutStatus: "processing" });
      expect(commissionUpdates).toHaveLength(0);
      expect(adjustmentUpdates).toHaveLength(0);
      expect(mockAuditLogRepo.save).not.toHaveBeenCalled();
      expect(auditRepo.save).not.toHaveBeenCalled();
    });

    describe("R3-C2/C4/I4 — recordUnreleasableClaim, the shared clawback sink", () => {
      // R4 MINOR: writeAudit now writes through the CALLER's EntityManager
      // when one is supplied, so this fake manager has to distinguish the
      // adjustment repository from the audit-log one - otherwise the audit
      // row lands in `saved` and every "no adjustment was written"
      // assertion below silently stops meaning anything.
      function makeAdjustmentManager() {
        const saved: any[] = [];
        const audited: any[] = [];
        const adjustmentRepo = {
          create: mock((d: any) => ({ ...d })),
          save: mock((a: any) => {
            saved.push(a);
            return Promise.resolve(a);
          }),
        };
        const auditRepo = {
          create: mock((d: any) => ({ ...d })),
          save: mock((a: any) => {
            audited.push(a);
            return Promise.resolve(a);
          }),
        };
        const manager: any = {
          getRepository: mock((target: any) => (target === AuditLog ? auditRepo : adjustmentRepo)),
          query: mock(() => Promise.resolve([])),
        };
        return { manager, saved, audited };
      }

      const baseInput = {
        commissionId: "c1",
        vendorId: "v1",
        payoutId: "p1",
        clawbackAmount: 61_550,
        sourceType: "order_cancellation",
        sourceId: "order-1",
        reason: "Order cancellation (order-1): refunded",
      };

      it("writes a negative adjustment when the payout's transfer has already gone out", async () => {
        const { manager, saved, audited } = makeAdjustmentManager();

        const out = await service.recordUnreleasableClaim(manager, {
          ...baseInput,
          payoutStatus: "processing",
        });

        expect(out).toEqual({ clawedBack: true, amount: 61_550, moneyLeftThePlatform: true });
        expect(saved).toHaveLength(1);
        expect(saved[0]).toMatchObject({
          vendor_id: "v1",
          amount_fils: -61_550,
          source_type: "order_cancellation",
          source_id: "order-1",
        });
        expect(audited).toHaveLength(1);
      });

      it("writes NO adjustment for a failed payout, but still audits (R3-I4)", async () => {
        const { manager, saved, audited } = makeAdjustmentManager();

        const out = await service.recordUnreleasableClaim(manager, {
          ...baseInput,
          payoutStatus: "failed",
        });

        expect(out).toEqual({ clawedBack: false, amount: 0, moneyLeftThePlatform: false });
        expect(saved).toHaveLength(0);
        expect(audited).toHaveLength(1);
      });

      it("writes NO zero-fils adjustment — the table CHECKs amount_fils <> 0 (R3-C4)", async () => {
        const { manager, saved, audited } = makeAdjustmentManager();

        const out = await service.recordUnreleasableClaim(manager, {
          ...baseInput,
          payoutStatus: "paid",
          clawbackAmount: 0,
        });

        expect(out.clawedBack).toBe(false);
        expect(saved).toHaveLength(0);
        expect(audited).toHaveLength(1);
      });
    });

    it("reports not_found when the payout row no longer exists", async () => {
      const { manager, commissionUpdates } = makeManager({ claimedRows: [] });

      const result = await service.invalidateDraftForReversal(manager, "missing", "reason");

      expect(result).toEqual({ invalidated: false, payoutStatus: "not_found" });
      expect(commissionUpdates).toHaveLength(0);
    });
  });

  describe("executeRetryAndAudit", () => {
    /**
     * Retry fixture: mirrors the approveDraft/executeApprovedTransfer fixture
     * above, but the conditional claim transitions failed -> processing (not
     * pending -> processing). The success path now shares
     * recordSuccessfulTransfer with the approval path (I1 fix), so this
     * fixture ALSO needs manager.transaction + a txCommissionRepo — the
     * claimed commissions must be marked paid on retry too, not just on
     * approval.
     */
    function makeService(
      opts: {
        payout?: any;
        claimResult?: "claimed" | "not_claimed";
        /** R3-C2: overrides what the (now shared) pre-transfer reconciliation SELECT reports. Defaults to reconciling exactly. */
        claimedEarningSum?: number;
        /** R3-I1: how many claimed commissions the reconciliation SELECT reports as still 'pending'. */
        pendingCount?: number;
        /** R3-I1: how many rows the bulk mark-paid UPDATE reports as affected. */
        markPaidAffected?: number;
        /** R5-C1: override the Stripe double to exercise the transfers.list duplicate guard. */
        stripe?: any;
      } = {},
    ) {
      const payout = opts.payout ?? {
        id: "p1",
        status: "failed",
        net_amount: 50_000,
        shipping_contribution_total: 0,
        adjustment_total: 0,
        currency: "AED",
        vendor_id: "v1",
        vendor: { stripe_account_id: "acct_1" },
        gateway_reference: null,
        updated_at: new Date("2026-07-20T10:00:00.000Z"),
      };

      const stripe = opts.stripe ?? {
        transfers: { create: mock(() => Promise.resolve({ id: "tr_retry" })) },
      };
      let payoutSaved: any = null;
      const commissionUpdates: any[] = [];

      // Simulates the raw `UPDATE ... WHERE status = 'failed' RETURNING id`
      // conditional claim: same [rows, rowCount] tuple shape as the approval
      // path's claim (see reference_typeorm_update_returning_tuple) — plus the
      // R3-C2 reconciliation SELECT the retry path now shares with the
      // approval path (a bare row array, no tuple).
      const claimQuery = mock((sql: string, params?: any[]) => {
        if (sql.includes("SUM(vendor_earning)")) {
          const sum =
            opts.claimedEarningSum ??
            (payout.net_amount ?? 0) +
              (payout.shipping_contribution_total ?? 0) -
              (payout.adjustment_total ?? 0);
          return Promise.resolve([{ sum, pending_count: opts.pendingCount ?? 0 }]);
        }
        if (opts.claimResult === "not_claimed") return Promise.resolve([[], 0]);
        return Promise.resolve([[{ id: params?.[0] }], 1]);
      });

      const txCommissionRepo = {
        update: mock((where: any, set: any) => {
          commissionUpdates.push([where, set]);
          return Promise.resolve({
            affected: opts.markPaidAffected ?? 0,
            raw: [],
            generatedMaps: [],
          });
        }),
      };
      const payoutTxRepo = {
        save: mock((data: any) => {
          payoutSaved = { ...data };
          return Promise.resolve(payoutSaved);
        }),
      };

      const payoutTarget = {}; // sentinel: distinct from Commission
      const payoutRepo = {
        target: payoutTarget,
        findOne: mock(() => Promise.resolve(payout)),
        save: mock((data: any) => {
          payoutSaved = { ...data };
          return Promise.resolve(payoutSaved);
        }),
        manager: {
          query: claimQuery,
          transaction: mock((cb: any) =>
            cb({
              getRepository: (target: any) =>
                target === Commission ? txCommissionRepo : payoutTxRepo,
              query: mock(() => Promise.resolve([])),
            }),
          ),
        },
      };

      const auditLogRepo = {
        save: mock((entry: any) => Promise.resolve({ id: "al1", ...entry })),
        create: mock((entry: any) => entry),
      };

      const svc: any = new PayoutService(
        payoutRepo as any,
        {} as any,
        stripe as any,
        {} as any,
        auditLogRepo as any,
        {} as any,
        {} as any,
        {} as any,
      );

      svc.__stripe = stripe;
      svc.__claimQuery = claimQuery;
      svc.__commissionUpdates = commissionUpdates;
      Object.defineProperty(svc, "__payoutSaved", { get: () => payoutSaved });
      return svc;
    }

    it("claims the payout via a conditional UPDATE (failed -> processing) before touching Stripe", async () => {
      const svc = makeService();
      await svc.executeRetryAndAudit("p1");
      expect(svc.__claimQuery).toHaveBeenCalled();
      const [sql] = svc.__claimQuery.mock.calls[0];
      expect(sql).toMatch(/status = 'failed'/);
    });

    it("never calls Stripe when the conditional claim affects 0 rows", async () => {
      const svc = makeService({ claimResult: "not_claimed" });

      const result = await svc.executeRetryAndAudit("p1");

      expect(svc.__stripe.transfers.create).not.toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it("carries a Stripe idempotency key that differs from the approval path's key", async () => {
      const svc = makeService();

      await svc.executeRetryAndAudit("p1");

      expect(svc.__stripe.transfers.create).toHaveBeenCalledTimes(1);
      const [, options] = svc.__stripe.transfers.create.mock.calls[0];
      expect(options?.idempotencyKey).toBeTruthy();
      expect(options.idempotencyKey).not.toBe("payout-transfer-p1");
    });

    it("a Stripe call that succeeds but whose post-transfer transaction fails, followed by a retry, calls Stripe exactly once", async () => {
      let dbStatus = "failed";
      const payoutRow: any = {
        id: "p1",
        status: "failed",
        net_amount: 50_000,
        shipping_contribution_total: 0,
        adjustment_total: 0,
        currency: "AED",
        vendor_id: "v1",
        vendor: { stripe_account_id: "acct_1" },
        gateway_reference: null,
        updated_at: new Date("2026-07-20T10:00:00.000Z"),
      };
      const stripe = { transfers: { create: mock(() => Promise.resolve({ id: "tr_retry" })) } };
      let transactionShouldFail = true;
      const payoutTxRepo = { save: mock((data: any) => Promise.resolve(data)) };
      const txCommissionRepo = {
        update: mock(() => Promise.resolve({ affected: 0, raw: [], generatedMaps: [] })),
      };

      const payoutRepo: any = {
        target: {},
        findOne: mock(() => Promise.resolve({ ...payoutRow, status: dbStatus })),
        save: mock((data: any) => {
          // Only used for the claim-rollback path (Stripe itself failing) —
          // not exercised here.
          dbStatus = data.status;
          return Promise.resolve(data);
        }),
        manager: {
          // Mirrors a real conditional UPDATE: only succeeds while the row is
          // still "failed", and commits immediately/independently of the
          // (unrelated) post-transfer transaction that fails below.
          query: mock((sql: string, params?: any[]) => {
            if (sql.includes("SUM(vendor_earning)")) {
              return Promise.resolve([{ sum: 50_000, pending_count: 0 }]);
            }
            if (dbStatus !== "failed") return Promise.resolve([[], 0]);
            dbStatus = "processing";
            return Promise.resolve([[{ id: params?.[0] }], 1]);
          }),
          transaction: mock((cb: any) => {
            if (transactionShouldFail) {
              transactionShouldFail = false;
              return Promise.reject(new Error("connection reset by peer"));
            }
            return cb({
              getRepository: (target: any) =>
                target === Commission ? txCommissionRepo : payoutTxRepo,
              query: mock(() => Promise.resolve([])),
            });
          }),
        },
      };

      const svc: any = new PayoutService(
        payoutRepo,
        {} as any,
        stripe as any,
        {} as any,
        { save: mock(() => Promise.resolve({})), create: mock((e: any) => e) } as any,
        {} as any,
        {} as any,
        {} as any,
      );

      // Attempt 1 (the original job run): Stripe succeeds, then the
      // post-transfer transaction (status/gateway_reference save + mark
      // claimed commissions paid) throws -- this is what causes BullMQ to
      // schedule attempt 2.
      await expect(svc.executeRetryAndAudit("p1")).rejects.toThrow(/connection reset/);
      expect(stripe.transfers.create).toHaveBeenCalledTimes(1);

      // Attempt 2 (BullMQ's retry): the conditional claim it performs first
      // sees the payout is no longer "failed" -- attempt 1's raw UPDATE
      // already committed independently of the failed transaction -- so it
      // no-ops instead of transferring a second time.
      await expect(svc.executeRetryAndAudit("p1")).resolves.toBeDefined();
      expect(stripe.transfers.create).toHaveBeenCalledTimes(1);
    });

    it("marks the payout failed and rethrows when the Stripe transfer fails", async () => {
      const svc = makeService();
      const declined: any = new Error("card_declined");
      declined.type = "StripeInvalidRequestError";
      declined.statusCode = 400;
      svc.__stripe.transfers.create.mockImplementationOnce(() => Promise.reject(declined));

      await expect(svc.executeRetryAndAudit("p1")).rejects.toThrow("card_declined");
      expect(svc.__payoutSaved.status).toBe("failed");
    });

    it("R5-I1: the retry claim also refuses a soft-deleted (voided) draft", async () => {
      const svc = makeService();
      await svc.executeRetryAndAudit("p1");

      const claimSql = (svc.__claimQuery as any).mock.calls
        .map((c: any) => String(c[0]))
        .find((s: string) => s.includes("UPDATE vendor_payouts"));
      expect(claimSql).toBeDefined();
      expect(claimSql).toContain("deleted_at IS NULL");
    });

    it("R5-C1: an unknown-outcome retry stays 'processing' instead of falling back to retryable 'failed'", async () => {
      const svc = makeService();
      const lost: any = new Error("socket hang up");
      lost.type = "StripeConnectionError";
      svc.__stripe.transfers.create.mockImplementationOnce(() => Promise.reject(lost));

      await expect(svc.executeRetryAndAudit("p1")).rejects.toThrow("socket hang up");
      // The entity read before the claim still said 'failed'; saving it unset
      // would have left this row retryable forever.
      expect(svc.__payoutSaved.status).toBe("processing");
    });

    // R5-C1, the load-bearing guard. Every other protection on this path is a
    // statement about our own row, and all of them are wrong in the one case
    // where Stripe accepted a transfer we never recorded. The idempotency key
    // cannot help — it changes per operator retry by design (R3-C1) — so the
    // only authority is Stripe itself.
    describe("R5-C1 duplicate-transfer guard", () => {
      const withTransfers = (data: any[]) => ({
        transfers: {
          create: mock(() => Promise.resolve({ id: "tr_second" })),
          list: mock(() => Promise.resolve({ data })),
        },
      });

      it("adopts an existing Stripe transfer instead of sending a second one", async () => {
        const stripe = withTransfers([
          { id: "tr_first", metadata: { payout_id: "p1" }, reversed: false },
        ]);
        const svc = makeService({ stripe });

        const result = await svc.executeRetryAndAudit("p1");

        expect(stripe.transfers.create).not.toHaveBeenCalled();
        expect(svc.__payoutSaved.gateway_reference).toBe("tr_first");
        expect(result).toBeDefined();
      });

      it("sends normally when Stripe holds no transfer for this payout", async () => {
        // A transfer to the same connected account for a DIFFERENT payout
        // must not be mistaken for this one — the match is on metadata, not
        // on destination or amount.
        const stripe = withTransfers([
          { id: "tr_other", metadata: { payout_id: "p-other" }, reversed: false },
        ]);
        const svc = makeService({ stripe });

        await svc.executeRetryAndAudit("p1");

        expect(stripe.transfers.create).toHaveBeenCalledTimes(1);
      });

      it("ignores a reversed transfer — that money came back, so this payout is genuinely unsent", async () => {
        const stripe = withTransfers([
          { id: "tr_reversed", metadata: { payout_id: "p1" }, reversed: true },
        ]);
        const svc = makeService({ stripe });

        await svc.executeRetryAndAudit("p1");

        expect(stripe.transfers.create).toHaveBeenCalledTimes(1);
      });

      it("degrades to the previous behaviour when the lookup itself fails", async () => {
        const stripe = {
          transfers: {
            create: mock(() => Promise.resolve({ id: "tr_new" })),
            list: mock(() => Promise.reject(new Error("stripe list down"))),
          },
        };
        const svc = makeService({ stripe });

        await svc.executeRetryAndAudit("p1");

        // Defence in depth on top of the gateway_reference/status guards —
        // it must not become a new way to block a legitimate retry.
        expect(stripe.transfers.create).toHaveBeenCalledTimes(1);
      });
    });

    it("I1: a successful retry marks exactly the commissions claimed by that payout paid, with paid_at set — the retry path used to skip this entirely", async () => {
      const svc = makeService({
        payout: {
          id: "p1",
          status: "failed",
          net_amount: 50_000,
          shipping_contribution_total: 0,
          adjustment_total: 0,
          currency: "AED",
          vendor_id: "v1",
          vendor: { stripe_account_id: "acct_1" },
          gateway_reference: null,
          updated_at: new Date("2026-07-20T10:00:00.000Z"),
        },
      });

      await svc.executeRetryAndAudit("p1");

      expect(svc.__commissionUpdates).toHaveLength(1);
      const [where, set] = svc.__commissionUpdates[0];
      // C1: scoped to status='pending' too — a commission that left
      // 'pending' for any reason (most importantly, cancelOrder voiding it
      // to 'cancelled') must never be resurrected to 'paid' just because it
      // still carries this payout's id.
      expect(where).toEqual({ payout_id: "p1", status: "pending" });
      expect(set.status).toBe("paid");
      expect(set.paid_at).toBeInstanceOf(Date);
    });

    describe("R3-C1 — the idempotency anchor is per operator retry, not per BullMQ attempt", () => {
      /**
       * The finding, concretely:
       *   1. BullMQ attempt 1 CASes failed -> processing and calls Stripe.
       *      Stripe CREATES THE TRANSFER but the response is lost (socket
       *      reset), so the SDK throws.
       *   2. The catch writes status='failed' + notes — bumping `updated_at`.
       *   3. Attempt 2 re-reads `updated_at` (now T2), wins the CAS again, and
       *      the old anchor produced a DIFFERENT key -> Stripe creates a
       *      SECOND transfer for the same net_amount.
       * Both attempts of one job carry the same `retryToken`, so both must
       * present Stripe the identical key and let Stripe collapse them.
       *
       * R5-C1 note: the simulated failure here is now a DEFINITIVE Stripe
       * rejection, not the lost-response socket reset the story above opens
       * with. That case no longer reaches Stripe a second time at all — an
       * indeterminate error leaves the row `processing`, so attempt 2 loses
       * the CAS and returns without calling Stripe (asserted separately
       * below). What this harness still pins down is the key DERIVATION: for
       * a genuinely retryable failure, two attempts carrying one `retryToken`
       * must present the identical key, and that key must never be computed
       * from mutable row state or the clock.
       */
      function makeRetryHarness({ definitive = true }: { definitive?: boolean } = {}) {
        let dbStatus = "failed";
        let updatedAt = new Date("2026-07-20T10:00:00.000Z");
        const keys: string[] = [];
        const stripe = {
          transfers: {
            create: mock((_args: any, opts: any) => {
              keys.push(opts.idempotencyKey);
              const rejected: any = new Error("connection reset by peer");
              if (definitive) {
                rejected.type = "StripeInvalidRequestError";
                rejected.statusCode = 400;
              } else {
                rejected.type = "StripeConnectionError";
              }
              return Promise.reject(rejected);
            }),
          },
        };
        const payoutRepo: any = {
          target: {},
          findOne: mock(() =>
            Promise.resolve({
              id: "p1",
              status: dbStatus,
              net_amount: 50_000,
              shipping_contribution_total: 0,
              adjustment_total: 0,
              currency: "AED",
              vendor_id: "v1",
              vendor: { stripe_account_id: "acct_1" },
              gateway_reference: null,
              updated_at: updatedAt,
            }),
          ),
          save: mock((data: any) => {
            dbStatus = data.status;
            // The catch block's save is exactly what bumps updated_at in
            // Postgres (@UpdateDateColumn) — the mutable state the old
            // anchor was derived from.
            updatedAt = new Date(updatedAt.getTime() + 60_000);
            return Promise.resolve(data);
          }),
          manager: {
            query: mock((sql: string, params?: any[]) => {
              if (sql.includes("SUM(vendor_earning)")) {
                return Promise.resolve([{ sum: 50_000, pending_count: 0 }]);
              }
              if (dbStatus !== "failed") return Promise.resolve([[], 0]);
              dbStatus = "processing";
              return Promise.resolve([[{ id: params?.[0] }], 1]);
            }),
            transaction: mock((cb: any) =>
              cb({
                getRepository: () => ({
                  save: mock((d: any) => Promise.resolve(d)),
                  update: mock(() => Promise.resolve({ affected: 0 })),
                }),
                query: mock(() => Promise.resolve([])),
              }),
            ),
          },
        };
        const svc: any = new PayoutService(
          payoutRepo,
          {} as any,
          stripe as any,
          {} as any,
          { save: mock(() => Promise.resolve({})), create: mock((e: any) => e) } as any,
          {} as any,
          {} as any,
          {} as any,
        );
        return { svc, keys };
      }

      it("reuses the identical Stripe idempotency key across BullMQ attempts of one retry job", async () => {
        const { svc, keys } = makeRetryHarness();
        const retryToken = "tok-abc-123";

        await expect(svc.executeRetryAndAudit("p1", retryToken)).rejects.toThrow(
          /connection reset/,
        );
        await expect(svc.executeRetryAndAudit("p1", retryToken)).rejects.toThrow(
          /connection reset/,
        );

        expect(keys).toHaveLength(2);
        expect(keys[0]).toBe("payout-retry-p1-tok-abc-123");
        // Same key -> Stripe returns the FIRST attempt's (already created)
        // transfer instead of creating a second one.
        expect(keys[1]).toBe(keys[0]);
      });

      it("gives a genuinely new operator retry a different key", async () => {
        const { svc, keys } = makeRetryHarness();

        await expect(svc.executeRetryAndAudit("p1", "tok-1")).rejects.toThrow(/connection reset/);
        await expect(svc.executeRetryAndAudit("p1", "tok-2")).rejects.toThrow(/connection reset/);

        expect(keys[0]).not.toBe(keys[1]);
      });

      it("never derives the key from mutable row state or the clock when no token is supplied", async () => {
        const { svc, keys } = makeRetryHarness();

        await expect(svc.executeRetryAndAudit("p1")).rejects.toThrow(/connection reset/);
        await expect(svc.executeRetryAndAudit("p1")).rejects.toThrow(/connection reset/);

        expect(keys[0]).toBe("payout-retry-p1-p1");
        expect(keys[1]).toBe(keys[0]);
      });

      it("R5-C1: after an INDETERMINATE failure, attempt 2 never reaches Stripe at all", async () => {
        // The original R3-C1 story — Stripe created the transfer, the response
        // was lost — is now cut off one step earlier than the idempotency key.
        // The catch leaves the row 'processing' instead of writing it back to
        // 'failed', so the second attempt loses the claim CAS and no-ops. The
        // key never even gets computed, which is why it is not the thing
        // standing between this payout and a duplicate transfer.
        const { svc, keys } = makeRetryHarness({ definitive: false });

        await expect(svc.executeRetryAndAudit("p1", "tok-abc-123")).rejects.toThrow(
          /connection reset/,
        );
        // No throw: a claim that finds nothing to claim is a no-op, not an error.
        await svc.executeRetryAndAudit("p1", "tok-abc-123");

        expect(keys).toHaveLength(1);
      });

      it("retry() mints a fresh token per operator retry and carries it in the job payload", async () => {
        const payoutRepo: any = {
          findOne: mock(() => Promise.resolve({ id: "p1", status: "failed" })),
        };
        const svc: any = new PayoutService(
          payoutRepo,
          {} as any,
          {} as any,
          {} as any,
          { save: mock(() => Promise.resolve({})), create: mock((e: any) => e) } as any,
          {} as any,
          {} as any,
          {} as any,
        );

        await svc.retry("p1", "admin-1");
        await svc.retry("p1", "admin-1");

        const tokens = mockQueueAdd.mock.calls.map((c: any[]) => c[1].retryToken);
        expect(tokens).toHaveLength(2);
        expect(tokens[0]).toBeTruthy();
        expect(tokens[0]).not.toBe(tokens[1]);
      });
    });

    describe("R3-C2 — the retry path reconciles before transferring", () => {
      it("refuses to retry a payout whose claimed commissions were cancelled after it failed", async () => {
        // The finding's path: commission earning 61_550 claimed by payout P;
        // P's transfer fails; the order is then cancelled and fully refunded
        // (commission -> 'cancelled', payout_id kept); an admin hits Retry.
        // The retry path had NO reconciliation at all, so the stored
        // net_amount went out for a refunded sale.
        const svc = makeService({
          payout: {
            id: "p1",
            status: "failed",
            net_amount: 61_550,
            shipping_contribution_total: 0,
            adjustment_total: 0,
            currency: "AED",
            vendor_id: "v1",
            vendor: { stripe_account_id: "acct_1" },
            gateway_reference: null,
            updated_at: new Date("2026-07-20T10:00:00.000Z"),
          },
          claimedEarningSum: 0,
        });

        await expect(svc.executeRetryAndAudit("p1")).rejects.toThrow(/reconciliation failed/i);
        expect(svc.__stripe.transfers.create).not.toHaveBeenCalled();
        expect(svc.__payoutSaved.status).toBe("failed");
      });
    });

    it("I1: never calls Stripe when the conditional claim affects 0 rows, and never marks any commission paid", async () => {
      const svc = makeService({ claimResult: "not_claimed" });

      await svc.executeRetryAndAudit("p1");

      expect(svc.__stripe.transfers.create).not.toHaveBeenCalled();
      expect(svc.__commissionUpdates).toHaveLength(0);
    });
  });

  describe("approveDraft rail dispatch", () => {
    it("enqueues a transfer job on the stripe_connect rail", async () => {
      mockPayoutRepo.findOne = mock(() =>
        Promise.resolve({
          id: "po1",
          status: "pending",
          net_amount: 5000,
          vendor_id: "v1",
          payout_reference: "PAY-2026-000001",
        } as any),
      );
      mockPayoutRepo.manager.query = mock(() => Promise.resolve([[{ id: "po1" }], 1])) as any;
      mockVendorRepo.findOne = mock(() =>
        Promise.resolve({ id: "v1", stripe_account_id: "acct_123" } as any),
      );

      const result = await service.approveDraft("po1", "admin1", PayoutRail.stripe_connect);

      expect(result.jobId).toBe("job1");
      expect(result.rail).toBe(PayoutRail.stripe_connect);
      expect(mockQueueAdd).toHaveBeenCalled();
      // The stripe rail's claim leaves status = 'pending' (executeApprovedTransfer
      // does the real processing-claim later) — assert the exact params so a
      // swapped $2/$3 or a wrong nextStatus literal fails this test.
      expect(mockPayoutRepo.manager.query).toHaveBeenCalledWith(
        expect.stringContaining("status = 'pending'"),
        ["po1", PayoutRail.stripe_connect, "pending"],
      );
    });

    it("refuses the stripe_connect rail when the vendor has no Stripe account", async () => {
      mockPayoutRepo.findOne = mock(() =>
        Promise.resolve({ id: "po1", status: "pending", net_amount: 5000, vendor_id: "v1" } as any),
      );
      mockVendorRepo.findOne = mock(() =>
        Promise.resolve({ id: "v1", stripe_account_id: null } as any),
      );

      await expect(
        service.approveDraft("po1", "admin1", PayoutRail.stripe_connect),
      ).rejects.toThrow("Vendor has no Stripe account");
    });

    it("moves to processing with no job on the manual rail", async () => {
      mockQueueAdd.mockClear();
      mockPayoutRepo.findOne = mock(() =>
        Promise.resolve({
          id: "po1",
          status: "pending",
          net_amount: 5000,
          shipping_contribution_total: 0,
          adjustment_total: 0,
          vendor_id: "v1",
        } as any),
      );
      // FIX 2: approveDraft's manual branch now runs assertClaimedSetReconciles
      // BEFORE the claim UPDATE, so this shared query mock must answer both:
      // the reconciliation SELECT (matched on "SUM(vendor_earning)", reconciling
      // exactly with the fixture above) and the claim UPDATE.
      mockPayoutRepo.manager.query = mock((sql: string) => {
        if (sql.includes("SUM(vendor_earning)")) {
          return Promise.resolve([{ sum: 5000, pending_count: 0 }]);
        }
        return Promise.resolve([[{ id: "po1" }], 1]);
      }) as any;

      const result = await service.approveDraft("po1", "admin1", PayoutRail.manual_bank_transfer);

      expect(result.jobId).toBeNull();
      expect(result.rail).toBe(PayoutRail.manual_bank_transfer);
      expect(mockQueueAdd).not.toHaveBeenCalled();
      // The manual rail's claim IS the mutual-exclusion guard — it must move
      // status to 'processing' in the same UPDATE that stamps the rail.
      expect(mockPayoutRepo.manager.query).toHaveBeenCalledWith(
        expect.stringContaining("status = 'pending'"),
        ["po1", PayoutRail.manual_bank_transfer, "processing"],
      );
    });

    it("refuses when the conditional claim wins no rows (already paid concurrently)", async () => {
      mockPayoutRepo.findOne = mock(() =>
        Promise.resolve({
          id: "po1",
          status: "pending",
          net_amount: 5000,
          shipping_contribution_total: 0,
          adjustment_total: 0,
          vendor_id: "v1",
        } as any),
      );
      mockPayoutRepo.manager.query = mock((sql: string) => {
        if (sql.includes("SUM(vendor_earning)")) {
          return Promise.resolve([{ sum: 5000, pending_count: 0 }]);
        }
        return Promise.resolve([[], 0]);
      }) as any;

      await expect(
        service.approveDraft("po1", "admin1", PayoutRail.manual_bank_transfer),
      ).rejects.toMatchObject({ code: "PAYOUT_NOT_DRAFT" });
    });

    describe("FIX 2 — the manual rail reconciles before the claim flips the row to processing", () => {
      it("refuses to pay a manual-rail draft whose claimed commissions have drifted from its stored figures, and never claims or dispatches anything", async () => {
        mockQueueAdd.mockClear();
        mockPayoutRepo.findOne = mock(() =>
          Promise.resolve({
            id: "po1",
            status: "pending",
            net_amount: 17_900,
            shipping_contribution_total: 0,
            adjustment_total: 0,
            vendor_id: "v1",
          } as any),
        );
        let claimQueryCalled = false;
        mockPayoutRepo.manager.query = mock((sql: string) => {
          if (sql.includes("SUM(vendor_earning)")) {
            // Only 8_950 of the expected 17_900 fils is still actually
            // claimed — a commission was released/cancelled after the draft
            // was built.
            return Promise.resolve([{ sum: 8_950, pending_count: 0 }]);
          }
          claimQueryCalled = true;
          return Promise.resolve([[{ id: "po1" }], 1]);
        }) as any;

        await expect(
          service.approveDraft("po1", "admin1", PayoutRail.manual_bank_transfer),
        ).rejects.toMatchObject({ code: "PAYOUT_RECONCILIATION_FAILED" });

        // Must fail BEFORE the claim that would flip the row to 'processing'
        // and before any job is queued.
        expect(claimQueryCalled).toBe(false);
        expect(mockQueueAdd).not.toHaveBeenCalled();

        // assertClaimedSetReconciles marks the row failed itself.
        expect(mockPayoutRepo.save).toHaveBeenCalled();
        const saved = mockPayoutRepo.save.mock.calls[0]![0];
        expect(saved.status).toBe("failed");
        expect(saved.notes).toMatch(/reconciliation failed/i);
        // ...and the rail lands in that SAME save. The claim below never ran
        // (claimQueryCalled is false above), so this is the only write that
        // can record it. A `failed` row with payout_rail NULL reads as Stripe
        // to availablePayoutActions, which then offers Retry — and the Stripe
        // retry path overwrites `notes` with "Vendor has no Stripe account",
        // destroying the reconciliation diagnostic asserted just above.
        expect(saved.payout_rail).toBe(PayoutRail.manual_bank_transfer);
      });

      it("does NOT run the reconciliation guard on the stripe_connect rail (already covered downstream by executeApprovedTransfer)", async () => {
        mockPayoutRepo.findOne = mock(() =>
          Promise.resolve({
            id: "po1",
            status: "pending",
            net_amount: 5000,
            vendor_id: "v1",
          } as any),
        );
        mockVendorRepo.findOne = mock(() =>
          Promise.resolve({ id: "v1", stripe_account_id: "acct_123" } as any),
        );
        let sawReconciliationQuery = false;
        mockPayoutRepo.manager.query = mock((sql: string) => {
          if (sql.includes("SUM(vendor_earning)")) sawReconciliationQuery = true;
          return Promise.resolve([[{ id: "po1" }], 1]);
        }) as any;

        const result = await service.approveDraft("po1", "admin1", PayoutRail.stripe_connect);

        expect(result.rail).toBe(PayoutRail.stripe_connect);
        expect(sawReconciliationQuery).toBe(false);
      });
    });
  });

  describe("addDraftAdjustment", () => {
    it("moves net_amount and adjustment_total by the same delta", async () => {
      const draft = {
        id: "po1",
        status: "pending",
        net_amount: 10_000,
        adjustment_total: 0,
        shipping_contribution_total: 500,
        vendor_id: "v1",
      };
      mockPayoutRepo.findOne = mock(() => Promise.resolve({ ...draft } as any));

      const updated = await service.addDraftAdjustment({
        payoutId: "po1",
        amountFils: -2_500,
        reason: "Damaged goods credit",
        adminUserId: "admin1",
      });

      expect(updated.net_amount).toBe(7_500);
      expect(updated.adjustment_total).toBe(-2_500);

      // The ledger row is the only durable record of what was adjusted —
      // assert its shape directly rather than trusting the payout-side
      // numbers alone. settled_payout_id in particular is the crux
      // constraint: this row must belong to THIS draft and can never be
      // swept into another (unlike the vendor-scoped path, where it's
      // stamped later by whichever draft claims it).
      expect(draftAdjustmentSaves).toHaveLength(1);
      const ledgerRow = draftAdjustmentSaves[0];
      expect(ledgerRow.settled_payout_id).toBe("po1");
      expect(ledgerRow.amount_fils).toBe(-2_500);
      expect(ledgerRow.vendor_id).toBe("v1");
      expect(ledgerRow.source_type).toBe("manual");
      expect(ledgerRow.created_by).toBe("admin1");

      // Same pattern as appendNote's audit assertion above.
      expect(mockAuditLogRepo.save).toHaveBeenCalled();
      const audit = mockAuditLogRepo.save.mock.calls[0]![0];
      expect(audit.action).toBe("payout.draft_adjusted");
      expect(audit.entity_id).toBe("po1");
      expect(audit.actor_id).toBe("admin1");
    });

    describe("FIX 1 — the write touches only net_amount and adjustment_total", () => {
      it("calls repo.update with a payoutId predicate and EXACTLY {net_amount, adjustment_total} — no status/payout_rail/gateway_reference/deleted_at", async () => {
        // Deliberately loaded with columns that, if the write reverted to a
        // full-entity save(payout), would be carried back over whatever
        // another transaction wrote to them in the meantime (e.g. a
        // concurrent Reject soft-deleting this row and releasing its claims).
        const staleInMemorySnapshot = {
          id: "po1",
          status: "pending",
          payout_rail: null,
          gateway_reference: null,
          deleted_at: null,
          net_amount: 10_000,
          adjustment_total: 0,
          shipping_contribution_total: 500,
          vendor_id: "v1",
        };
        mockPayoutRepo.findOne = mock(() => Promise.resolve({ ...staleInMemorySnapshot } as any));
        mockPayoutRepo.update.mockClear();

        await service.addDraftAdjustment({
          payoutId: "po1",
          amountFils: -2_500,
          reason: "Damaged goods credit",
          adminUserId: "admin1",
        });

        expect(mockPayoutRepo.save).not.toHaveBeenCalled();
        expect(mockPayoutRepo.update).toHaveBeenCalledTimes(1);
        const [where, set] = mockPayoutRepo.update.mock.calls[0]!;
        expect(where).toEqual({ id: "po1" });
        // Exact key set — a mutation that adds `status`, `payout_rail`,
        // `gateway_reference` or `deleted_at` back into this object (i.e.
        // reverting to the old save(payout) shape) must fail this assertion,
        // not just a "was update called" check.
        expect(Object.keys(set).sort()).toEqual(["adjustment_total", "net_amount"]);
        expect(set.net_amount).toBe(7_500);
        expect(set.adjustment_total).toBe(-2_500);
      });

      it("never reverts a concurrently soft-deleted payout back to a live row (regression guard for the read-then-write hazard)", async () => {
        // Simulates the exact scenario in the finding: the in-memory payout
        // was read as a live pending draft, but by the time this write lands
        // a concurrent Reject has soft-deleted it. A column-targeted UPDATE
        // must not touch deleted_at at all — it should stay whatever the
        // reject transaction set it to; a save(payout) would write NULL over
        // it.
        mockPayoutRepo.findOne = mock(() =>
          Promise.resolve({
            id: "po1",
            status: "pending",
            deleted_at: null, // stale in-memory view — DB may since be non-null
            net_amount: 10_000,
            adjustment_total: 0,
            vendor_id: "v1",
          } as any),
        );
        mockPayoutRepo.update.mockClear();

        await service.addDraftAdjustment({
          payoutId: "po1",
          amountFils: 1_000,
          reason: "test",
          adminUserId: "admin1",
        });

        const [, set] = mockPayoutRepo.update.mock.calls[0]!;
        expect(set).not.toHaveProperty("deleted_at");
        expect(set).not.toHaveProperty("status");
        expect(set).not.toHaveProperty("payout_rail");
        expect(set).not.toHaveProperty("gateway_reference");
      });
    });

    it("FIX 7: the adjusted draft still passes the REAL assertClaimedSetReconciles guard (not a local reimplementation of its formula)", async () => {
      const before = {
        net_amount: 10_000,
        shipping_contribution_total: 500,
        adjustment_total: 0,
      };

      mockPayoutRepo.findOne = mock(() =>
        Promise.resolve({ id: "po1", status: "pending", vendor_id: "v1", ...before } as any),
      );

      const updated = await service.addDraftAdjustment({
        payoutId: "po1",
        amountFils: 3_000,
        reason: "Goodwill",
        adminUserId: "admin1",
      });

      // Sanity on the raw numbers first (positive counterpart to the negative
      // case above — asserting the sign catches a flip, e.g. always storing
      // Math.abs(amountFils), that the reconciliation call alone would not).
      expect(updated.net_amount).toBe(13_000);
      expect(updated.adjustment_total).toBe(3_000);
      expect(draftAdjustmentSaves).toHaveLength(1);
      expect(draftAdjustmentSaves[0].amount_fils).toBe(3_000);
      expect(draftAdjustmentSaves[0].settled_payout_id).toBe("po1");

      // Now exercise the GUARD ITSELF, not a copy of its formula. The claimed
      // commission set's earning sum must still equal
      // net_amount + shipping_contribution_total - adjustment_total
      // = 13_000 + 500 - 3_000 = 10_500, unchanged from before the
      // adjustment (the commissions table was never touched).
      mockPayoutRepo.manager.query = mock((sql: string) => {
        if (sql.includes("SUM(vendor_earning)")) {
          return Promise.resolve([{ sum: 10_500, pending_count: 0 }]);
        }
        throw new Error(`unexpected query in reconciliation check: ${sql}`);
      }) as any;

      await expect((service as any).assertClaimedSetReconciles(updated)).resolves.toEqual({
        claimedEarningSum: 10_500,
        pendingCount: 0,
      });

      // And prove the test would actually catch drift: an out-of-date
      // expectation (as if the adjustment had NOT moved net_amount and
      // adjustment_total together) throws.
      await expect(
        (service as any).assertClaimedSetReconciles({ ...updated, adjustment_total: 0 }),
      ).rejects.toThrow(/reconciliation failed/i);
    });

    it("refuses on a non-pending payout", async () => {
      mockPayoutRepo.findOne = mock(() =>
        Promise.resolve({ id: "po1", status: "processing", net_amount: 10_000 } as any),
      );

      await expect(
        service.addDraftAdjustment({
          payoutId: "po1",
          amountFils: 100,
          reason: "late",
          adminUserId: "admin1",
        }),
      ).rejects.toMatchObject({ code: "PAYOUT_NOT_DRAFT" });
    });

    it("refuses an adjustment that would drive the net to zero or below", async () => {
      mockPayoutRepo.findOne = mock(() =>
        Promise.resolve({
          id: "po1",
          status: "pending",
          net_amount: 1_000,
          adjustment_total: 0,
          vendor_id: "v1",
        } as any),
      );

      await expect(
        service.addDraftAdjustment({
          payoutId: "po1",
          amountFils: -1_000,
          reason: "too much",
          adminUserId: "admin1",
        }),
      ).rejects.toMatchObject({ code: "PAYOUT_ADJUSTMENT_NET_NOT_POSITIVE" });
    });

    it("refuses a zero amount", async () => {
      mockPayoutRepo.findOne = mock(() =>
        Promise.resolve({
          id: "po1",
          status: "pending",
          net_amount: 1_000,
          vendor_id: "v1",
        } as any),
      );

      await expect(
        service.addDraftAdjustment({
          payoutId: "po1",
          amountFils: 0,
          reason: "noop",
          adminUserId: "admin1",
        }),
      ).rejects.toThrow("non-zero");
    });
  });
});
