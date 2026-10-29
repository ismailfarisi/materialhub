import { jwtAuth, requireRole } from "@materialhub/guards";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

const BASE_COST_KEY = "shipping.base_carrier_cost_fils";
const BASE_COST_DEFAULT = 1300;

const BaseTierBody = {
  min_order_value: t.Integer({ minimum: 0 }),
  vendor_contribution: t.Integer({ minimum: 0 }),
  vendor_id: t.Optional(t.Union([t.String({ format: "uuid" }), t.Null()])),
  currency: t.Optional(t.String({ minLength: 3, maxLength: 3 })),
  is_active: t.Optional(t.Boolean()),
  sort_order: t.Optional(t.Integer({ minimum: 0 })),
};

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

export const shippingContributionAdminRoutes = new Elysia({
  prefix: "/admin/shipping-contribution-tiers",
})
  .use(container)
  .use(jwtAuth)
  .use(requireRole("admin", "super_admin"))
  // BASE COST — read
  .get("/base-cost", async ({ siteSettingRepo }: any) => {
    const row = await siteSettingRepo.findOne({ where: { key: BASE_COST_KEY } });
    const value = row ? Number(row.value) : BASE_COST_DEFAULT;
    return ok({ base_carrier_cost_fils: value });
  })
  // BASE COST — write (upsert)
  .patch(
    "/base-cost",
    async ({ body, siteSettingRepo }: any) => {
      const existing = await siteSettingRepo.findOne({ where: { key: BASE_COST_KEY } });
      await siteSettingRepo.save({
        ...(existing ?? {}),
        key: BASE_COST_KEY,
        value: String(body.base_carrier_cost_fils),
        value_type: "integer",
        setting_group: "shipping",
      });
      return ok({ base_carrier_cost_fils: body.base_carrier_cost_fils });
    },
    { body: t.Object({ base_carrier_cost_fils: t.Integer({ minimum: 0 }) }) },
  )
  // LIST
  .get(
    "/",
    async ({ query, shippingContributionTierRepo }: any) => {
      const qb = shippingContributionTierRepo
        .createQueryBuilder("t")
        .orderBy("t.vendor_id", "ASC")
        .addOrderBy("t.min_order_value", "ASC");
      if (!query.include_deleted || query.include_deleted === "false") {
        qb.where("t.deleted_at IS NULL");
      }
      if (query.vendor_id === "platform") qb.andWhere("t.vendor_id IS NULL");
      else if (query.vendor_id) qb.andWhere("t.vendor_id = :v", { v: query.vendor_id });
      if (query.is_active === "true") qb.andWhere("t.is_active = true");
      if (query.is_active === "false") qb.andWhere("t.is_active = false");
      return ok(await qb.getMany());
    },
    {
      query: t.Object({
        vendor_id: t.Optional(t.String()),
        is_active: t.Optional(t.String()),
        include_deleted: t.Optional(t.String()),
      }),
    },
  )
  // GET ONE
  .get(
    "/:id",
    async ({ params, shippingContributionTierRepo, set }: any) => {
      const row = await shippingContributionTierRepo.findOne({ where: { id: params.id } });
      if (!row || row.deleted_at) {
        set.status = 404;
        return err(404, "NOT_FOUND", `Shipping contribution tier '${params.id}' not found`);
      }
      return ok(row);
    },
    { params: t.Object({ id: t.String() }) },
  )
  // CREATE
  .post(
    "/",
    async ({ body, shippingContributionTierRepo, set }: any) => {
      const saved = await shippingContributionTierRepo.save(body);
      set.status = 201;
      return { statusCode: 201, data: saved, timestamp: new Date().toISOString() };
    },
    { body: t.Object(BaseTierBody) },
  )
  // UPDATE
  .patch(
    "/:id",
    async ({ params, body, shippingContributionTierRepo, set }: any) => {
      const row = await shippingContributionTierRepo.findOne({ where: { id: params.id } });
      if (!row) {
        set.status = 404;
        return err(404, "NOT_FOUND", `Shipping contribution tier '${params.id}' not found`);
      }
      await shippingContributionTierRepo.update({ id: params.id }, body);
      const updated = await shippingContributionTierRepo.findOne({ where: { id: params.id } });
      return ok(updated);
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object(
        Object.fromEntries(
          Object.entries(BaseTierBody).map(([k, v]) => [k, t.Optional(v as any)]),
        ) as unknown as typeof BaseTierBody,
      ),
    },
  )
  // SOFT DELETE
  .delete(
    "/:id",
    async ({ params, shippingContributionTierRepo, set }: any) => {
      const row = await shippingContributionTierRepo.findOne({ where: { id: params.id } });
      if (!row) {
        set.status = 404;
        return err(404, "NOT_FOUND", `Shipping contribution tier '${params.id}' not found`);
      }
      await shippingContributionTierRepo.softDelete(params.id);
      return ok({ id: params.id, deleted_at: new Date().toISOString() });
    },
    { params: t.Object({ id: t.String() }) },
  );
