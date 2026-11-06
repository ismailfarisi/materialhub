// Request for quotation (RFQ) routes.
//
//   /buyer/quotes   customer: create, list, view, message, accept, decline, cancel
//   /vendor/quotes  vendor member: inbox, view, respond, message, decline
//   /admin/quotes   admin: read-only list and detail for support
//
// The gateway proxies /buyer, /vendor/quotes and /admin/quotes here verbatim.
import { QUOTE_EMIRATES, QUOTE_UNITS } from "@materialhub/database/src/enums/quote.enums.ts";
import { jwtAuth, requireRole, vendorMembership } from "@materialhub/guards";
import { auditPlugin } from "@materialhub/plugins";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

const ts = () => new Date().toISOString();
const uuid = t.String({ format: "uuid" });
const idParam = t.Object({ id: uuid });
const pairParam = t.Object({ id: uuid, supplierId: uuid });

const listQuery = t.Object({
  page: t.Optional(t.Integer({ minimum: 1, default: 1 })),
  limit: t.Optional(t.Integer({ minimum: 1, maximum: 100, default: 20 })),
  status: t.Optional(t.String({ maxLength: 20 })),
  q: t.Optional(t.String({ maxLength: 100 })),
});

const attachment = t.Object({
  key: t.String({ minLength: 1, maxLength: 500 }),
  filename: t.String({ maxLength: 200 }),
  content_type: t.String({ maxLength: 100 }),
});

const createBody = t.Object({
  product_id: t.Optional(t.Nullable(uuid)),
  variant_id: t.Optional(t.Nullable(uuid)),
  category_id: t.Optional(t.Nullable(uuid)),
  title: t.Optional(t.Nullable(t.String({ maxLength: 200 }))),
  specification: t.String({ minLength: 1, maxLength: 5000 }),
  quantity: t.Integer({ minimum: 1, maximum: 10_000_000 }),
  unit: t.Union(QUOTE_UNITS.map((u) => t.Literal(u))),
  need_by: t.Optional(t.Nullable(t.String({ maxLength: 10 }))),
  delivery_emirate: t.Union(QUOTE_EMIRATES.map((e) => t.Literal(e))),
  attachments: t.Optional(t.Array(attachment, { maxItems: 5 })),
  vendor_ids: t.Optional(t.Array(uuid, { maxItems: 3 })),
  vendor_slugs: t.Optional(t.Array(t.String({ maxLength: 200 }), { maxItems: 3 })),
});

const messageBody = t.Object({
  body: t.String({ minLength: 1, maxLength: 4000 }),
  attachments: t.Optional(t.Array(attachment, { maxItems: 5 })),
});

const reasonBody = t.Object({
  reason: t.Optional(t.Nullable(t.String({ maxLength: 1000 }))),
});

const respondBody = t.Object({
  product_id: uuid,
  variant_id: t.Optional(t.Nullable(uuid)),
  unit_price: t.Integer({ minimum: 1 }),
  moq: t.Integer({ minimum: 1 }),
  lead_time_days: t.Integer({ minimum: 0, maximum: 365 }),
  valid_until: t.String({ minLength: 10, maxLength: 10 }),
  notes: t.Optional(t.Nullable(t.String({ maxLength: 2000 }))),
});

const attachmentQuery = t.Object({ key: t.String({ minLength: 1, maxLength: 500 }) });

