import { jwtAuth, requireRole } from "@materialhub/guards";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

export const productAiSettingsRoutes = new Elysia({
  prefix: "/admin/settings/ai/product-content",
})
  .use(container)
  .use(jwtAuth)
  .use(requireRole("admin", "super_admin"))
  .get("/", async ({ productAiSettings }) => ({
    statusCode: 200,
    data: await productAiSettings.getPublic(),
    timestamp: new Date().toISOString(),
  }))
  .patch(
    "/",
    async ({ body, productAiSettings, user }) => {
      await productAiSettings.update(body, user!.id);
      return {
        statusCode: 200,
        data: await productAiSettings.getPublic(),
        timestamp: new Date().toISOString(),
      };
    },
    {
      body: t.Object({
        enabled: t.Optional(t.Boolean()),
        base_url: t.Optional(t.String({ minLength: 1, maxLength: 300 })),
        model: t.Optional(t.String({ minLength: 1, maxLength: 100 })),
        prompt: t.Optional(t.String({ minLength: 1, maxLength: 2000 })),
        timeout_ms: t.Optional(t.Integer({ minimum: 5000, maximum: 300000 })),
        api_key: t.Optional(t.String({ maxLength: 300 })),
      }),
    },
  );
