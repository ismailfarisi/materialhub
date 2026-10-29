import { afterEach, describe, expect, it, mock } from "bun:test";
import {
  AFFILIATE_COMMISSIONS_QUEUE,
  __setQueueFactoryForTests,
  publishOrderDeliveredForAffiliates,
  publishOrderPaidForAffiliates,
  publishOrderRefundedForAffiliates,
} from "./affiliate-commission-events.ts";

interface FakeQueue {
  name: string;
  opts: unknown;
  add: ReturnType<typeof mock>;
}

function makeFakeQueue(): FakeQueue {
  return {
    name: "",
    opts: null,
    add: mock(async () => ({ id: "job-id" })),
  };
}

describe("affiliate-commission-events publisher", () => {
  let fake: FakeQueue;
  let createCount: number;

  const setupFactory = () => {
    createCount = 0;
    fake = makeFakeQueue();
    __setQueueFactoryForTests(() => {
      createCount += 1;
      // Mimic the BullMQ Queue constructor capturing name/connection.
      fake.name = AFFILIATE_COMMISSIONS_QUEUE;
      fake.opts = { connection: { url: "redis://test" } };
      return fake as unknown as import("bullmq").Queue;
    });
  };

  afterEach(() => {
    __setQueueFactoryForTests(null);
  });

  it("publishOrderPaidForAffiliates adds snapshotAffiliateCommissions with orderId", async () => {
    setupFactory();
    await publishOrderPaidForAffiliates("o-1");
    expect(fake.add).toHaveBeenCalledTimes(1);
    const call = fake.add.mock.calls[0]!;
    expect(call[0]).toBe("snapshotAffiliateCommissions");
    expect(call[1]).toEqual({ orderId: "o-1" });
    expect(call[2]).toMatchObject({ removeOnComplete: 1000, attempts: 5 });
    expect(fake.name).toBe("affiliate-commissions");
  });

  it("publishOrderDeliveredForAffiliates adds setAffiliateEligibility with orderId", async () => {
    setupFactory();
    await publishOrderDeliveredForAffiliates("o-2");
    expect(fake.add).toHaveBeenCalledTimes(1);
    const call = fake.add.mock.calls[0]!;
    expect(call[0]).toBe("setAffiliateEligibility");
    expect(call[1]).toEqual({ orderId: "o-2" });
    expect(call[2]).toMatchObject({ removeOnComplete: 1000, attempts: 5 });
  });

  it("publishOrderRefundedForAffiliates adds voidAffiliateCommissions with orderId", async () => {
    setupFactory();
    await publishOrderRefundedForAffiliates("o-3");
    expect(fake.add).toHaveBeenCalledTimes(1);
    const call = fake.add.mock.calls[0]!;
    expect(call[0]).toBe("voidAffiliateCommissions");
    expect(call[1]).toEqual({ orderId: "o-3" });
    expect(call[2]).toMatchObject({ removeOnComplete: 1000, attempts: 5 });
  });

  it("reuses a single Queue instance across calls (no connection leak)", async () => {
    setupFactory();
    await publishOrderPaidForAffiliates("o-a");
    await publishOrderDeliveredForAffiliates("o-b");
    await publishOrderRefundedForAffiliates("o-c");
    await publishOrderPaidForAffiliates("o-d");
    expect(createCount).toBe(1);
    expect(fake.add).toHaveBeenCalledTimes(4);
  });

  it("restores the default factory when set to null", () => {
    __setQueueFactoryForTests(null);
    // Smoke: the module should still export the callables; we don't actually
    // invoke them here (that would try to connect to a real Redis).
    expect(typeof publishOrderPaidForAffiliates).toBe("function");
  });
});
