import { describe, expect, it, mock } from "bun:test";
import { IntegrationAuthority, IntegrationEventType } from "@materialhub/database";
import { InboundService } from "./inbound.service.ts";

const integ = {
  id: "i1",
  vendor_id: "v1",
  inbound_secret_encrypted: "enc(secret123)",
  inbound_ip_allowlist: [] as string[],
  inventory_authority: IntegrationAuthority.advisory,
  pricing_authority: IntegrationAuthority.advisory,
  is_active: true,
  deleted_at: null,
};

const encryption = {
  encrypt: (s: string) => `enc(${s})`,
  decrypt: (s: string) => s.replace(/^enc\(/, "").replace(/\)$/, ""),
} as any;

const buildDeps = () => ({
  integrationRepo: {
    findOne: mock(() => Promise.resolve(integ)),
    update: mock(() => Promise.resolve({ affected: 1 })),
  } as any,
  mappingRepo: {
    findOne: mock(() =>
      Promise.resolve({
        spec: { version: 1, fields: [{ target: "vendor_order_id", source: "ext_id" }] },
      }),
    ),
  } as any,
  deliveryRepo: {
    findOne: mock(() => Promise.resolve(null)),
    save: mock((v: any) => Promise.resolve({ id: "d1", ...v })),
    update: mock(() => Promise.resolve({ affected: 1 })),
  } as any,
  pendingWrites: { stage: mock(() => Promise.resolve({ id: "pw1" })) } as any,
  domainDispatch: { call: mock(() => Promise.resolve({ status: 200, body: "ok" })) } as any,
  encryption,
});

import { sign } from "../dispatcher/signer.ts";

describe("InboundService.handle", () => {
  it("rejects on invalid signature", async () => {
    const deps = buildDeps();
    const svc = new InboundService(deps as any);
    const body = '{"ext_id":"VO-1"}';
    const r = await svc.handle({
      integrationId: "i1",
      eventType: IntegrationEventType.order_accept,
      sourceIp: "1.2.3.4",
      headers: {
        "x-signature": "sha256=deadbeef",
        "x-timestamp": Math.floor(Date.now() / 1000).toString(),
      },
      rawBody: body,
    });
    expect(r.status).toBe(401);
  });

  it("dispatches when signature valid and event is non-DE", async () => {
    const deps = buildDeps();
    const svc = new InboundService(deps as any);
    const body = JSON.stringify({ ext_id: "VO-1" });
    const ts = Math.floor(Date.now() / 1000).toString();
    const sig = `sha256=${sign("secret123", ts, body)}`;
    const r = await svc.handle({
      integrationId: "i1",
      eventType: IntegrationEventType.order_accept,
      sourceIp: "1.2.3.4",
      headers: { "x-signature": sig, "x-timestamp": ts },
      rawBody: body,
    });
    expect(r.status).toBe(200);
    expect(deps.domainDispatch.call).toHaveBeenCalled();
  });

  it("stages D event when in advisory mode", async () => {
    const deps = buildDeps();
    deps.mappingRepo.findOne = mock(() =>
      Promise.resolve({
        spec: {
          version: 1,
          fields: [
            { target: "product_id", source: "pid" },
            { target: "delta", source: "qty" },
            { target: "change_id", source: "cid" },
          ],
        },
      }),
    );
    const svc = new InboundService(deps as any);
    const body = JSON.stringify({ pid: "p1", qty: 50, cid: "c1" });
    const ts = Math.floor(Date.now() / 1000).toString();
    const sig = `sha256=${sign("secret123", ts, body)}`;
    const r = await svc.handle({
      integrationId: "i1",
      eventType: IntegrationEventType.inventory_adjust,
      sourceIp: "1.2.3.4",
      headers: { "x-signature": sig, "x-timestamp": ts },
      rawBody: body,
    });
    expect(r.status).toBe(202);
    expect(deps.pendingWrites.stage).toHaveBeenCalled();
    expect(deps.domainDispatch.call).not.toHaveBeenCalled();
  });
});