export const quoteRequestRoutes = new Elysia()
  .use(container)
  .use(jwtAuth)
  .use(auditPlugin)

  // ── Buyer ────────────────────────────────────────────────────────────────
  .group("/buyer/quotes", (app) =>
    app
      .use(requireRole("customer"))
      .post(
        "/",
        async ({ user, body, quoteRequestService, set }: any) => {
          const data = await quoteRequestService.create(user.id, body);
          set.status = 201;
          return { statusCode: 201, data, timestamp: ts() };
        },
        { body: createBody },
      )
      .get(
        "/",
        async ({ user, query, quoteRequestService }: any) => {
          const result = await quoteRequestService.listForBuyer(user.id, query);
          return { statusCode: 200, ...result, timestamp: ts() };
        },
        { query: listQuery },
      )
      .get(
        "/:id",
        async ({ user, params, quoteRequestService }: any) => ({
          statusCode: 200,
          data: await quoteRequestService.getForBuyer(user.id, params.id),
          timestamp: ts(),
        }),
        { params: idParam },
      )
      .get(
        "/:id/attachment",
        async ({ user, params, query, quoteRequestService }: any) => ({
          statusCode: 200,
          data: await quoteRequestService.attachmentUrl(
            { role: "buyer", userId: user.id },
            params.id,
            query.key,
          ),
          timestamp: ts(),
        }),
        { params: idParam, query: attachmentQuery },
      )
      .post(
        "/:id/cancel",
        async ({ user, params, quoteRequestService }: any) => ({
          statusCode: 200,
          data: await quoteRequestService.cancel(user.id, params.id),
          timestamp: ts(),
        }),
        { params: idParam },
      )
      .post(
        "/:id/suppliers/:supplierId/messages",
        async ({ user, params, body, quoteRequestService, set }: any) => {
          const data = await quoteRequestService.buyerMessage(
            user.id,
            params.id,
            params.supplierId,
            body,
          );
          set.status = 201;
          return { statusCode: 201, data, timestamp: ts() };
        },
        { params: pairParam, body: messageBody },
      )
      .post(
        "/:id/suppliers/:supplierId/accept",
        async ({ user, params, quoteRequestService, audit }: any) => {
          const data = await quoteRequestService.accept(user.id, params.id, params.supplierId);
          audit.action = "quote.accept";
          audit.entity_type = "quote_request";
          audit.entity_id = params.id;
          audit.metadata = { quote_request_vendor_id: params.supplierId };
          audit.force = true;
          return { statusCode: 200, data, timestamp: ts() };
        },
        { params: pairParam },
      )
      .post(
        "/:id/suppliers/:supplierId/decline",
        async ({ user, params, body, quoteRequestService }: any) => ({
          statusCode: 200,
          data: await quoteRequestService.decline(
            user.id,
            params.id,
            params.supplierId,
            body?.reason,
          ),
          timestamp: ts(),
        }),
        { params: pairParam, body: reasonBody },
      ),
  )

  // ── Vendor ───────────────────────────────────────────────────────────────
  .group("/vendor/quotes", (app) =>
    app
      .guard({}, (a) =>
        a
          .use(vendorMembership("orders.read"))
          .get(
            "/",
            async ({ member, query, quoteRequestService }: any) => {
              const result = await quoteRequestService.listForVendor(member.vid, query);
              return { statusCode: 200, ...result, timestamp: ts() };
            },
            { query: listQuery },
          )
          .get(
            "/:id",
            async ({ member, params, quoteRequestService }: any) => ({
              statusCode: 200,
              data: await quoteRequestService.getForVendor(member.vid, params.id),
              timestamp: ts(),
            }),
            { params: idParam },
          )
          .get(
            "/:id/attachment",
            async ({ member, params, query, quoteRequestService }: any) => {
              const link = await quoteRequestService.getForVendor(member.vid, params.id);
              return {
                statusCode: 200,
                data: await quoteRequestService.attachmentUrl(
                  { role: "vendor", vendorId: member.vid },
                  link.request.id,
                  query.key,
                ),
                timestamp: ts(),
              };
            },
            { params: idParam, query: attachmentQuery },
          ),
      )
      .guard({}, (a) =>
        a
          .use(vendorMembership("orders.fulfill"))
          .post(
            "/:id/respond",
            async ({ member, user, params, body, quoteRequestService, audit }: any) => {
              const data = await quoteRequestService.respond(member.vid, user.id, params.id, body);
              audit.action = "quote.respond";
              audit.entity_type = "quote_request_vendor";
              audit.entity_id = params.id;
              audit.metadata = {
                unit_price: body.unit_price,
                moq: body.moq,
                valid_until: body.valid_until,
              };
              return { statusCode: 200, data, timestamp: ts() };
            },
            { params: idParam, body: respondBody },
          )
          .post(
            "/:id/decline",
            async ({ member, user, params, body, quoteRequestService }: any) => ({
              statusCode: 200,
              data: await quoteRequestService.vendorDecline(
                member.vid,
                user.id,
                params.id,
                body?.reason,
              ),
              timestamp: ts(),
            }),
            { params: idParam, body: reasonBody },
          )
          .post(
            "/:id/messages",
            async ({ member, user, params, body, quoteRequestService, set }: any) => {
              const data = await quoteRequestService.vendorMessage(
                member.vid,
                user.id,
                params.id,
                body,
              );
              set.status = 201;
              return { statusCode: 201, data, timestamp: ts() };
            },
            { params: idParam, body: messageBody },
          ),
      ),
  )

  // ── Admin (read-only) ────────────────────────────────────────────────────
  .group("/admin/quotes", (app) =>
    app
      .use(requireRole("admin", "super_admin"))
      .get(
        "/",
        async ({ query, quoteRequestService }: any) => {
          const result = await quoteRequestService.listForAdmin(query);
          return { statusCode: 200, ...result, timestamp: ts() };
        },
        { query: listQuery },
      )
      .get(
        "/:id",
        async ({ params, quoteRequestService }: any) => ({
          statusCode: 200,
          data: await quoteRequestService.getForAdmin(params.id),
          timestamp: ts(),
        }),
        { params: idParam },
      )
      .get(
        "/:id/attachment",
        async ({ params, query, quoteRequestService }: any) => ({
          statusCode: 200,
          data: await quoteRequestService.attachmentUrl({ role: "admin" }, params.id, query.key),
          timestamp: ts(),
        }),
        { params: idParam, query: attachmentQuery },
      ),
  );
