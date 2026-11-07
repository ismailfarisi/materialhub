import { jwtAuth, vendorMembership } from "@materialhub/guards";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

/**
 * Phase 2 migration: replaces `requireRole("vendor") + vendorOwnership` with
 * `vendorMembership("inventory.write")`. The design matrix puts read access
 * for inventory under `inventory.write` (no separate `inventory.read`); if a
 * future use-case needs read-only inventory, add a permission then.
 */
export const inventoryRoutes = new Elysia({ prefix: "/inventory" })
  .use(container)
  .use(jwtAuth)
  .use(vendorMembership("inventory.write"))

  .get("/", async ({ query, member, inventoryController }: any) => {
    const data = await inventoryController.listForVendor(member.vid, query.product_id);
    return { statusCode: 200, data, timestamp: new Date().toISOString() };
  })

  .post(
    "/restock",
    async ({ body, member, inventoryController }: any) => {
      const data = await inventoryController.restock(member.vid, body);
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    {
      body: t.Object({
        product_id: t.String({ format: "uuid" }),
        variant_id: t.Optional(t.String({ format: "uuid" })),
        warehouse_id: t.Optional(t.String({ format: "uuid" })),
        quantity: t.Number({ minimum: 1 }),
        reference: t.Optional(t.String()),
      }),
    },
  )

  .post(
    "/adjust",
    async ({ body, member, inventoryController }: any) => {
      const data = await inventoryController.adjust(member.vid, body);
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    {
      body: t.Object({
        product_id: t.String({ format: "uuid" }),
        variant_id: t.Optional(t.String({ format: "uuid" })),
        warehouse_id: t.Optional(t.String({ format: "uuid" })),
        quantity: t.Number(),
        reason: t.String({ minLength: 1 }),
      }),
    },
  )

  .get("/movements", async ({ query, member, inventoryController }: any) => {
    const data = await inventoryController.getMovements(
      member.vid,
      query.product_id,
      query.page ? Math.max(1, Math.trunc(Number(query.page)) || 1) : undefined,
      query.limit ? Math.max(1, Math.trunc(Number(query.limit)) || 1) : undefined,
    );
    return { statusCode: 200, data, timestamp: new Date().toISOString() };
  })

  .get("/low-stock", async ({ member, inventoryController }: any) => {
    const data = await inventoryController.getLowStock(member.vid);
    return { statusCode: 200, data, timestamp: new Date().toISOString() };
  });
