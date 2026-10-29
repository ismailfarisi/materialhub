import { afterEach, describe, expect, it } from "bun:test";
import { IntegrationEventType } from "@materialhub/database";
import { startMockVendorServer } from "../../test-helpers/mock-vendor-server.ts";
import { DispatcherService } from "./dispatcher.service.ts";

describe("DispatcherService.dispatchOutbound", () => {
  let mock: ReturnType<typeof startMockVendorServer>;
  afterEach(() => mock?.stop());

  it("posts a signed body shaped by the mapping spec", async () => {
    mock = startMockVendorServer();
    const integration = {
      id: "i1",
      vendor_id: "v1",
      outbound_url: mock.url,
      outbound_secret: "secret123",
    };
    const mapping = {
      spec: {
        version: 1,
        fields: [{ target: "external_id", source: "vendor_order.vendor_order_number" }],
      },
    };
    const dispatcher = new DispatcherService();
    const result = await dispatcher.dispatchOutbound({
      integration,
      mapping,
      eventType: IntegrationEventType.vendor_order_created,
      sourceContext: { vendor_order: { vendor_order_number: "VO-1" } },
      sourceRef: { vendor_order_id: "vo1" },
    });

    expect(result.status).toBe("delivered");
    expect(result.responseStatus).toBe(200);
    expect(mock.requests.length).toBe(1);
    const req = mock.requests[0];
    if (!req) throw new Error("expected captured request");
    expect(JSON.parse(req.body)).toEqual({ external_id: "VO-1" });
    expect(req.headers["x-signature"]).toMatch(/^sha256=/);
    expect(req.headers["x-event-type"]).toBe(IntegrationEventType.vendor_order_created);
    expect(req.headers["x-idempotency-key"]).toBeTruthy();
  });

  it("returns failed on 5xx", async () => {
    mock = startMockVendorServer({ respondWith: { status: 500, body: "boom" } });
    const dispatcher = new DispatcherService();
    const result = await dispatcher.dispatchOutbound({
      integration: { id: "i1", vendor_id: "v1", outbound_url: mock.url, outbound_secret: "s" },
      mapping: { spec: { version: 1, fields: [] } },
      eventType: IntegrationEventType.vendor_order_created,
      sourceContext: {},
      sourceRef: {},
    });
    expect(result.status).toBe("failed");
    expect(result.responseStatus).toBe(500);
  });
});
