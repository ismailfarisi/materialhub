import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Elysia, t } from "elysia";
import { MockShippingProviderAdapter } from "../domain/shipment/mock-shipping-provider.adapter.ts";
import { ShippingProviderRegistry } from "../domain/shipment/shipping-provider-adapter.ts";

type Provider = {
  id: string;
  code: string;
  display_name: string;
  credential_schema: any;
  is_active: boolean;
};
type Account = {
  id: string;
  vendor_id: string;
  provider_id: string;
  display_name: string;
  credentials_encrypted: string;
  credentials_last4: string | null;
  is_active: boolean;
  is_verified: boolean;
  verified_at: Date | null;
  last_verify_error: string | null;
  deleted_at: Date | null;
  provider?: Provider;
};

function ok(data: unknown, status = 200) {
  return { statusCode: status, data, timestamp: new Date().toISOString() };
}
function errResp(status: number, error: string, message: string) {
  return { statusCode: status, error, message, timestamp: new Date().toISOString() };
}

function mask(acc: Account) {
  const { credentials_encrypted: _, ...rest } = acc;
  return rest;
}

function buildApp({
  // Phase 3a: vendor owners carry role="customer" + vm JWT claim
  user = { id: "u-1", role: "customer", vendor_id: "v-1" },
  providers = [] as Provider[],
  accounts = [] as Account[],
  vendors = [{ id: "v-1", default_shipping_account_id: null as string | null }],
} = {}) {
  const providerRepo = {
    find: mock(async () => providers.filter((p) => p.is_active)),
    findOne: mock(async (opts: any) => providers.find((p) => p.id === opts?.where?.id) ?? null),
  };
  const accountRepo = {
    find: mock(async (opts: any) =>
      accounts.filter((a) => a.vendor_id === opts?.where?.vendor_id && !a.deleted_at),
    ),
    findOne: mock(
      async (opts: any) =>
        accounts.find((a) => a.id === opts?.where?.id && a.vendor_id === opts?.where?.vendor_id) ??
        null,
    ),
    save: mock(async (row: any) => {
      const existing = accounts.find((a) => a.id === row.id);
      if (existing) {
        Object.assign(existing, row);
        return existing;
      }
      const full: Account = {
        id: row.id ?? `acc-${accounts.length + 1}`,
        vendor_id: row.vendor_id,
        provider_id: row.provider_id,
        display_name: row.display_name,
        credentials_encrypted: row.credentials_encrypted,
        credentials_last4: row.credentials_last4 ?? null,
        is_active: row.is_active ?? true,
        is_verified: row.is_verified ?? false,
        verified_at: row.verified_at ?? null,
        last_verify_error: row.last_verify_error ?? null,
        deleted_at: null,
      };
      accounts.push(full);
      return full;
    }),
    softDelete: mock(async (id: string) => {
      const a = accounts.find((x) => x.id === id);
      if (a) a.deleted_at = new Date();
      return { affected: a ? 1 : 0 };
    }),
  };
  const vendorRepo = {
    findOne: mock(async (opts: any) => vendors.find((v) => v.id === opts?.where?.id) ?? null),
    update: mock(async (id: string, patch: any) => {
      const v = vendors.find((x) => x.id === id);
      if (v) Object.assign(v, patch);
      return { affected: v ? 1 : 0 };
    }),
  };
  const encryption = {
    encrypt: (s: string) => `enc:${s}`,
    decrypt: (s: string) => s.replace(/^enc:/, ""),
    encryptObject: (o: Record<string, unknown>) => `enc:${JSON.stringify(o)}`,
    decryptObject: <T>(s: string) => JSON.parse(s.replace(/^enc:/, "")) as T,
  };
  const registry = new ShippingProviderRegistry();
  registry.register(new MockShippingProviderAdapter());

  return (
    new Elysia()
      .decorate("shippingProviderRepo", providerRepo as any)
      .decorate("vendorCarrierAccountRepo", accountRepo as any)
      .decorate("vendorRepo", vendorRepo as any)
      .decorate("encryption", encryption as any)
      .decorate("shippingProviderRegistry", registry)
      .derive(() => ({ user }))
      // LIST PROVIDERS
      .get("/vendor/shipping-integrations/providers", async ({ shippingProviderRepo }: any) => {
        const list = await shippingProviderRepo.find({ where: { is_active: true } });
        return ok(list);
      })
      // LIST ACCOUNTS
      .get("/vendor/shipping-integrations", async ({ user, vendorCarrierAccountRepo }: any) => {
        const rows = await vendorCarrierAccountRepo.find({ where: { vendor_id: user.vendor_id } });
        return ok(rows.map(mask));
      })
      // GET ONE
      .get(
        "/vendor/shipping-integrations/:id",
        async ({ params, user, vendorCarrierAccountRepo, set }: any) => {
          const row = await vendorCarrierAccountRepo.findOne({
            where: { id: params.id, vendor_id: user.vendor_id },
          });
          if (!row || row.deleted_at) {
            set.status = 404;
            return errResp(404, "NOT_FOUND", "Integration not found");
          }
          return ok(mask(row));
        },
        { params: t.Object({ id: t.String() }) },
      )
      // CREATE
      .post(
        "/vendor/shipping-integrations",
        async ({
          body,
          user,
          shippingProviderRepo,
          vendorCarrierAccountRepo,
          encryption,
          shippingProviderRegistry,
          set,
        }: any) => {
          const provider = await shippingProviderRepo.findOne({ where: { id: body.provider_id } });
          if (!provider || !provider.is_active) {
            set.status = 404;
            return errResp(404, "PROVIDER_NOT_AVAILABLE", "Provider unavailable");
          }
          const adapter = shippingProviderRegistry.get(provider.code);
          if (!adapter) {
            set.status = 500;
            return errResp(500, "ADAPTER_MISSING", "Adapter not registered");
          }
          for (const req of adapter.credentialSchema.required) {
            if (!body.credentials?.[req]) {
              set.status = 422;
              return errResp(422, "VALIDATION_ERROR", `Missing credential field '${req}'`);
            }
          }
          const firstSecretKey =
            Object.entries(adapter.credentialSchema.properties).find(
              ([, v]) => (v as any).format === "password",
            )?.[0] ?? Object.keys(adapter.credentialSchema.properties)[0];
          const last4 = firstSecretKey
            ? String(body.credentials[firstSecretKey] ?? "").slice(-4)
            : null;

          const saved = await vendorCarrierAccountRepo.save({
            vendor_id: user.vendor_id,
            provider_id: body.provider_id,
            display_name: body.display_name,
            credentials_encrypted: encryption.encryptObject(body.credentials),
            credentials_last4: last4,
            is_active: true,
            is_verified: false,
          });
          set.status = 201;
          return { statusCode: 201, data: mask(saved), timestamp: new Date().toISOString() };
        },
        {
          body: t.Object({
            provider_id: t.String(),
            display_name: t.String({ minLength: 1, maxLength: 255 }),
            credentials: t.Record(t.String(), t.String()),
          }),
        },
      )
      // VERIFY
      .post(
        "/vendor/shipping-integrations/:id/verify",
        async ({
          params,
          user,
          vendorCarrierAccountRepo,
          shippingProviderRepo,
          encryption,
          shippingProviderRegistry,
          set,
        }: any) => {
          const account = await vendorCarrierAccountRepo.findOne({
            where: { id: params.id, vendor_id: user.vendor_id },
          });
          if (!account) {
            set.status = 404;
            return errResp(404, "NOT_FOUND", "Integration not found");
          }
          const provider = await shippingProviderRepo.findOne({
            where: { id: account.provider_id },
          });
          const adapter = shippingProviderRegistry.get(provider.code);
          const creds = encryption.decryptObject(account.credentials_encrypted) as Record<
            string,
            string
          >;
          const result = await adapter.verifyCredentials(creds);
          if (result.ok) {
            account.is_verified = true;
            account.verified_at = new Date();
            account.last_verify_error = null;
          } else {
            account.is_verified = false;
            account.last_verify_error = result.message ?? "Verification failed";
          }
          await vendorCarrierAccountRepo.save(account);
          return ok(result);
        },
        { params: t.Object({ id: t.String() }) },
      )
      // PATCH
      .patch(
        "/vendor/shipping-integrations/:id",
        async ({ params, body, user, vendorCarrierAccountRepo, encryption, set }: any) => {
          const account = await vendorCarrierAccountRepo.findOne({
            where: { id: params.id, vendor_id: user.vendor_id },
          });
          if (!account) {
            set.status = 404;
            return errResp(404, "NOT_FOUND", "Integration not found");
          }
          if (body.display_name) account.display_name = body.display_name;
          if (typeof body.is_active === "boolean") account.is_active = body.is_active;
          if (body.credentials) {
            account.credentials_encrypted = encryption.encryptObject(body.credentials);
            account.is_verified = false;
            account.last_verify_error = null;
          }
          await vendorCarrierAccountRepo.save(account);
          return ok(mask(account));
        },
        {
          params: t.Object({ id: t.String() }),
          body: t.Object({
            display_name: t.Optional(t.String({ minLength: 1 })),
            is_active: t.Optional(t.Boolean()),
            credentials: t.Optional(t.Record(t.String(), t.String())),
          }),
        },
      )
      // SET DEFAULT
      .patch(
        "/vendor/shipping-integrations/:id/set-default",
        async ({ params, user, vendorCarrierAccountRepo, vendorRepo, set }: any) => {
          const account = await vendorCarrierAccountRepo.findOne({
            where: { id: params.id, vendor_id: user.vendor_id },
          });
          if (!account) {
            set.status = 404;
            return errResp(404, "NOT_FOUND", "Integration not found");
          }
          if (!account.is_active || !account.is_verified) {
            set.status = 409;
            return errResp(
              409,
              "ACCOUNT_NOT_READY",
              "Account must be active and verified before setting as default",
            );
          }
          await vendorRepo.update(user.vendor_id, { default_shipping_account_id: account.id });
          return ok({ default_shipping_account_id: account.id });
        },
        { params: t.Object({ id: t.String() }) },
      )
      // DELETE
      .delete(
        "/vendor/shipping-integrations/:id",
        async ({ params, user, vendorCarrierAccountRepo, vendorRepo, set }: any) => {
          const account = await vendorCarrierAccountRepo.findOne({
            where: { id: params.id, vendor_id: user.vendor_id },
          });
          if (!account) {
            set.status = 404;
            return errResp(404, "NOT_FOUND", "Integration not found");
          }
          const vendor = await vendorRepo.findOne({ where: { id: user.vendor_id } });
          if (vendor?.default_shipping_account_id === account.id) {
            await vendorRepo.update(user.vendor_id, { default_shipping_account_id: null });
          }
          await vendorCarrierAccountRepo.softDelete(account.id);
          return ok({ id: account.id });
        },
        { params: t.Object({ id: t.String() }) },
      )
  );
}

