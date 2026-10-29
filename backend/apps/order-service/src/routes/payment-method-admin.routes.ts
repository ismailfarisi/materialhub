import { jwtAuth, requireRole } from "@materialhub/guards";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

export const paymentMethodAdminRoutes = new Elysia({ prefix: "/admin/payment-methods" })
  .use(container)
  .use(jwtAuth)
  .use(requireRole("admin", "super_admin"))
  .get("/", async ({ paymentMethodThresholdRepo }: any) => {
    const rows = await paymentMethodThresholdRepo.find({});
    return { statusCode: 200, data: rows, timestamp: new Date().toISOString() };
  })
  .patch(
    "/:provider",
    async ({ params, body, paymentMethodThresholdRepo, set }: any) => {
      const { is_active, surcharge_fils } = body;

      if (is_active === undefined && surcharge_fils === undefined) {
        set.status = 400;
        return {
          statusCode: 400,
          error: "NO_FIELDS",
          message: "At least one of is_active or surcharge_fils must be provided",
          timestamp: new Date().toISOString(),
        };
      }

      if (surcharge_fils !== undefined && params.provider !== "cod") {
        set.status = 400;
        return {
          statusCode: 400,
          error: "INVALID_FIELD",
          message: "surcharge_fils is only editable for COD",
          timestamp: new Date().toISOString(),
        };
      }

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

      const patch: Record<string, unknown> = {};
      if (is_active !== undefined) patch.is_active = is_active;
      if (surcharge_fils !== undefined) patch.surcharge_fils = surcharge_fils;

      await paymentMethodThresholdRepo.update({ provider: params.provider }, patch);

      return {
        statusCode: 200,
        data: {
          provider: params.provider,
          ...(is_active !== undefined ? { is_active } : {}),
          ...(surcharge_fils !== undefined ? { surcharge_fils } : {}),
        },
        timestamp: new Date().toISOString(),
      };
    },
    {
      params: t.Object({ provider: t.String() }),
      body: t.Object({
        is_active: t.Optional(t.Boolean()),
        surcharge_fils: t.Optional(t.Integer({ minimum: 0 })),
      }),
    },
  );
