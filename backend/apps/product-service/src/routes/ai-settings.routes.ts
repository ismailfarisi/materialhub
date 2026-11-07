import { jwtAuth, requireRole } from "@materialhub/guards";
import { auditPlugin } from "@materialhub/plugins";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

export const aiSettingsRoutes = new Elysia({ prefix: "/admin/settings/ai/image-enhance" })
  .use(container)
  .use(jwtAuth)
  .use(requireRole("admin", "super_admin"))
  .use(auditPlugin)

  // GET — read current settings (masked api_key)
  .get("/", async ({ aiSettings }) => ({
    statusCode: 200,
    data: await aiSettings.getPublic(),
    timestamp: new Date().toISOString(),
  }))

  // PATCH — update. api_key is write-only; pass empty string to clear it.
  .patch(
    "/",
    async ({ body, user, aiSettings }) => {
      // biome-ignore lint/style/noNonNullAssertion: requireRole guarantees user
      await aiSettings.update(body, user!.id);
      return {
        statusCode: 200,
        data: await aiSettings.getPublic(),
        timestamp: new Date().toISOString(),
      };
    },
    {
      body: t.Object({
        enabled: t.Optional(t.Boolean()),
        model: t.Optional(t.String({ minLength: 1, maxLength: 100 })),
        prompt: t.Optional(t.String({ minLength: 1, maxLength: 600 })),
        per_vendor_monthly_cap: t.Optional(t.Integer({ minimum: 0, maximum: 10_000 })),
        per_vendor_per_minute_cap: t.Optional(t.Integer({ minimum: 0, maximum: 60 })),
        api_key: t.Optional(t.String({ maxLength: 200 })),
      }),
    },
  )

  // POST /test — run a single enhance against a sample key, return preview without persisting
  .post(
    "/test",
    async ({ body, aiEnhance, aiSettings }) => {
      const settings = await aiSettings.get();
      const result = await aiEnhance.enhance({
        sourceKey: body.sample_key,
        prompt: body.prompt ?? settings.prompt,
        model: settings.model,
        candidateUuid: crypto.randomUUID(),
        apiKey: settings.api_key,
      });
      return {
        statusCode: 200,
        data: {
          preview_url: result.processed.medium.url,
          no_change_detected: result.noChangeDetected,
        },
        timestamp: new Date().toISOString(),
      };
    },
    {
      body: t.Object({
        sample_key: t.String({ minLength: 1 }),
        prompt: t.Optional(t.String({ minLength: 1, maxLength: 600 })),
      }),
    },
  );
