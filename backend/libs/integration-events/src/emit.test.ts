import { describe, expect, it, mock } from "bun:test";
import type { Queue } from "bullmq";
import { emitIntegrationEvent } from "./emit.ts";

describe("emitIntegrationEvent", () => {
  it("calls queue.add with the right job name and payload", async () => {
    const add = mock(() => Promise.resolve());
    const queue = { add } as unknown as Queue;
    await emitIntegrationEvent(queue, {
      event_type: "vendor_order.created" as any,
      vendor_id: "v1",
      payload: { foo: "bar" },
      source_ref: { vendor_order_id: "vo1" },
      schema_version: 1,
    });
    expect(add).toHaveBeenCalledWith("emit", {
      event_type: "vendor_order.created",
      vendor_id: "v1",
      payload: { foo: "bar" },
      source_ref: { vendor_order_id: "vo1" },
      schema_version: 1,
    });
  });
});
