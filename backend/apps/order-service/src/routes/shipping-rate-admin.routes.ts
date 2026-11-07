import { jwtAuth, requireRole } from "@materialhub/guards";
import { auditPlugin } from "@materialhub/plugins";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

const BaseRateBody = {
  name: t.String({ minLength: 1, maxLength: 255 }),
  method: t.String({ minLength: 1, maxLength: 100 }),
  base_cost: t.Integer({ minimum: 0 }),
  vendor_id: t.Optional(t.Union([t.String({ format: "uuid" }), t.Null()])),
  zone_id: t.Optional(t.Union([t.String({ format: "uuid" }), t.Null()])),
  min_weight_grams: t.Optional(t.Union([t.Integer({ minimum: 0 }), t.Null()])),
  max_weight_grams: t.Optional(t.Union([t.Integer({ minimum: 0 }), t.Null()])),
  min_order_amount: t.Optional(t.Union([t.Integer({ minimum: 0 }), t.Null()])),
  carrier: t.Optional(t.Union([t.String({ maxLength: 100 }), t.Null()])),
  carrier_cost: t.Optional(t.Union([t.Integer({ minimum: 0 }), t.Null()])),
  per_kg_cost: t.Optional(t.Integer({ minimum: 0 })),
  free_above: t.Optional(t.Union([t.Integer({ minimum: 0 }), t.Null()])),
  currency: t.Optional(t.String({ minLength: 3, maxLength: 3 })),
  estimated_days_min: t.Optional(t.Union([t.Integer({ minimum: 0 }), t.Null()])),
  estimated_days_max: t.Optional(t.Union([t.Integer({ minimum: 0 }), t.Null()])),
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

export const shippingRateAdminRoutes = new Elysia({ prefix: "/admin/shipping-rates" })
  .use(container)
  .use(jwtAuth)
  .use(requireRole("admin", "super_admin"))
  .use(auditPlugin)
  // LIST
  .get(
    "/",
    async ({ query, shippingRateRepo }: any) => {
      const qb = shippingRateRepo
        .createQueryBuilder("r")
        .orderBy("r.sort_order", "ASC")
        .addOrderBy("r.created_at", "DESC");

      if (!query.include_deleted || query.include_deleted === "false") {
        qb.where("r.deleted_at IS NULL");
      }

      if (query.vendor_id === "platform") {
        qb.andWhere("r.vendor_id IS NULL");
      } else if (query.vendor_id) {
        qb.andWhere("r.vendor_id = :v", { v: query.vendor_id });
      }

      if (query.zone_id === "any") {
        qb.andWhere("r.zone_id IS NULL");
      } else if (query.zone_id) {
        qb.andWhere("r.zone_id = :z", { z: query.zone_id });
      }

      if (query.method) qb.andWhere("r.method = :m", { m: query.method });
      if (query.is_active === "true") qb.andWhere("r.is_active = true");
      if (query.is_active === "false") qb.andWhere("r.is_active = false");

      const rows = await qb.getMany();
      return ok(rows);
    },
    {
      query: t.Object({
        vendor_id: t.Optional(t.String()),
        zone_id: t.Optional(t.String()),
        method: t.Optional(t.String()),
        is_active: t.Optional(t.String()),
        include_deleted: t.Optional(t.String()),
      }),
    },
  )
  // GET ONE
  .get(
    "/:id",
    async ({ params, shippingRateRepo, set }: any) => {
      const row = await shippingRateRepo.findOne({ where: { id: params.id } });
      if (!row || row.deleted_at) {
        set.status = 404;
        return err(404, "NOT_FOUND", `Shipping rate '${params.id}' not found`);
      }
      return ok(row);
    },
    { params: t.Object({ id: t.String() }) },
  )
  // CREATE
  .post(
    "/",
    async ({ body, shippingRateRepo, set }: any) => {
      const saved = await shippingRateRepo.save(body);
      set.status = 201;
      return { statusCode: 201, data: saved, timestamp: new Date().toISOString() };
    },
    { body: t.Object(BaseRateBody) },
  )
  // UPDATE
  .patch(
    "/:id",
    async ({ params, body, shippingRateRepo, set }: any) => {
      const row = await shippingRateRepo.findOne({ where: { id: params.id } });
      if (!row) {
        set.status = 404;
        return err(404, "NOT_FOUND", `Shipping rate '${params.id}' not found`);
      }
      await shippingRateRepo.update({ id: params.id }, body);
      const updated = await shippingRateRepo.findOne({ where: { id: params.id } });
      return ok(updated);
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object(
        Object.fromEntries(
          Object.entries(BaseRateBody).map(([k, v]) => [k, t.Optional(v as any)]),
        ) as unknown as typeof BaseRateBody,
      ),
    },
  )
  // SOFT DELETE
  .delete(
    "/:id",
    async ({ params, shippingRateRepo, set }: any) => {
      const row = await shippingRateRepo.findOne({ where: { id: params.id } });
      if (!row) {
        set.status = 404;
        return err(404, "NOT_FOUND", `Shipping rate '${params.id}' not found`);
      }
      await shippingRateRepo.softDelete(params.id);
      return ok({ id: params.id, deleted_at: new Date().toISOString() });
    },
    { params: t.Object({ id: t.String() }) },
  );
