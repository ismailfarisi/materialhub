import { AdminAdjustmentCreateBody, AdminAdjustmentListQuery } from "@materialhub/dto";
import { jwtAuth, requireRole } from "@materialhub/guards";
import { BadRequestError, HttpError, auditPlugin } from "@materialhub/plugins";
import { Elysia } from "elysia";
import { container } from "../container.ts";

/**
 * PayoutAdjustmentService signals its one expected, client-facing condition
 * (a zero amount_fils, which the DB CHECK constraint would otherwise reject
 * with a raw constraint violation) with a plain Error — translate it here
 * into a 400, mirroring translatePayoutError in admin-payout.controller.ts.
 * Anything else is rethrown unchanged so errorHandler logs it and returns a
 * 500 without leaking the internal message.
 */
function translateAdjustmentError(err: any): HttpError {
  if (err instanceof HttpError) return err;
  if (err?.message === "amount_fils must be a non-zero integer") {
    return new BadRequestError(err.message);
  }
  throw err;
}

export const adminPayoutAdjustmentRoutes = new Elysia()
  .use(container)
  .use(jwtAuth)
  .use(auditPlugin)
  // Type-only: `: any` on the group callback's RETURN stops tsc inferring the
  // full chained Elysia type here, which (on top of the large container
  // decorator type) blew the instantiation-depth limit (TS2589). Handlers are
  // already `: any`-typed and nothing consumes this plugin's route types
  // (no Eden client), so no type information is lost and runtime is unchanged.
  .group("/admin/payout-adjustments", (app): any =>
    app
      .use(requireRole("admin", "super_admin"))
      .get(
        "/",
        async ({ query, payoutAdjustmentService }: any) => {
          const result = await payoutAdjustmentService.listForVendor(query.vendorId, {
            page: query.page,
            limit: query.limit,
            unsettledOnly: query.unsettledOnly,
          });
          return {
            statusCode: 200,
            data: result.items,
            total: result.total,
            timestamp: new Date().toISOString(),
          };
        },
        { query: AdminAdjustmentListQuery },
      )
      .post(
        "/",
        async ({ body, user, payoutAdjustmentService, audit }: any) => {
          try {
            const data = await payoutAdjustmentService.create({
              vendorId: body.vendorId,
              amountFils: body.amountFils,
              reason: body.reason,
              adminUserId: user.id,
            });
            audit.action = "payout_adjustment.created";
            audit.entity_type = "vendor_payout_adjustment";
            audit.entity_id = data.id;
            audit.metadata = {
              vendor_id: body.vendorId,
              amount_fils: body.amountFils,
              reason: body.reason,
            };
            return { statusCode: 201, data, timestamp: new Date().toISOString() };
          } catch (err: any) {
            throw translateAdjustmentError(err);
          }
        },
        { body: AdminAdjustmentCreateBody },
      ),
  );
