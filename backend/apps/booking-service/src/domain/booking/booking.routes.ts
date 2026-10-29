// booking.routes.ts
//
// Customer-facing booking APIs (Phase 4 Task 8, spec §5.1/§8): hold a slot,
// create a booking, and read back the caller's own bookings. Auth-required —
// NOT public, NOT optional-auth (a booking always needs a real customer
// identity). Mirrors order-service's checkout.routes.ts / order.routes.ts
// buyer-endpoint pattern: `.use(jwtAuth).use(requireRole(...))`, then derive
// customerId from `user.id` off context — NEVER from the request body.
//
// Gateway wiring (api-gateway/src/proxy.ts): `/bookings*` and `/me/bookings`
// route to booking-service. Neither collides with the existing `/booking`
// (singular) vendor/public prefix — `"/bookings".startsWith("/booking/")` is
// false (next char is `s`, not `/`), and no generic `/me` prefix exists to
// collide with `/me/bookings` (see proxy.ts comment).
import {
  BookingHoldBody,
  CancelBookingBody,
  CreateBookingBody,
  MyBookingsQuery,
  RescheduleBookingBody,
} from "@materialhub/dto";
import { jwtAuth, requireRole } from "@materialhub/guards";
import { NotFoundError } from "@materialhub/plugins";
import { Elysia, t } from "elysia";
import { container } from "../../container.ts";
import type { BookingActorRole } from "./booking-status.service.ts";

// Map the verified JWT role onto the state-machine's actor role. Only
// customer / admin / super_admin reach these routes (requireRole below);
// admin + super_admin both act as "admin" (they bypass the customer
// reschedule window — see RescheduleService).
function actorRoleFor(role: string): BookingActorRole {
  return role === "customer" ? "customer" : "admin";
}

const ok = (data: unknown, status = 200) => ({
  statusCode: status,
  data,
  timestamp: new Date().toISOString(),
});

export const bookingRoutes = new Elysia()
  .use(container)
  .use(jwtAuth)
  .use(requireRole("customer", "admin", "super_admin"))
  // POST /bookings/hold — soft-locks a staff+slot in Redis (no DB row; spec
  // §5.1 step 2) and returns allowed_payment_modes computed for this
  // customer, so checkout can render only valid modes with explanatory copy
  // before the customer fills in payment details. 200, not 201 — the hold is
  // an ephemeral Redis key, not a persisted resource with its own GET.
  .post(
    "/bookings/hold",
    // biome-ignore lint/suspicious/noExplicitAny: Elysia guarded context is loosely typed
    async ({ user, body, bookingController }: any) =>
      ok(await bookingController.hold(user.id, body)),
    { body: BookingHoldBody },
  )
  // POST /bookings — BookingService.create() (Task 5): one DB transaction
  // (engagement + booking), branches on payment_mode. Returns the booking row
  // + client_secret (deposit/prepay) or confirmed with client_secret=null
  // (pay_at_venue).
  .post(
    "/bookings",
    // biome-ignore lint/suspicious/noExplicitAny: guarded context
    async ({ user, body, bookingController, set }: any) => {
      const data = await bookingController.create(user.id, body);
      set.status = 201;
      return ok(data, 201);
    },
    { body: CreateBookingBody },
  )
  // POST /bookings/:id/reschedule — move a confirmed booking to a new slot
  // (Phase 5 Task 3, spec §5.3). Reaches booking-service via the existing
  // `/bookings` gateway prefix (no new proxy entry needed). Ownership +
  // window enforcement live in RescheduleService; a customer's not-owned
  // booking reads as 404. Returns 200 (the booking is updated in place, not a
  // newly created resource).
  .post(
    "/bookings/:id/reschedule",
    // biome-ignore lint/suspicious/noExplicitAny: guarded context
    async ({ user, params, body, bookingController }: any) => {
      const actor = { id: user.id, role: actorRoleFor(user.role) };
      const data = await bookingController.reschedule(actor, params.id, body);
      return ok(data);
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: RescheduleBookingBody,
    },
  )
  // POST /bookings/:id/cancel — cancel a confirmed booking (Phase 5 Task 4,
  // spec §5.3). Frees the slot + moves money per the snapshotted cancellation
  // policy (customer out-of-window forfeits; admin bypasses the window → full
  // refund). Ownership + policy enforcement live in CancelService; a customer's
  // not-owned booking reads as 404. Returns 200 (the booking is updated in
  // place, not a newly created resource).
  .post(
    "/bookings/:id/cancel",
    // biome-ignore lint/suspicious/noExplicitAny: guarded context
    async ({ user, params, body, bookingController }: any) => {
      const actor = { id: user.id, role: actorRoleFor(user.role) };
      const data = await bookingController.cancel(actor, params.id, body);
      return ok(data);
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: CancelBookingBody,
    },
  )
  // GET /me/bookings — the authenticated customer's own bookings only
  // (BookingQueryService.list scopes by customer_user_id = user.id).
  .get(
    "/me/bookings",
    // biome-ignore lint/suspicious/noExplicitAny: guarded context
    async ({ user, query, bookingController }: any) => {
      const result = await bookingController.listMine(user.id, query);
      return {
        statusCode: 200,
        data: result.data,
        total: result.total,
        timestamp: new Date().toISOString(),
      };
    },
    { query: MyBookingsQuery },
  )
  // GET /bookings/:id — the authenticated customer's own booking by id.
  // Ownership scoping happens in BookingQueryService.getById (WHERE id=...
  // AND customer_user_id=...); a booking that exists but belongs to a
  // different customer is indistinguishable from a nonexistent one — 404,
  // matching order-service's OrderQueryService.getById convention (no
  // separate 403 branch that would leak existence).
  .get(
    "/bookings/:id",
    // biome-ignore lint/suspicious/noExplicitAny: guarded context
    async ({ user, params, bookingController }: any) => {
      const booking = await bookingController.getOwn(user.id, params.id);
      if (!booking) throw new NotFoundError("Booking not found");
      return ok(booking);
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  );
