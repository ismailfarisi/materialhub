import { jwtAuth, requireRole } from "@materialhub/guards";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

export const recentSearchRoutes = new Elysia({ prefix: "/me/recent-searches" })
  .use(container)
  .use(jwtAuth)
  .use(requireRole("customer", "admin", "super_admin"))

  .get("/", async ({ user, recentSearchService }: any) => {
    const data = await recentSearchService.list(user!.id, 10);
    return { statusCode: 200, data, timestamp: new Date().toISOString() };
  })

  .post(
    "/",
    async ({ body, user, recentSearchService, set }: any) => {
      await recentSearchService.record(user!.id, body.query);
      set.status = 204;
    },
    { body: t.Object({ query: t.String({ minLength: 1, maxLength: 200 }) }) },
  )

  .delete(
    "/",
    async ({ query, user, recentSearchService, set }: any) => {
      await recentSearchService.clear(user!.id, query.query);
      set.status = 204;
    },
    { query: t.Object({ query: t.Optional(t.String()) }) },
  );
