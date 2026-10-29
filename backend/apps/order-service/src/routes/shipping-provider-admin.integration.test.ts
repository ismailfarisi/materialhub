import { afterEach, describe, expect, it, mock } from "bun:test";
import { Elysia, t } from "elysia";

type Row = {
  id: string;
  code: string;
  display_name: string;
  description: string | null;
  logo_url: string | null;
  credential_schema: Record<string, unknown>;
  supported_regions: string[];
  webhook_secret_encrypted: string | null;
  is_active: boolean;
  sort_order: number;
  deleted_at: Date | null;
};

type PlatformAccount = {
  id: string;
  vendor_id: string | null;
  provider_id: string;
  display_name: string;
  credentials_encrypted: string;
  credentials_last4: string | null;
  is_active: boolean;
  is_verified: boolean;
  verified_at: Date | null;
  last_verify_error: string | null;
  deleted_at: Date | null;
};

function makeRow(o: Partial<Row> = {}): Row {
  return {
    id: o.id ?? "p-1",
    code: o.code ?? "mock",
    display_name: o.display_name ?? "Mock Provider",
    description: null,
    logo_url: null,
    credential_schema: { type: "object", required: [], properties: {} },
    supported_regions: [],
    webhook_secret_encrypted: null,
    is_active: false,
    sort_order: 0,
    deleted_at: null,
    ...o,
  };
}

const ok = (data: unknown, status = 200) => ({
  statusCode: status,
  data,
  timestamp: new Date().toISOString(),
});
const err = (status: number, error: string, message: string) => ({
  statusCode: status,
  error,
  message,
  timestamp: new Date().toISOString(),
});

function platformAccountPayload(account: any) {
  const { credentials_encrypted: _, ...safe } = account;
  return safe;
}

function postaplusCredentialsFromEnv(): {
  credentials: Record<string, string>;
  missing: string[];
} {
  const credentials: Record<string, string> = {
    partner_key: process.env.POSTAPLUS_PARTNER_KEY ?? "",
    tenant: process.env.POSTAPLUS_TENANT ?? "",
    customer: process.env.POSTAPLUS_CUSTOMER ?? "",
    created_by: process.env.POSTAPLUS_CREATED_BY ?? "",
  };
  const optional: Record<string, string | undefined> = {
    base_url: process.env.POSTAPLUS_BASE_URL,
    shipment_type: process.env.POSTAPLUS_SHIPMENT_TYPE,
    package_type: process.env.POSTAPLUS_PACKAGE_TYPE,
    service: process.env.POSTAPLUS_SERVICE,
    vehicle: process.env.POSTAPLUS_VEHICLE,
    pickup_type: process.env.POSTAPLUS_PICKUP_TYPE,
  };
  for (const [key, value] of Object.entries(optional)) {
    if (value) credentials[key] = value;
  }
  const missing = ["partner_key", "tenant", "customer", "created_by"].filter(
    (key) => !credentials[key],
  );
  return { credentials, missing };
}

const ALLOWED = new Set([
  "display_name",
  "description",
  "logo_url",
  "supported_regions",
  "sort_order",
  "is_active",
  "webhook_secret",
]);

