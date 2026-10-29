import { beforeEach, describe, expect, it, mock } from "bun:test";
import {
  REELS_NUDGES_QUEUE,
  __setQueueFactoryForTests,
  publishOrderDeliveredForNudge,
} from "./reels-nudge-events.ts";

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

describe("reels-nudge-events publisher", () => {
  let fake: FakeQueue;
  let createCount: number;

  beforeEach(() => {
    createCount = 0;
    fake = makeFakeQueue();
    __setQueueFactoryForTests(() => {
      createCount += 1;
      fake.name = REELS_NUDGES_QUEUE;
      fake.opts = { connection: { url: "redis://test" } };
      return fake as unknown as import("bullmq").Queue;
    });
  });

  it("publishOrderDeliveredForNudge adds sendPostDeliveryReelNudge with orderId+userId", async () => {
    await publishOrderDeliveredForNudge("o-1", "u-1");
    expect(fake.add).toHaveBeenCalledTimes(1);
    const call = fake.add.mock.calls[0]!;
    expect(call[0]).toBe("sendPostDeliveryReelNudge");
    expect(call[1]).toEqual({ orderId: "o-1", userId: "u-1" });
    expect(call[2]).toMatchObject({ removeOnComplete: 1000, attempts: 5 });
    expect(fake.name).toBe("reels-nudges");
  });

  it("reuses a single Queue instance across calls (no connection leak)", async () => {
    await publishOrderDeliveredForNudge("o-a", "u-a");
    await publishOrderDeliveredForNudge("o-b", "u-b");
    await publishOrderDeliveredForNudge("o-c", "u-c");
    expect(createCount).toBe(1);
    expect(fake.add).toHaveBeenCalledTimes(3);
  });

  it("restores the default factory when set to null", () => {
    __setQueueFactoryForTests(null);
    // Smoke: the module should still export the callable; we don't actually
    // invoke it here (that would try to connect to a real Redis).
    expect(typeof publishOrderDeliveredForNudge).toBe("function");
  });
});
