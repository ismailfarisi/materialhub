import { describe, expect, it, mock } from "bun:test";
import { ReelCommissionStatus } from "@materialhub/database";
import { CommissionService } from "./commission.service.ts";

function makeAttributionQb(row: any, updateSpy?: (args: any) => void) {
  return {
    createQueryBuilder: () => ({
      where: function () {
        return this;
      },
      andWhere: function () {
        return this;
      },
      orderBy: function () {
        return this;
      },
      addOrderBy: function () {
        return this;
      },
      setParameter: function () {
        return this;
      },
      limit: function () {
        return this;
      },
      getOne: async () => row,
    }),
    update: mock(async (criteria: any, patch: any) => {
      updateSpy?.({ criteria, patch });
      return { affected: 1 };
    }),
  };
}

/**
 * Stub `AppDataSource.transaction` so it passes a fake EntityManager to the
 * callback. The fake manager routes `getRepository(ReelCommission)` to the
 * supplied commission repo mock and `getRepository(ReelAttribution)` to the
 * attribution repo mock. Returns a cleanup function; call it in `finally`.
 *
 * The `createFromOrder` path now opens a per-item transaction to wrap the
 * commission save + attribution consume atomically, so tests that drive
 * that method must stub the transaction boundary.
 */
async function stubCommitTransaction(
  commissionRepo: any,
  attributionRepo: any,
): Promise<() => void> {
  const dbModule = await import("@materialhub/database");
  const originalTxn = dbModule.AppDataSource.transaction;
  const fakeManager: any = {
    getRepository: (entity: any) => {
      // Match by class reference (ReelCommission vs ReelAttribution).
      if (entity === dbModule.ReelCommission) return commissionRepo;
      if (entity === dbModule.ReelAttribution) return attributionRepo;
      return commissionRepo;
    },
  };
  (dbModule.AppDataSource as any).transaction = async (cb: any) => cb(fakeManager);
  return () => {
    (dbModule.AppDataSource as any).transaction = originalTxn;
  };
}

