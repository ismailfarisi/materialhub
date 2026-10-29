import { jwtAuth, vendorMembership } from "@materialhub/guards";
import { sourceSchemas } from "@materialhub/integration-events";
import { Elysia, t } from "elysia";

const ok = (data: unknown) => ({
  statusCode: 200,
  data,
  timestamp: new Date().toISOString(),
});

// Phase 2 migration: replaces `requireRole("vendor")` with
// `vendorMembership("products.read")`. The handler doesn't read vendor
// context — the guard exists purely to require an authenticated member with
// products.read on the active vendor before exposing source schema metadata.
export const sourceSchemasRoutes = new Elysia({
  prefix: "/vendor/integrations/:id/source-schema",
})
  .use(jwtAuth)
  .use(vendorMembership("products.read"))
  .get(
    "/:event_type",
    ({ params, set }: any) => {
      const schema = (sourceSchemas as any)[params.event_type];
      if (!schema) {
        set.status = 404;
        return { statusCode: 404, error: "UNKNOWN_EVENT_TYPE" };
      }
      return ok(schema);
    },
    { params: t.Object({ id: t.String(), event_type: t.String() }) },
  );
