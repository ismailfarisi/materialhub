import { DisputeStatus } from "@materialhub/database";
import {
  AssignDisputeBody,
  DisputeMessageBody,
  OpenDisputeBody,
  ResolveDisputeBody,
} from "@materialhub/dto";
import { jwtAuth, requireRole, vendorMembership } from "@materialhub/guards";
import { NotFoundError, auditPlugin } from "@materialhub/plugins";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

const uuidParam = t.Object({ id: t.String({ format: "uuid" }) });

const paginationQuery = t.Object({
  page: t.Optional(t.Integer({ minimum: 1, default: 1 })),
  limit: t.Optional(t.Integer({ minimum: 1, maximum: 100, default: 20 })),
});

const ts = () => new Date().toISOString();

export const disputeRoutes = new Elysia()
  .use(container)
  .use(jwtAuth)
  .use(auditPlugin)

  // ── /orders — customer: open a dispute on an order ─────────────────────────
  .group("/orders", (app) =>
    app.use(requireRole("customer")).post(
      "/:id/dispute",
      async ({ user, params, body, disputeController, audit }: any) => {
        const result = await disputeController.openDispute(params.id, user.id, body);
        audit.action = "dispute.open";
        audit.entity_type = "dispute";
        audit.entity_id = result?.id;
        audit.metadata = { order_id: params.id, ...body };
        audit.force = true; // /orders isn't in the prefix allowlist
        return { statusCode: 201, data: result, timestamp: ts() };
      },
      {
        params: uuidParam,
        body: OpenDisputeBody,
      },
    ),
  )

  // ── /buyer/disputes — customer: list & view own disputes ───────────────────
  .group("/buyer/disputes", (app) =>
    app
      .use(requireRole("customer"))
      .get(
        "/",
        async ({ user, query, disputeController }: any) => {
          const result = await disputeController.listForBuyer(user.id, query);
          return { statusCode: 200, ...result, timestamp: ts() };
        },
        {
          query: t.Object({
            page: t.Optional(t.Integer({ minimum: 1, default: 1 })),
            limit: t.Optional(t.Integer({ minimum: 1, maximum: 100, default: 20 })),
            status: t.Optional(t.Enum(DisputeStatus)),
            order_id: t.Optional(t.String({ format: "uuid" })),
          }),
        },
      )
      .get(
        "/:id",
        async ({ user, params, disputeController }: any) => {
          const result = await disputeController.getForBuyer(params.id, user.id);
          if (!result) throw new NotFoundError("Dispute not found");
          return { statusCode: 200, data: result, timestamp: ts() };
        },
        {
          params: uuidParam,
        },
      ),
  )

  // ── /admin/disputes — admin: manage all disputes ───────────────────────────
  .group("/admin/disputes", (app) =>
    app
      .use(requireRole("admin", "super_admin"))
      .get(
        "/",
        async ({ query, disputeController }: any) => {
          const result = await disputeController.listForAdmin(query);
          return { statusCode: 200, ...result, timestamp: ts() };
        },
        {
          query: t.Object({
            page: t.Optional(t.Integer({ minimum: 1, default: 1 })),
            limit: t.Optional(t.Integer({ minimum: 1, maximum: 100, default: 20 })),
            status: t.Optional(t.Enum(DisputeStatus)),
            assigned_to: t.Optional(t.String({ format: "uuid" })),
          }),
        },
      )
      .get(
        "/:id",
        async ({ params, disputeController }: any) => {
          const result = await disputeController.getForAdmin(params.id);
          return { statusCode: 200, data: result, timestamp: ts() };
        },
        {
          params: uuidParam,
        },
      )
      .patch(
        "/:id/assign",
        async ({ user, params, body, disputeController, audit }: any) => {
          const result = await disputeController.assign(params.id, user.id, body);
          audit.action = "dispute.assign";
          audit.entity_type = "dispute";
          audit.entity_id = params.id;
          audit.metadata = { assignee_id: body.assignee_id };
          return { statusCode: 200, data: result, timestamp: ts() };
        },
        {
          params: uuidParam,
          body: AssignDisputeBody,
        },
      )
      .patch(
        "/:id/escalate",
        async ({ user, params, disputeController, audit }: any) => {
          const result = await disputeController.escalate(params.id, user.id);
          audit.action = "dispute.escalate";
          audit.entity_type = "dispute";
          audit.entity_id = params.id;
          return { statusCode: 200, data: result, timestamp: ts() };
        },
        {
          params: uuidParam,
        },
      )
      .patch(
        "/:id/resolve",
        async ({ user, params, body, disputeController, audit }: any) => {
          const result = await disputeController.resolve(params.id, user.id, body);
          audit.action = "dispute.resolve";
          audit.entity_type = "dispute";
          audit.entity_id = params.id;
          audit.metadata = body;
          return { statusCode: 200, data: result, timestamp: ts() };
        },
        {
          params: uuidParam,
          body: ResolveDisputeBody,
        },
      )
      .patch(
        "/:id/close",
        async ({ user, params, disputeController, audit }: any) => {
          const result = await disputeController.close(params.id, user.id);
          audit.action = "dispute.close";
          audit.entity_type = "dispute";
          audit.entity_id = params.id;
          return { statusCode: 200, data: result, timestamp: ts() };
        },
        {
          params: uuidParam,
        },
      ),
  )

  // ── /disputes — customer+vendor+admin: messages thread ────────────────────
  .group("/disputes", (app) =>
    app
      .use(requireRole("customer", "admin", "super_admin"))
      .post(
        "/:id/messages",
        async ({ user, params, body, disputeController }: any) => {
          const result = await disputeController.addMessage(params.id, user, body);
          return { statusCode: 201, data: result, timestamp: ts() };
        },
        {
          params: uuidParam,
          body: DisputeMessageBody,
        },
      )
      .get(
        "/:id/messages",
        async ({ user, params, query, disputeController }: any) => {
          const result = await disputeController.listMessages(params.id, user, query);
          return { statusCode: 200, ...result, timestamp: ts() };
        },
        {
          params: uuidParam,
          query: paginationQuery,
        },
      ),
  )

  // ── /vendor/disputes — the supplier a dispute is raised against ────────────
  // Reads use `orders.read` (owner / manager / staff / viewer), posting a
  // message uses `orders.fulfill` (owner / manager / staff), as on
  // /vendor/orders. Scoped to `dispute.vendor_id` of the active membership;
  // internal admin notes are never returned and cannot be posted.
  .group("/vendor/disputes", (app) =>
    app
      .guard({}, (a) =>
        a
          .use(vendorMembership("orders.read"))
          .get(
            "/",
            async ({ member, query, disputeController }: any) => {
              const result = await disputeController.listForVendor(member.vid, query);
              return { statusCode: 200, ...result, timestamp: ts() };
            },
            {
              query: t.Object({
                page: t.Optional(t.Integer({ minimum: 1, default: 1 })),
                limit: t.Optional(t.Integer({ minimum: 1, maximum: 100, default: 20 })),
                status: t.Optional(t.Enum(DisputeStatus)),
                order_id: t.Optional(t.String({ format: "uuid" })),
              }),
            },
          )
          .get(
            "/:id",
            async ({ member, params, disputeController }: any) => {
              const result = await disputeController.getForVendor(params.id, member.vid);
              return { statusCode: 200, data: result, timestamp: ts() };
            },
            { params: uuidParam },
          )
          .get(
            "/:id/messages",
            async ({ member, params, query, disputeController }: any) => {
              const result = await disputeController.listVendorMessages(
                params.id,
                member.vid,
                query,
              );
              return { statusCode: 200, ...result, timestamp: ts() };
            },
            { params: uuidParam, query: paginationQuery },
          ),
      )
      .guard({}, (a) =>
        a.use(vendorMembership("orders.fulfill")).post(
          "/:id/messages",
          async ({ member, user, params, body, disputeController }: any) => {
            const result = await disputeController.addVendorMessage(
              params.id,
              member.vid,
              user.id,
              body,
            );
            return { statusCode: 201, data: result, timestamp: ts() };
          },
          {
            params: uuidParam,
            body: t.Object({
              message: t.String({ minLength: 1, maxLength: 5000 }),
              attachment_urls: t.Optional(t.Array(t.String(), { maxItems: 5 })),
            }),
          },
        ),
      ),
  );
