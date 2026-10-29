import { randomBytes } from "node:crypto";
import { jwtAuth, requireRole } from "@materialhub/guards";
import { Elysia, t } from "elysia";
import { IsNull } from "typeorm";
import { container } from "../container.ts";

const ALLOWED_PATCH_FIELDS = new Set([
  "display_name",
  "description",
  "logo_url",
  "supported_regions",
  "sort_order",
  "is_active",
  "webhook_secret",
]);

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

export const shippingProviderAdminRoutes = new Elysia({
  prefix: "/admin/shipping-providers",
})
  .use(container)
  .use(jwtAuth)
  .use(requireRole("admin", "super_admin"))
  .get("/", async ({ shippingProviderRepo, vendorCarrierAccountRepo }: any) => {
    const providers = await shippingProviderRepo
      .createQueryBuilder("p")
      .where("p.deleted_at IS NULL")
      .orderBy("p.sort_order", "ASC")
      .addOrderBy("p.display_name", "ASC")
      .getMany();

    const withCounts = await Promise.all(
      providers.map(async (p: any) => ({
        ...p,
        vendor_account_count: await vendorCarrierAccountRepo.count({
          where: { provider_id: p.id, deleted_at: null as any },
        }),
      })),
    );
    return ok(withCounts);
  })
  .get(
    "/:id",
    async ({ params, shippingProviderRepo, set }: any) => {
      const row = await shippingProviderRepo.findOne({
        where: { id: params.id },
      });
      if (!row || row.deleted_at) {
        set.status = 404;
        return err(404, "NOT_FOUND", `Provider '${params.id}' not found`);
      }
      return ok(row);
    },
    { params: t.Object({ id: t.String() }) },
  )
  .patch(
    "/:id",
    async ({ params, body, shippingProviderRepo, encryption, set }: any) => {
      const row = await shippingProviderRepo.findOne({
        where: { id: params.id },
      });
      if (!row || row.deleted_at) {
        set.status = 404;
        return err(404, "NOT_FOUND", `Provider '${params.id}' not found`);
      }
      const patch: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
        if (!ALLOWED_PATCH_FIELDS.has(k)) continue;
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
        display_name: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
        description: t.Optional(t.Union([t.String(), t.Null()])),
        logo_url: t.Optional(t.Union([t.String(), t.Null()])),
        supported_regions: t.Optional(t.Array(t.String({ minLength: 2, maxLength: 8 }))),
        sort_order: t.Optional(t.Integer({ minimum: 0 })),
        is_active: t.Optional(t.Boolean()),
        webhook_secret: t.Optional(t.String({ minLength: 16 })),
      }),
    },
  )
  .post(
    "/:id/rotate-webhook-secret",
    async ({ params, shippingProviderRepo, encryption, set }: any) => {
      const row = await shippingProviderRepo.findOne({
        where: { id: params.id },
      });
      if (!row || row.deleted_at) {
        set.status = 404;
        return err(404, "NOT_FOUND", `Provider '${params.id}' not found`);
      }
      const plaintext = randomBytes(32).toString("hex");
      row.webhook_secret_encrypted = encryption.encrypt(plaintext);
      await shippingProviderRepo.save(row);
      return ok({ webhook_secret: plaintext });
    },
    { params: t.Object({ id: t.String() }) },
  )
  .post(
    "/:id/platform-account/sync",
    async ({ params, shippingProviderRepo, vendorCarrierAccountRepo, encryption, set }: any) => {
      const provider = await shippingProviderRepo.findOne({
        where: { id: params.id },
      });
      if (!provider || provider.deleted_at) {
        set.status = 404;
        return err(404, "NOT_FOUND", `Provider '${params.id}' not found`);
      }
      if (provider.code !== "postaplus") {
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

      if (!provider.is_active) {
        provider.is_active = true;
        await shippingProviderRepo.save(provider);
      }

      const partnerKey = credentials.partner_key ?? "";
      const encrypted = encryption.encryptObject(credentials);
      const existing = await vendorCarrierAccountRepo.findOne({
        where: { vendor_id: IsNull(), provider_id: provider.id },
      });
      const patch = {
        vendor_id: null,
        provider_id: provider.id,
        display_name: "MaterialHub PostaPlus (platform default)",
        credentials_encrypted: encrypted,
        credentials_last4: partnerKey.slice(-4),
        is_active: true,
        is_verified: true,
        verified_at: new Date(),
        last_verify_error: null,
      };

      const saved = existing
        ? await vendorCarrierAccountRepo.save({ ...existing, ...patch })
        : await vendorCarrierAccountRepo.save(patch);

      return ok({ created: !existing, account: platformAccountPayload(saved) });
    },
    { params: t.Object({ id: t.String() }) },
  );
