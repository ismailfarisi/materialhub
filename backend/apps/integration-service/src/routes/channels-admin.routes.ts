import { jwtAuth, requireRole } from "@materialhub/guards";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

const ok = (data: unknown, status = 200) => ({
  statusCode: status,
  data,
  timestamp: new Date().toISOString(),
});

export const channelsAdminRoutes = new Elysia({ prefix: "/admin/sales-channels" })
  .use(container)
  .use(jwtAuth)
  .use(requireRole("admin", "super_admin"))
  .get("/", async ({ channelController }: any) => ok(await channelController.list()))
  .get(
    "/:code",
    async ({ params, channelController }: any) => ok(await channelController.get(params.code)),
    { params: t.Object({ code: t.String() }) },
  )
  .patch(
    "/:code",
    async ({ params, body, channelController }: any) =>
      ok(await channelController.update(params.code, body)),
    {
      params: t.Object({ code: t.String() }),
      body: t.Object({
        display_name: t.Optional(t.String({ minLength: 1, maxLength: 100 })),
        is_enabled: t.Optional(t.Boolean()),
        config: t.Optional(t.Object({}, { additionalProperties: true })),
        feed_format: t.Optional(t.Union([t.Literal("xml"), t.Literal("csv")])),
        delta_enabled: t.Optional(t.Boolean()),
      }),
    },
  )
  .put(
    "/:code/credentials",
    async ({ params, body, channelController }: any) =>
      ok(await channelController.setCredentials(params.code, body.credentials)),
    {
      params: t.Object({ code: t.String() }),
      body: t.Object({ credentials: t.Object({}, { additionalProperties: true }) }),
    },
  )
  .get(
    "/:code/category-mappings",
    async ({ params, channelController }: any) =>
      ok(await channelController.listCategoryMappings(params.code)),
    { params: t.Object({ code: t.String() }) },
  )
  .put(
    "/:code/category-mappings",
    async ({ params, body, channelController }: any) =>
      ok(await channelController.upsertCategoryMapping(params.code, body)),
    {
      params: t.Object({ code: t.String() }),
      body: t.Object({
        category_id: t.String({ format: "uuid" }),
        external_category_id: t.String({ minLength: 1, maxLength: 64 }),
        external_category_path: t.Optional(t.Union([t.String(), t.Null()])),
      }),
    },
  )
  .delete(
    "/category-mappings/:id",
    async ({ params, channelController }: any) =>
      ok(await channelController.deleteCategoryMapping(params.id)),
    { params: t.Object({ id: t.String() }) },
  )
  .get(
    "/:code/runs",
    async ({ params, query, channelController, channelFeedRunRepo }: any) => {
      const limit = query.limit ?? 10;
      return ok(await channelController.listRuns(params.code, limit, channelFeedRunRepo));
    },
    {
      params: t.Object({ code: t.String() }),
      query: t.Object({ limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100 })) }),
    },
  )
  .get(
    "/:code/deliveries",
    async ({ params, query, channelController, channelDeliveryRepo }: any) => {
      const limit = query.limit ?? 20;
      return ok(await channelController.listDeliveries(params.code, limit, channelDeliveryRepo));
    },
    {
      params: t.Object({ code: t.String() }),
      query: t.Object({ limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100 })) }),
    },
  )
  .get(
    "/:code/stats",
    async ({ params, channelController, channelFeedRunRepo, channelDeliveryRepo }: any) =>
      ok(await channelController.stats(params.code, channelFeedRunRepo, channelDeliveryRepo)),
    { params: t.Object({ code: t.String() }) },
  )
  .post(
    "/:code/rebuild",
    async ({ params, channelController, feedBuildQueue }: any) =>
      ok(await channelController.rebuild(params.code, feedBuildQueue), 202),
    { params: t.Object({ code: t.String() }) },
  );
