import { describe, expect, it, mock } from "bun:test";
import {
  AffiliateAttribution,
  AffiliateCommission,
  AffiliateCommissionStatus,
  AffiliateCommissionType,
  ReelAttribution,
  ReelCommission,
  VendorAffiliate,
  VendorAffiliateStatus,
} from "@materialhub/database";
import {
  AffiliateCommissionService,
  computeAffiliateCommissionFils,
} from "./affiliate-commission.service.ts";

describe("computeAffiliateCommissionFils", () => {
  it("percentage: bps of gross, rounded", () => {
    // 10% (1000 bps) of 12345 fils = 1234.5 -> 1235
    expect(computeAffiliateCommissionFils(12345, "percentage", 1000)).toBe(1235);
  });

  it("percentage: 15% of 20000 = 3000", () => {
    expect(computeAffiliateCommissionFils(20000, "percentage", 1500)).toBe(3000);
  });

  it("fixed: min(value, gross)", () => {
    expect(computeAffiliateCommissionFils(20000, "fixed", 5000)).toBe(5000);
    expect(computeAffiliateCommissionFils(3000, "fixed", 5000)).toBe(3000); // clamped to gross
  });

  it("never negative", () => {
    expect(computeAffiliateCommissionFils(0, "percentage", 1000)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Precedence + deduction — driven via the exposed `snapshotItem` seam with a
// fully-mocked EntityManager, mirroring reels-service's
// payout.service.executePayout test seam. This avoids mocking the
// AppDataSource statics (brittle under bun) while still exercising the real
// read+write sequence for a single order item.
// ---------------------------------------------------------------------------

interface FakeQueryBuilder {
  where: () => FakeQueryBuilder;
  andWhere: () => FakeQueryBuilder;
  orderBy: () => FakeQueryBuilder;
  limit: () => FakeQueryBuilder;
  getOne: () => Promise<unknown>;
}

function fakeQb(result: unknown): FakeQueryBuilder {
  const qb: FakeQueryBuilder = {
    where: () => qb,
    andWhere: () => qb,
    orderBy: () => qb,
    limit: () => qb,
    getOne: async () => result,
  };
  return qb;
}

function makeFakeManager(opts: {
  existingCommission?: unknown;
  reelCommission?: unknown;
  reelAttribution?: unknown;
  attribution?: unknown;
  affiliate?: unknown;
}) {
  const savedRows: any[] = [];
  const recordedSql: { sql: string; params: unknown[] }[] = [];
  const updateCalls: { entity: unknown; criteria: unknown; partial: unknown }[] = [];

  const manager = {
    getRepository: (entity: unknown) => {
      if (entity === AffiliateCommission) {
        return {
          findOne: mock(async () => opts.existingCommission ?? null),
          create: (x: any) => x,
          save: mock(async (x: any) => {
            const row = { id: "ac-1", ...x };
            savedRows.push(row);
            return row;
          }),
        };
      }
      if (entity === ReelCommission) {
        return { findOne: mock(async () => opts.reelCommission ?? null) };
      }
      if (entity === ReelAttribution) {
        return { createQueryBuilder: () => fakeQb(opts.reelAttribution ?? null) };
      }
      if (entity === AffiliateAttribution) {
        return {
          createQueryBuilder: () => fakeQb(opts.attribution ?? null),
          update: mock(async (criteria: unknown, partial: unknown) => {
            updateCalls.push({ entity, criteria, partial });
            return {};
          }),
        };
      }
      if (entity === VendorAffiliate) {
        return { findOne: mock(async () => opts.affiliate ?? null) };
      }
      throw new Error(`makeFakeManager: unexpected entity ${String(entity)}`);
    },
    query: mock(async (sql: string, params: unknown[]) => {
      recordedSql.push({ sql, params });
      return [];
    }),
  };

  return { manager, savedRows, recordedSql, updateCalls };
}

const order = { id: "order-1", user_id: "user-1" } as any;
const item = {
  id: "item-1",
  vendor_id: "vendor-1",
  vendor_order_id: "vo-1",
  product_id: "product-1",
  line_total: 12345,
  unit_price: 12345,
  quantity: 1,
} as any;

describe("AffiliateCommissionService.snapshotItem — precedence + deduction", () => {
  it("skips the affiliate snapshot when a reel_commission already owns this order item (creator wins the tie)", async () => {
    const { manager, savedRows, recordedSql, updateCalls } = makeFakeManager({
      reelCommission: { id: "rc-1", order_item_id: item.id },
    });
    const svc = new AffiliateCommissionService();
    const result = await svc.snapshotItem(manager as any, order, item);

    expect(result).toBeNull();
    expect(savedRows.length).toBe(0);
    expect(recordedSql.length).toBe(0);
    expect(updateCalls.length).toBe(0);
  });

  it("skips the affiliate snapshot when a live reel_attribution exists for (user, product) even with no reel_commission yet", async () => {
    const { manager, savedRows } = makeFakeManager({
      reelCommission: null,
      reelAttribution: { id: "ra-1" },
    });
    const svc = new AffiliateCommissionService();
    const result = await svc.snapshotItem(manager as any, order, item);

    expect(result).toBeNull();
    expect(savedRows.length).toBe(0);
  });

  it("creates a pending affiliate commission and deducts vendor_earning when there is no creator competition", async () => {
    const { manager, savedRows, recordedSql, updateCalls } = makeFakeManager({
      reelCommission: null,
      reelAttribution: null,
      attribution: { id: "attr-1", vendor_affiliate_id: "va-1" },
      affiliate: {
        id: "va-1",
        status: VendorAffiliateStatus.active,
        commission_type: AffiliateCommissionType.percentage,
        commission_value: 1000, // 10% bps
      },
    });
    const svc = new AffiliateCommissionService();
    const result = await svc.snapshotItem(manager as any, order, item);

    expect(result).not.toBeNull();
    expect(savedRows.length).toBe(1);
    expect(savedRows[0].status).toBe(AffiliateCommissionStatus.pending);
    expect(savedRows[0].order_item_id).toBe(item.id);
    expect(savedRows[0].commission_fils).toBe("1235");

    // Attribution consumed.
    expect(updateCalls.length).toBe(1);
    expect(updateCalls[0]?.criteria).toEqual({ id: "attr-1" });
    expect(updateCalls[0]?.partial).toEqual({ consumed_order_item_id: item.id });

    // Vendor margin deduction issued with the right amount.
    expect(recordedSql.some((q) => q.sql.includes("vendor_earning") && q.params[0] === 1235)).toBe(
      true,
    );
  });

  it("is idempotent: returns the existing commission and performs no new writes", async () => {
    const existing = {
      id: "ac-existing",
      order_item_id: item.id,
      status: AffiliateCommissionStatus.pending,
    };
    const { manager, savedRows, recordedSql, updateCalls } = makeFakeManager({
      existingCommission: existing,
    });
    const svc = new AffiliateCommissionService();
    const result = await svc.snapshotItem(manager as any, order, item);

    expect(result).toBe(existing as any);
    expect(savedRows.length).toBe(0);
    expect(recordedSql.length).toBe(0);
    expect(updateCalls.length).toBe(0);
  });

  it("skips when there is no live affiliate attribution at all", async () => {
    const { manager, savedRows } = makeFakeManager({
      reelCommission: null,
      reelAttribution: null,
      attribution: null,
    });
    const svc = new AffiliateCommissionService();
    const result = await svc.snapshotItem(manager as any, order, item);

    expect(result).toBeNull();
    expect(savedRows.length).toBe(0);
  });

  it("skips when the matched affiliate is not active", async () => {
    const { manager, savedRows } = makeFakeManager({
      reelCommission: null,
      reelAttribution: null,
      attribution: { id: "attr-1", vendor_affiliate_id: "va-1" },
      affiliate: { id: "va-1", status: VendorAffiliateStatus.suspended },
    });
    const svc = new AffiliateCommissionService();
    const result = await svc.snapshotItem(manager as any, order, item);

    expect(result).toBeNull();
    expect(savedRows.length).toBe(0);
  });
});
