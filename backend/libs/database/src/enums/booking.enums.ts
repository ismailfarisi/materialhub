export enum ServiceLocationMode {
  at_premises = "at_premises",
  home_visit = "home_visit",
  either = "either",
}

export enum ServicePaymentMode {
  prepay = "prepay",
  deposit = "deposit",
  pay_at_venue = "pay_at_venue",
}

export enum ServiceOfferingStatus {
  draft = "draft",
  // Vendor requested publication but is not yet trusted — awaits admin review.
  pending_review = "pending_review",
  published = "published",
  // Admin declined; rejection_reason explains why. Vendor may edit and resubmit.
  rejected = "rejected",
  paused = "paused",
  archived = "archived",
}

export enum DepositType {
  percent = "percent",
  fixed = "fixed",
  none = "none",
}

export enum CancellationRefundPolicy {
  full = "full",
  deposit_forfeit = "deposit_forfeit",
  percent = "percent",
}

// Every consumption of a staff member's time is one staff_engagement row,
// regardless of source. The GiST EXCLUDE constraint enforces no overlap across
// all kinds at once.
export enum EngagementKind {
  marketplace_booking = "marketplace_booking",
  walk_in = "walk_in",
  phone = "phone",
  external_import = "external_import",
  manual_block = "manual_block",
  break = "break",
}

// `conflicted` is deliberately OUTSIDE the EXCLUDE predicate (`held`,`confirmed`)
// so it is always insertable — Phase 6's iCal import lands overlapping inbound
// events as `conflicted` to surface the collision instead of silently dropping it.
export enum EngagementStatus {
  held = "held",
  confirmed = "confirmed",
  released = "released",
  cancelled = "cancelled",
  conflicted = "conflicted",
}

// The `booking` row's lifecycle (spec §5.3). `pending_payment` is the only
// pre-money state; the reaper (Phase 4 Task 7) expires stale ones. `rescheduled`
// is a transient marker on the old booking when a customer moves to a new slot
// (the new booking/engagement carries the live state forward).
export enum BookingStatus {
  pending_payment = "pending_payment",
  confirmed = "confirmed",
  rescheduled = "rescheduled",
  cancelled = "cancelled",
  completed = "completed",
  no_show = "no_show",
  expired = "expired",
}

// Moderation status for `service_reviews` (spec §4.3). Mirrors the values on the
// product-catalog `ReviewStatus` (product.enums.ts), but kept as its own type —
// service_reviews is owned by booking-service and reviews is owned by
// product-service; sharing one Postgres enum type would couple their schemas
// across the service boundary (Task 7 may need to diverge, e.g. a `hidden`
// state, without touching product reviews).
export enum ServiceReviewStatus {
  pending = "pending",
  approved = "approved",
  rejected = "rejected",
  flagged = "flagged",
}
