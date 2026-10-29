import { type Static, Type } from "@sinclair/typebox";

// ─── Manual walk-in / phone booking (Phase 6 Task 1) ───────────────────────
// POST /manage/bookings — a vendor location manager records a walk-in/phone
// customer directly against the capacity ledger (no MaterialHub customer
// account, no online payment/checkout). `service_id` is deliberately
// optional: a phone booking may be taken before the exact service is
// decided. Every nullable-optional field follows this repo's
// Type.Optional(Type.Union([X, Type.Null()])) convention — plain
// Type.Optional rejects an explicit `null` body value.
export const CreateManualBookingBody = Type.Object({
  staff_member_id: Type.String({ format: "uuid" }),
  vendor_location_id: Type.String({ format: "uuid" }),
  service_id: Type.Optional(Type.Union([Type.String({ format: "uuid" }), Type.Null()])),
  starts_at: Type.String(),
  ends_at: Type.String(),
  kind: Type.Union([Type.Literal("walk_in"), Type.Literal("phone")]),
  customer_name: Type.Optional(Type.Union([Type.String({ maxLength: 255 }), Type.Null()])),
  customer_phone: Type.Optional(Type.Union([Type.String({ maxLength: 32 }), Type.Null()])),
  // Free-text note — e.g. a manual deposit collected in person. Recorded on
  // the booking row's `notes` column; no deposit/payment processing happens
  // through this route (capacity-only, spec's off-platform-capacity binding
  // decision).
  notes: Type.Optional(Type.Union([Type.String(), Type.Null()])),
});
export type CreateManualBookingBody = Static<typeof CreateManualBookingBody>;

// ─── Block time / break (Phase 6 Task 2) ────────────────────────────────
// POST /manage/blocks — a vendor location manager blocks a staff member's
// time (`manual_block`, e.g. closed for stocktake) or logs a `break`
// directly against the capacity ledger. Engagement-only: this never creates
// a `bookings` row (see block-time.service.ts's header comment).
export const CreateBlockBody = Type.Object({
  staff_member_id: Type.String({ format: "uuid" }),
  vendor_location_id: Type.String({ format: "uuid" }),
  starts_at: Type.String(),
  ends_at: Type.String(),
  kind: Type.Union([Type.Literal("manual_block"), Type.Literal("break")]),
  // No dedicated notes/reason column on `staff_engagements` (unlike
  // `bookings.notes` above) — this piggybacks on the ledger's existing
  // free-text `external_source` column rather than adding a migration for a
  // single optional field. See block-time.service.ts for the full decision.
  reason: Type.Optional(Type.Union([Type.String({ maxLength: 128 }), Type.Null()])),
});
export type CreateBlockBody = Static<typeof CreateBlockBody>;

// ─── Calendar subscription (Phase 6 Task 4) ────────────────────────────────
// PUT /manage/staff/:id/calendar-subscription — register/replace the external
// iCal feed URL the inbound poller pulls into the capacity ledger. One
// subscription per staff member. `ical_url` must be http(s) (re-validated in
// the service; the DTO's `format: "uri"` is advisory only, Elysia doesn't
// enforce the scheme).
export const UpsertCalendarSubscriptionBody = Type.Object({
  ical_url: Type.String({ format: "uri", minLength: 1, maxLength: 2048 }),
});
export type UpsertCalendarSubscriptionBody = Static<typeof UpsertCalendarSubscriptionBody>;

// ─── Vendor calendar (Task 0A, Phase 7 backend prerequisite) ───────────────
// GET /manage/calendar — unified vendor/location-scoped read across ALL
// staff_engagements kinds (marketplace bookings, walk-in/phone, external
// iCal imports, blocks, breaks) for the dashboard day/week calendar view.
// Response-shape only (no request body — `from`/`to`/`staff_member_id`/
// `vendor_location_id` are plain query-string params, validated/parsed in
// ManageCalendarService.list rather than an Elysia `query:` schema, mirroring
// AvailabilityController.getBySlug's own required-field + range-cap
// validation). Exported as `Static<>` types for the
// service/controller return-type annotations — this repo doesn't wire
// `response:` schemas into Elysia routes anywhere, so these aren't attached
// to the route either, just used for typing/documentation like every other
// GET response shape here.
export const ManageCalendarBookingSummary = Type.Object({
  id: Type.String({ format: "uuid" }),
  booking_number: Type.String(),
  status: Type.Union([
    Type.Literal("pending_payment"),
    Type.Literal("confirmed"),
    Type.Literal("rescheduled"),
    Type.Literal("cancelled"),
    Type.Literal("completed"),
    Type.Literal("no_show"),
    Type.Literal("expired"),
  ]),
  // Free-text on the entity (not a DB enum) — kept as a plain string here too.
  source: Type.String(),
  payment_mode: Type.Union([
    Type.Literal("prepay"),
    Type.Literal("deposit"),
    Type.Literal("pay_at_venue"),
  ]),
  service_name: Type.String(),
  price_fils: Type.Integer(),
  notes: Type.Union([Type.String(), Type.Null()]),
  location_id: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
  // `bookings.customer_name` for walk-in/phone; the resolved users-table
  // display name for marketplace bookings; null if that user row is missing.
  customer_name: Type.Union([Type.String(), Type.Null()]),
});
export type ManageCalendarBookingSummary = Static<typeof ManageCalendarBookingSummary>;

