import { jwtAuth, requireRole, vendorMembership } from "@materialhub/guards";
// shipping.routes.ts
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

// Vendor: list own warehouses (read-only), scoped to the caller's vendor via
// member.vid. Readable by fulfilment staff and by anyone who can edit stock —
// the product form's inventory tab needs the warehouse list to target a
// restock/adjust. Lives at the service root (not under /shipping) because the
// gateway proxies the /vendor/warehouses prefix verbatim.
export const vendorWarehouseRoutes = new Elysia({ prefix: "/vendor/warehouses" })
  .use(container)
  .use(jwtAuth)
  .use(vendorMembership("orders.fulfill", "inventory.write"))
  .get("/", async ({ member, shippingController }: any) => {
    const data = await shippingController.listVendorWarehouses(member.vid);
    return { statusCode: 200, data, timestamp: new Date().toISOString() };
  });

export const shippingRoutes = new Elysia({ prefix: "/shipping" })
  .use(container)
  .get("/health", () => ({
    status: "ok",
    service: "order-service-shipping",
    timestamp: new Date().toISOString(),
  }))
  .get(
    "/delivery-zones/lookup",
    async ({ query, shippingController }) => {
      const zone = await shippingController.lookupZone(Number(query.lat), Number(query.lng));
      return { statusCode: 200, data: zone, timestamp: new Date().toISOString() };
    },
    {
      query: t.Object({ lat: t.String(), lng: t.String() }),
    },
  )
  .get("/delivery-zones", async ({ shippingController }) => {
    const zones = await shippingController.listZones();
    return { statusCode: 200, data: zones, timestamp: new Date().toISOString() };
  })
  .use(jwtAuth)
  .use(requireRole("admin", "super_admin"))
  .get(
    "/warehouses",
    async ({ query, shippingController }: any) => {
      const data = await shippingController.listWarehouses(query.vendor_id, {
        includeInactive: query.include_inactive === "true",
      });
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    {
      query: t.Object({
        vendor_id: t.Optional(t.String({ format: "uuid" })),
        include_inactive: t.Optional(t.String()),
      }),
    },
  )
  .post(
    "/delivery-zones",
    async ({ body, shippingController, set }: any) => {
      const zone = await shippingController.createZone(body);
      set.status = 201;
      return { statusCode: 201, data: zone, timestamp: new Date().toISOString() };
    },
    {
      body: t.Object({
        name: t.String(),
        slug: t.String(),
        city: t.String(),
        emirate: t.String(),
        country_code: t.Optional(t.String()),
      }),
    },
  )
  .post(
    "/shipping-rates",
    async ({ body, shippingController, set }: any) => {
      const rate = await shippingController.createRate(body);
      set.status = 201;
      return { statusCode: 201, data: rate, timestamp: new Date().toISOString() };
    },
    {
      body: t.Object({
        name: t.String(),
        method: t.String(),
        base_cost: t.Integer(),
        per_kg_cost: t.Optional(t.Integer()),
        free_above: t.Optional(t.Integer()),
        zone_id: t.Optional(t.String({ format: "uuid" })),
        vendor_id: t.Optional(t.String({ format: "uuid" })),
        estimated_days_min: t.Optional(t.Integer()),
        estimated_days_max: t.Optional(t.Integer()),
      }),
    },
  )
  .post(
    "/warehouses",
    async ({ body, shippingController, set }: any) => {
      const wh = await shippingController.createWarehouse(body);
      set.status = 201;
      return { statusCode: 201, data: wh, timestamp: new Date().toISOString() };
    },
    {
      body: t.Object({
        name: t.String(),
        code: t.String(),
        address_line_1: t.String(),
        address_line_2: t.Optional(t.String()),
        city: t.String(),
        emirate: t.String(),
        country_code: t.Optional(t.String()),
        vendor_id: t.Optional(t.String({ format: "uuid" })),
        zone_id: t.Optional(t.String({ format: "uuid" })),
        contact_phone: t.Optional(t.String()),
        contact_email: t.Optional(t.String()),
        is_default: t.Optional(t.Boolean()),
      }),
    },
  )
  .patch(
    "/warehouses/:id",
    async ({ params, body, shippingController }: any) => {
      const wh = await shippingController.updateWarehouse(params.id, body);
      return { statusCode: 200, data: wh, timestamp: new Date().toISOString() };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({
        name: t.Optional(t.String()),
        code: t.Optional(t.String()),
        address_line_1: t.Optional(t.String()),
        address_line_2: t.Optional(t.String()),
        city: t.Optional(t.String()),
        emirate: t.Optional(t.String()),
        country_code: t.Optional(t.String()),
        zone_id: t.Optional(t.String({ format: "uuid" })),
        contact_phone: t.Optional(t.String()),
        contact_email: t.Optional(t.String()),
        is_active: t.Optional(t.Boolean()),
        // Delivery promise settings (workstream 5)
        dispatch_cutoff_time: t.Optional(t.String({ pattern: "^([01][0-9]|2[0-3]):[0-5][0-9]$" })),
        handling_days: t.Optional(t.Integer({ minimum: 0, maximum: 60 })),
        working_days: t.Optional(t.Array(t.Integer({ minimum: 0, maximum: 6 }), { minItems: 1 })),
        same_day_emirates: t.Optional(t.Array(t.String({ maxLength: 50 }))),
        next_day_emirates: t.Optional(t.Array(t.String({ maxLength: 50 }))),
      }),
    },
  )
  .post(
    "/warehouses/:id/default",
    async ({ params, shippingController }: any) => {
      const wh = await shippingController.setDefaultWarehouse(params.id);
      return { statusCode: 200, data: wh, timestamp: new Date().toISOString() };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
    },
  )
  .delete(
    "/warehouses/:id",
    async ({ params, shippingController }: any) => {
      await shippingController.deleteWarehouse(params.id);
      return { statusCode: 200, message: "ok", timestamp: new Date().toISOString() };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
    },
  );
