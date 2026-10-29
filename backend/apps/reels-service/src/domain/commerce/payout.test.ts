import { describe, expect, it, mock } from "bun:test";
import { ReelCommissionStatus } from "@materialhub/database";
import { type EntityManager, In } from "typeorm";
import {
  NoopStripePayoutInitiator,
  PayoutService,
  type StripePayoutInitiator,
} from "./payout.service.ts";

const fakeStripe: StripePayoutInitiator = {
  async initiate(input) {
    return { externalRef: `stub_${input.idempotencyKey}` };
  },
};

/**
 * Minimal stand-in for the subset of the TypeORM EntityManager API that
 * PayoutService.executePayout touches. Only `getRepository(ReelCommission)`
 * is driven through the manager — the wallet debit uses the injected
 * CreatorWalletService mock directly.
 */
function makeFakeManager(updateSpy: (args: { criteria: any; patch: any }) => void) {
  const repo = {
    update: mock(async (criteria: any, patch: any) => {
      updateSpy({ criteria, patch });
      return { affected: 1 };
    }),
  };
  const manager = {
    getRepository: mock((_entity: any) => repo),
  };
  return { manager: manager as unknown as EntityManager, repo, rawManager: manager };
}

/**
 * Build a manager whose ReelCommission repo supports the full path the
 * new requestPayout takes: a locked createQueryBuilder().getMany() to load
 * earned rows, followed by an update({id: In([...])}) to flip them to
 * paid_out. Both calls go through the same underlying repo object so the
 * test can assert on the captured spies.
 */
function makeRequestPayoutManager(earnedRows: any[]) {
  const setLockCalls: string[] = [];
  const qb: any = {
    where() {
      return this;
    },
    andWhere() {
      return this;
    },
    setLock(mode: string) {
      setLockCalls.push(mode);
      return this;
    },
    getMany: mock(async () => earnedRows),
  };
  const repo = {
    createQueryBuilder: mock(() => qb),
    update: mock(async (_criteria: any, _patch: any) => ({ affected: earnedRows.length })),
  };
  const manager = {
    getRepository: mock((_entity: any) => repo),
  };
  return {
    manager: manager as unknown as EntityManager,
    repo,
    qb,
    setLockCalls,
    rawManager: manager,
  };
}

/**
 * Stub AppDataSource.transaction to drive the callback with a caller-supplied
 * manager. Returns a cleanup function.
 */
async function stubTransaction(fakeManager: EntityManager): Promise<() => void> {
  const dbModule = await import("@materialhub/database");
  const original = dbModule.AppDataSource.transaction;
  (dbModule.AppDataSource as any).transaction = async (cb: any) => cb(fakeManager);
  return () => {
    (dbModule.AppDataSource as any).transaction = original;
  };
}

