// service-review.routes.ts
//
// Booking-gated review APIs (Phase 5 Task 7, spec §4.3/§7). Two separate
// Elysia scopes (mirrors booking.routes.ts / manage-booking.routes.ts being
// split by guard):
//   - POST /bookings/:id/review — the booking's own customer only.
//   - POST /vendor/booking/reviews/:id/reply — the review's owning vendor
//     only (vendorMembership, NOT customer/admin).
// Reaches booking-service via the existing gateway prefixes (`/bookings*` and
// `/vendor/booking*` already proxy here — no new proxy entry needed).
import { CreateServiceReviewBody, VendorReplyServiceReviewBody } from "@materialhub/dto";
import { jwtAuth, requireRole, vendorMembership } from "@materialhub/guards";
import { Elysia, t } from "elysia";
import { container } from "../../container.ts";

const ok = (data: unknown, status = 200) => ({
  statusCode: status,
  data,
  timestamp: new Date().toISOString(),
});

// POST /bookings/:id/review — customer-only (not admin: a review is the
// booking customer's own opinion, unlike cancel/reschedule which admins may
// also perform on a customer's behalf). Ownership + completed-only (403) +
// one-per-booking (409) enforced in ServiceReviewService.create.
export const serviceReviewRoutes = new Elysia()
  .use(container)
  .use(jwtAuth)
  .use(requireRole("customer"))
  .post(
    "/bookings/:id/review",
    // biome-ignore lint/suspicious/noExplicitAny: guarded context is loosely typed
    async ({ user, params, body, serviceReviewController, set }: any) => {
      const data = await serviceReviewController.create(user.id, params.id, body);
      set.status = 201;
      return ok(data, 201);
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: CreateServiceReviewBody,
    },
  );

// POST /vendor/booking/reviews/:id/reply — vendor-scoped via
// vendorMembership("products.write"), reusing the SAME gate staff.routes.ts /
// location.routes.ts already use for vendor-level booking-service management,
// PLUS an owner/manager role check inside ServiceReviewService.vendorReply
// (`products.write` alone is held by ordinary staff, and a reply is a public
// statement in the vendor's name — see that method's doc comment, and
// ManageBookingActionsController.loadScopedBooking for the matching rule).
// See ServiceReviewService.vendorReply's doc comment for why this isn't
// location-scoped (a booking's location_id is nullable — home-visit).
export const vendorServiceReviewRoutes = new Elysia({ prefix: "/vendor/booking/reviews" })
  .use(container)
  // jwtAuth populates `user` for vendorMembership below — MUST be in this same
  // instance (scoped derive doesn't cross plugin encapsulation). Without it the
  // guard's `!user` branch 401s every caller. Mirrors coupon-routes precedent.
  .use(jwtAuth)
  .guard({}, (app) =>
    app.use(vendorMembership("products.write")).post(
      "/:id/reply",
      // biome-ignore lint/suspicious/noExplicitAny: guarded context is loosely typed
      async ({ params, body, member, serviceReviewController }: any) =>
        ok(
          await serviceReviewController.vendorReply(
            { vendorId: member.vid, role: member.r },
            params.id,
            body,
          ),
        ),
      {
        params: t.Object({ id: t.String({ format: "uuid" }) }),
        body: VendorReplyServiceReviewBody,
      },
    ),
  );
