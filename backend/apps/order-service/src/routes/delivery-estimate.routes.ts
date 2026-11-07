import { jwtAuth, requireRole, vendorMembership } from "@materialhub/guards";
import { HttpError, NotFoundError, auditPlugin } from "@materialhub/plugins";
// delivery-estimate.routes.ts — delivery promise (workstream 5).
import { Elysia, t } from "elysia";
import { container } from "../container.ts";
import {
  MAX_BATCH_GROUPS,
  normaliseDeliverySettings,
  validateDeliverySettings,
} from "../domain/shipping/estimate/delivery-estimate.service.ts";

const ok = (data: unknown, statusCode = 200) => ({
  statusCode,
  data,
  timestamp: new Date().toISOString(),
});

/** Optional `at` lets clients and tests ask "what if I order at …"; defaults to now. */
function parseAt(at?: string): Date | undefined {
  if (!at) return undefined;
  const d = new Date(at);
  if (Number.isNaN(d.getTime()))
    throw new HttpError(422, "`at` must be an ISO timestamp", "INVALID_AT");
  return d;
}

const Uuid = t.String({ format: "uuid" });

const DeliverySettingsBody = t.Object({
  dispatch_cutoff_time: t.Optional(t.String({ pattern: "^([01][0-9]|2[0-3]):[0-5][0-9]$" })),
  handling_days: t.Optional(t.Integer({ minimum: 0, maximum: 60 })),
  working_days: t.Optional(
    t.Array(t.Integer({ minimum: 0, maximum: 6 }), { minItems: 1, maxItems: 7 }),
  ),
  same_day_emirates: t.Optional(t.Array(t.String({ maxLength: 50 }), { maxItems: 7 })),
  next_day_emirates: t.Optional(t.Array(t.String({ maxLength: 50 }), { maxItems: 7 })),
});

const DELIVERY_FIELDS = [
  "dispatch_cutoff_time",
  "handling_days",
  "working_days",
  "same_day_emirates",
  "next_day_emirates",
] as const;

function deliverySettingsOf(wh: any) {
  return {
    warehouse_id: wh.id,
    name: wh.name,
    code: wh.code,
    emirate: wh.emirate,
    is_default: wh.is_default,
    ...Object.fromEntries(DELIVERY_FIELDS.map((k) => [k, wh[k]])),
  };
}

/** Public: storefront product page, cart and checkout. */
export const deliveryEstimateRoutes = new Elysia({ prefix: "/shipping/delivery-estimate" })
  .use(container)
  .get(
    "/",
    async ({ query, deliveryEstimateService }: any) => {
      const productIds = query.product_id
        ? String(query.product_id).split(",").filter(Boolean)
        : [];
      const data = await deliveryEstimateService.estimate({
        vendorId: query.vendor_id,
        warehouseId: query.warehouse_id,
        emirate: query.emirate,
        productIds,
        method: query.method || null,
        now: parseAt(query.at),
      });
      return ok(data);
    },
    {
      query: t.Object({
        vendor_id: t.Optional(Uuid),
        warehouse_id: t.Optional(Uuid),
        emirate: t.String({ minLength: 2, maxLength: 50 }),
        product_id: t.Optional(t.String({ maxLength: 2000 })),
        method: t.Optional(t.String({ maxLength: 100 })),
        at: t.Optional(t.String()),
      }),
    },
  )
  .post(
    "/batch",
    async ({ body, deliveryEstimateService }: any) => {
      const data = await deliveryEstimateService.estimateBatch({
        emirate: body.emirate,
        method: body.method ?? null,
        now: parseAt(body.at),
        groups: body.groups,
      });
      return ok(data);
    },
    {
      body: t.Object({
        emirate: t.String({ minLength: 2, maxLength: 50 }),
        method: t.Optional(t.String({ maxLength: 100 })),
        at: t.Optional(t.String()),
        groups: t.Array(
          t.Object({
            vendor_id: t.Optional(Uuid),
            warehouse_id: t.Optional(Uuid),
            product_ids: t.Optional(t.Array(Uuid, { maxItems: 100 })),
            method: t.Optional(t.String({ maxLength: 100 })),
          }),
          { minItems: 1, maxItems: MAX_BATCH_GROUPS },
        ),
      }),
    },
  );