describe("PayoutService.requestPayout", () => {
  it("throws payout_below_threshold (quick pre-flight) when wallet balance is below threshold", async () => {
    const wallet = {
      getBalance: async () => 10000,
      debit: async () => ({}),
    } as any;
    const service = new PayoutService(wallet, fakeStripe);
    (service as any).getThresholdFils = async () => 20000;

    await expect(service.requestPayout("creator-1")).rejects.toThrow(
      "payout_below_threshold:20000",
    );
  });

  it("throws payout_below_threshold when wallet is empty", async () => {
    const wallet = { getBalance: async () => 0, debit: async () => ({}) } as any;
    const service = new PayoutService(wallet, fakeStripe);
    (service as any).getThresholdFils = async () => 20000;

    await expect(service.requestPayout("creator-1")).rejects.toThrow(
      /^payout_below_threshold:20000$/,
    );
  });

  it("loads earned commissions under lock, pays out their exact sum, and flips them by id", async () => {
    // Three earned commissions summing to 60000 fils (above threshold).
    const earnedRows = [
      { id: "c-1", gross_commission_fils: "20000" },
      { id: "c-2", gross_commission_fils: "15000" },
      { id: "c-3", gross_commission_fils: "25000" },
    ];
    const { manager, repo, setLockCalls } = makeRequestPayoutManager(earnedRows);

    const debitCalls: any[] = [];
    const wallet = {
      // Outer quickBalance check: return any value above threshold. The
      // authoritative amount is computed from the locked earned rows.
      getBalance: async () => 60000,
      debit: mock(async (ctx: any) => {
        debitCalls.push(ctx);
        return { id: "wt-1" };
      }),
    } as any;

    const stripeCalls: any[] = [];
    const stripe: StripePayoutInitiator = {
      initiate: mock(async (input: any) => {
        stripeCalls.push(input);
        return { externalRef: `stub_${input.idempotencyKey}` };
      }),
    };

    const service = new PayoutService(wallet, stripe);
    (service as any).getThresholdFils = async () => 20000;

    const restore = await stubTransaction(manager);
    try {
      const result = await service.requestPayout("creator-1");

      // The SELECT took a pessimistic write lock.
      expect(setLockCalls).toContain("pessimistic_write");

      // The update used an `In([...])` criteria by id, NOT a
      // { creator_id, status: earned } shape. This is the key regression
      // guard: a future refactor that reverts to the broad status-based
      // update would light this test up.
      expect(repo.update).toHaveBeenCalledTimes(1);
      const updateCall = (repo.update as any).mock.calls[0];
      const criteria = updateCall[0];
      // The `In` operator value lives in a property — check it's an `In` shape.
      expect(criteria).toBeDefined();
      expect(criteria.id).toBeDefined();
      // Compare to a fresh `In(...)` with the expected ids.
      const expectedIn = In(["c-1", "c-2", "c-3"]);
      expect(criteria.id).toEqual(expectedIn);
      // Should NOT be the old broad criteria.
      expect((criteria as any).creator_id).toBeUndefined();
      expect((criteria as any).status).toBeUndefined();
      expect(updateCall[1]).toEqual({
        status: ReelCommissionStatus.paid_out,
      });

      // wallet.debit called with the SUM (60000), not the outer quickBalance.
      expect(debitCalls).toHaveLength(1);
      expect(debitCalls[0]).toMatchObject({
        userId: "creator-1",
        amount: 60000,
        transactionType: "reels_payout_debit",
        referenceType: "reels_payout",
      });
      expect(debitCalls[0].manager).toBe(manager);

      // Stripe called with the SUM.
      expect(stripeCalls).toHaveLength(1);
      expect(stripeCalls[0].amountFils).toBe(60000);

      // Return shape reflects the SUM.
      expect(result.amountFils).toBe(60000);
      expect(result.status).toBe("queued");
      expect(result.externalRef).toBe(`stub_${debitCalls[0].referenceId}`);
    } finally {
      restore();
    }
  });

  it("throws payout_below_threshold from inside the transaction when the locked earned sum is below threshold", async () => {
    // Outer quickBalance passes (>= threshold) but the authoritative sum
    // of locked earned rows is below threshold — e.g. a parallel voided
    // refund happened between the quickBalance read and the lock.
    const earnedRows = [
      { id: "c-1", gross_commission_fils: "5000" },
      { id: "c-2", gross_commission_fils: "4000" },
    ];
    const { manager, repo } = makeRequestPayoutManager(earnedRows);

    const wallet = {
      getBalance: async () => 25000, // outer check passes
      debit: mock(async () => ({ id: "wt-1" })),
    } as any;

    const service = new PayoutService(wallet, fakeStripe);
    (service as any).getThresholdFils = async () => 20000;

    const restore = await stubTransaction(manager);
    try {
      await expect(service.requestPayout("creator-1")).rejects.toThrow(
        "payout_below_threshold:20000",
      );
      // We should NOT have flipped or debited anything.
      expect(repo.update).not.toHaveBeenCalled();
      expect(wallet.debit).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });
});

describe("PayoutService.executePayout", () => {
  it("flips the supplied earned commissions by id, debits wallet, and returns queued result", async () => {
    const updates: Array<{ criteria: any; patch: any }> = [];
    const { manager, repo, rawManager } = makeFakeManager((u) => updates.push(u));

    const debitCalls: any[] = [];
    const wallet = {
      getBalance: async () => 25000,
      debit: mock(async (ctx: any) => {
        debitCalls.push(ctx);
        return { id: "wt-1" };
      }),
    } as any;

    const stripeCalls: any[] = [];
    const stripe: StripePayoutInitiator = {
      initiate: mock(async (input: any) => {
        stripeCalls.push(input);
        return { externalRef: `stub_${input.idempotencyKey}` };
      }),
    };

    const service = new PayoutService(wallet, stripe);
    const earned = [
      { id: "c-1", gross_commission_fils: "10000" },
      { id: "c-2", gross_commission_fils: "15000" },
    ] as any[];
    const result = await service.executePayout(manager, "creator-1", 25000, earned);

    // 1. ReelCommission.update called with an `In` criteria by id — NOT
    //    the old broad { creator_id, status: earned } shape. This is the
    //    key regression guard against the TOCTOU fix being reverted.
    expect(updates).toHaveLength(1);
    const criteria = updates[0]?.criteria;
    expect(criteria).toBeDefined();
    expect(criteria.id).toEqual(In(["c-1", "c-2"]));
    expect(criteria.creator_id).toBeUndefined();
    expect(criteria.status).toBeUndefined();
    expect(updates[0]?.patch).toEqual({
      status: ReelCommissionStatus.paid_out,
    });
    expect(rawManager.getRepository as any).toHaveBeenCalled();
    expect(repo.update as any).toHaveBeenCalledTimes(1);

    // 2. wallet.debit called with shared manager + right ctx
    expect(debitCalls).toHaveLength(1);
    expect(debitCalls[0]).toMatchObject({
      userId: "creator-1",
      amount: 25000,
      transactionType: "reels_payout_debit",
      referenceType: "reels_payout",
    });
    expect(debitCalls[0].referenceId).toEqual(expect.any(String));
    expect(debitCalls[0].manager).toBe(manager);

    // 3. Stripe initiator called with same payout id as idempotency key
    expect(stripeCalls).toHaveLength(1);
    expect(stripeCalls[0]).toMatchObject({
      userId: "creator-1",
      amountFils: 25000,
      currency: "AED",
    });
    expect(stripeCalls[0].idempotencyKey).toBe(debitCalls[0].referenceId);

    // 4. Return shape
    expect(result.amountFils).toBe(25000);
    expect(result.status).toBe("queued");
    expect(result.externalRef).toBe(`stub_${debitCalls[0].referenceId}`);
  });

  it("skips the ReelCommission update entirely when the earned set is empty", async () => {
    const updates: Array<{ criteria: any; patch: any }> = [];
    const { manager, repo } = makeFakeManager((u) => updates.push(u));

    const wallet = {
      getBalance: async () => 0,
      debit: mock(async () => ({ id: "wt-1" })),
    } as any;
    const service = new PayoutService(wallet, fakeStripe);

    // executePayout with empty earned is defensive — callers shouldn't
    // reach here with zero rows, but if they do the update should not run
    // (no rows to flip) while wallet.debit and stripe.initiate still fire
    // with the supplied amount.
    await service.executePayout(manager, "creator-1", 0, []);

    expect(repo.update as any).not.toHaveBeenCalled();
    expect(wallet.debit).toHaveBeenCalledTimes(1);
  });

  it("propagates errors from wallet.debit (e.g. insufficient_balance)", async () => {
    const { manager } = makeFakeManager(() => undefined);
    const wallet = {
      getBalance: async () => 25000,
      debit: async () => {
        throw new Error("insufficient_balance");
      },
    } as any;
    const service = new PayoutService(wallet, fakeStripe);
    await expect(
      service.executePayout(manager, "c1", 25000, [
        { id: "c-1", gross_commission_fils: "25000" },
      ] as any[]),
    ).rejects.toThrow("insufficient_balance");
  });
});

describe("PayoutService.getThresholdFils", () => {
  // These tests stub AppDataSource.getRepository temporarily so they don't
  // need a live Postgres connection.
  async function withStubbedSiteSettings<T>(
    rowValue: string | null,
    fn: (service: PayoutService) => Promise<T>,
  ): Promise<T> {
    const { AppDataSource } = await import("@materialhub/database");
    const original = AppDataSource.getRepository.bind(AppDataSource);
    (AppDataSource as any).getRepository = (_entity: any) => ({
      findOne: async () =>
        rowValue === null ? null : { key: "reels_payout_threshold_fils", value: rowValue },
    });
    try {
      const service = new PayoutService({ getBalance: async () => 0 } as any, fakeStripe);
      return await fn(service);
    } finally {
      (AppDataSource as any).getRepository = original;
    }
  }

  it("returns the value from site_settings when present and numeric", async () => {
    await withStubbedSiteSettings("50000", async (service) => {
      expect(await service.getThresholdFils()).toBe(50000);
    });
  });

  it("defaults to 20000 when site_settings row missing", async () => {
    await withStubbedSiteSettings(null, async (service) => {
      expect(await service.getThresholdFils()).toBe(20000);
    });
  });

  it("defaults to 20000 when site_settings value is non-numeric", async () => {
    await withStubbedSiteSettings("not-a-number", async (service) => {
      expect(await service.getThresholdFils()).toBe(20000);
    });
  });

  it("defaults to 20000 when site_settings value is zero or negative", async () => {
    await withStubbedSiteSettings("0", async (service) => {
      expect(await service.getThresholdFils()).toBe(20000);
    });
    await withStubbedSiteSettings("-500", async (service) => {
      expect(await service.getThresholdFils()).toBe(20000);
    });
  });
});

describe("NoopStripePayoutInitiator", () => {
  it("returns a stub externalRef derived from the idempotency key", async () => {
    const noop = new NoopStripePayoutInitiator();
    const result = await noop.initiate({
      userId: "u1",
      amountFils: 10000,
      currency: "AED",
      idempotencyKey: "abc-123",
    });
    expect(result.externalRef).toBe("stub_abc-123");
  });
});
