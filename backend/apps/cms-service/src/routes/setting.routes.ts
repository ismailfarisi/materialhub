import { jwtAuth, requireRole } from "@materialhub/guards";
import { auditPlugin } from "@materialhub/plugins";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

export const settingRoutes = new Elysia({ prefix: "/settings" })
  .use(container)

  // ─── Public Route ────────────────────────────────────────────────────────
  .get("/public", async ({ settingController }) => {
    const data = await settingController.getPublic();
    return { statusCode: 200, data, timestamp: new Date().toISOString() };
  })

  // ─── Admin Route (read) ──────────────────────────────────────────────────
  .use(jwtAuth)
  .use(requireRole("admin", "super_admin"))

  .get(
    "/",
    async ({ query, settingController }) => {
      const data = await settingController.list(query.group);
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    { query: t.Object({ group: t.Optional(t.String()) }) },
  )

  // ─── Super Admin Route (write) ───────────────────────────────────────────
  .use(requireRole("super_admin"))
  .use(auditPlugin)

  .put(
    "/:key",
    async ({ params, body, user, settingController, audit }) => {
      audit.action = "setting.update";
      audit.entity_type = "site_setting";
      audit.entity_id = params.key;
      const data = await settingController.update(params.key, body.value, user!.id);
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    {
      params: t.Object({ key: t.String() }),
      body: t.Object({ value: t.String() }),
    },
  );
