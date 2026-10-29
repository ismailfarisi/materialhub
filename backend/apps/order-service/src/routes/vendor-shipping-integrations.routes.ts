import { jwtAuth, vendorMembership } from "@materialhub/guards";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

function mask(row: any) {
  if (!row) return row;
  const { credentials_encrypted: _, ...rest } = row;
  return rest;
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

// Phase 2 migration: replaces `requireRole("vendor")` (which paired with a
// JWT-shaped `user.vendor_id` field that no longer exists in Phase 2) with
// `vendorMembership("orders.fulfill")`. The active vendor is derived from the
// user's `vm` claim (and optional `X-Active-Vendor-Id` header) and exposed as
// `member.vid`. Two handlers (`PATCH /:id/set-default` and `DELETE /:id`) keep
// their inline `vendorRepo.findOne/update` calls — they just feed `member.vid`
// instead of the missing `user.vendor_id`.
export const vendorShippingIntegrationsRoutes = new Elysia({
  prefix: "/vendor/shipping-integrations",
})
  .use(container)
  .use(jwtAuth)
  .use(vendorMembership("orders.fulfill"))
  .get("/providers", async ({ shippingProviderRepo }: any) => {
    const providers = await shippingProviderRepo.find({
      where: { is_active: true, deleted_at: null as any },
      order: { sort_order: "ASC", display_name: "ASC" },
    });
    return ok(providers);
  })
  .get("/", async ({ member, vendorCarrierAccountRepo }: any) => {
    const rows = await vendorCarrierAccountRepo.find({
      where: { vendor_id: member.vid, deleted_at: null as any },
      relations: ["provider"],
      order: { created_at: "DESC" },
    });
    return ok(rows.map(mask));
  })
  .get(
    "/:id",
    async ({ params, member, vendorCarrierAccountRepo, set }: any) => {
      const row = await vendorCarrierAccountRepo.findOne({
        where: { id: params.id, vendor_id: member.vid },
        relations: ["provider"],
      });
      if (!row || row.deleted_at) {
        set.status = 404;
        return err(404, "NOT_FOUND", "Integration not found");
      }
      return ok(mask(row));
    },
    { params: t.Object({ id: t.String() }) },
  )
  .post(
    "/",
    async ({
      body,
      member,
      shippingProviderRepo,
      vendorCarrierAccountRepo,
      encryption,
      shippingProviderRegistry,
      set,
    }: any) => {
      const provider = await shippingProviderRepo.findOne({
        where: { id: body.provider_id },
      });
      if (!provider || !provider.is_active || provider.deleted_at) {
        set.status = 404;
        return err(404, "PROVIDER_NOT_AVAILABLE", "Provider is not available");
      }
      const adapter = shippingProviderRegistry.get(provider.code);
      if (!adapter) {
        set.status = 500;
        return err(500, "ADAPTER_MISSING", `Adapter '${provider.code}' not registered`);
      }
      for (const req of adapter.credentialSchema.required) {
        if (!body.credentials?.[req]) {
          set.status = 422;
          return err(422, "VALIDATION_ERROR", `Missing credential field '${req}'`);
        }
      }
      const firstSecretKey =
        Object.entries(adapter.credentialSchema.properties).find(
          ([, v]: any) => v.format === "password",
        )?.[0] ?? Object.keys(adapter.credentialSchema.properties)[0];
      const last4 = firstSecretKey
        ? String(body.credentials[firstSecretKey] ?? "").slice(-4)
        : null;

      const saved = await vendorCarrierAccountRepo.save({
        vendor_id: member.vid,
        provider_id: body.provider_id,
        display_name: body.display_name,
        credentials_encrypted: encryption.encryptObject(body.credentials),
        credentials_last4: last4,
        is_active: true,
        is_verified: false,
      });
      set.status = 201;
      return {
        statusCode: 201,
        data: mask(saved),
        timestamp: new Date().toISOString(),
      };
    },
    {
      body: t.Object({
        provider_id: t.String({ format: "uuid" }),
        display_name: t.String({ minLength: 1, maxLength: 255 }),
        credentials: t.Record(t.String(), t.String()),
      }),
    },
  )
  .post(
    "/:id/verify",
    async ({
      params,
      member,
      vendorCarrierAccountRepo,
      shippingProviderRepo,
      encryption,
      shippingProviderRegistry,
      set,
    }: any) => {
      const account = await vendorCarrierAccountRepo.findOne({
        where: { id: params.id, vendor_id: member.vid },
      });
      if (!account || account.deleted_at) {
        set.status = 404;
        return err(404, "NOT_FOUND", "Integration not found");
      }
      const provider = await shippingProviderRepo.findOne({
        where: { id: account.provider_id },
      });
      const adapter = shippingProviderRegistry.get(provider.code);
      if (!adapter) {
        set.status = 500;
        return err(500, "ADAPTER_MISSING", `Adapter '${provider.code}' not registered`);
      }
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
  .patch(
    "/:id",
    async ({
      params,
      body,
      member,
      vendorCarrierAccountRepo,
      shippingProviderRepo,
      shippingProviderRegistry,
      encryption,
      set,
    }: any) => {
      const account = await vendorCarrierAccountRepo.findOne({
        where: { id: params.id, vendor_id: member.vid },
      });
      if (!account || account.deleted_at) {
        set.status = 404;
        return err(404, "NOT_FOUND", "Integration not found");
      }
      if (body.display_name) account.display_name = body.display_name;
      if (typeof body.is_active === "boolean") account.is_active = body.is_active;
      if (body.credentials) {
        const provider = await shippingProviderRepo.findOne({
          where: { id: account.provider_id },
        });
        const adapter = provider ? shippingProviderRegistry.get(provider.code) : null;
        const firstSecretKey = adapter
          ? (Object.entries(adapter.credentialSchema.properties).find(
              ([, v]: any) => v.format === "password",
            )?.[0] ?? Object.keys(adapter.credentialSchema.properties)[0])
          : Object.keys(body.credentials)[0];
        account.credentials_encrypted = encryption.encryptObject(body.credentials);
        account.credentials_last4 = firstSecretKey
          ? String(body.credentials[firstSecretKey] ?? "").slice(-4)
          : null;
        account.is_verified = false;
        account.verified_at = null;
        account.last_verify_error = null;
      }
      await vendorCarrierAccountRepo.save(account);
      return ok(mask(account));
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        display_name: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
        is_active: t.Optional(t.Boolean()),
        credentials: t.Optional(t.Record(t.String(), t.String())),
      }),
    },
  )
  .patch(
    "/:id/set-default",
    async ({ params, member, vendorCarrierAccountRepo, vendorRepo, set }: any) => {
      const account = await vendorCarrierAccountRepo.findOne({
        where: { id: params.id, vendor_id: member.vid },
      });
      if (!account || account.deleted_at) {
        set.status = 404;
        return err(404, "NOT_FOUND", "Integration not found");
      }
      if (!account.is_active || !account.is_verified) {
        set.status = 409;
        return err(
          409,
          "ACCOUNT_NOT_READY",
          "Account must be active and verified before setting as default",
        );
      }
      await vendorRepo.update(member.vid, {
        default_shipping_account_id: account.id,
      });
      return ok({ default_shipping_account_id: account.id });
    },
    { params: t.Object({ id: t.String() }) },
  )
  .delete(
    "/:id",
    async ({ params, member, vendorCarrierAccountRepo, vendorRepo, set }: any) => {
      const account = await vendorCarrierAccountRepo.findOne({
        where: { id: params.id, vendor_id: member.vid },
      });
      if (!account || account.deleted_at) {
        set.status = 404;
        return err(404, "NOT_FOUND", "Integration not found");
      }
      const vendor = await vendorRepo.findOne({
        where: { id: member.vid },
      });
      if (vendor?.default_shipping_account_id === account.id) {
        await vendorRepo.update(member.vid, {
          default_shipping_account_id: null,
        });
      }
      await vendorCarrierAccountRepo.softDelete(account.id);
      return ok({ id: account.id });
    },
    { params: t.Object({ id: t.String() }) },
  );
