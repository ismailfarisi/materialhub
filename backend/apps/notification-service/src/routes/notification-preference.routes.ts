import { timingSafeEqual } from "node:crypto";
import { config } from "@materialhub/config";
import { NotificationChannel, NotificationType } from "@materialhub/database";
import { jwtAuth } from "@materialhub/guards";
import { HttpError } from "@materialhub/plugins";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

export const notificationPreferenceRoutes = new Elysia({
  prefix: "/notifications/preferences",
})
  .use(container)

  // Internal endpoint for service-to-service calls (e.g., auth-service on registration)
  // Protected by shared internal service secret with constant-time comparison
  .post(
    "/seed-internal",
    ({ body, request, preferenceController }) => {
      const secret = request.headers.get("x-internal-secret") ?? "";
      const expected = config.internal.serviceSecret;
      const secretBuf = Buffer.from(secret);
      const expectedBuf = Buffer.from(expected);
      if (secretBuf.length !== expectedBuf.length || !timingSafeEqual(secretBuf, expectedBuf)) {
        throw new HttpError(403, "Forbidden", "FORBIDDEN");
      }
      return preferenceController.seedDefaultsForUser(body.user_id);
    },
    {
      body: t.Object({
        user_id: t.String({ minLength: 1 }),
      }),
    },
  )

  .use(jwtAuth)

  .get("/", ({ user, preferenceController }) => preferenceController.getPreferences(user!))

  .patch(
    "/",
    ({ user, body, preferenceController }) => preferenceController.bulkUpdate(user!, body.updates),
    {
      body: t.Object({
        updates: t.Array(
          t.Object({
            notification_type: t.Enum(NotificationType),
            channel: t.Enum(NotificationChannel),
            enabled: t.Boolean(),
          }),
          { minItems: 1 },
        ),
      }),
    },
  )

  .patch(
    "/:type/:channel",
    ({ user, params, body, preferenceController }) =>
      preferenceController.updateSingle(user!, params.type, params.channel, body.enabled),
    {
      params: t.Object({
        type: t.Enum(NotificationType),
        channel: t.Enum(NotificationChannel),
      }),
      body: t.Object({
        enabled: t.Boolean(),
      }),
    },
  )

  .post("/seed", ({ user, preferenceController }) => preferenceController.seedDefaults(user!));
