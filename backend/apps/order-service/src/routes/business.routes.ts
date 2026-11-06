import { jwtAuth, requireRole } from "@materialhub/guards";
import { UnauthorizedError, auditPlugin } from "@materialhub/plugins";
// business.routes.ts — workstream 3: order approvals (/checkout/approvals),
// VAT tax invoices (/invoices) and admin net-terms receivables.
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

/** jwtAuth guarantees a user on these routes; this narrows the type. */
function uid(user: { id: string } | null | undefined): string {
  if (!user) throw new UnauthorizedError("Sign in to continue");
  return user.id;
}

const ok = (data: unknown) => ({ statusCode: 200, data, timestamp: new Date().toISOString() });
const idParam = t.Object({ id: t.String({ format: "uuid" }) });
const noteBody = t.Object({ note: t.Optional(t.Nullable(t.String({ maxLength: 1000 }))) });

export const orderApprovalRoutes = new Elysia({ prefix: "/checkout/approvals" })
  .use(container)
  .use(jwtAuth)
  .use(requireRole("customer", "admin", "super_admin"))
  .post(
    "/",
    async ({ user, body, orderApprovalService }) =>
      ok(await orderApprovalService.request(uid(user), body?.note ?? null)),
    { body: noteBody },
  )
  .get(
    "/",
    async ({ user, query, orderApprovalService }) =>
      ok(await orderApprovalService.list(uid(user), query.status)),
    {
      query: t.Object({
        status: t.Optional(
          t.Union([
            t.Literal("pending"),
            t.Literal("approved"),
            t.Literal("rejected"),
            t.Literal("used"),
            t.Literal("expired"),
            t.Literal("cancelled"),
          ]),
        ),
      }),
    },
  )
  .post(
    "/:id/approve",
    async ({ user, params, body, orderApprovalService }) =>
      ok(await orderApprovalService.decide(uid(user), params.id, "approved", body?.note ?? null)),
    { params: idParam, body: noteBody },
  )
  .post(
    "/:id/reject",
    async ({ user, params, body, orderApprovalService }) =>
      ok(await orderApprovalService.decide(uid(user), params.id, "rejected", body?.note ?? null)),
    { params: idParam, body: noteBody },
  )
  .post(
    "/:id/cancel",
    async ({ user, params, orderApprovalService }) =>
      ok(await orderApprovalService.cancel(uid(user), params.id)),
    { params: idParam },
  );

function xmlResponse(filename: string, xml: string) {
  return new Response(xml, {
    status: 200,
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "content-disposition": `attachment; filename="${filename.replace(/[^A-Za-z0-9._-]/g, "_")}"`,
      "cache-control": "private, no-store",
    },
  });
}

export const taxInvoiceRoutes = new Elysia({ prefix: "/invoices" })
  .use(container)
  .use(jwtAuth)
  .use(requireRole("customer", "admin", "super_admin"))
  .get(
    "/",
    async ({ user, query, taxInvoiceService }) =>
      ok(await taxInvoiceService.listForUser(uid(user), query)),
    {
      query: t.Object({
        status: t.Optional(t.Union([t.Literal("paid"), t.Literal("unpaid"), t.Literal("overdue")])),
        page: t.Optional(t.Numeric({ minimum: 1 })),
        limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100 })),
      }),
    },
  )
  .get(
    "/:id/pdf",
    async ({ user, params, taxInvoiceService }) =>
      ok(await taxInvoiceService.pdfUrlFor(uid(user), params.id)),
    { params: idParam },
  )
  .get(
    "/:id/xml",
    async ({ user, params, taxInvoiceService }) => {
      const { filename, xml } = await taxInvoiceService.xmlFor(uid(user), params.id);
      return xmlResponse(filename, xml);
    },
    { params: idParam },
  );

export const adminReceivableRoutes = new Elysia({ prefix: "/admin/receivables" })
  .use(container)
  .use(jwtAuth)
  .use(requireRole("admin", "super_admin"))
  .use(auditPlugin)
  .get(
    "/",
    async ({ query, netTermsService }) => ok(await netTermsService.listReceivables(query)),
    {
      query: t.Object({
        status: t.Optional(
          t.Union([t.Literal("due"), t.Literal("overdue"), t.Literal("paid"), t.Literal("all")]),
        ),
        q: t.Optional(t.String({ maxLength: 100 })),
        page: t.Optional(t.Numeric({ minimum: 1 })),
        limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100 })),
      }),
    },
  )
  .post(
    "/:orderId/mark-paid",
    async ({ user, params, body, audit, netTermsService }) => {
      audit.entity_type = "order";
      audit.entity_id = params.orderId;
      audit.action = "net_terms.mark_paid";
      return ok(await netTermsService.markPaid(params.orderId, uid(user), body));
    },
    {
      params: t.Object({ orderId: t.String({ format: "uuid" }) }),
      body: t.Object({
        reference: t.String({ minLength: 1, maxLength: 255 }),
        paid_at: t.Optional(t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" })),
      }),
    },
  )
  .get(
    "/invoices/:id/xml",
    async ({ user, params, audit, taxInvoiceService }) => {
      audit.skip = true;
      const { filename, xml } = await taxInvoiceService.xmlFor(uid(user), params.id, true);
      return xmlResponse(filename, xml);
    },
    { params: idParam },
  )
  .get(
    "/invoices/:id/pdf",
    async ({ user, params, audit, taxInvoiceService }) => {
      audit.skip = true;
      return ok(await taxInvoiceService.pdfUrlFor(uid(user), params.id, true));
    },
    { params: idParam },
  );
