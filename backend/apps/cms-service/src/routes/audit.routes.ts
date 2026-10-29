import { jwtAuth, requireRole } from "@materialhub/guards";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

export const auditRoutes = new Elysia({ prefix: "/admin/audit-log" })
  .use(container)
  .use(jwtAuth)
  .use(requireRole("admin", "super_admin"))

  .get(
    "/",
    async ({ query, auditController }) => {
      const data = await auditController.list(query);
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    {
      query: t.Object({
        page: t.Optional(t.Number({ minimum: 1 })),
        limit: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
        actor_id: t.Optional(t.String({ format: "uuid" })),
        action: t.Optional(t.String()),
        entity_type: t.Optional(t.String()),
        date_from: t.Optional(t.String({ format: "date-time" })),
        date_to: t.Optional(t.String({ format: "date-time" })),
      }),
    },
  );
