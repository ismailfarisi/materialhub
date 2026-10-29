// admin-service-offering.routes.ts
//
// Platform-staff approval surface for the booking catalog. Separate module from
// service-offering.routes.ts because the guard differs: those routes are
// vendorMembership-scoped vendor CRUD, these are cross-vendor admin actions
// with no vendor scoping at all (an admin acts on any offering by id).
import { RejectServiceOfferingBody } from "@materialhub/dto";
import { jwtAuth, requireRole } from "@materialhub/guards";
import { NotFoundError } from "@materialhub/plugins";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

const ok = (data: unknown, status = 200) => ({
  statusCode: status,
  data,
  timestamp: new Date().toISOString(),
});

export const adminServiceOfferingRoutes = new Elysia()
  .use(container)
  .use(jwtAuth)
  .use(requireRole("admin", "super_admin"))
  .get(
    "/admin/service-offerings",
    // biome-ignore lint/suspicious/noExplicitAny: guarded context is loosely typed
    async ({ query, serviceOfferingController }: any) => {
      const data = await serviceOfferingController.adminList({
        page: query.page,
        limit: query.limit,
        status: query.status,
        vendorId: query.vendorId,
        search: query.search,
      });
      return ok(data);
    },
    {
      query: t.Object({
        page: t.Optional(t.Numeric({ minimum: 1 })),
        limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100 })),
        status: t.Optional(t.String()),
        vendorId: t.Optional(t.String()),
        search: t.Optional(t.String()),
      }),
    },
  )
  .get(
    "/admin/service-offerings/:id",
    // biome-ignore lint/suspicious/noExplicitAny: guarded context is loosely typed
    async ({ params, serviceOfferingController }: any) => {
      const data = await serviceOfferingController.adminGetById(params.id);
      if (!data) throw new NotFoundError("Service offering not found");
      return ok(data);
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )
  .post(
    "/admin/service-offerings/:id/approve",
    // biome-ignore lint/suspicious/noExplicitAny: guarded context is loosely typed
    async ({ user, params, serviceOfferingController }: any) => {
      const data = await serviceOfferingController.approve(params.id, user.id);
      return ok(data);
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )
  .post(
    "/admin/service-offerings/:id/reject",
    // biome-ignore lint/suspicious/noExplicitAny: guarded context is loosely typed
    async ({ user, params, body, serviceOfferingController }: any) => {
      const data = await serviceOfferingController.reject(params.id, user.id, body.reason);
      return ok(data);
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: RejectServiceOfferingBody,
    },
  );
