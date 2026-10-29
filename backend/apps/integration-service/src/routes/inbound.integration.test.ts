import { describe, expect, it, mock } from "bun:test";
import { IntegrationAuthority, IntegrationDirection } from "@materialhub/database";
import { Elysia, t } from "elysia";
import { sign } from "../domain/dispatcher/signer.ts";
import { InboundService } from "../domain/inbound/inbound.service.ts";

const SECRET = "test-inbound-secret";

const encryption = {
  encrypt: (s: string) => `enc(${s})`,
  decrypt: (s: string) => s.replace(/^enc\(/, "").replace(/\)$/, ""),
} as any;

function buildApp({ flagEnabled = true } = {}) {
  const siteSettingRepo = {
    findOne: mock((_opts?: unknown) => Promise.resolve({ value: flagEnabled ? "true" : "false" })),
  };

  const integ = {
    id: "i1",
    vendor_id: "v1",
    inbound_secret_encrypted: `enc(${SECRET})`,
    inbound_ip_allowlist: [] as string[],
    inventory_authority: IntegrationAuthority.advisory,
    pricing_authority: IntegrationAuthority.advisory,
    is_active: true,
    deleted_at: null,
  };

  const integrationRepo = {
    findOne: mock(() => Promise.resolve(integ)),
    update: mock(() => Promise.resolve({ affected: 1 })),
  };
  const mappingRepo = {
    findOne: mock(() =>
      Promise.resolve({
        spec: {
          version: 1,
          fields: [{ target: "vendor_order_id", source: "ext_id" }],
        },
        direction: IntegrationDirection.inbound,
      }),
    ),
  };
  const deliveryRepo = {
    findOne: mock(() => Promise.resolve(null)),
    save: mock((v: any) => Promise.resolve({ id: "d1", ...v })),
    update: mock(() => Promise.resolve({ affected: 1 })),
  };
  const pendingWrites = { stage: mock(() => Promise.resolve({ id: "pw1" })) };
  const domainDispatch = { call: mock(() => Promise.resolve({ status: 200, body: "ok" })) };

  const inboundService = new InboundService({
    integrationRepo: integrationRepo as any,
    mappingRepo: mappingRepo as any,
    deliveryRepo: deliveryRepo as any,
    pendingWrites: pendingWrites as any,
    domainDispatch: domainDispatch as any,
    encryption,
  });

  const app = new Elysia({ prefix: "/integrations/inbound" }).post(
    "/:id/:event_type",
    async ({ params, request, set }: any) => {
      const flag = await siteSettingRepo.findOne({
        where: { key: "vendor_integrations_inbound_enabled" },
      });
      if (flag?.value !== "true") {
        set.status = 503;
        return { statusCode: 503, error: "INBOUND_DISABLED" };
      }

      const rawBody = await request.text();
      const headers: Record<string, string> = {};
      request.headers.forEach((v: string, k: string) => {
        headers[k] = v;
      });
      const sourceIp = headers["x-forwarded-for"]?.split(",")[0]?.trim() ?? "0.0.0.0";
      const result = await inboundService.handle({
        integrationId: params.id,
        eventType: params.event_type,
        sourceIp,
        headers,
        rawBody,
      });
      set.status = result.status;
      return result.body;
    },
    { params: t.Object({ id: t.String(), event_type: t.String() }) },
  );

  return { app, domainDispatch, pendingWrites, siteSettingRepo };
}

describe("POST /integrations/inbound/:id/:event_type", () => {
  it("returns 401 on bad signature", async () => {
    const { app } = buildApp();
    const res = await app.handle(
      new Request("http://localhost/integrations/inbound/i1/order.accept", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-signature": "sha256=deadbeef",
          "x-timestamp": Math.floor(Date.now() / 1000).toString(),
        },
        body: JSON.stringify({ ext_id: "VO-1" }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("dispatches when signature is valid (non-DE event)", async () => {
    const { app, domainDispatch } = buildApp();
    const body = JSON.stringify({ ext_id: "VO-1" });
    const ts = Math.floor(Date.now() / 1000).toString();
    const sig = `sha256=${sign(SECRET, ts, body)}`;
    const res = await app.handle(
      new Request("http://localhost/integrations/inbound/i1/order.accept", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-signature": sig,
          "x-timestamp": ts,
        },
        body,
      }),
    );
    expect(res.status).toBe(200);
    expect(domainDispatch.call).toHaveBeenCalled();
  });

  it("returns 503 when inbound flag is disabled", async () => {
    const { app } = buildApp({ flagEnabled: false });
    const res = await app.handle(
      new Request("http://localhost/integrations/inbound/i1/order.accept", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ext_id: "VO-1" }),
      }),
    );
    expect(res.status).toBe(503);
  });
});
