import { type Static, Type } from "@sinclair/typebox";

// ─── Customer booking APIs (Phase 4 Task 8, spec §5.1/§8) ──────────────────
// customer_id is NEVER accepted in the body — the route derives it from the
// verified JWT (`user.id`). `customer_address` stays OPTIONAL here even
// though it's required for home-visit bookings, because this schema has no
// way to know the target offering's `location_mode`; BookingService.create()
// (and .hold()) enforce the "required when home-visit" rule server-side,
// keyed on the resolved offering's `location_mode` (not on whether the
// client happened to send `customer_area_id`) — throwing
// UnprocessableEntityError (422) when a home-visit booking is missing
// `customer_area_id`/`customer_address`.

const Jsonb = Type.Record(Type.String(), Type.Unknown());

export const BookingHoldBody = Type.Object({
  offering_id: Type.String({ format: "uuid" }),
  starts_at: Type.String(),
  ends_at: Type.String(),
  // Preferred staff; omitted lets the service auto-assign the first
  // eligible+free staff member for the slot (mirrors CreateBookingBody).
  staff_member_id: Type.Optional(Type.Union([Type.String({ format: "uuid" }), Type.Null()])),
  // Required for at_premises/either bookings.
  location_id: Type.Optional(Type.Union([Type.String({ format: "uuid" }), Type.Null()])),
  // Presence signals "home visit requested"; required for home_visit bookings.
  customer_area_id: Type.Optional(Type.Union([Type.String({ format: "uuid" }), Type.Null()])),
});
export type BookingHoldBody = Static<typeof BookingHoldBody>;

export const CreateBookingBody = Type.Object({
  offering_id: Type.String({ format: "uuid" }),
  starts_at: Type.String(),
  ends_at: Type.String(),
  staff_member_id: Type.Optional(Type.Union([Type.String({ format: "uuid" }), Type.Null()])),
  location_id: Type.Optional(Type.Union([Type.String({ format: "uuid" }), Type.Null()])),
  customer_area_id: Type.Optional(Type.Union([Type.String({ format: "uuid" }), Type.Null()])),
  // Required ONLY when the resolved offering is home-visit — validated in
  // BookingService.create(), not here (see module comment above).
  customer_address: Type.Optional(Type.Union([Jsonb, Type.Null()])),
  // Token from POST /bookings/hold — verified server-side to be bound to the
  // exact staff/slot being booked.
  hold_token: Type.String({ minLength: 1 }),
  notes: Type.Optional(Type.Union([Type.String(), Type.Null()])),
});
export type CreateBookingBody = Static<typeof CreateBookingBody>;

// ─── Reschedule (Phase 5 Task 3, spec §5.3) ───────────────────────────────
// The customer picks a NEW slot via POST /bookings/hold (same as create),
// then POSTs the resulting hold_token here with the new starts_at/ends_at.
// offering_id is NOT accepted — it's carried from the existing booking (a
// reschedule can't change the service). staff_member_id/location_id/
// customer_area_id are optional overrides for resolving the new slot: when
// omitted the service reuses the booking's existing location (at_premises)
// and auto-assigns free staff, mirroring create()'s resolution. As with the
// other bodies here, EVERY field must be declared or Elysia strips it before
// the handler sees it, and t.Optional means absent/undefined (never null) —
// hence the explicit Union([X, Null]) on the nullable optionals.
export const RescheduleBookingBody = Type.Object({
  starts_at: Type.String(),
  ends_at: Type.String(),
  staff_member_id: Type.Optional(Type.Union([Type.String({ format: "uuid" }), Type.Null()])),
  location_id: Type.Optional(Type.Union([Type.String({ format: "uuid" }), Type.Null()])),
  customer_area_id: Type.Optional(Type.Union([Type.String({ format: "uuid" }), Type.Null()])),
  // Token from POST /bookings/hold — verified server-side to be bound to the
  // exact staff/slot being moved to.
  hold_token: Type.String({ minLength: 1 }),
});
export type RescheduleBookingBody = Static<typeof RescheduleBookingBody>;

// ─── Cancel (Phase 5 Task 4, spec §5.3) ───────────────────────────────────
// POST /bookings/:id/cancel. Only an optional free-text `reason` is accepted —
// the booking id comes from the path, the actor from the verified JWT. As with
// the other bodies here, t.Optional means absent/undefined (never null), so the
// nullable optional is spelled Union([String, Null]) explicitly (a client may
// send `reason: null`); Elysia strips any field not declared here before the
// handler sees it.
export const CancelBookingBody = Type.Object({
  reason: Type.Optional(Type.Union([Type.String(), Type.Null()])),
});
export type CancelBookingBody = Static<typeof CancelBookingBody>;