describe("vendor-shipping-integrations.routes", () => {
  let providers: Provider[];
  beforeEach(() => {
    providers = [
      {
        id: "p-1",
        code: "mock",
        display_name: "Mock Provider",
        is_active: true,
        credential_schema: new MockShippingProviderAdapter().credentialSchema as any,
      },
    ];
  });

  it("POST /vendor/shipping-integrations creates an account (masked, unverified)", async () => {
    const app = buildApp({ providers });
    const res = await app.handle(
      new Request("http://localhost/vendor/shipping-integrations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider_id: "p-1",
          display_name: "My Mock",
          credentials: { api_key: "test_abcd1234", warehouse_id: "wh-1" },
        }),
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.data.is_verified).toBe(false);
    expect(body.data.credentials_last4).toBe("1234");
    expect(body.data.credentials_encrypted).toBeUndefined();
  });

  it("POST /verify flips is_verified on success", async () => {
    const accounts: Account[] = [
      {
        id: "acc-1",
        vendor_id: "v-1",
        provider_id: "p-1",
        display_name: "My Mock",
        credentials_encrypted: `enc:${JSON.stringify({ api_key: "test_x", warehouse_id: "wh-1" })}`,
        credentials_last4: "x",
        is_active: true,
        is_verified: false,
        verified_at: null,
        last_verify_error: null,
        deleted_at: null,
      },
    ];
    const app = buildApp({ providers, accounts });
    const res = await app.handle(
      new Request("http://localhost/vendor/shipping-integrations/acc-1/verify", { method: "POST" }),
    );
    expect(res.status).toBe(200);
    expect(accounts[0]!.is_verified).toBe(true);
    expect(accounts[0]!.verified_at).toBeInstanceOf(Date);
  });

  it("POST /verify records last_verify_error on failure", async () => {
    const accounts: Account[] = [
      {
        id: "acc-1",
        vendor_id: "v-1",
        provider_id: "p-1",
        display_name: "My Mock",
        credentials_encrypted: `enc:${JSON.stringify({ api_key: "bad", warehouse_id: "wh-1" })}`,
        credentials_last4: "bad",
        is_active: true,
        is_verified: true,
        verified_at: new Date(),
        last_verify_error: null,
        deleted_at: null,
      },
    ];
    const app = buildApp({ providers, accounts });
    await app.handle(
      new Request("http://localhost/vendor/shipping-integrations/acc-1/verify", { method: "POST" }),
    );
    expect(accounts[0]!.is_verified).toBe(false);
    expect(accounts[0]!.last_verify_error).toBeTruthy();
  });

  it("PATCH /set-default returns 409 when account is unverified", async () => {
    const accounts: Account[] = [
      {
        id: "acc-1",
        vendor_id: "v-1",
        provider_id: "p-1",
        display_name: "X",
        credentials_encrypted: "enc:{}",
        credentials_last4: "x",
        is_active: true,
        is_verified: false,
        verified_at: null,
        last_verify_error: null,
        deleted_at: null,
      },
    ];
    const app = buildApp({ providers, accounts });
    const res = await app.handle(
      new Request("http://localhost/vendor/shipping-integrations/acc-1/set-default", {
        method: "PATCH",
      }),
    );
    expect(res.status).toBe(409);
  });

  it("vendor cannot read another vendor's accounts", async () => {
    const accounts: Account[] = [
      {
        id: "acc-other",
        vendor_id: "v-OTHER",
        provider_id: "p-1",
        display_name: "X",
        credentials_encrypted: "enc:{}",
        credentials_last4: "x",
        is_active: true,
        is_verified: true,
        verified_at: new Date(),
        last_verify_error: null,
        deleted_at: null,
      },
    ];
    const app = buildApp({ providers, accounts });
    const res = await app.handle(
      new Request("http://localhost/vendor/shipping-integrations/acc-other"),
    );
    expect(res.status).toBe(404);
  });

  it("DELETE clears vendor default when deleted account was the default", async () => {
    const accounts: Account[] = [
      {
        id: "acc-1",
        vendor_id: "v-1",
        provider_id: "p-1",
        display_name: "X",
        credentials_encrypted: "enc:{}",
        credentials_last4: "x",
        is_active: true,
        is_verified: true,
        verified_at: new Date(),
        last_verify_error: null,
        deleted_at: null,
      },
    ];
    const vendors = [{ id: "v-1", default_shipping_account_id: "acc-1" as string | null }];
    const app = buildApp({ providers, accounts, vendors });
    await app.handle(
      new Request("http://localhost/vendor/shipping-integrations/acc-1", { method: "DELETE" }),
    );
    expect(vendors[0]!.default_shipping_account_id).toBe(null);
    expect(accounts[0]!.deleted_at).toBeInstanceOf(Date);
  });
});