describe("CommissionService.createFromOrder", () => {
  it("creates a commission row with subsidy active (50/50 split)", async () => {
    const now = Date.now();
    const order: any = {
      id: "order-1",
      user_id: "buyer-1",
      items: [
        {
          id: "oi-1",
          product_id: "p-1",
          line_total: 10000, // 100 AED in fils
          vendor_id: "v-1",
          quantity: 1,
          unit_price: 10000,
        },
      ],
    };

    const attribution = {
      id: "a-1",
      user_id: "buyer-1",
      product_id: "p-1",
      creator_id: "creator-1",
      reel_id: "reel-1",
      tapped_at: new Date(now - 1000),
      consumed_order_item_id: null,
    };

    const vendor = {
      id: "v-1",
      reels_program_joined_at: new Date(now - 86_400_000),
      reels_commission_rate: "0.0500",
      reels_subsidy_ends_at: new Date(now + 86_400_000), // still active
    };

    let saved: any = null;
    const attributionRepo = makeAttributionQb(attribution);
    const orderItemRepo = {};
    const vendorRepo = { findOne: mock(async () => vendor) };
    const commissionRepo = {
      create: (x: any) => x,
      // Idempotency probe: no existing row for this order_item.
      findOne: mock(async () => null),
      save: mock(async (x: any) => {
        saved = { ...x, id: "c-1" };
        return saved;
      }),
    };

    const service = new CommissionService();
    (service as any).attributionRepo = attributionRepo;
    (service as any).orderItemRepo = orderItemRepo;
    (service as any).vendorRepo = vendorRepo;
    (service as any).commissionRepo = commissionRepo;

    const restore = await stubCommitTransaction(commissionRepo, attributionRepo);
    try {
      await service.createFromOrder(order);
    } finally {
      restore();
    }

    expect(saved).not.toBeNull();
    expect(saved.creator_id).toBe("creator-1");
    expect(saved.attribution_id).toBe("a-1");
    expect(saved.order_id).toBe("order-1");
    expect(saved.order_item_id).toBe("oi-1");
    expect(saved.vendor_id).toBe("v-1");
    expect(saved.product_id).toBe("p-1");
    expect(saved.reel_id).toBe("reel-1");
    expect(saved.item_price_fils).toBe("10000");
    expect(saved.commission_rate_snapshot).toBe("0.05");
    expect(saved.subsidy_share_snapshot).toBe("0.5");
    // gross = round(10000 * 0.05) = 500
    expect(saved.gross_commission_fils).toBe("500");
    // platformSubsidy = round(500 * 0.5) = 250
    expect(saved.platform_subsidy_fils).toBe("250");
    // vendorShare = 500 - 250 = 250
    expect(saved.vendor_share_fils).toBe("250");
    expect(saved.status).toBe(ReelCommissionStatus.pending);

    // attribution marked as consumed
    expect(attributionRepo.update).toHaveBeenCalled();
    const call = (attributionRepo.update as any).mock.calls[0];
    expect(call[0]).toEqual({ id: "a-1", tapped_at: attribution.tapped_at });
    expect(call[1]).toEqual({ consumed_order_item_id: "oi-1" });
  });

  it("creates a commission row with no subsidy (full vendor share)", async () => {
    const now = Date.now();
    const order: any = {
      id: "order-2",
      user_id: "buyer-1",
      items: [
        {
          id: "oi-2",
          product_id: "p-1",
          line_total: 20000,
          vendor_id: "v-1",
          quantity: 2,
          unit_price: 10000,
        },
      ],
    };

    const attribution = {
      id: "a-2",
      user_id: "buyer-1",
      product_id: "p-1",
      creator_id: "creator-1",
      reel_id: "reel-1",
      tapped_at: new Date(),
      consumed_order_item_id: null,
    };

    const vendor = {
      id: "v-1",
      reels_program_joined_at: new Date(now - 86_400_000),
      reels_commission_rate: "0.0500",
      reels_subsidy_ends_at: new Date(now - 1000), // expired
    };

    let saved: any = null;
    const attributionRepoNoSubsidy = makeAttributionQb(attribution);
    const commissionRepoNoSubsidy = {
      create: (x: any) => x,
      findOne: mock(async () => null),
      save: mock(async (x: any) => {
        saved = { ...x, id: "c-2" };
        return saved;
      }),
    };
    const service = new CommissionService();
    (service as any).attributionRepo = attributionRepoNoSubsidy;
    (service as any).orderItemRepo = {};
    (service as any).vendorRepo = { findOne: async () => vendor };
    (service as any).commissionRepo = commissionRepoNoSubsidy;

    const restore = await stubCommitTransaction(commissionRepoNoSubsidy, attributionRepoNoSubsidy);
    try {
      await service.createFromOrder(order);
    } finally {
      restore();
    }
    expect(saved.gross_commission_fils).toBe("1000");
    expect(saved.platform_subsidy_fils).toBe("0");
    expect(saved.vendor_share_fils).toBe("1000");
    expect(saved.subsidy_share_snapshot).toBe("0");
  });

  it("skips item when vendor is not enrolled in reels program", async () => {
    const order: any = {
      id: "order-3",
      user_id: "buyer-1",
      items: [
        {
          id: "oi-3",
          product_id: "p-1",
          line_total: 5000,
          vendor_id: "v-2",
          quantity: 1,
          unit_price: 5000,
        },
      ],
    };

    const attribution = {
      id: "a-3",
      user_id: "buyer-1",
      product_id: "p-1",
      creator_id: "creator-1",
      reel_id: "reel-1",
      tapped_at: new Date(),
      consumed_order_item_id: null,
    };

    const vendor = {
      id: "v-2",
      reels_program_joined_at: null, // not enrolled
      reels_commission_rate: "0.0500",
      reels_subsidy_ends_at: null,
    };

    const commissionSave = mock(async (x: any) => x);
    const service = new CommissionService();
    (service as any).attributionRepo = makeAttributionQb(attribution);
    (service as any).orderItemRepo = {};
    (service as any).vendorRepo = { findOne: async () => vendor };
    (service as any).commissionRepo = {
      create: (x: any) => x,
      findOne: mock(async () => null),
      save: commissionSave,
    };

    await service.createFromOrder(order);
    expect(commissionSave).not.toHaveBeenCalled();
  });

  it("skips item when no attribution found", async () => {
    const order: any = {
      id: "order-4",
      user_id: "buyer-1",
      items: [
        {
          id: "oi-4",
          product_id: "p-1",
          line_total: 5000,
          vendor_id: "v-1",
          quantity: 1,
          unit_price: 5000,
        },
      ],
    };

    const commissionSave = mock(async (x: any) => x);
    const vendorFindOne = mock(async () => ({ id: "v-1" }));
    const service = new CommissionService();
    (service as any).attributionRepo = makeAttributionQb(null);
    (service as any).orderItemRepo = {};
    (service as any).vendorRepo = { findOne: vendorFindOne };
    (service as any).commissionRepo = {
      create: (x: any) => x,
      findOne: mock(async () => null),
      save: commissionSave,
    };

    await service.createFromOrder(order);
    expect(commissionSave).not.toHaveBeenCalled();
    expect(vendorFindOne).not.toHaveBeenCalled();
  });

  it("skips commission save on retry when a row already exists for the order_item (idempotency)", async () => {
    // Simulates the worker retry scenario: a previous attempt already
    // saved a commission row for this order_item (the save succeeded but
    // either the attribution update or a later item crashed). The retry
    // must not re-save (which would trip the UNIQUE constraint) and must
    // repair the attribution's consumed_order_item_id if it's still null.
    const order: any = {
      id: "order-retry",
      user_id: "buyer-1",
      items: [
        {
          id: "oi-retry",
          product_id: "p-1",
          line_total: 10000,
          vendor_id: "v-1",
          quantity: 1,
          unit_price: 10000,
        },
      ],
    };

    const attribution = {
      id: "a-retry",
      user_id: "buyer-1",
      product_id: "p-1",
      creator_id: "creator-1",
      reel_id: "reel-1",
      tapped_at: new Date(),
      // Previous attempt died between commission save and attribution
      // update, so this is still null.
      consumed_order_item_id: null,
    };

    const vendor = {
      id: "v-1",
      reels_program_joined_at: new Date(Date.now() - 86_400_000),
      reels_commission_rate: "0.0500",
      reels_subsidy_ends_at: null,
    };

    const attributionRepo = makeAttributionQb(attribution);
    const commissionSave = mock(async (x: any) => x);
    const commissionRepo = {
      create: (x: any) => x,
      // Existing row found: previous attempt already saved it.
      findOne: mock(async () => ({ id: "existing-c", order_item_id: "oi-retry" })),
      save: commissionSave,
    };

    const service = new CommissionService();
    (service as any).attributionRepo = attributionRepo;
    (service as any).orderItemRepo = {};
    (service as any).vendorRepo = { findOne: async () => vendor };
    (service as any).commissionRepo = commissionRepo;

    await service.createFromOrder(order);

    // Commission save NOT called — existence check short-circuited it.
    expect(commissionSave).not.toHaveBeenCalled();
    // Attribution update IS called — repairing the un-consumed state.
    expect(attributionRepo.update).toHaveBeenCalled();
    const call = (attributionRepo.update as any).mock.calls[0];
    expect(call[0]).toEqual({ id: "a-retry", tapped_at: attribution.tapped_at });
    expect(call[1]).toEqual({ consumed_order_item_id: "oi-retry" });
  });

  it("on retry with existing commission AND already-consumed attribution, does nothing", async () => {
    // Both the commission save and the attribution update completed on the
    // first attempt. The retry should do nothing (not re-save, not re-update).
    const order: any = {
      id: "order-retry-2",
      user_id: "buyer-1",
      items: [
        {
          id: "oi-retry-2",
          product_id: "p-1",
          line_total: 10000,
          vendor_id: "v-1",
          quantity: 1,
          unit_price: 10000,
        },
      ],
    };

    const attribution = {
      id: "a-retry-2",
      user_id: "buyer-1",
      product_id: "p-1",
      creator_id: "creator-1",
      reel_id: "reel-1",
      tapped_at: new Date(),
      // Already consumed by the previous successful attempt.
      consumed_order_item_id: "oi-retry-2",
    };

    // Note: the createQueryBuilder filter `consumed_order_item_id IS NULL`
    // would filter this row out in production, but makeAttributionQb ignores
    // the filter and returns whatever we pass. That matches what this test
    // wants to prove: even if somehow the attribution is returned, the repair
    // path is skipped because consumed_order_item_id is already set.
    const vendor = {
      id: "v-1",
      reels_program_joined_at: new Date(Date.now() - 86_400_000),
      reels_commission_rate: "0.0500",
      reels_subsidy_ends_at: null,
    };

    const attributionRepo = makeAttributionQb(attribution);
    const commissionSave = mock(async (x: any) => x);
    const commissionRepo = {
      create: (x: any) => x,
      findOne: mock(async () => ({ id: "existing-c", order_item_id: "oi-retry-2" })),
      save: commissionSave,
    };

    const service = new CommissionService();
    (service as any).attributionRepo = attributionRepo;
    (service as any).orderItemRepo = {};
    (service as any).vendorRepo = { findOne: async () => vendor };
    (service as any).commissionRepo = commissionRepo;

    await service.createFromOrder(order);

    expect(commissionSave).not.toHaveBeenCalled();
    expect(attributionRepo.update).not.toHaveBeenCalled();
  });

  it("rolls back attribution consume when commission save fails mid-transaction", async () => {
    // If commissionRepo.save throws inside the per-item transaction,
    // attributionRepo.update must NOT be called — the rollback leaves
    // the attribution un-consumed so the next retry sees a clean slate.
    const order: any = {
      id: "order-fail",
      user_id: "buyer-1",
      items: [
        {
          id: "oi-fail",
          product_id: "p-1",
          line_total: 10000,
          vendor_id: "v-1",
          quantity: 1,
          unit_price: 10000,
        },
      ],
    };

    const attribution = {
      id: "a-fail",
      user_id: "buyer-1",
      product_id: "p-1",
      creator_id: "creator-1",
      reel_id: "reel-1",
      tapped_at: new Date(),
      consumed_order_item_id: null,
    };

    const vendor = {
      id: "v-1",
      reels_program_joined_at: new Date(Date.now() - 86_400_000),
      reels_commission_rate: "0.0500",
      reels_subsidy_ends_at: null,
    };

    const attributionRepo = makeAttributionQb(attribution);
    const commissionRepo = {
      create: (x: any) => x,
      findOne: mock(async () => null),
      save: mock(async () => {
        throw new Error("save_failed");
      }),
    };

    const service = new CommissionService();
    (service as any).attributionRepo = attributionRepo;
    (service as any).orderItemRepo = {};
    (service as any).vendorRepo = { findOne: async () => vendor };
    (service as any).commissionRepo = commissionRepo;

    const restore = await stubCommitTransaction(commissionRepo, attributionRepo);
    try {
      await expect(service.createFromOrder(order)).rejects.toThrow("save_failed");
    } finally {
      restore();
    }

    // Critical: attribution update NOT called after the failed save. In
    // production this is enforced by the DB transaction rollback; in this
    // test it's enforced by the order of operations inside the stubbed
    // transaction callback (save throws before update runs).
    expect(attributionRepo.update).not.toHaveBeenCalled();
  });
});