function buildApp(rows: Row[], accounts: PlatformAccount[] = []) {
  const repo = {
    find: mock(async () => rows.filter((r) => !r.deleted_at)),
    findOne: mock(async (opts: any) => rows.find((r) => r.id === opts?.where?.id) ?? null),
    save: mock(async (r: any) => {
      const idx = rows.findIndex((x) => x.id === r.id);
      if (idx >= 0) rows[idx] = { ...rows[idx], ...r };
      return r;
    }),
    createQueryBuilder: mock(() => ({
      where: function () {
        return this;
      },
      orderBy: function () {
        return this;
      },
      addOrderBy: function () {
        return this;
      },
      getMany: async () => rows.filter((r) => !r.deleted_at),
    })),
  };
  const accountRepo = {
    count: mock(async (_opts: any) => 0),
    findOne: mock(async (opts: any) => {
      if (opts?.where?.vendor_id !== null) return null;
      return (
        accounts.find((a) => a.provider_id === opts?.where?.provider_id && !a.deleted_at) ?? null
      );
    }),
    save: mock(async (account: any) => {
      const saved = {
        id: account.id ?? `acc-${accounts.length + 1}`,
        deleted_at: null,
        ...account,
      } as PlatformAccount;
      const idx = accounts.findIndex((a) => a.id === saved.id);
      if (idx >= 0) accounts[idx] = { ...accounts[idx], ...saved };
      else accounts.push(saved);
      return saved;
    }),
  };
  const encryption = {
    encrypt: mock((s: string) => `enc:${s}`),
    decrypt: mock((s: string) => s.replace(/^enc:/, "")),
    encryptObject: mock((o: Record<string, unknown>) => `enc:${JSON.stringify(o)}`),
  };

  return new Elysia()
    .decorate("shippingProviderRepo", repo as any)
    .decorate("vendorCarrierAccountRepo", accountRepo as any)
    .decorate("encryption", encryption as any)
    .derive(() => ({ user: { id: "admin-1", role: "admin" } }))
    .get(
      "/admin/shipping-providers",
      async ({ shippingProviderRepo, vendorCarrierAccountRepo }: any) => {
        const providers = await shippingProviderRepo
          .createQueryBuilder("p")
          .orderBy("p.sort_order", "ASC")
          .addOrderBy("p.display_name", "ASC")
          .getMany();
        const withCounts = await Promise.all(
          providers.map(async (p: any) => ({
            ...p,
            vendor_account_count: await vendorCarrierAccountRepo.count({
              where: { provider_id: p.id, deleted_at: null },
            }),
          })),
        );
        return ok(withCounts);
      },
    )
    .get(
      "/admin/shipping-providers/:id",
      async ({ params, shippingProviderRepo, set }: any) => {
        const row = await shippingProviderRepo.findOne({
          where: { id: params.id },
        });
        if (!row) {
          set.status = 404;
          return err(404, "NOT_FOUND", `Provider '${params.id}' not found`);
        }
        return ok(row);
      },
      { params: t.Object({ id: t.String() }) },
    )
    .patch(
      "/admin/shipping-providers/:id",
      async ({ params, body, shippingProviderRepo, encryption, set }: any) => {
        const row = await shippingProviderRepo.findOne({
          where: { id: params.id },
        });
        if (!row) {
          set.status = 404;
          return err(404, "NOT_FOUND", `Provider '${params.id}' not found`);
        }
        const patch: any = {};
        for (const [k, v] of Object.entries(body)) {
          if (!ALLOWED.has(k)) continue;
          if (k === "webhook_secret" && typeof v === "string") {
            patch.webhook_secret_encrypted = encryption.encrypt(v);
          } else {
            patch[k] = v;
          }
        }
        Object.assign(row, patch);
        await shippingProviderRepo.save(row);
        return ok(row);
      },
      {
        params: t.Object({ id: t.String() }),
        body: t.Object({
          display_name: t.Optional(t.String({ minLength: 1 })),
          description: t.Optional(t.Union([t.String(), t.Null()])),
          logo_url: t.Optional(t.Union([t.String(), t.Null()])),
          supported_regions: t.Optional(t.Array(t.String())),
          sort_order: t.Optional(t.Integer({ minimum: 0 })),
          is_active: t.Optional(t.Boolean()),
          webhook_secret: t.Optional(t.String({ minLength: 16 })),
        }),
      },
    )
    .post(
      "/admin/shipping-providers/:id/rotate-webhook-secret",
      async ({ params, shippingProviderRepo, encryption, set }: any) => {
        const row = await shippingProviderRepo.findOne({
          where: { id: params.id },
        });
        if (!row) {
          set.status = 404;
          return err(404, "NOT_FOUND", `Provider '${params.id}' not found`);
        }
        const { randomBytes } = await import("node:crypto");
        const plaintext = randomBytes(32).toString("hex");
        row.webhook_secret_encrypted = encryption.encrypt(plaintext);
        await shippingProviderRepo.save(row);
        return ok({ webhook_secret: plaintext });
      },
      { params: t.Object({ id: t.String() }) },
    )
    .post(
      "/admin/shipping-providers/:id/platform-account/sync",
      async ({ params, shippingProviderRepo, vendorCarrierAccountRepo, encryption, set }: any) => {
        const row = await shippingProviderRepo.findOne({
          where: { id: params.id },
        });
        if (!row) {
          set.status = 404;
          return err(404, "NOT_FOUND", `Provider '${params.id}' not found`);
        }
        if (row.code !== "postaplus") {
          set.status = 409;
          return err(
            409,
            "UNSUPPORTED_PROVIDER",
            "Platform credential sync is currently supported for PostaPlus only",
          );
        }

        const { credentials, missing } = postaplusCredentialsFromEnv();
        if (missing.length) {
          set.status = 422;
          return err(422, "MISSING_CREDENTIALS", `Missing env credentials: ${missing.join(", ")}`);
        }

        if (!row.is_active) {
          row.is_active = true;
          await shippingProviderRepo.save(row);
        }

        const existing = await vendorCarrierAccountRepo.findOne({
          where: { vendor_id: null, provider_id: row.id },
        });
        const partnerKey = credentials.partner_key ?? "";
        const patch = {
          vendor_id: null,
          provider_id: row.id,
          display_name: "MaterialHub PostaPlus (platform default)",
          credentials_encrypted: encryption.encryptObject(credentials),
          credentials_last4: partnerKey.slice(-4),
          is_active: true,
          is_verified: true,
          verified_at: new Date(),
          last_verify_error: null,
        };
        const saved = existing
          ? await vendorCarrierAccountRepo.save({ ...existing, ...patch })
          : await vendorCarrierAccountRepo.save(patch);
        return ok({
          created: !existing,
          account: platformAccountPayload(saved),
        });
      },
      { params: t.Object({ id: t.String() }) },
    );
}

