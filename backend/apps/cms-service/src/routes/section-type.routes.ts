import { jwtAuth, requireRole } from "@materialhub/guards";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

// Public read: section-type registry is metadata; vendors need to fetch it
// to render the "Add Section" picker in their storefront editor.
export const publicSectionTypeRoutes = new Elysia({ prefix: "/section-types" })
  .use(container)
  .get("/", async ({ sectionTypeController }) => {
    const data = await sectionTypeController.list();
    return { statusCode: 200, data, timestamp: new Date().toISOString() };
  });

export const sectionTypeRoutes = new Elysia({ prefix: "/admin/section-types" })
  .use(container)

  // ─── Admin Routes ────────────────────────────────────────────────────────
  .use(jwtAuth)
  .use(requireRole("admin", "super_admin"))

  .get("/", async ({ sectionTypeController }) => {
    const data = await sectionTypeController.list();
    return { statusCode: 200, data, timestamp: new Date().toISOString() };
  })

  .post(
    "/",
    async ({ body, sectionTypeController, set }) => {
      const data = await sectionTypeController.create(body);
      set.status = 201;
      return { statusCode: 201, data, timestamp: new Date().toISOString() };
    },
    {
      body: t.Object({
        name: t.String({ pattern: "^[a-z][a-z0-9_]*$" }),
        label: t.Record(t.String(), t.String()),
        description: t.Optional(t.String()),
        icon: t.Optional(t.String()),
        settings_schema: t.Optional(t.Record(t.String(), t.Unknown())),
        max_per_layout: t.Optional(t.Integer({ minimum: 1 })),
        supports_bidding: t.Optional(t.Boolean()),
        default_settings: t.Optional(t.Record(t.String(), t.Unknown())),
      }),
    },
  )

  .put(
    "/:id",
    async ({ params, body, sectionTypeController }) => {
      const data = await sectionTypeController.update(params.id, body);
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({
        name: t.Optional(t.String({ pattern: "^[a-z][a-z0-9_]*$" })),
        label: t.Optional(t.Record(t.String(), t.String())),
        description: t.Optional(t.String()),
        icon: t.Optional(t.String()),
        settings_schema: t.Optional(t.Record(t.String(), t.Unknown())),
        max_per_layout: t.Optional(t.Integer({ minimum: 1 })),
        supports_bidding: t.Optional(t.Boolean()),
        default_settings: t.Optional(t.Record(t.String(), t.Unknown())),
      }),
    },
  );
