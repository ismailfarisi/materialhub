import { jwtAuth, requireRole } from "@materialhub/guards";
import { auditPlugin } from "@materialhub/plugins";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";
import type { TicketIdentity } from "../domain/support/support.service.ts";
import { subscribeTicket } from "../lib/ticket-events.ts";

function resolveIdentity(user: { id: string } | null, request: Request): TicketIdentity {
  if (user?.id) return { userId: user.id, guestSession: null };
  const guestSession = request.headers.get("x-guest-session");
  return { userId: null, guestSession: guestSession ?? null };
}

const ticketQuerySchema = t.Object({
  page: t.Optional(t.Number({ minimum: 1 })),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
  status: t.Optional(
    t.Union([
      t.Literal("open"),
      t.Literal("in_progress"),
      t.Literal("waiting_customer"),
      t.Literal("resolved"),
      t.Literal("closed"),
    ]),
  ),
  priority: t.Optional(
    t.Union([t.Literal("low"), t.Literal("medium"), t.Literal("high"), t.Literal("urgent")]),
  ),
  assigned_to: t.Optional(t.String({ format: "uuid" })),
  date_from: t.Optional(t.String({ format: "date-time" })),
  date_to: t.Optional(t.String({ format: "date-time" })),
});

const messageBodySchema = t.Object({
  message: t.String({ minLength: 1 }),
  attachment_urls: t.Optional(t.Array(t.String())),
  is_internal: t.Optional(t.Boolean()),
});

export const supportRoutes = new Elysia({ prefix: "/support" })
  .use(container)
  .use(jwtAuth)
  .use(auditPlugin)

  // ─── Customer Routes ─────────────────────────────────────────────────────
  .post(
    "/tickets",
    async ({ body, user, request, supportController, set }) => {
      const data = await supportController.createTicket(body, resolveIdentity(user, request));
      set.status = 201;
      return { statusCode: 201, data, timestamp: new Date().toISOString() };
    },
    {
      body: t.Object({
        subject: t.String({ minLength: 1, maxLength: 255 }),
        category: t.Union([
          t.Literal("order"),
          t.Literal("payment"),
          t.Literal("product"),
          t.Literal("account"),
          t.Null(),
        ]),
        order_id: t.Optional(t.Union([t.String({ format: "uuid" }), t.Null()])),
        message: t.String({ minLength: 1 }),
        guest_email: t.Optional(t.String({ format: "email", maxLength: 255 })),
        guest_name: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
      }),
    },
  )

  .get(
    "/tickets",
    async ({ query, user, request, supportController }) => {
      const data = await supportController.listUserTickets(resolveIdentity(user, request), query);
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    { query: ticketQuerySchema },
  )

  .get(
    "/tickets/:id",
    async ({ params, user, request, supportController }) => {
      const data = await supportController.getUserTicket(params.id, resolveIdentity(user, request));
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )

  .post(
    "/tickets/:id/messages",
    async ({ params, body, user, request, supportController, set }) => {
      const data = await supportController.addCustomerMessage(
        params.id,
        resolveIdentity(user, request),
        body,
      );
      set.status = 201;
      return { statusCode: 201, data, timestamp: new Date().toISOString() };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: messageBodySchema,
    },
  )

  .get(
    "/tickets/:id/stream",
    async ({ params, user, request, query, supportController }) => {
      // Identity: header for header-capable fetch, or ?guest_session= for robustness.
      const guestFromQuery = (query as { guest_session?: string }).guest_session ?? null;
      const identity = user?.id
        ? { userId: user.id, guestSession: null }
        : { userId: null, guestSession: request.headers.get("x-guest-session") ?? guestFromQuery };

      // Authorize: throws 404 if the caller does not own the ticket.
      await supportController.getUserTicket(params.id, identity);

      let cleanup: (() => Promise<void>) | null = null;
      let heartbeat: ReturnType<typeof setInterval> | null = null;
      let closed = false;

      const releaseResources = async () => {
        if (heartbeat) {
          clearInterval(heartbeat);
          heartbeat = null;
        }
        if (cleanup) {
          const c = cleanup;
          cleanup = null;
          await c();
        }
      };

      const stream = new ReadableStream({
        async start(controller) {
          const enc = (s: string) => controller.enqueue(new TextEncoder().encode(s));

          const shutdown = async () => {
            if (closed) return;
            closed = true;
            await releaseResources();
            try {
              controller.close();
            } catch {
              /* already closed */
            }
          };

          // Register abort handling BEFORE opening the Redis connection so a
          // disconnect during auth/subscribe still triggers cleanup.
          request.signal.addEventListener("abort", shutdown);
          if (request.signal.aborted) {
            await shutdown();
            return;
          }

          enc(": connected\n\n");

          cleanup = await subscribeTicket(params.id, (payload) => {
            try {
              enc(`data: ${payload}\n\n`);
            } catch {
              /* controller closed */
            }
          });

          // If the client disconnected while we were subscribing, the abort
          // listener already ran shutdown() as a no-op (cleanup was still null).
          // Release the now-assigned connection directly — releaseResources() is
          // idempotent, so this cannot double-free; controller.close() may already
          // have run, hence the try/catch.
          if (request.signal.aborted) {
            await releaseResources();
            try {
              controller.close();
            } catch {
              /* already closed */
            }
            return;
          }

          heartbeat = setInterval(() => {
            try {
              enc(": hb\n\n");
            } catch {
              if (heartbeat) clearInterval(heartbeat);
            }
          }, 25000);
        },
        async cancel() {
          closed = true;
          await releaseResources();
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      query: t.Object({ guest_session: t.Optional(t.String()) }),
    },
  )

  // ─── Admin Routes ─────────────────────────────────────────────────────────
  .use(requireRole("admin", "super_admin"))

  .get(
    "/admin/tickets",
    async ({ query, supportController }) => {
      const data = await supportController.listAllTickets(query);
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    { query: ticketQuerySchema },
  )

  .get(
    "/admin/tickets/:id",
    async ({ params, supportController }) => {
      const data = await supportController.getAdminTicket(params.id);
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )

  .put(
    "/admin/tickets/:id",
    async ({ params, body, supportController, audit }: any) => {
      const data = await supportController.updateTicket(params.id, body);
      audit.action = "ticket.update";
      audit.entity_type = "ticket";
      audit.entity_id = params.id;
      audit.metadata = body;
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({
        status: t.Optional(
          t.Union([
            t.Literal("open"),
            t.Literal("in_progress"),
            t.Literal("waiting_customer"),
            t.Literal("resolved"),
            t.Literal("closed"),
          ]),
        ),
        priority: t.Optional(
          t.Union([t.Literal("low"), t.Literal("medium"), t.Literal("high"), t.Literal("urgent")]),
        ),
        assigned_to: t.Optional(t.Union([t.String({ format: "uuid" }), t.Null()])),
      }),
    },
  )

  .post(
    "/admin/tickets/:id/messages",
    async ({ params, body, user, supportController, set }: any) => {
      const data = await supportController.addAdminMessage(params.id, user!.id, user!.role, body);
      set.status = 201;
      return { statusCode: 201, data, timestamp: new Date().toISOString() };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: messageBodySchema,
    },
  );
