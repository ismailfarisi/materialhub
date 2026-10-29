import {
  AdminPayoutApproveBody,
  AdminPayoutCommissionsQuery,
  AdminPayoutDraftAdjustmentBody,
  AdminPayoutEstimateQuery,
  AdminPayoutGenerateBody,
  AdminPayoutListQuery,
  AdminPayoutNoteBody,
  AdminPayoutRejectBody,
  AdminPayoutStatusBody,
  AdminPayoutVoidBody,
  IdParam,
} from "@materialhub/dto";
import { jwtAuth, requireRole } from "@materialhub/guards";
import { auditPlugin } from "@materialhub/plugins";
import { Elysia } from "elysia";
import { container } from "../container.ts";

export const adminPayoutRoutes = new Elysia()
  .use(container)
  .use(jwtAuth)
  .use(auditPlugin)
  .group("/admin/payouts", (app) =>
    app
      .use(requireRole("admin", "super_admin"))
      .get(
        "/",
        async ({ query, adminPayoutController }: any) => {
          const result = await adminPayoutController.list(query);
          return {
            statusCode: 200,
            data: result.items,
            total: result.total,
            timestamp: new Date().toISOString(),
          };
        },
        { query: AdminPayoutListQuery },
      )
      .get("/summary", async ({ adminPayoutController }: any) => {
        const data = await adminPayoutController.summary();
        return { statusCode: 200, data, timestamp: new Date().toISOString() };
      })
      .get(
        "/estimate",
        async ({ query, adminPayoutController }: any) => {
          const data = await adminPayoutController.estimate(query.vendorId, query.periodEnd);
          return { statusCode: 200, data, timestamp: new Date().toISOString() };
        },
        { query: AdminPayoutEstimateQuery },
      )
      .get(
        "/:id",
        async ({ params, adminPayoutController }: any) => {
          const data = await adminPayoutController.get(params.id);
          return { statusCode: 200, data, timestamp: new Date().toISOString() };
        },
        { params: IdParam },
      )
      .get(
        "/:id/commissions",
        async ({ params, query, adminPayoutController }: any) => {
          const result = await adminPayoutController.listCommissions(
            params.id,
            query.page ?? 1,
            query.limit ?? 20,
          );
          return {
            statusCode: 200,
            data: result.items,
            total: result.total,
            timestamp: new Date().toISOString(),
          };
        },
        { params: IdParam, query: AdminPayoutCommissionsQuery },
      )
      // Vendor payout statement, as a downloadable PDF. GET (it mutates
      // nothing) but audited with `audit.force` — auditPlugin skips GETs by
      // default, and "who pulled this vendor's earnings statement, and when"
      // is exactly the sort of question that gets asked after a figure is
      // disputed. Content-Disposition is `attachment` so a browser that
      // reaches this URL directly downloads rather than renders it.
      .get(
        "/:id/statement",
        async ({ params, adminPayoutController, set, audit }: any) => {
          const { filename, pdf, vendorId, reference } = await adminPayoutController.statement(
            params.id,
          );
          set.headers["content-type"] = "application/pdf";
          set.headers["content-disposition"] = `attachment; filename="${filename}"`;
          audit.action = "payout.statement_downloaded";
          audit.entity_type = "vendor_payout";
          audit.entity_id = params.id;
          audit.metadata = { vendor_id: vendorId, payout_reference: reference };
          audit.force = true;
          return pdf;
        },
        { params: IdParam },
      )
      .get(
        "/:id/timeline",
        async ({ params, adminPayoutController }: any) => {
          const data = await adminPayoutController.getTimeline(params.id);
          return { statusCode: 200, data, timestamp: new Date().toISOString() };
        },
        { params: IdParam },
      )
      .get(
        "/:id/adjustments",
        async ({ params, payoutAdjustmentService }: any) => {
          const data = await payoutAdjustmentService.listForPayout(params.id);
          return { statusCode: 200, data, timestamp: new Date().toISOString() };
        },
        { params: IdParam },
      )
      // Errors (PAYOUT_DUPLICATE, "Vendor not found", ...) are HttpError
      // subclasses by the time they leave the controller (translatePayoutError),
      // so the global errorHandler formats them — no inline catch here, same
      // as approve/reject below.
      .post(
        "/generate",
        async ({ body, user, adminPayoutController, audit }: any) => {
          const data = await adminPayoutController.generate(user.id, body);
          audit.action = "payout.queued";
          audit.entity_type = "vendor_payout";
          audit.metadata = {
            vendor_id: body.vendorId,
            period_start: body.periodStart,
            period_end: body.periodEnd,
            job_id: data.jobId,
          };
          return { statusCode: 200, data, timestamp: new Date().toISOString() };
        },
        { body: AdminPayoutGenerateBody },
      )
      .post(
        "/:id/retry",
        async ({ params, user, adminPayoutController, audit }: any) => {
          const data = await adminPayoutController.retry(params.id, user.id);
          audit.action = "payout.retried";
          audit.entity_type = "vendor_payout";
          audit.entity_id = params.id;
          audit.metadata = { job_id: data.jobId };
          return { statusCode: 200, data, timestamp: new Date().toISOString() };
        },
        { params: IdParam },
      )
      .patch(
        "/:id/status",
        async ({ params, body, user, adminPayoutController, audit }: any) => {
          const data = await adminPayoutController.changeStatus(params.id, user.id, body);
          audit.action = "payout.status_changed";
          audit.entity_type = "vendor_payout";
          audit.entity_id = params.id;
          audit.changes = { status: { old: "processing", new: body.status } };
          if (body.notes) audit.metadata = { note: body.notes };
          return { statusCode: 200, data, timestamp: new Date().toISOString() };
        },
        { params: IdParam, body: AdminPayoutStatusBody },
      )
      .post(
        "/:id/notes",
        async ({ params, body, user, adminPayoutController, audit }: any) => {
          const data = await adminPayoutController.addNote(params.id, user.id, body.note);
          audit.action = "payout.note_added";
          audit.entity_type = "vendor_payout";
          audit.entity_id = params.id;
          audit.metadata = { note: body.note };
          return { statusCode: 200, data, timestamp: new Date().toISOString() };
        },
        { params: IdParam, body: AdminPayoutNoteBody },
      )
      // Corrects a pending draft's amount in place — see
      // PayoutService.addDraftAdjustment for why moving net_amount and
      // adjustment_total by the same delta keeps assertClaimedSetReconciles
      // satisfied.
      .post(
        "/:id/adjustments",
        async ({ params, body, user, adminPayoutController, audit }: any) => {
          const data = await adminPayoutController.addDraftAdjustment(params.id, user.id, body);
          audit.action = "payout.draft_adjusted";
          audit.entity_type = "vendor_payout";
          audit.entity_id = params.id;
          audit.metadata = { amount_fils: body.amountFils, reason: body.reason };
          return { statusCode: 200, data, timestamp: new Date().toISOString() };
        },
        { params: IdParam, body: AdminPayoutDraftAdjustmentBody },
      )
      // The only two ways money moves: approve queues the transfer of a
      // pending draft's stored figures; reject releases its claims. Service
      // errors (not-found / not-a-draft) are HttpError subclasses by the time
      // they leave the controller, so the global errorHandler formats them.
      .post(
        "/:id/approve",
        async ({ params, body, adminPayoutController, user, audit }: any) => {
          const data = await adminPayoutController.approve(params.id, user.id, body.rail);
          audit.action =
            body.rail === "manual_bank_transfer"
              ? "payout.paid_manually_initiated"
              : "payout.approved";
          audit.entity_type = "vendor_payout";
          audit.entity_id = params.id;
          audit.metadata = { job_id: data.jobId, payout_rail: data.rail };
          return { statusCode: 202, data, timestamp: new Date().toISOString() };
        },
        { params: IdParam, body: AdminPayoutApproveBody },
      )
      // R4-C1: void releases a FAILED payout's claims — commissions,
      // adjustments and license holds go back into the payable pool and the
      // payout is soft-deleted with the reason. Permitted only while no
      // Stripe transfer exists for it (409 PAYOUT_NOT_VOIDABLE otherwise),
      // so it can never "release" money that has already been sent.
      .post(
        "/:id/void",
        async ({ params, body, adminPayoutController, user, audit }: any) => {
          await adminPayoutController.void(params.id, user.id, body.reason);
          audit.action = "payout.voided";
          audit.entity_type = "vendor_payout";
          audit.entity_id = params.id;
          audit.metadata = { reason: body.reason };
          return { statusCode: 200, data: { ok: true }, timestamp: new Date().toISOString() };
        },
        { params: IdParam, body: AdminPayoutVoidBody },
      )
      .post(
        "/:id/reject",
        async ({ params, body, adminPayoutController, user, audit }: any) => {
          await adminPayoutController.reject(params.id, user.id, body.reason);
          audit.action = "payout.draft_rejected";
          audit.entity_type = "vendor_payout";
          audit.entity_id = params.id;
          audit.metadata = { reason: body.reason };
          return { statusCode: 200, data: { ok: true }, timestamp: new Date().toISOString() };
        },
        { params: IdParam, body: AdminPayoutRejectBody },
      )
      // POST, not GET: this writes an audit row, and a GET would be
      // retried/prefetched/cached by anything sitting in front of it.
      .post(
        "/:id/reveal-bank",
        async ({ params, user, adminPayoutController, audit }: any) => {
          const data = await adminPayoutController.revealBank(params.id, {
            id: user.id,
            role: user.role,
          });
          // The controller already writes an awaited, guaranteed
          // `payout.bank_details_revealed` row with the real bank_account_id
          // and vendor_id in its metadata. Without `skip`, auditPlugin's
          // onAfterHandle auto-captures this non-GET /admin request too and
          // infers its own bare `payouts.reveal-bank` row — a second,
          // untracked entry for the single most sensitive action in the
          // system. Skip it so the controller's row is the one source of truth.
          audit.skip = true;
          return { statusCode: 200, data, timestamp: new Date().toISOString() };
        },
        { params: IdParam },
      ),
  );