describe("CommissionService.setEligibility", () => {
  it("updates pending commissions with computed eligible_at", async () => {
    const deliveredAt = new Date("2026-04-01T00:00:00Z");
    const service = new CommissionService();
    const updateSpy = mock(async (_criteria: any, _patch: any) => ({ affected: 2 }));
    (service as any).commissionRepo = { update: updateSpy };

    await service.setEligibility("order-1", deliveredAt, 7);

    expect(updateSpy).toHaveBeenCalled();
    const call = (updateSpy as any).mock.calls[0];
    expect(call[0]).toEqual({
      order_id: "order-1",
      status: ReelCommissionStatus.pending,
    });
    // eligible_at = deliveredAt + 7 days
    const expected = new Date(deliveredAt.getTime() + 7 * 86_400_000);
    expect((call[1].eligible_at as Date).toISOString()).toBe(expected.toISOString());
  });
});

describe("CommissionService.voidPendingForOrder", () => {
  it("updates pending commissions to voided with reason", async () => {
    const service = new CommissionService();
    const updateSpy = mock(async (_criteria: any, _patch: any) => ({ affected: 1 }));
    (service as any).commissionRepo = { update: updateSpy };

    await service.voidPendingForOrder("order-1", "full_refund");
    expect(updateSpy).toHaveBeenCalled();
    const call = (updateSpy as any).mock.calls[0];
    expect(call[0]).toEqual({
      order_id: "order-1",
      status: ReelCommissionStatus.pending,
    });
    expect(call[1]).toEqual({
      status: ReelCommissionStatus.voided,
      voided_reason: "full_refund",
    });
  });
});