describe("shipping-provider-admin.routes", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("GET /admin/shipping-providers lists providers with account counts", async () => {
    const rows = [makeRow({ id: "p1", code: "mock" })];
    const app = buildApp(rows);
    const res = await app.handle(new Request("http://localhost/admin/shipping-providers"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.data.length).toBe(1);
    expect(body.data[0].vendor_account_count).toBe(0);
  });

  it("GET /admin/shipping-providers/:id returns 404 when missing", async () => {
    const app = buildApp([]);
    const res = await app.handle(new Request("http://localhost/admin/shipping-providers/missing"));
    expect(res.status).toBe(404);
  });

  it("PATCH /admin/shipping-providers/:id only writes allowlisted fields", async () => {
    const rows = [makeRow({ id: "p1" })];
    const app = buildApp(rows);
    const res = await app.handle(
      new Request("http://localhost/admin/shipping-providers/p1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          display_name: "Renamed",
          is_active: true,
          code: "hacked",
          credential_schema: { evil: true },
        } as any),
      }),
    );
    expect(res.status).toBe(200);
    expect(rows[0]!.display_name).toBe("Renamed");
    expect(rows[0]!.is_active).toBe(true);
    expect(rows[0]!.code).toBe("mock");
    expect(rows[0]!.credential_schema).toEqual({
      type: "object",
      required: [],
      properties: {},
    });
  });

  it("PATCH /admin/shipping-providers/:id stores webhook_secret encrypted", async () => {
    const rows = [makeRow({ id: "p1" })];
    const app = buildApp(rows);
    await app.handle(
      new Request("http://localhost/admin/shipping-providers/p1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ webhook_secret: "super-secret-1234" }),
      }),
    );
    expect(rows[0]!.webhook_secret_encrypted).toBe("enc:super-secret-1234");
  });

  it("POST /admin/shipping-providers/:id/rotate-webhook-secret returns plaintext once", async () => {
    const rows = [makeRow({ id: "p1" })];
    const app = buildApp(rows);
    const res = await app.handle(
      new Request("http://localhost/admin/shipping-providers/p1/rotate-webhook-secret", {
        method: "POST",
      }),
    );
    const body = (await res.json()) as any;
    expect(res.status).toBe(200);
    expect(body.data.webhook_secret.length).toBe(64);
    expect(rows[0]!.webhook_secret_encrypted).toBe(`enc:${body.data.webhook_secret}`);
  });

  it("POST /admin/shipping-providers/:id/platform-account/sync creates the platform account from env credentials", async () => {
    process.env.POSTAPLUS_PARTNER_KEY = "partner-key-123456";
    process.env.POSTAPLUS_TENANT = "DXB";
    process.env.POSTAPLUS_CUSTOMER = "CR26006714";
    process.env.POSTAPLUS_CREATED_BY = "POSTACLNT";
    process.env.POSTAPLUS_BASE_URL = "https://infolink.postaplus.net/api";
    process.env.POSTAPLUS_SHIPMENT_TYPE = "SHPT2";
    process.env.POSTAPLUS_PACKAGE_TYPE = "NA";
    process.env.POSTAPLUS_SERVICE = "SRV1";
    process.env.POSTAPLUS_VEHICLE = "VHTY1";
    process.env.POSTAPLUS_PICKUP_TYPE = "NM";

    const rows = [makeRow({ id: "postaplus-id", code: "postaplus", is_active: false })];
    const accounts: PlatformAccount[] = [];
    const app = buildApp(rows, accounts);

    const res = await app.handle(
      new Request("http://localhost/admin/shipping-providers/postaplus-id/platform-account/sync", {
        method: "POST",
      }),
    );

    const body = (await res.json()) as any;
    expect(res.status).toBe(200);
    expect(body.data.created).toBe(true);
    expect(body.data.account.vendor_id).toBeNull();
    expect(body.data.account.provider_id).toBe("postaplus-id");
    expect(body.data.account.is_active).toBe(true);
    expect(body.data.account.is_verified).toBe(true);
    expect(body.data.account.credentials_last4).toBe("3456");
    expect(body.data.account.credentials_encrypted).toBeUndefined();
    expect(accounts[0]!.credentials_encrypted).toContain("POSTACLNT");
    expect(rows[0]!.is_active).toBe(true);
  });
});
