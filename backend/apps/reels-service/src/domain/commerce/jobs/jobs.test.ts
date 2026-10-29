import { describe, expect, it, mock } from "bun:test";
import { AppDataSource } from "@materialhub/database";
import type { CommissionService } from "../commission.service.ts";
import { COMMERCE_JOB_NAMES, CommerceEventJobs } from "./commerce-event-jobs.ts";
import { TransitionPendingToEarnedJob } from "./transition-pending-to-earned.job.ts";

/**
 * These tests call `handle()` directly and never invoke `start()`, so no
 * BullMQ Worker / Redis connection is opened. We stub AppDataSource's
 * `getRepository` only for the tests that need it (the create/eligibility
 * paths load an Order).
 */

function stubOrderRepo(order: any) {
  const original = AppDataSource.getRepository.bind(AppDataSource);
  const spy = mock((entity: any) => {
    const name = typeof entity === "function" ? entity.name : (entity?.name ?? entity);
    if (name === "Order") {
      return {
        findOne: mock(async () => order),
      } as any;
    }
    return original(entity);
  });
  (AppDataSource as any).getRepository = spy;
  return () => {
    (AppDataSource as any).getRepository = original;
  };
}

function makeCommissionServiceMock(): CommissionService & {
  _calls: {
    createFromOrder: any[];
    setEligibility: any[];
    voidPendingForOrder: any[];
    transitionEligibleToEarned: any[];
  };
} {
  const calls = {
    createFromOrder: [] as any[],
    setEligibility: [] as any[],
    voidPendingForOrder: [] as any[],
    transitionEligibleToEarned: [] as any[],
  };
  const svc = {
    _calls: calls,
    createFromOrder: mock(async (order: any) => {
      calls.createFromOrder.push(order);
    }),
    setEligibility: mock(async (orderId: string, deliveredAt: Date, days: number) => {
      calls.setEligibility.push({ orderId, deliveredAt, days });
    }),
    voidPendingForOrder: mock(async (orderId: string, reason: string) => {
      calls.voidPendingForOrder.push({ orderId, reason });
    }),
    transitionEligibleToEarned: mock(async () => {
      calls.transitionEligibleToEarned.push(Date.now());
      return 0;
    }),
  };
  return svc as any;
}

