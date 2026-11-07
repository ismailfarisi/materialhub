import { jwtAuth, requireRole } from "@materialhub/guards";
import { auditPlugin } from "@materialhub/plugins";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";
import { buildPaymentMethodPatch } from "../domain/payment-method/payment-method-patch.ts";

export const paymentMethodAdminRoutes = new Elysia({ prefix: "/admin/payment-methods" })
  .use(container)
  .use(jwtAuth)
  .use(requireRole("admin", "super_admin"))
  .use(auditPlugin)
  .get("/", async ({ paymentMethodThresholdRepo }: any) => {
    const rows = await paymentMethodThresholdRepo.find({});
    return { statusCode: 200, data: rows, timestamp: new Date().toISOString() };
  })
  .patch(
    "/:provider",
    async ({ params, body, paymentMethodThresholdRepo, set, audit }: any) => {
      const row = await paymentMethodThresholdRepo.findOne({
        where: { provider: params.provider },
      });
      if (!row) {
        set.status = 404;
        return {
          statusCode: 404,
          error: "NOT_FOUND",
          message: `Payment method '${params.provider}' not found`,
          timestamp: new Date().toISOString(),
        };
      }

      const result = buildPaymentMethodPatch(row, body);
      if (!result.ok) {
        set.status = result.status;
        return {
          statusCode: result.status,
          error: result.error,
          message: result.message,
          timestamp: new Date().toISOString(),
        };
      }

      await paymentMethodThresholdRepo.update({ provider: params.provider }, result.patch);

      audit.action = "payment_method.update";
      audit.entity_type = "payment_method";
      audit.entity_id = params.provider;
      audit.changes = result.changes;

      return {
        statusCode: 200,
        data: { ...row, ...result.patch, provider: params.provider },
        timestamp: new Date().toISOString(),
      };
    },
    {
      params: t.Object({ provider: t.String() }),
      body: t.Object({
        is_active: t.Optional(t.Boolean()),
        surcharge_fils: t.Optional(t.Integer({ minimum: 0 })),
        min_amount_fils: t.Optional(t.Integer({ minimum: 0 })),
        max_amount_fils: t.Optional(t.Integer({ minimum: 0 })),
      }),
    },
  );
