import { timingSafeEqual } from "node:crypto";
import { config } from "@materialhub/config";
import { NotificationListQuery, SendNotificationBody } from "@materialhub/dto";
import { jwtAuth } from "@materialhub/guards";
import { ForbiddenError, HttpError } from "@materialhub/plugins";
import { Elysia } from "elysia";
import { container } from "../container.ts";

export const notificationRoutes = new Elysia({ prefix: "/notifications" })
  .use(container)

  .get("/health", () => ({
    status: "ok",
    service: "notification-service",
    timestamp: new Date().toISOString(),
  }))

  // Internal service-to-service send endpoint gated by x-internal-secret.
  // Placed BEFORE `.use(jwtAuth)` so it does NOT inherit JWT gating, matching
  // the notification-preference.routes.ts `/seed-internal` pattern.
  // Other backend services call this route to send a notification on a user's behalf.
  .post(
    "/send-internal",
    ({ body, request, set, notificationController }: any) => {
      const secret = request.headers.get("x-internal-secret") ?? "";
      const expected = config.internal.serviceSecret;
      const secretBuf = Buffer.from(secret);
      const expectedBuf = Buffer.from(expected);
      if (secretBuf.length !== expectedBuf.length || !timingSafeEqual(secretBuf, expectedBuf)) {
        throw new HttpError(403, "Forbidden", "FORBIDDEN");
      }
      set.status = 201;
      return notificationController.send(body);
    },
    { body: SendNotificationBody },
  )

  .use(jwtAuth)

  .get(
    "/",
    async ({ user, query, set, notificationController }: any) => {
      const result = await notificationController.list(user, query);
      const unreadCount = (await notificationController.unreadCount(user.id)) || 0;
      set.headers["X-Unread-Count"] = String(unreadCount);
      return { statusCode: 200, ...result, timestamp: new Date().toISOString() };
    },
    { query: NotificationListQuery },
  )

  .get("/stream", async ({ user, set }: any) => {
    set.headers["Content-Type"] = "text/event-stream";
    set.headers["Cache-Control"] = "no-cache";
    set.headers.Connection = "keep-alive";

    // Return a ReadableStream for SSE
    const stream = new ReadableStream({
      start(controller) {
        // Send initial heartbeat
        controller.enqueue(": heartbeat\n\n");

        // TODO: Redis Pub/Sub subscription will be wired in container task
        // For now, just keep the connection alive with periodic heartbeats
        const heartbeat = setInterval(() => {
          try {
            controller.enqueue(": heartbeat\n\n");
          } catch {
            clearInterval(heartbeat);
          }
        }, 30000);
      },
    });

    return new Response(stream);
  })

  .post(
    "/send",
    ({ body, set, user, notificationController }) => {
      // Only admins can send notifications to arbitrary users
      if (!user || !["admin", "super_admin"].includes(user.role)) {
        throw new ForbiddenError("Only admins can send notifications");
      }
      set.status = 201;
      return notificationController.send(body);
    },
    { body: SendNotificationBody },
  )

  .patch("/read-all", async ({ user, notificationController }: any) => {
    const result = await notificationController.readAll(user.id);
    return { statusCode: 200, data: result, timestamp: new Date().toISOString() };
  })

  .patch("/:id/read", ({ params, user, notificationController }) =>
    notificationController.markAsRead(params.id, user!.id),
  );
