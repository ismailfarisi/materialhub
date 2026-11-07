import { jwtAuth, vendorMembership } from "@materialhub/guards";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

/**
 * Read-only attribute endpoints for vendors.
 * Vendors need to list attributes and their values when configuring product variants.
 *
 * Phase 2 migration: replaces `requireRole("vendor") + vendorOwnership` with
 * `vendorMembership("products.read")` — these handlers don't read the vendor
 * context, but the guard still enforces an active vendor membership on the
 * caller before allowing the read.
 */
export const attributeRoutes = new Elysia({ prefix: "/attributes" })
  .use(container)
  .use(jwtAuth)
  .use(vendorMembership("products.read"))

  .get("/", async ({ query, attributeController }) => {
    const data = await attributeController.list(
      query.page ? Math.max(1, Math.trunc(Number(query.page)) || 1) : undefined,
      query.limit ? Math.max(1, Math.trunc(Number(query.limit)) || 1) : undefined,
      query.type,
    );
    return { statusCode: 200, data, timestamp: new Date().toISOString() };
  })

  .get(
    "/:id/values",
    async ({ params, attributeController }) => {
      const data = await attributeController.getValues(params.id);
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  );
