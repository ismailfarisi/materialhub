import type { BrandStatus } from "@materialhub/database";
import { jwtAuth, requireRole } from "@materialhub/guards";
import { auditPlugin } from "@materialhub/plugins";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

export const brandAdminRoutes = new Elysia({ prefix: "/admin/brands" })
  .use(container)
  .use(jwtAuth)
  .use(requireRole("admin", "super_admin"))
  .use(auditPlugin)

  .get(
    "/",
    async ({ query, brandController }) => {
      const data = await brandController.listForAdmin(
        query.page ? Number(query.page) : undefined,
        query.limit ? Number(query.limit) : undefined,
        query.search,
      );
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    {
      query: t.Object({
        page: t.Optional(t.String()),
        limit: t.Optional(t.String()),
        search: t.Optional(t.String()),
      }),
    },
  )

  .post(
    "/",
    async ({ body, brandController, set }) => {
      const data = await brandController.create(body);
      set.status = 201;
      return { statusCode: 201, data, timestamp: new Date().toISOString() };
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 200 }),
        name_ar: t.Optional(t.String()),
        logo_url: t.Optional(t.String()),
        description: t.Optional(t.String()),
      }),
    },
  )

  .patch(
    "/:id",
    async ({ params, body, brandController }) => {
      const data = await brandController.update(params.id, body);
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({
        name: t.Optional(t.String({ minLength: 1, maxLength: 200 })),
        name_ar: t.Optional(t.String()),
        logo_url: t.Optional(t.String()),
        description: t.Optional(t.String()),
      }),
    },
  )

  .delete(
    "/:id",
    async ({ params, brandController }) => {
      await brandController.remove(params.id);
      return { statusCode: 200, message: "Brand deleted", timestamp: new Date().toISOString() };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )

  .post("/recompute-counts", async ({ brandController }) => {
    const data = await brandController.recomputeProductCounts();
    return { statusCode: 200, data, timestamp: new Date().toISOString() };
  })

  // ─── Vendor submissions ──────────────────────────────────────────────
  // Brands a vendor asked for because the catalogue was missing one. They
  // already exist as rows and are already attachable to that vendor's
  // products; approving is what makes them public.

  .get(
    "/submissions",
    async ({ query, brandController }) => {
      const data = await brandController.listSubmissions({
        status: query.status as BrandStatus | undefined,
        page: query.page ? Number(query.page) : undefined,
        limit: query.limit ? Number(query.limit) : undefined,
      });
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    {
      query: t.Object({
        status: t.Optional(
          t.Union([t.Literal("pending"), t.Literal("approved"), t.Literal("rejected")]),
        ),
        page: t.Optional(t.String()),
        limit: t.Optional(t.String()),
      }),
    },
  )

  .post(
    "/:id/approve",
    // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the admin route pattern
    async ({ params, user, brandController }: any) => {
      const data = await brandController.approveSubmission(params.id, user.id);
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )

  .post(
    "/:id/reject",
    // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the admin route pattern
    async ({ params, body, user, brandController }: any) => {
      const data = await brandController.rejectSubmission(params.id, user.id, body.reason);
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      // The reason goes back to the vendor, so it is required, not optional.
      body: t.Object({ reason: t.String({ minLength: 1, maxLength: 1000 }) }),
    },
  );
