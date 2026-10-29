import { jwtAuth, requireRole, vendorMembership } from "@materialhub/guards";
import { auditPlugin } from "@materialhub/plugins";
// commission.routes.ts
import { Elysia, t } from "elysia";
import { container } from "../container.ts";
import { VendorPayoutListQuery } from "./vendor-payout.query.ts";

export const commissionRoutes = new Elysia()
  .use(container)
  .use(jwtAuth)
  .use(auditPlugin)
  // Admin commission dashboard
  .group("/admin/commissions", (app) =>
    app
      .use(requireRole("admin", "super_admin"))
      .get(
        "/",
        async ({ query, commissionController }: any) => {
          const result = await commissionController.listCommissions(query);
          return { statusCode: 200, ...result, timestamp: new Date().toISOString() };
        },
        {
          query: t.Object({
            vendorId: t.Optional(t.String({ format: "uuid" })),
            page: t.Optional(t.Integer({ default: 1 })),
            limit: t.Optional(t.Integer({ default: 20 })),
          }),
        },
      )
      .get("/config", async ({ commissionController }: any) => {
        const result = await commissionController.getCommissionConfig();
        return { statusCode: 200, data: result, timestamp: new Date().toISOString() };
      })
      .get("/global-rate", async ({ commissionController }: any) => {
        const rate = await commissionController.getGlobalRate();
        return { statusCode: 200, data: { rate }, timestamp: new Date().toISOString() };
      })
      .patch(
        "/global-rate",
        async ({ body, commissionController, audit }: any) => {
          const previousRate = await commissionController.getGlobalRate();
          const rate = await commissionController.setGlobalRate(body.rate);
          audit.action = "commission.global_rate_update";
          audit.entity_type = "commission_config";
          if (previousRate !== rate) {
            audit.changes = { rate: { old: previousRate, new: rate } };
          }
          return { statusCode: 200, data: { rate }, timestamp: new Date().toISOString() };
        },
        {
          body: t.Object({
            rate: t.Number({ minimum: 0, maximum: 100 }),
          }),
        },
      )
      .patch(
        "/vendors/:vendorId/rate",
        async ({ params, body, commissionController, audit }: any) => {
          const result = await commissionController.updateVendorRate(params.vendorId, body);
          audit.action = "commission.vendor_rate_update";
          audit.entity_type = "vendor";
          audit.entity_id = params.vendorId;
          audit.metadata = {
            type: body.type,
            value: body.value,
            tiers: body.tiers ?? null,
          };
          return { statusCode: 200, data: result, timestamp: new Date().toISOString() };
        },
        {
          params: t.Object({ vendorId: t.String({ format: "uuid" }) }),
          body: t.Object({
            type: t.Union([t.Literal("percentage"), t.Literal("fixed"), t.Literal("tiered")]),
            value: t.Number({ minimum: 0 }),
            tiers: t.Optional(
              t.Array(
                t.Object({
                  minAmount: t.Number({ minimum: 0 }),
                  maxAmount: t.Optional(t.Number()),
                  rate: t.Number({ minimum: 0 }),
                }),
              ),
            ),
          }),
        },
      )
      // Backfill commission rows for an order whose items predate the
      // order-creation-time commission hook (PR #85). Idempotent by
      // default — items already commissioned are skipped. Pass
      // ?recalculate=true to also delete-and-recreate existing PENDING
      // rows (useful after a formula change like PR #87 going to
      // VAT-inclusive math). Rows with status other than `pending` are
      // never overwritten even with recalculate=true.
      .post(
        "/backfill/orders/:orderId",
        async ({ params, query, commissionController, audit }: any) => {
          const recalculate = query?.recalculate === true || query?.recalculate === "true";
          const result = await commissionController.backfillCommissions(params.orderId, {
            recalculate,
          });
          audit.action = "commission.backfill";
          audit.entity_type = "order";
          audit.entity_id = params.orderId;
          audit.metadata = { recalculate, result };
          return { statusCode: 200, data: result, timestamp: new Date().toISOString() };
        },
        {
          params: t.Object({ orderId: t.String({ format: "uuid" }) }),
          query: t.Object({
            recalculate: t.Optional(t.Union([t.Boolean(), t.Literal("true"), t.Literal("false")])),
          }),
        },
      ),
  )
  // Vendor payout history
  .group("/vendors/me/payouts", (app) =>
    app
      .use(vendorMembership("payouts.read"))
      .get("/estimate", async ({ member, commissionController }: any) => {
        const result = await commissionController.estimatePayout(member.vid);
        return { statusCode: 200, data: result, timestamp: new Date().toISOString() };
      })
      .get(
        "/",
        async ({ member, query, commissionController }: any) => {
          const result = await commissionController.listVendorPayouts(member.vid, query);
          return { statusCode: 200, ...result, timestamp: new Date().toISOString() };
        },
        { query: VendorPayoutListQuery },
      ),
  );
