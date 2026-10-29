import { jwtAuth, requireRole, vendorMembership } from "@materialhub/guards";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

export const dashboardRoutes = new Elysia()
  .use(container)
  .use(jwtAuth)

  .group("/admin/dashboard", (app) =>
    app
      .use(requireRole("admin", "super_admin"))
      .get("/stats", async ({ dashboardController }: any) => {
        const data = await dashboardController.adminStats();
        return { statusCode: 200, data, timestamp: new Date().toISOString() };
      })
      .get(
        "/revenue",
        async ({ query, dashboardController }: any) => {
          const data = await dashboardController.adminRevenue(query.period || "7d");
          return { statusCode: 200, data, timestamp: new Date().toISOString() };
        },
        {
          query: t.Object({
            period: t.Optional(t.Union([t.Literal("7d"), t.Literal("30d"), t.Literal("90d")])),
          }),
        },
      ),
  )

  .group("/vendor/dashboard", (app) =>
    app
      .use(vendorMembership("analytics.read"))
      .get("/stats", async ({ member, dashboardController }: any) => {
        const data = await dashboardController.vendorStats(member.vid);
        return { statusCode: 200, data, timestamp: new Date().toISOString() };
      })
      .get(
        "/revenue",
        async ({ member, query, dashboardController }: any) => {
          const data = await dashboardController.vendorRevenue(member.vid, query.period || "7d");
          return { statusCode: 200, data, timestamp: new Date().toISOString() };
        },
        {
          query: t.Object({
            period: t.Optional(t.Union([t.Literal("7d"), t.Literal("30d"), t.Literal("90d")])),
          }),
        },
      ),
  );
