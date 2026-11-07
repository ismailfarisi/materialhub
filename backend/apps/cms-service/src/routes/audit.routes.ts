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
        actor: t.Optional(t.String({ maxLength: 200 })),
        action: t.Optional(t.String({ maxLength: 100 })),
        entity_type: t.Optional(t.String({ maxLength: 100 })),
        // A date input ("2026-11-07") or a full ISO date-time.
        date_from: t.Optional(t.String({ maxLength: 40 })),
        date_to: t.Optional(t.String({ maxLength: 40 })),
      }),
    },
  )

  .get("/facets", async ({ auditController }) => {
    const data = await auditController.facets();
    return { statusCode: 200, data, timestamp: new Date().toISOString() };
  });