export const ManageCalendarEngagement = Type.Object({
  id: Type.String({ format: "uuid" }),
  staff_member_id: Type.String({ format: "uuid" }),
  kind: Type.Union([
    Type.Literal("marketplace_booking"),
    Type.Literal("walk_in"),
    Type.Literal("phone"),
    Type.Literal("external_import"),
    Type.Literal("manual_block"),
    Type.Literal("break"),
  ]),
  // Only the three "occupied" statuses are ever returned by this read
  // (released/cancelled are excluded server-side).
  status: Type.Union([Type.Literal("held"), Type.Literal("confirmed"), Type.Literal("conflicted")]),
  starts_at: Type.String(),
  ends_at: Type.String(),
  // Dual-purpose column: block/break reason text OR an external-import feed
  // identifier, depending on `kind` (see block-time.service.ts's header
  // comment) — carried through verbatim, no separate reason field.
  external_source: Type.Union([Type.String(), Type.Null()]),
  external_ref: Type.Union([Type.String(), Type.Null()]),
  // Populated only for engagements that back a `bookings` row (matched via
  // bookings.engagement_id); null for manual_block/break/external_import.
  booking: Type.Union([ManageCalendarBookingSummary, Type.Null()]),
});
export type ManageCalendarEngagement = Static<typeof ManageCalendarEngagement>;

// ─── Vendor-surface booking reschedule (Task 0B, Phase 7) ──────────────────
// POST /manage/bookings/:id/reschedule — a vendor/location-manager moves one
// of their OWN confirmed bookings to a new slot from the dashboard. Distinct
// from the customer RescheduleBookingBody (booking.dto.ts): NO `hold_token`
// (a vendor JWT can't mint the customer-gated Redis hold — the atomic EXCLUDE
// re-check inside the reschedule service makes the vendor move safe without
// one), and NO `location_id`/`customer_area_id` (a vendor reschedule is a
// time/staff move only — no location or offering change; the booking's
// existing location is reused). `offering_id` is likewise carried over from
// the booking. Every nullable-optional field follows this repo's
// Type.Optional(Type.Union([X, Type.Null()])) convention (plain Type.Optional
// rejects an explicit `null`); Elysia strips any field not declared here.
export const ManageRescheduleBookingBody = Type.Object({
  starts_at: Type.String(),
  ends_at: Type.String(),
  staff_member_id: Type.Optional(Type.Union([Type.String({ format: "uuid" }), Type.Null()])),
});
export type ManageRescheduleBookingBody = Static<typeof ManageRescheduleBookingBody>;

// ─── Location-membership CRUD (Task 0B, Phase 7) ───────────────────────────
// POST /manage/locations/:id/members — an owner/manager grants a vendor member
// a per-location managing role (layered on the vendor-wide vendor_members
// grant). `role` is constrained to the two literals the location-scope guard
// actually recognizes as "managing" (MANAGING_LOCATION_ROLES in
// guards/location-scope.ts) — granting any other value would be an inert row
// that authorizes nothing, so only the meaningful vocabulary is accepted here
// (location_memberships.role is a free varchar in the schema; these are the
// only literals the code assigns behavior to — not invented). `user_id` must
// resolve to an ACTIVE vendor_members row of the same vendor (enforced in the
// service — a location grant is a subset of vendor membership, never a
// backdoor into the vendor).
export const CreateLocationMembershipBody = Type.Object({
  user_id: Type.String({ format: "uuid" }),
  role: Type.Union([Type.Literal("manager"), Type.Literal("admin")]),
});
export type CreateLocationMembershipBody = Static<typeof CreateLocationMembershipBody>;

// GET /manage/locations/:id/members response row — an active location
// membership plus the member's resolved display name + email (one batched
// users lookup; a missing user row yields nulls, never a thrown error).
export const LocationMembershipRow = Type.Object({
  id: Type.String({ format: "uuid" }),
  vendor_location_id: Type.String({ format: "uuid" }),
  user_id: Type.String({ format: "uuid" }),
  role: Type.String(),
  permissions: Type.Array(Type.String()),
  user_name: Type.Union([Type.String(), Type.Null()]),
  user_email: Type.Union([Type.String(), Type.Null()]),
  created_at: Type.String(),
  updated_at: Type.String(),
});
export type LocationMembershipRow = Static<typeof LocationMembershipRow>;

// GET /manage/my-location-memberships response row (Task 7 fix cycle, Important
// #2) — a SELF-scoped read: the caller's OWN active location_membership rows
// for the active vendor, `{ location_id, role }` only (no user_id/email/name —
// the caller already knows who they are; this exists purely so the vendor-
// dashboard can compute "can I manage THIS location's write affordances"
// without an owner/manager-only GET /manage/locations/:id/members call, which
// a location-admin/staff actor is forbidden from making). Owner/manager
// callers get `[]` from the service (they pass vendor-wide via
// isVendorManagerRole and don't need rows to prove it).
export const MyLocationMembershipRow = Type.Object({
  location_id: Type.String({ format: "uuid" }),
  role: Type.String(),
});
export type MyLocationMembershipRow = Static<typeof MyLocationMembershipRow>;

// ─── Public offering staff (Task 0A, Phase 7 backend prerequisite) ─────────
// GET /booking/offerings/:id/staff — PII-free staff rows for the storefront
// PDP availability picker (renders staff_options ids as names/avatars + a
// staff filter). Never includes user_id. Response-shape only (no request
// body); documented here as Static<> for consistency with the rest of this
// file, not wired to Elysia response: validation (see comment above).
export const PublicStaffMember = Type.Object({
  id: Type.String({ format: "uuid" }),
  name: Type.String(),
  avatar_url: Type.Union([Type.String(), Type.Null()]),
  bio: Type.Union([Type.String(), Type.Null()]),
  // Numeric Postgres column — serializes as a string over JSON (e.g. "4.50"),
  // matching every other numeric field in this codebase (vat_rate,
  // commission_rate, ...). Kept as Type.String() rather than Type.Number()
  // to reflect the actual wire shape.
  rating: Type.String(),
  rating_count: Type.Integer(),
});
export type PublicStaffMember = Static<typeof PublicStaffMember>;
