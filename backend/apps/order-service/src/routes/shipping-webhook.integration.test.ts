import { describe, expect, it, mock } from "bun:test";
import { createHmac } from "node:crypto";
import { ShipmentStatus } from "@materialhub/database/src/enums/order.enums.ts";
import { Elysia, t } from "elysia";
import { MockShippingProviderAdapter } from "../domain/shipment/mock-shipping-provider.adapter.ts";
import { ShippingProviderRegistry } from "../domain/shipment/shipping-provider-adapter.ts";

const ok = (data: unknown, status = 200) => ({
  statusCode: status,
  data,
  timestamp: new Date().toISOString(),
});
const errResp = (status: number, error: string, message: string) => ({
  statusCode: status,
  error,
  message,
  timestamp: new Date().toISOString(),
});

function buildApp({
  providerIsActive = true,
  secretPlain = "secret-1234567890abcdef",
  shipments = [{ id: "shp-1", external_shipment_id: "shp-1", tracking_number: "TRK-1" }],
  shipmentTrackingService = {
    processWebhookEvent: mock(async () => undefined),
  },
}) {
  const registry = new ShippingProviderRegistry();
  registry.register(new MockShippingProviderAdapter());

  const providerRepo = {
    findOne: mock(async (opts: any) => {
      if (opts.where.code !== "mock") return null;
      return {
        id: "p-1",
        code: "mock",
        is_active: providerIsActive,
        webhook_secret_encrypted: `enc:${secretPlain}`,
      };
    }),
  };
  const shipmentRepo = {
    findOne: mock(
      async (opts: any) =>
        shipments.find((s) => s.external_shipment_id === opts?.where?.external_shipment_id) ?? null,
    ),
  };
  const encryption = { decrypt: (s: string) => s.replace(/^enc:/, "") };

  return new Elysia()
    .decorate("shippingProviderRepo", providerRepo as any)
    .decorate("shipmentRepo", shipmentRepo as any)
    .decorate("shipmentTrackingService", shipmentTrackingService as any)
    .decorate("shippingProviderRegistry", registry)
    .decorate("encryption", encryption as any)
    .post(
      "/webhooks/shipping/:provider_code",
      async ({
        params,
        request,
        shippingProviderRepo,
        shippingProviderRegistry,
        shipmentRepo,
        shipmentTrackingService,
        encryption,
        set,
      }: any) => {
        const provider = await shippingProviderRepo.findOne({
          where: { code: params.provider_code },
        });
        if (!provider || !provider.is_active) {
          set.status = 404;
          return errResp(404, "PROVIDER_NOT_FOUND", "Provider not available");
        }
        const adapter = shippingProviderRegistry.get(params.provider_code);
        if (!adapter) {
          set.status = 404;
          return errResp(404, "ADAPTER_NOT_REGISTERED", "Adapter not registered");
        }
        const rawBody = await request.text();
        const secret = provider.webhook_secret_encrypted
          ? encryption.decrypt(provider.webhook_secret_encrypted)
          : null;
        if (!adapter.verifyWebhook(request.headers, rawBody, secret)) {
          set.status = 401;
          return errResp(401, "INVALID_SIGNATURE", "Webhook signature failed");
        }
        const event = adapter.parseWebhookEvent(rawBody);
        const shipment = await shipmentRepo.findOne({
          where: { external_shipment_id: event.external_shipment_id },
        });
        if (!shipment) {
          set.status = 202;
          return ok({ ingested: false, reason: "unknown_shipment" });
        }
        await shipmentTrackingService.processWebhookEvent({
          tracking_number: shipment.tracking_number ?? event.external_shipment_id,
          provider_id: provider.id,
          external_event_id: event.external_event_id,
          status: event.status,
          location: event.location ?? undefined,
          description: event.description ?? undefined,
          occurred_at: event.occurred_at.toISOString(),
          raw_payload: event.raw,
        });
        return ok({ ingested: true });
      },
      { params: t.Object({ provider_code: t.String() }) },
    );
}

function sign(secret: string, body: string) {
  return createHmac("sha256", secret).update(body).digest("hex");
}

describe("shipping-webhook.routes", () => {
  const body = JSON.stringify({
    event_id: "evt-1",
    shipment_id: "shp-1",
    status: "delivered",
    occurred_at: "2026-04-18T12:00:00Z",
  });

  it("ingests a valid event through shipment status processing", async () => {
    const secret = "secret-1234567890abcdef";
    const shipmentTrackingService = {
      processWebhookEvent: mock(async () => undefined),
    };
    const app = buildApp({ shipmentTrackingService });
    const res = await app.handle(
      new Request("http://localhost/webhooks/shipping/mock", {
        method: "POST",
        headers: { "x-mock-signature": sign(secret, body), "content-type": "application/json" },
        body,
      }),
    );
    expect(res.status).toBe(200);
    expect(shipmentTrackingService.processWebhookEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        tracking_number: "TRK-1",
        provider_id: "p-1",
        external_event_id: "evt-1",
        status: ShipmentStatus.delivered,
        occurred_at: "2026-04-18T12:00:00.000Z",
      }),
    );
  });

  it("returns 401 on bad signature", async () => {
    const app = buildApp({});
    const res = await app.handle(
      new Request("http://localhost/webhooks/shipping/mock", {
        method: "POST",
        headers: { "x-mock-signature": "deadbeef", "content-type": "application/json" },
        body,
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 202 for unknown external_shipment_id", async () => {
    const secret = "secret-1234567890abcdef";
    const shipmentTrackingService = {
      processWebhookEvent: mock(async () => undefined),
    };
    const app = buildApp({ shipments: [], shipmentTrackingService });
    const res = await app.handle(
      new Request("http://localhost/webhooks/shipping/mock", {
        method: "POST",
        headers: { "x-mock-signature": sign(secret, body), "content-type": "application/json" },
        body,
      }),
    );
    expect(res.status).toBe(202);
    const j = (await res.json()) as any;
    expect(j.data.ingested).toBe(false);
    expect(shipmentTrackingService.processWebhookEvent).not.toHaveBeenCalled();
  });

  it("returns 404 for inactive provider", async () => {
    const app = buildApp({ providerIsActive: false });
    const res = await app.handle(
      new Request("http://localhost/webhooks/shipping/mock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      }),
    );
    expect(res.status).toBe(404);
  });
});
