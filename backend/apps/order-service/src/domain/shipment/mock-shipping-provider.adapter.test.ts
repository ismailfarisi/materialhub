import { describe, expect, it } from "bun:test";
import { createHmac } from "node:crypto";
import { ShipmentStatus } from "@materialhub/database/src/enums/order.enums.ts";
import { MockShippingProviderAdapter } from "./mock-shipping-provider.adapter.ts";

const adapter = new MockShippingProviderAdapter();

describe("MockShippingProviderAdapter", () => {
  it("exposes code, displayName, credentialSchema", () => {
    expect(adapter.code).toBe("mock");
    expect(adapter.displayName).toBe("Mock Provider");
    expect(adapter.credentialSchema.required).toContain("api_key");
    expect(adapter.credentialSchema.properties.api_key!.format).toBe("password");
  });

  it("verifyCredentials returns ok when api_key starts with 'test_'", async () => {
    const r = await adapter.verifyCredentials({ api_key: "test_123", warehouse_id: "wh-1" });
    expect(r.ok).toBe(true);
  });

  it("verifyCredentials returns !ok otherwise", async () => {
    const r = await adapter.verifyCredentials({ api_key: "bad", warehouse_id: "wh-1" });
    expect(r.ok).toBe(false);
    expect(r.message).toBeDefined();
  });

  it("bookShipment returns a TRK-MOCK tracking number and a fils cost", async () => {
    const res = await adapter.bookShipment(
      {
        vendorOrderId: "vo-1",
        items: [{ productName: "Widget", quantity: 2, weightGrams: 500 }],
        shippingAddress: { city: "Dubai" },
      },
      { api_key: "test_x", warehouse_id: "wh-1" },
    );
    expect(res.tracking_number.startsWith("TRK-MOCK-")).toBe(true);
    expect(res.carrier_cost_fils).toBeGreaterThan(0);
    expect(res.external_shipment_id.length).toBeGreaterThan(0);
  });

  it("verifyWebhook validates HMAC-SHA256 signature", () => {
    const secret = "shh";
    const body = JSON.stringify({ hello: "world" });
    const sig = createHmac("sha256", secret).update(body).digest("hex");
    const headers = new Headers({ "x-mock-signature": sig });
    expect(adapter.verifyWebhook(headers, body, secret)).toBe(true);
    expect(adapter.verifyWebhook(new Headers({ "x-mock-signature": "bad" }), body, secret)).toBe(
      false,
    );
    // Without a secret set, verification fails closed.
    expect(adapter.verifyWebhook(headers, body, null)).toBe(false);
  });

  it("parseWebhookEvent maps provider status to ShipmentStatus", () => {
    const body = JSON.stringify({
      event_id: "evt-1",
      shipment_id: "shp-1",
      status: "delivered",
      occurred_at: "2026-04-18T12:00:00Z",
    });
    const ev = adapter.parseWebhookEvent(body);
    expect(ev.external_event_id).toBe("evt-1");
    expect(ev.external_shipment_id).toBe("shp-1");
    expect(ev.status).toBe(ShipmentStatus.delivered);
    expect(ev.occurred_at).toBeInstanceOf(Date);
  });
});