/**
 * Vendor: delivery settings on the vendor's own warehouses, plus a live
 * preview of the promise for unsaved settings. Shared platform warehouses
 * are read-only here (the platform sets their dispatch rules).
 */
export const vendorWarehouseDeliveryRoutes = new Elysia({ prefix: "/vendor/warehouses" })
  .use(container)
  .use(jwtAuth)
  .use(vendorMembership("orders.fulfill"))
  .get("/delivery", async ({ member, warehouseRepo }: any) => {
    const rows = await warehouseRepo.find({
      where: { vendor_id: member.vid },
      order: { is_default: "DESC", created_at: "ASC" },
    });
    return ok(rows.map(deliverySettingsOf));
  })
  .patch(
    "/:id/delivery",
    async ({ params, body, member, warehouseRepo }: any) => {
      const wh = await warehouseRepo.findOne({ where: { id: params.id, vendor_id: member.vid } });
      if (!wh) throw new NotFoundError("Warehouse not found");
      validateDeliverySettings(body);
      const merged = normaliseDeliverySettings({
        same_day_emirates: wh.same_day_emirates,
        next_day_emirates: wh.next_day_emirates,
        ...body,
      });
      for (const k of DELIVERY_FIELDS) if (merged[k] !== undefined) wh[k] = merged[k];
      const saved = await warehouseRepo.save(wh);
      return ok(deliverySettingsOf(saved));
    },
    { params: t.Object({ id: Uuid }), body: DeliverySettingsBody },
  )
  .post(
    "/:id/delivery/preview",
    async ({ params, body, member, warehouseRepo, deliveryEstimateService }: any) => {
      const wh = await warehouseRepo.findOne({ where: { id: params.id, vendor_id: member.vid } });
      if (!wh) throw new NotFoundError("Warehouse not found");
      const { emirate, at, ...draft } = body;
      const data = await deliveryEstimateService.preview(wh, draft, emirate, parseAt(at));
      return ok(data);
    },
    {
      params: t.Object({ id: Uuid }),
      body: t.Composite([
        DeliverySettingsBody,
        t.Object({
          emirate: t.String({ minLength: 2, maxLength: 50 }),
          at: t.Optional(t.String()),
        }),
      ]),
    },
  );

const HolidayBody = {
  holiday_date: t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }),
  name: t.String({ minLength: 1, maxLength: 150 }),
  name_ar: t.Optional(t.Union([t.String({ maxLength: 150 }), t.Null()])),
  is_estimate: t.Optional(t.Boolean()),
  is_active: t.Optional(t.Boolean()),
};

/** Admin: the public-holiday list the estimator skips. */
export const publicHolidayAdminRoutes = new Elysia({ prefix: "/admin/public-holidays" })
  .use(container)
  .use(jwtAuth)
  .use(requireRole("admin", "super_admin"))
  .use(auditPlugin)
  .get(
    "/",
    async ({ query, publicHolidayService }: any) =>
      ok(await publicHolidayService.list(query.year ? Number(query.year) : undefined)),
    { query: t.Object({ year: t.Optional(t.String({ pattern: "^\\d{4}$" })) }) },
  )
  .post(
    "/",
    async ({ body, publicHolidayService, set }: any) => {
      set.status = 201;
      return ok(await publicHolidayService.create(body), 201);
    },
    { body: t.Object(HolidayBody) },
  )
  .patch(
    "/:id",
    async ({ params, body, publicHolidayService }: any) =>
      ok(await publicHolidayService.update(params.id, body)),
    {
      params: t.Object({ id: Uuid }),
      body: t.Partial(t.Object(HolidayBody)),
    },
  )
  .delete(
    "/:id",
    async ({ params, publicHolidayService }: any) => {
      await publicHolidayService.remove(params.id);
      return ok({ id: params.id });
    },
    { params: t.Object({ id: Uuid }) },
  );
