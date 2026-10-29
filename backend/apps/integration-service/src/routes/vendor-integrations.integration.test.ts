import { describe, expect, it, mock } from "bun:test";
import { Elysia, t } from "elysia";
import { IntegrationController } from "../domain/integration/integration.controller.ts";
import { IntegrationService } from "../domain/integration/integration.service.ts";

const ok = (data: unknown, status = 200) => ({
  statusCode: status,
  data,
  timestamp: new Date().toISOString(),
});

const encryptionStub = {
  encrypt: (s: string) => `enc(${s})`,
  decrypt: (s: string) => s.replace(/^enc\(/, "").replace(/\)$/, ""),
  encryptObject: (o: any) => `enc(${JSON.stringify(o)})`,
  decryptObject: (s: string) => JSON.parse(s.replace(/^enc\(/, "").replace(/\)$/, "")),
};

function buildApp({
  // Phase 3a: vendor owners carry role="customer" + vm JWT claim
  user = { id: "u-1", role: "customer", vendor_id: "v-1" } as any,
  rows = [] as any[],
} = {}) {
  const integrationRepo = {
    find: mock(async (opts: any) =>
      rows.filter((r) => r.vendor_id === opts?.where?.vendor_id && !r.deleted_at),
    ),
    findOne: mock(
      async (opts: any) =>
        rows.find(
          (r) =>
            r.id === opts?.where?.id && r.vendor_id === opts?.where?.vendor_id && !r.deleted_at,
        ) ?? null,
    ),
    save: mock(async (row: any) => {
      const id = row.id ?? `int-${rows.length + 1}`;
      const next = {
        ...row,
        id,
        deleted_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      rows.push(next);
      return next;
    }),
    update: mock(async () => ({ affected: 1 })),
    softDelete: mock(async () => ({ affected: 1 })),
  };

  const svc = new IntegrationService(integrationRepo as any, encryptionStub as any);
  const controller = new IntegrationController(svc);

  return new Elysia()
    .decorate("integrationController", controller)
    .derive(() => ({ user }))
    .post(
      "/vendor/integrations",
      async ({ body, user, integrationController, set }: any) => {
        const result = await integrationController.create(user.vendor_id, body);
        set.status = 201;
        return ok(
          {
            ...result.integration,
            inbound_secret_plaintext: result.inbound_secret_plaintext,
            outbound_secret_plaintext: result.outbound_secret_plaintext,
            inbound_url: `/integrations/inbound/${result.integration.id}`,
          },
          201,
        );
      },
      {
        body: t.Object({
          name: t.String({ minLength: 1, maxLength: 255 }),
          outbound_url: t.Optional(t.Union([t.String(), t.Null()])),
        }),
      },
    )
    .get("/vendor/integrations", async ({ user, integrationController }: any) =>
      ok(await integrationController.list(user.vendor_id)),
    );
}

describe("POST /vendor/integrations", () => {
  it("creates and returns inbound + outbound secrets once", async () => {
    const app = buildApp();
    const res = (await app
      .handle(
        new Request("http://localhost/vendor/integrations", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "test-int", outbound_url: "https://example.com/hook" }),
        }),
      )
      .then((r) => r.json())) as any;

    expect(res.statusCode).toBe(201);
    expect(res.data.inbound_secret_plaintext).toMatch(/^[a-f0-9]{64}$/);
    expect(res.data.outbound_secret_plaintext).toMatch(/^[a-f0-9]{64}$/);
    expect(res.data.inbound_url).toBe(`/integrations/inbound/${res.data.id}`);
    expect(res.data.name).toBe("test-int");
  });
});

describe("GET /vendor/integrations", () => {
  it("returns the vendor's integrations only", async () => {
    const app = buildApp({
      rows: [
        { id: "a", vendor_id: "v-1", name: "mine", deleted_at: null },
        { id: "b", vendor_id: "v-2", name: "other", deleted_at: null },
      ],
    });
    const res = (await app
      .handle(new Request("http://localhost/vendor/integrations"))
      .then((r) => r.json())) as any;
    expect(res.statusCode).toBe(200);
    expect(res.data.map((r: any) => r.id)).toEqual(["a"]);
  });
});
