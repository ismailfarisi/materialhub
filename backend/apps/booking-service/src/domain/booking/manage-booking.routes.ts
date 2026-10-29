// manage-booking.routes.ts
//
// Staff-facing booking-management actions (Phase 5 Task 5, spec §5.3). Separate
// from booking.routes.ts because the guard differs: these are NOT customer
// endpoints — the marking actor is platform staff. Kept in its own Elysia scope
// (its own requireRole) rather than mixed into booking.routes.ts's
// `requireRole("customer", ...)` scope.
//
// ── Exposure decision (mirrors how Phase 4's completeBooking is reachable) ────
// BookingStatusService.completeBooking has NO dedicated customer/vendor HTTP
// route — it's reachable only via the auto-complete job + internal/admin paths.
// No-show follows the same posture: gated to platform staff (admin/super_admin),
// who legitimately act on ANY booking (loaded by id, no ownership scoping —
// exactly like admin cancel in booking.routes.ts). NoShowService.markNoShow
// itself accepts any NON-customer actor (it throws ForbiddenError on a customer),
// so the eventual VENDOR / location-admin manage surface — which needs
// vendor_members ownership scoping (a vendor must only no-show THEIR OWN
// bookings) that doesn't exist in booking-service's route layer yet — can call
// the SAME service method once that scoping lands.
//
// >>> Phase 7 manage-surface gap: FILLED (Task 0B). The vendor/location-manager
// mutations (complete / no-show / reschedule) now live in
// manage-booking-actions.routes.ts under the `/manage/bookings/:id/*` prefix,
// gated by `vendorMembership("products.write")` with vendor_members-based
// ownership scoping (booking.vendor_id === member.vid) + location scope, and
// they DELEGATE to the same completion/no-show/reschedule services this admin
// route family uses. This route below stays as the PLATFORM-STAFF
// (admin/super_admin) no-show path — act-on-any, no vendor ownership scoping.
import { NoShowBookingBody } from "@materialhub/dto";
import { jwtAuth, requireRole } from "@materialhub/guards";
import { Elysia, t } from "elysia";
import { container } from "../../container.ts";

const ok = (data: unknown, status = 200) => ({
  statusCode: status,
  data,
  timestamp: new Date().toISOString(),
});

export const manageBookingRoutes = new Elysia()
  .use(container)
  .use(jwtAuth)
  .use(requireRole("admin", "super_admin"))
  // POST /bookings/:id/no-show — mark a confirmed booking (in the
  // [starts_at, ends_at+grace) window) as a no-show. Forfeits per the
  // snapshotted policy, records the forfeit in the status-history reason, and
  // notifies the customer with the penalty breakdown + dispute link. The
  // per-vendor strike count (which gates pay_at_venue) ticks up as a derived
  // consequence — no separate write. Returns 200 (the booking is updated in
  // place, not a newly created resource).
  .post(
    "/bookings/:id/no-show",
    // biome-ignore lint/suspicious/noExplicitAny: guarded context is loosely typed
    async ({ user, params, body, bookingController }: any) => {
      // admin / super_admin both map to the state-machine's "admin" actor role.
      const actor = { id: user.id, role: "admin" as const };
      const data = await bookingController.markNoShow(actor, params.id, body);
      return ok(data);
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: NoShowBookingBody,
    },
  );
