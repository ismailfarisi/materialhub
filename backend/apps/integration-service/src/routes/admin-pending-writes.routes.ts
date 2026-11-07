import { jwtAuth, requireRole } from "@materialhub/guards";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

const ok = (data: unknown, status = 200) => ({
  statusCode: status,
  data,
  timestamp: new Date().toISOString(),
});

export const adminPendingWritesRoutes = new Elysia({ prefix: "/admin/integrations" })
  .use(container)
  .use(jwtAuth)
  .use(requireRole("admin", "super_admin"))
  .get(
    "/:id/pending-writes",
    async ({ params, query, pendingWritesService }: any) => {
      const rows = await pendingWritesService.list(params.id, query.status);
      return ok(rows);
    },
    {
      params: t.Object({ id: t.String() }),
      query: t.Object({
        status: t.Optional(
          t.Union([
            t.Literal("pending"),
            t.Literal("approved"),
            t.Literal("rejected"),
            t.Literal("applied"),
          ]),
        ),
      }),
    },
  )
  .post(
    "/pending-writes/:id/approve",
    async ({ params, user, pendingWritesService, domainDispatch, set }: any) => {
      const row = await pendingWritesService.approve(params.id, user.user_id ?? user.id);
      const r = await domainDispatch.call({
        eventType: row.kind as any,
        vendorId: row.payload?.vendor_id ?? "",
        payload: row.payload,
      });
      if (r.status >= 200 && r.status < 300) {
        await pendingWritesService.markApplied(params.id);
        return ok({ id: row.id, applied: true });
      }
      set.status = 502;
      return { statusCode: 502, error: "DOMAIN_FAILED", message: r.body };
    },
    { params: t.Object({ id: t.String() }) },
  )
  .post(
    "/pending-writes/:id/reject",
    async ({ params, user, pendingWritesService }: any) => {
      const row = await pendingWritesService.reject(params.id, user.user_id ?? user.id);
      return ok({ id: row.id, status: row.status });
    },
    { params: t.Object({ id: t.String() }) },
  );
