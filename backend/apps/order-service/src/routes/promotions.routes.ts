import { jwtAuth, requireRole } from "@materialhub/guards";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

export const promotionsRoutes = new Elysia()
  .use(container)
  .use(jwtAuth)
  .group("/admin/promotions", (app) =>
    app.use(requireRole("admin", "super_admin")).get(
      "/",
      async ({ query, promotionsService }: any) => {
        const result = await promotionsService.getOverview(query);
        return { statusCode: 200, ...result, timestamp: new Date().toISOString() };
      },
      {
        query: t.Object({
          type: t.Optional(t.String()),
          status: t.Optional(t.String()),
          search: t.Optional(t.String()),
        }),
      },
    ),
  );
