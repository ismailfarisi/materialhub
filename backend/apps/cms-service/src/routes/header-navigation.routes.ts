import { jwtAuth, requireRole } from "@materialhub/guards";
import { auditPlugin } from "@materialhub/plugins";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

const tabSchema = t.Object({
  id: t.String(),
  kind: t.Union([t.Literal("category"), t.Literal("custom")]),
  category_id: t.Union([t.String({ format: "uuid" }), t.Null()]),
  href_override: t.Union([t.String(), t.Null()]),
  label: t.Record(t.String(), t.String()),
  show_subcategories: t.Boolean(),
  enabled: t.Boolean(),
  position: t.Integer(),
  brand_list: t.Object({
    title: t.Record(t.String(), t.String()),
    see_all_href: t.String(),
    brand_ids: t.Array(t.String({ format: "uuid" })),
  }),
  promo_tiles: t.Array(
    t.Object({
      id: t.String(),
      image_url: t.String(),
      title: t.Record(t.String(), t.String()),
      cta_text: t.Record(t.String(), t.String()),
      href: t.String(),
    }),
  ),
});

const configSchema = t.Object({ tabs: t.Array(tabSchema) });

export const adminHeaderNavRoutes = new Elysia({
  prefix: "/admin/header-navigation",
})
  .use(container)
  .use(jwtAuth)
  .use(requireRole("admin", "super_admin"))
  .use(auditPlugin)

  .get("/draft", async ({ headerNavController }) => {
    const data = await headerNavController.getDraft();
    return { statusCode: 200, data, timestamp: new Date().toISOString() };
  })

  .put(
    "/draft",
    async ({ body, headerNavController, user }) => {
      const userId = (user as { id: string }).id;
      const data = await headerNavController.upsertDraft(
        body as unknown as Parameters<typeof headerNavController.upsertDraft>[0],
        userId,
      );
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    { body: configSchema },
  )

  .post("/publish", async ({ headerNavController, user }) => {
    const userId = (user as { id: string }).id;
    const data = await headerNavController.publish(userId);
    return { statusCode: 200, data, timestamp: new Date().toISOString() };
  });