describe("CommissionService.transitionEligibleToEarned", () => {
  it("credits wallet and flips status for each eligible pending commission", async () => {
    const now = new Date("2026-04-10T00:00:00Z");
    const commissions = [
      {
        id: "c-1",
        creator_id: "creator-1",
        gross_commission_fils: "500",
        status: ReelCommissionStatus.pending,
      },
      {
        id: "c-2",
        creator_id: "creator-2",
        gross_commission_fils: "1000",
        status: ReelCommissionStatus.pending,
      },
    ];

    // Track the FOR UPDATE + SKIP LOCKED hints so we can assert the method
    // still asks for pessimistic locking inside the outer transaction.
    const setLockCalls: string[] = [];
    const setOnLockedCalls: string[] = [];
    const createQbSpy = mock(() => ({
      where: function () {
        return this;
      },
      andWhere: function () {
        return this;
      },
      orderBy: function () {
        return this;
      },
      limit: function () {
        return this;
      },
      setParameter: function () {
        return this;
      },
      setLock: function (mode: string) {
        setLockCalls.push(mode);
        return this;
      },
      setOnLocked: function (mode: string) {
        setOnLockedCalls.push(mode);
        return this;
      },
      getMany: async () => commissions,
    }));

    const managerCommissionRepoUpdate = mock(async () => ({ affected: 1 }));
    const managerCommissionRepo = {
      createQueryBuilder: createQbSpy,
      update: managerCommissionRepoUpdate,
    };
    const fakeManager: any = {
      getRepository: () => managerCommissionRepo,
    };

    // Stub AppDataSource.transaction to invoke callback with our fake manager.
    const dbModule = await import("@materialhub/database");
    const originalTxn = dbModule.AppDataSource.transaction;
    (dbModule.AppDataSource as any).transaction = async (cb: any) => cb(fakeManager);

    try {
      const walletCredit = mock(async () => ({ id: "wt-1" }));
      const fakeWallet: any = { credit: walletCredit };
      const service = new CommissionService(fakeWallet);

      const count = await service.transitionEligibleToEarned(now);

      expect(count).toBe(2);

      // The batch select was built once and asked for FOR UPDATE SKIP LOCKED.
      expect(createQbSpy).toHaveBeenCalledTimes(1);
      expect(setLockCalls).toContain("pessimistic_write");
      expect(setOnLockedCalls).toContain("skip_locked");

      expect(walletCredit).toHaveBeenCalledTimes(2);

      const firstCall = (walletCredit as any).mock.calls[0][0];
      expect(firstCall.userId).toBe("creator-1");
      expect(firstCall.amount).toBe(500);
      expect(firstCall.transactionType).toBe("reels_commission_credit");
      expect(firstCall.referenceType).toBe("reel_commission");
      expect(firstCall.referenceId).toBe("c-1");
      expect(firstCall.manager).toBe(fakeManager);

      // commission row updated to earned with wallet_transaction_id linked
      expect(managerCommissionRepoUpdate).toHaveBeenCalledTimes(2);
      const updateCall = (managerCommissionRepoUpdate as any).mock.calls[0];
      // Status guard is present on the criteria — defence-in-depth
      expect(updateCall[0]).toEqual({
        id: "c-1",
        status: ReelCommissionStatus.pending,
      });
      expect(updateCall[1].status).toBe(ReelCommissionStatus.earned);
      expect(updateCall[1].wallet_transaction_id).toBe("wt-1");
      expect(updateCall[1].earned_at).toEqual(now);
    } finally {
      (dbModule.AppDataSource as any).transaction = originalTxn;
    }
  });

  it("throws commission_already_claimed when the status guard fails (defence in depth)", async () => {
    // Under the new single-outer-transaction design this path is essentially
    // unreachable — SKIP LOCKED already guarantees no other worker holds the
    // row. The guard remains as defence in depth for any future callsite
    // that might bypass the lock, and this test still asserts the behavior
    // if `update` ever returns { affected: 0 }.
    const now = new Date("2026-04-10T00:00:00Z");
    const commissions = [
      {
        id: "c-1",
        creator_id: "creator-1",
        gross_commission_fils: "500",
        status: ReelCommissionStatus.pending,
      },
    ];

    const createQbSpy = mock(() => ({
      where: function () {
        return this;
      },
      andWhere: function () {
        return this;
      },
      orderBy: function () {
        return this;
      },
      limit: function () {
        return this;
      },
      setParameter: function () {
        return this;
      },
      setLock: function () {
        return this;
      },
      setOnLocked: function () {
        return this;
      },
      getMany: async () => commissions,
    }));

    // update returns 0 affected — simulating the status guard rejecting.
    const managerCommissionRepoUpdate = mock(async () => ({ affected: 0 }));
    const managerCommissionRepo = {
      createQueryBuilder: createQbSpy,
      update: managerCommissionRepoUpdate,
    };
    const fakeManager: any = {
      getRepository: () => managerCommissionRepo,
    };

    const dbModule = await import("@materialhub/database");
    const originalTxn = dbModule.AppDataSource.transaction;
    // Stub the transaction wrapper to invoke the callback and propagate thrown errors.
    (dbModule.AppDataSource as any).transaction = async (cb: any) => {
      return cb(fakeManager);
    };

    try {
      const walletCredit = mock(async () => ({ id: "wt-1" }));
      const fakeWallet: any = { credit: walletCredit };
      const service = new CommissionService(fakeWallet);

      // Whole batch aborts — the throw rolls the outer transaction back.
      await expect(service.transitionEligibleToEarned(now)).rejects.toThrow(
        "commission_already_claimed",
      );

      // Wallet credit was attempted on the row before the guard tripped.
      expect(walletCredit).toHaveBeenCalledTimes(1);
      expect(managerCommissionRepoUpdate).toHaveBeenCalledTimes(1);
    } finally {
      (dbModule.AppDataSource as any).transaction = originalTxn;
    }
  });
});
