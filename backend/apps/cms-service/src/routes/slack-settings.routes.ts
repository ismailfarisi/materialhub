import { jwtAuth, requireRole } from "@materialhub/guards";
import { auditPlugin } from "@materialhub/plugins";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

export const slackSettingsRoutes = new Elysia({ prefix: "/support/admin/slack-settings" })
  .use(container)
  .use(jwtAuth)
  .use(auditPlugin)
  .use(requireRole("admin", "super_admin"))

  .get("/", async ({ slackController }) => {
    const data = await slackController.getPublic();
    return { statusCode: 200, data, timestamp: new Date().toISOString() };
  })

  .post("/test", async ({ slackController }) => {
    const data = await slackController.test();
    return { statusCode: 200, data, timestamp: new Date().toISOString() };
  })

  .use(requireRole("super_admin"))
  .put(
    "/",
    async ({ body, user, slackController, audit }) => {
      const data = await slackController.update(body, user!.id);
      audit.action = "slack.settings.update";
      audit.entity_type = "setting";
      audit.entity_id = "slack_support";
      // Never log secret values.
      audit.metadata = {
        enabled: body.enabled,
        channel_id: body.channel_id,
        bot_token_changed: Boolean(body.bot_token),
        signing_secret_changed: Boolean(body.signing_secret),
      };
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    {
      body: t.Object({
        enabled: t.Optional(t.Boolean()),
        channel_id: t.Optional(t.Union([t.String(), t.Null()])),
        bot_token: t.Optional(t.String()),
        signing_secret: t.Optional(t.String()),
      }),
    },
  );