describe("CommerceEventJobs", () => {
  it("dispatches to createFromOrder on createCommissionsFromOrder job name", async () => {
    const order = { id: "order-1", delivered_at: null, items: [] };
    const restore = stubOrderRepo(order);
    try {
      const svc = makeCommissionServiceMock();
      const jobs = new CommerceEventJobs("redis://stub", svc);
      await jobs.handle({
        name: COMMERCE_JOB_NAMES.createCommissionsFromOrder,
        data: { orderId: "order-1" },
      } as any);
      expect(svc._calls.createFromOrder.length).toBe(1);
      expect(svc._calls.createFromOrder[0]).toBe(order);
    } finally {
      restore();
    }
  });

  it("no-ops on createCommissionsFromOrder when order missing", async () => {
    const restore = stubOrderRepo(null);
    try {
      const svc = makeCommissionServiceMock();
      const jobs = new CommerceEventJobs("redis://stub", svc);
      await jobs.handle({
        name: COMMERCE_JOB_NAMES.createCommissionsFromOrder,
        data: { orderId: "missing" },
      } as any);
      expect(svc._calls.createFromOrder.length).toBe(0);
    } finally {
      restore();
    }
  });

  it("dispatches to setEligibility on setCommissionEligibility with 7-day default window", async () => {
    const delivered = new Date("2026-04-01T12:00:00Z");
    const order = { id: "order-2", delivered_at: delivered, items: [] };
    const restore = stubOrderRepo(order);
    try {
      const svc = makeCommissionServiceMock();
      const jobs = new CommerceEventJobs("redis://stub", svc);
      await jobs.handle({
        name: COMMERCE_JOB_NAMES.setCommissionEligibility,
        data: { orderId: "order-2" },
      } as any);
      expect(svc._calls.setEligibility.length).toBe(1);
      expect(svc._calls.setEligibility[0]).toEqual({
        orderId: "order-2",
        deliveredAt: delivered,
        days: 7,
      });
    } finally {
      restore();
    }
  });

  it("falls back to now() for delivered_at when order has no delivery timestamp", async () => {
    const order = { id: "order-3", delivered_at: null, items: [] };
    const restore = stubOrderRepo(order);
    try {
      const svc = makeCommissionServiceMock();
      const jobs = new CommerceEventJobs("redis://stub", svc);
      const before = Date.now();
      await jobs.handle({
        name: COMMERCE_JOB_NAMES.setCommissionEligibility,
        data: { orderId: "order-3" },
      } as any);
      const after = Date.now();
      expect(svc._calls.setEligibility.length).toBe(1);
      const { deliveredAt } = svc._calls.setEligibility[0];
      expect(deliveredAt instanceof Date).toBe(true);
      expect(deliveredAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(deliveredAt.getTime()).toBeLessThanOrEqual(after);
    } finally {
      restore();
    }
  });

  it("voids commissions on voidCommissionsOnRefund", async () => {
    const svc = makeCommissionServiceMock();
    const jobs = new CommerceEventJobs("redis://stub", svc);
    await jobs.handle({
      name: COMMERCE_JOB_NAMES.voidCommissionsOnRefund,
      data: { orderId: "order-4" },
    } as any);
    expect(svc._calls.voidPendingForOrder.length).toBe(1);
    expect(svc._calls.voidPendingForOrder[0]).toEqual({
      orderId: "order-4",
      reason: "order_refunded",
    });
  });

  it("ignores unknown job name", async () => {
    const svc = makeCommissionServiceMock();
    const jobs = new CommerceEventJobs("redis://stub", svc);
    await jobs.handle({
      name: "somethingElse",
      data: { orderId: "order-5" },
    } as any);
    expect(svc._calls.createFromOrder.length).toBe(0);
    expect(svc._calls.setEligibility.length).toBe(0);
    expect(svc._calls.voidPendingForOrder.length).toBe(0);
  });

  it("no-ops when orderId is missing from payload", async () => {
    const svc = makeCommissionServiceMock();
    const jobs = new CommerceEventJobs("redis://stub", svc);
    await jobs.handle({
      name: COMMERCE_JOB_NAMES.createCommissionsFromOrder,
      data: {} as any,
    } as any);
    expect(svc._calls.createFromOrder.length).toBe(0);
  });
});

describe("TransitionPendingToEarnedJob", () => {
  it("loops until transitionEligibleToEarned returns 0 and sums the totals", async () => {
    const svc = makeCommissionServiceMock();
    const returns = [100, 50, 0];
    svc.transitionEligibleToEarned = mock(async () => {
      const next = returns.shift() ?? 0;
      return next;
    }) as any;

    const job = new TransitionPendingToEarnedJob("redis://stub", svc);
    const result = await job.handle();
    expect(result.total).toBe(150);
  });

  it("stops after MAX_LOOPS to bound runtime", async () => {
    const svc = makeCommissionServiceMock();
    let callCount = 0;
    svc.transitionEligibleToEarned = mock(async () => {
      callCount += 1;
      return 1; // Never drains → loop must cap itself.
    }) as any;

    const job = new TransitionPendingToEarnedJob("redis://stub", svc);
    const result = await job.handle();
    expect(callCount).toBe(50);
    expect(result.total).toBe(50);
  });

  it("returns zero when there are no eligible commissions", async () => {
    const svc = makeCommissionServiceMock();
    svc.transitionEligibleToEarned = mock(async () => 0) as any;

    const job = new TransitionPendingToEarnedJob("redis://stub", svc);
    const result = await job.handle();
    expect(result.total).toBe(0);
  });
});
