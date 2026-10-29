// admin-booking.routes.ts
//
// Platform-staff booking oversight. Complements manage-booking.routes.ts (which
// owns admin no-show) with the cross-vendor read surface plus admin completion.
//
// Cancel and reschedule are NOT re-declared here: booking.routes.ts already
// accepts an admin caller for both and already bypasses the customer-only
// windows (cancel.service.ts:203, reschedule.service.ts:263). Duplicating them
// would mean two code paths for one action.
import { jwtAuth, requireRole } from "@materialhub/guards";
import { NotFoundError } from "@materialhub/plugins";
import { Elysia, t } from "elysia";
import { container } from "../../container.ts";

const ok = (data: unknown, status = 200) => ({
  statusCode: status,
  data,
  timestamp: new Date().toISOString(),
});

export const adminBookingRoutes = new Elysia()
  .use(container)
  .use(jwtAuth)
  .use(requireRole("admin", "super_admin"))
  .get(
    "/admin/bookings",
    // biome-ignore lint/suspicious/noExplicitAny: guarded context is loosely typed
    async ({ query, bookingQueryService }: any) => {
      const data = await bookingQueryService.adminList({
        page: query.page,
        limit: query.limit,
        status: query.status,
        vendorId: query.vendorId,
        staffMemberId: query.staffMemberId,
        locationId: query.locationId,
        from: query.from,
        to: query.to,
        search: query.search,
      });
      return ok(data);
    },
    {
      // t.Numeric coerces the query string AND validates the range, so a
      // malformed ?page=-5 is a clean 400 instead of a negative SQL OFFSET
      // (which Postgres rejects at runtime, surfacing as a 500). Matches the
      // repo pattern in brand.routes.ts and channels-admin.routes.ts.
      query: t.Object({
        page: t.Optional(t.Numeric({ minimum: 1 })),
        limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100 })),
        status: t.Optional(t.String()),
        vendorId: t.Optional(t.String()),
        staffMemberId: t.Optional(t.String()),
        locationId: t.Optional(t.String()),
        from: t.Optional(t.String()),
        to: t.Optional(t.String()),
        search: t.Optional(t.String()),
      }),
    },
  )
  .get(
    "/admin/bookings/:id",
    // biome-ignore lint/suspicious/noExplicitAny: guarded context is loosely typed
    async ({ params, bookingQueryService, bookingStatusHistoryRepo }: any) => {
      const booking = await bookingQueryService.adminGetById(params.id);
      if (!booking) throw new NotFoundError("Booking not found");

      const history = await bookingStatusHistoryRepo.find({
        where: { booking_id: params.id },
        order: { created_at: "ASC" },
      });

      return ok({ ...booking, status_history: history });
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )
  .post(
    "/admin/bookings/:id/complete",
    // biome-ignore lint/suspicious/noExplicitAny: guarded context is loosely typed
    async ({ user, params, body, bookingStatusService }: any) => {
      // admin and super_admin both map to the state machine's "admin" actor,
      // matching manage-booking.routes.ts:56.
      const actor = { id: user.id, role: "admin" as const };
      const data = await bookingStatusService.completeBooking(params.id, actor, body?.reason);
      return ok(data);
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Optional(t.Object({ reason: t.Optional(t.String({ maxLength: 2000 })) })),
    },
  );
