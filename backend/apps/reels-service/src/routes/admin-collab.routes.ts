// admin-collab.routes.ts
//
// Platform-staff cross-vendor collab oversight. Read-only for now — no
// cancel/moderate actions, matching the scope of the admin-panel list view
// this backs.
import { CollabOpportunityStatus, CollabOpportunityType } from "@materialhub/database";
import { jwtAuth, requireRole } from "@materialhub/guards";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

const ok = (data: unknown) => ({
  statusCode: 200,
  data,
  timestamp: new Date().toISOString(),
});

export const adminCollabRoutes = new Elysia({ prefix: "/admin/reels/collabs" })
  .use(container)
  .use(jwtAuth)
  .use(requireRole("admin", "super_admin"))
  .get(
    "/",
    // biome-ignore lint/suspicious/noExplicitAny: guarded context is loosely typed
    async ({ query, collabService }: any) => {
      const data = await collabService.listAllForAdmin({
        page: query.page,
        limit: query.limit,
        status: query.status,
        type: query.type,
        vendorId: query.vendorId,
      });
      return ok(data);
    },
    {
      query: t.Object({
        page: t.Optional(t.Numeric({ minimum: 1 })),
        limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100 })),
        status: t.Optional(t.Enum(CollabOpportunityStatus)),
        type: t.Optional(t.Enum(CollabOpportunityType)),
        vendorId: t.Optional(t.String({ format: "uuid" })),
      }),
    },
  )
  .get(
    "/:id",
    // biome-ignore lint/suspicious/noExplicitAny: guarded context is loosely typed
    async ({ params, collabService }: any) =>
      ok(await collabService.getOpportunityForAdmin(params.id)),
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  );
