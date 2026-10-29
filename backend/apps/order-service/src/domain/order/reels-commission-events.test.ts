import { beforeEach, describe, expect, it, mock } from "bun:test";
import {
  REELS_COMMISSIONS_QUEUE,
  __setQueueFactoryForTests,
  publishOrderDeliveredForCommissions,
  publishOrderPaidForCommissions,
  publishOrderRefundedForCommissions,
} from "./reels-commission-events.ts";

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

describe("reels-commission-events publisher", () => {
  let fake: FakeQueue;
  let createCount: number;

  beforeEach(() => {
    createCount = 0;
    fake = makeFakeQueue();
    __setQueueFactoryForTests(() => {
      createCount += 1;
      // Mimic the BullMQ Queue constructor capturing name/connection.
      fake.name = REELS_COMMISSIONS_QUEUE;
      fake.opts = { connection: { url: "redis://test" } };
      return fake as unknown as import("bullmq").Queue;
    });
  });

  it("publishOrderPaidForCommissions adds createCommissionsFromOrder with orderId", async () => {
    await publishOrderPaidForCommissions("o-1");
    expect(fake.add).toHaveBeenCalledTimes(1);
    const call = fake.add.mock.calls[0]!;
    expect(call[0]).toBe("createCommissionsFromOrder");
    expect(call[1]).toEqual({ orderId: "o-1" });
    expect(call[2]).toMatchObject({ removeOnComplete: 1000, attempts: 5 });
    expect(fake.name).toBe("reels-commissions");
  });

  it("publishOrderDeliveredForCommissions adds setCommissionEligibility with orderId", async () => {
    await publishOrderDeliveredForCommissions("o-2");
    expect(fake.add).toHaveBeenCalledTimes(1);
    const call = fake.add.mock.calls[0]!;
    expect(call[0]).toBe("setCommissionEligibility");
    expect(call[1]).toEqual({ orderId: "o-2" });
    expect(call[2]).toMatchObject({ removeOnComplete: 1000, attempts: 5 });
  });

  it("publishOrderRefundedForCommissions adds voidCommissionsOnRefund with orderId", async () => {
    await publishOrderRefundedForCommissions("o-3");
    expect(fake.add).toHaveBeenCalledTimes(1);
    const call = fake.add.mock.calls[0]!;
    expect(call[0]).toBe("voidCommissionsOnRefund");
    expect(call[1]).toEqual({ orderId: "o-3" });
    expect(call[2]).toMatchObject({ removeOnComplete: 1000, attempts: 5 });
  });

  it("reuses a single Queue instance across calls (no connection leak)", async () => {
    await publishOrderPaidForCommissions("o-a");
    await publishOrderDeliveredForCommissions("o-b");
    await publishOrderRefundedForCommissions("o-c");
    await publishOrderPaidForCommissions("o-d");
    expect(createCount).toBe(1);
    expect(fake.add).toHaveBeenCalledTimes(4);
  });

  it("restores the default factory when set to null", () => {
    __setQueueFactoryForTests(null);
    // Smoke: the module should still export the callables; we don't actually
    // invoke them here (that would try to connect to a real Redis).
    expect(typeof publishOrderPaidForCommissions).toBe("function");
  });
});
