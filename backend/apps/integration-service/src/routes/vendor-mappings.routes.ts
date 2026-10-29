import type { IntegrationDirection, IntegrationEventType } from "@materialhub/database";
import { jwtAuth, vendorMembership } from "@materialhub/guards";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

const ok = (data: unknown, status = 200) => ({
  statusCode: status,
  data,
  timestamp: new Date().toISOString(),
});

// Phase 2 migration: replaces `requireRole("vendor") + vendorOwnership` with
// permission-aware `vendorMembership(...)` guards. Listing mappings uses
// `products.read`; upserting uses `products.write`.
export const vendorMappingsRoutes = new Elysia({
  prefix: "/vendor/integrations/:id/mappings",
})
  .use(container)
  .use(jwtAuth)
  .guard({}, (app) =>
    app.use(vendorMembership("products.read")).get(
      "/",
      async ({ params, member, integrationController, mappingService }: any) => {
        const integration = await integrationController.get(params.id, member.vid);
        return ok(await mappingService.list(integration.id));
      },
      { params: t.Object({ id: t.String() }) },
    ),
  )
  .guard({}, (app) =>
    app.use(vendorMembership("products.write")).post(
      "/:direction/:event_type",
      async ({ params, body, member, integrationController, mappingService, set }: any) => {
        const integration = await integrationController.get(params.id, member.vid);
        const result = await mappingService.upsert({
          integration_id: integration.id,
          event_type: params.event_type as IntegrationEventType,
          direction: params.direction as IntegrationDirection,
          spec: body.spec,
          is_enabled: body.is_enabled,
        });
        if (result.errors.length > 0) {
          set.status = 422;
          return { statusCode: 422, error: "VALIDATION_ERROR", errors: result.errors };
        }
        return ok({ mapping: result.mapping, preview: result.preview });
      },
      {
        params: t.Object({
          id: t.String(),
          direction: t.Union([t.Literal("outbound"), t.Literal("inbound")]),
          event_type: t.String(),
        }),
        body: t.Object({
          spec: t.Object({}, { additionalProperties: true }),
          is_enabled: t.Optional(t.Boolean()),
        }),
      },
    ),
  );
