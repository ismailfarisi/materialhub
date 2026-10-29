import { describe, expect, it } from "bun:test";
import { startMockVendorServer } from "../../test-helpers/mock-vendor-server.ts";
import { DomainDispatch } from "./domain-dispatch.ts";

describe("DomainDispatch", () => {
  it("calls the right path for shipment.create with internal JWT", async () => {
    const mock = startMockVendorServer({ respondWith: { status: 200, body: '{"ok":true}' } });
    process.env.INTERNAL_SERVICE_SECRET = "test-secret";
    const dispatch = new DomainDispatch({
      orderHost: mock.url,
      productHost: mock.url,
    });
    const r = await dispatch.call({
      eventType: "shipment.create" as any,
      vendorId: "v1",
      payload: { vendor_order_id: "vo1", tracking_number: "T1", carrier: "x", items: [] },
    });
    expect(r.status).toBe(200);
    const req = mock.requests[0];
    if (!req) throw new Error("expected captured request");
    expect(req.url).toContain("/internal/shipments");
    expect(req.headers.authorization).toMatch(/^Bearer /);
    mock.stop();
  });

  it("propagates 4xx errors", async () => {
    const mock = startMockVendorServer({ respondWith: { status: 422, body: '{"error":"bad"}' } });
    process.env.INTERNAL_SERVICE_SECRET = "s";
    const dispatch = new DomainDispatch({ orderHost: mock.url, productHost: mock.url });
    const r = await dispatch.call({
      eventType: "order.accept" as any,
      vendorId: "v1",
      payload: { vendor_order_id: "vo1" },
    });
    expect(r.status).toBe(422);
    expect(r.body).toContain("bad");
    mock.stop();
  });
});
