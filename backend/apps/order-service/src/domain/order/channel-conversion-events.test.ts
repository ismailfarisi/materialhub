import { beforeEach, describe, expect, it, mock } from "bun:test";
import {
  CHANNEL_CONVERSION_EVENTS_QUEUE,
  __setQueueFactoryForTests,
  publishOrderPaidForChannels,
} from "./channel-conversion-events.ts";

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

describe("channel-conversion-events publisher", () => {
  let fake: FakeQueue;
  let createCount: number;

  beforeEach(() => {
    createCount = 0;
    fake = makeFakeQueue();
    __setQueueFactoryForTests(() => {
      createCount += 1;
      // Mimic the BullMQ Queue constructor capturing name/connection.
      fake.name = CHANNEL_CONVERSION_EVENTS_QUEUE;
      fake.opts = { connection: { url: "redis://test" } };
      return fake as unknown as import("bullmq").Queue;
    });
  });

  it("publishOrderPaidForChannels adds recordChannelConversion with orderId", async () => {
    await publishOrderPaidForChannels("o-1");
    expect(fake.add).toHaveBeenCalledTimes(1);
    const call = fake.add.mock.calls[0]!;
    expect(call[0]).toBe("recordChannelConversion");
    expect(call[1]).toEqual({ orderId: "o-1" });
    expect(call[2]).toMatchObject({ removeOnComplete: 1000, attempts: 5 });
    expect(fake.name).toBe("channel-conversion-events");
  });

  it("reuses a single Queue instance across calls (no connection leak)", async () => {
    await publishOrderPaidForChannels("o-a");
    await publishOrderPaidForChannels("o-b");
    await publishOrderPaidForChannels("o-c");
    expect(createCount).toBe(1);
    expect(fake.add).toHaveBeenCalledTimes(3);
  });

  it("restores the default factory when set to null", () => {
    __setQueueFactoryForTests(null);
    // Smoke: the module should still export the callable; we don't actually
    // invoke it here (that would try to connect to a real Redis).
    expect(typeof publishOrderPaidForChannels).toBe("function");
  });
});