// ─── No-show (Phase 5 Task 5, spec §5.3) ──────────────────────────────────
// POST /bookings/:id/no-show — marked by a vendor/location-admin/platform-admin
// (NEVER the customer; enforced by the route's requireRole + the service). Same
// shape as CancelBookingBody: only an optional free-text `reason`, the booking
// id comes from the path and the marking actor from the verified JWT. t.Optional
// means absent/undefined (never null), so the nullable optional is spelled
// Union([String, Null]) explicitly.
export const NoShowBookingBody = Type.Object({
  reason: Type.Optional(Type.Union([Type.String(), Type.Null()])),
});
export type NoShowBookingBody = Static<typeof NoShowBookingBody>;

// Mirrors BookingStatus (@materialhub/database, booking.enums.ts) — kept as a
// literal union here (not an import) to match this DTO file's existing
// dependency-free style (see e.g. CreateBookingBody's Jsonb helper); an
// invalid value now 400s at the schema boundary instead of silently
// returning zero rows from BookingQueryService.list's WHERE status = ...
export const MyBookingsQuery = Type.Object({
  // Type.Number (not Integer): query params arrive as strings and Elysia only
  // coerces them for numeric schemas — Integer rejects "1" (cms.dto precedent).
  page: Type.Optional(Type.Number({ minimum: 1, default: 1 })),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100, default: 20 })),
  status: Type.Optional(
    Type.Union([
      Type.Literal("pending_payment"),
      Type.Literal("confirmed"),
      Type.Literal("rescheduled"),
      Type.Literal("cancelled"),
      Type.Literal("completed"),
      Type.Literal("no_show"),
      Type.Literal("expired"),
    ]),
  ),
});
export type MyBookingsQuery = Static<typeof MyBookingsQuery>;

// ─── Booking-gated reviews (Phase 5 Task 7, spec §4.3/§7) ─────────────────
// POST /bookings/:id/review — the booking id comes from the path, the
// customer from the verified JWT. ServiceReviewService enforces ownership
// (404), completed-only (403), and one-review-per-booking (409). As with the
// other bodies here, every field must be declared or Elysia strips it before
// the handler sees it, and t.Optional means absent/undefined (never null) —
// nullable optionals are spelled Union([X, Null]) explicitly.
//
// Input bounds MIRROR the product-review body (order-service's
// review.routes.ts / product.dto.ts CreateReviewBody): `body` maxLength 5000,
// `media_urls` maxItems 5. Without them a customer holding one completed
// booking could store a multi-MB body or a 100k-element media array in a row
// that is created already `approved` (see service-review.service.ts's
// moderation-status doc comment — booking reviews deliberately skip the
// `pending` step, so nothing stands between this input and "live").
//
// `media_urls` scheme validation is done with `pattern`, deliberately NOT
// `format: "uri"`:
//   1. `javascript:alert(1)` IS a perfectly valid URI, so `uri` would not
//      stop the thing worth stopping.
//   2. TypeBox returns FALSE for a format that isn't in its FormatRegistry.
//      Registration depends on import order (libs/dto imports raw
//      @sinclair/typebox, not elysia's type-system), so `format: "uri"` here
//      is a coin-flip between "no-op" and "rejects every URL" — verified:
//      with a bare TypeBox Value.Check even `https://cdn.x/a.jpg` fails.
// `pattern` is a plain JSON-Schema keyword with no registry dependency, so it
// is enforced identically in every context: http(s) only, so a stored URL can
// never become a script-scheme link the first time a render site appears.
const MEDIA_URL = Type.String({
  pattern: "^https?://",
  minLength: 1,
  maxLength: 2048,
});

export const CreateServiceReviewBody = Type.Object({
  rating: Type.Integer({ minimum: 1, maximum: 5 }),
  title: Type.Optional(Type.Union([Type.String({ maxLength: 255 }), Type.Null()])),
  body: Type.Optional(Type.Union([Type.String({ maxLength: 5000 }), Type.Null()])),
  media_urls: Type.Optional(Type.Union([Type.Array(MEDIA_URL, { maxItems: 5 }), Type.Null()])),
});
export type CreateServiceReviewBody = Static<typeof CreateServiceReviewBody>;

// POST /vendor/booking/reviews/:id/reply — vendor-scoped (vendorMembership,
// see service-review.routes.ts). One reply per review; a second attempt 409s.
export const VendorReplyServiceReviewBody = Type.Object({
  // Capped for the same reason as `body` above — a vendor reply is rendered
  // alongside the review and is stored unmoderated.
  reply: Type.String({ minLength: 1, maxLength: 5000 }),
});
export type VendorReplyServiceReviewBody = Static<typeof VendorReplyServiceReviewBody>;
