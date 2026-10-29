// Shared booking domain types for apps/web.
//
// This file is the single source of truth for booking wire shapes on the
// storefront — later tasks (Task 2 checkout/hold/pay, Task 3 my-bookings)
// should extend this file rather than redefining these types locally.
//
// Field lists mirror the ACTUAL backend entities as documented in
// .superpowers/sdd/phase7-recon-api.md (booking-service + product-service,
// branch booking/phase-2-scheduling-resources) — not the original plan docs.

export type LocationMode = "at_premises" | "home_visit" | "either";
export type PaymentMode = "prepay" | "deposit" | "pay_at_venue";
export type DepositType = "percent" | "fixed" | "none";
export type CancellationRefundPolicy = "full" | "deposit_forfeit" | "percent";
export type OfferingStatus = "draft" | "published" | "paused" | "archived";

/**
 * GET /services/:slug — raw ServiceOffering entity (product-service). No
 * staff/location join — those come from separate booking-service calls.
 */
export interface ServiceOffering {
  id: string;
  vendor_id: string;
  category_id: string | null;
  slug: string;
  name: string;
  description: string | null;
  media_urls: string[];
  duration_minutes: number;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  slot_step_minutes: number;
  location_mode: LocationMode;
  payment_mode: PaymentMode;
  price_fils: number;
  deposit_type: DepositType;
  /** Percent (0-100) when deposit_type is "percent"; fils when "fixed". */
  deposit_value: number;
  /** Numeric Postgres column serialized as a STRING (e.g. "5.00") — Number()-coerce before math. */
  vat_rate: string;
  min_notice_minutes: number;
  max_advance_days: number;
  cancellation_window_hours: number;
  cancellation_refund_policy: CancellationRefundPolicy;
  cancellation_penalty_percent: number | null;
  reschedule_window_hours: number;
  status: OfferingStatus;
  auto_approve: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** GET /booking/vendors/:id/locations — active branches only, public. */
export interface VendorLocation {
  id: string;
  vendor_id: string;
  name: string;
  address: Record<string, unknown> | null;
  lat: number | null;
  lng: number | null;
  area_id: string | null;
  timezone: string;
  is_active: boolean;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/**
 * GET /booking/offerings/:offeringId/staff — public subset only (id, name,
 * avatar_url, bio, rating, rating_count). Not the full vendor-management
 * StaffMember entity.
 */
export interface OfferingStaffMember {
  id: string;
  name: string;
  avatar_url: string | null;
  bio: string | null;
  /** Numeric column serialized as a STRING (e.g. "4.50"). */
  rating: string;
  rating_count: number;
}

export interface AvailabilitySlot {
  /** ISO instant (UTC). Service window only — buffers/travel are NOT reflected in these boundaries. */
  start: string;
  end: string;
  /** staff_member_id[] — every eligible+free staff for this exact slot. */
  staff_options: string[];
}

export type AvailabilityMode = "at_premises" | "home_visit";

/** GET /services/:slug/availability response `data`. */
export interface AvailabilityResponse {
  offering_id: string;
  /** IANA timezone, e.g. "Asia/Dubai" — render ALL wall-clock labels in this zone. */
  timezone: string;
  mode: AvailabilityMode;
  slots: AvailabilitySlot[];
}

export interface AvailabilityQuery {
  location?: string;
  area?: string;
  staff?: string;
  /** Required. ISO date/datetime. */
  from: string;
  /** Required. ISO date/datetime. Range capped server-side at 62 days and clamped to max_advance_days. */
  to: string;
}

export type BookingStatus =
  | "pending_payment"
  | "confirmed"
  | "rescheduled"
  | "cancelled"
  | "completed"
  | "no_show"
  | "expired";

export type BookingSource = "marketplace" | "walk_in" | "phone";

/**
 * Full Booking entity — used by later tasks (POST /bookings/hold + POST
 * /bookings response, GET /bookings/:id polling, GET /me/bookings list).
 * Defined here now so Task 2 / Task 3 extend one shared type instead of
 * redefining it.
 *
 * Gotcha: amount_paid_fils, balance_due_fils, paid_at_venue are DEAD
 * COLUMNS — never written back by any traced write path (deposit/prepay
 * capture, cancel, no-show all bypass them). Do NOT build a "paid so far"
 * UI off them; derive "what was charged" from payment_mode + deposit_fils /
 * price_fils + status instead.
 */
export interface Booking {
  id: string;
  booking_number: string;
  customer_user_id: string | null;
  vendor_id: string;
  location_id: string | null;
  customer_address: Record<string, unknown> | null;
  customer_name: string | null;
  customer_phone: string | null;
  staff_member_id: string;
  engagement_id: string;
  service_offering_id: string | null;
  service_name: string;
  duration_minutes: number;
  price_fils: number;
  vat_fils: number;
  deposit_fils: number;
  deposit_type: DepositType;
  cancellation_window_hours: number;
  cancellation_refund_policy: CancellationRefundPolicy;
  cancellation_penalty_percent: number | null;
  reschedule_window_hours: number;
  /** Numeric column serialized as a STRING. */
  commission_rate: string;
  commission_fils: number;
  commission_type: "percentage" | "fixed" | "tiered";
  starts_at: string;
  ends_at: string;
  status: BookingStatus;
  source: BookingSource;
  payment_mode: PaymentMode;
  /** @deprecated dead column, never written back — do not use for "paid so far" UI. */
  amount_paid_fils: number;
  /** @deprecated dead column, never written back — do not use for "balance due" UI. */
  balance_due_fils: number;
  /** @deprecated dead column, not actively written — do not use for "paid at venue" UI. */
  paid_at_venue: boolean;
  payment_id: string | null;
  escrow_hold_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** POST /bookings/hold response `data` — for Task 2. */
export interface BookingHoldResponse {
  hold_token: string;
  expires_in_seconds: number;
  staff_member_id: string;
  allowed_payment_modes: PaymentMode[];
}

/** POST /bookings/hold request body — for Task 2. */
export interface BookingHoldBody {
  offering_id: string;
  starts_at: string;
  ends_at: string;
  staff_member_id?: string | null;
  location_id?: string | null;
  customer_area_id?: string | null;
}

/** POST /bookings request body — for Task 2. Same shape as the hold body plus these fields. */
export interface CreateBookingBody {
  offering_id: string;
  starts_at: string;
  ends_at: string;
  staff_member_id?: string | null;
  location_id?: string | null;
  customer_area_id?: string | null;
  /** REQUIRED (422 if missing) when the RESOLVED offering is home-visit. */
  customer_address?: Record<string, unknown> | null;
  /** From POST /bookings/hold — must be bound to the exact staff/slot resolved server-side, or 409. */
  hold_token: string;
  notes?: string | null;
}

/** POST /bookings response `data` — for Task 2. */
export interface CreateBookingResponse {
  booking: Booking;
  client_secret: string | null;
  payment_intent_id: string | null;
  setup_intent_id: string | null;
}

/**
 * GET /me/bookings — NOTE the flat envelope quirk: `total` is a SIBLING of
 * `data` inside the response body's `data` key is NOT how this works either.
 * The full axios response body is `{ statusCode, data: Booking[], total,
 * timestamp }` — unlike almost every other booking-service response, which
 * nests everything under `data`. Callers should read `response.data.data`
 * (Booking[]) and `response.data.total` directly, NOT
 * `response.data.data.total` / `response.data.data.items`.
 */
export interface MyBookingsEnvelope {
  statusCode: number;
  data: Booking[];
  total: number;
  timestamp: string;
}

/** GET /me/bookings query params — for Task 3. */
export interface MyBookingsQuery {
  page?: number;
  limit?: number;
  status?: BookingStatus;
}

/**
 * POST /bookings/:id/reschedule request body — for Task 3. Same shape as
 * the hold body minus offering_id (carried over server-side from the
 * existing booking — a reschedule can't change service) plus a FRESH
 * hold_token (the create-time hold_token cannot be reused).
 */
export interface RescheduleBookingBody {
  starts_at: string;
  ends_at: string;
  staff_member_id?: string | null;
  location_id?: string | null;
  customer_area_id?: string | null;
  hold_token: string;
}

/** POST /bookings/:id/reschedule response `data` — same booking id, new slot, status back to "confirmed". */
export interface RescheduleBookingResponse {
  booking: Booking;
}

/** POST /bookings/:id/cancel request body — for Task 3. */
export interface CancelBookingBody {
  reason?: string | null;
}

export type CancelAction = "none" | "void" | "partial_capture" | "refund";

/**
 * POST /bookings/:id/cancel response `data` — the ACTUAL outcome (source of
 * truth). `refund_fils`/`forfeit_fils` reflect the INTENDED amounts, not a
 * guaranteed-successful gateway transfer (money movement is best-effort
 * after the booking is already cancelled).
 */
export interface CancelBookingResponse {
  booking: Booking;
  within_window: boolean;
  refund_fils: number;
  forfeit_fils: number;
  action: CancelAction;
}

/** POST /bookings/:id/review request body — for Task 3. */
export interface CreateServiceReviewBody {
  rating: number;
  title?: string | null;
  body?: string | null;
  media_urls?: string[] | null;
}

export type ServiceReviewStatus = "pending" | "approved" | "rejected";

/** POST /bookings/:id/review response `data` — the created ServiceReview row. */
export interface ServiceReview {
  id: string;
  booking_id: string;
  customer_user_id: string;
  vendor_id: string;
  staff_member_id: string;
  rating: number;
  title: string | null;
  body: string | null;
  media_urls: string[];
  status: ServiceReviewStatus;
  created_at: string;
  updated_at: string;
}

/**
 * A row from GET /services. This is the Typesense document shape, NOT the
 * ServiceOffering entity — note `price_fils` + `media_urls` (services) rather
 * than `price_min`/`images` (products), and the denormalised vendor/category
 * names that the raw entity does not carry.
 */
export interface ServiceListItem {
  id: string;
  name: string;
  description?: string;
  slug: string;
  vendor_id: string;
  vendor_name: string;
  vendor_slug?: string;
  category_id?: string;
  category_name: string;
  category_slug?: string;
  price_fils: number;
  duration_minutes: number;
  location_mode: LocationMode;
  payment_mode: PaymentMode;
  /** Mode-resolved: areas this offering can actually be had in. */
  area_ids: string[];
  area_slugs: string[];
  area_names: string[];
  /** Index-aligned WITH area_ids — look a name up by indexOf, see areaNamesFor. */
  premises_area_ids?: string[];
  home_visit_area_ids?: string[];
  rating_avg?: number;
  rating_count?: number;
  media_urls?: string[];
  status: OfferingStatus;
  /** Unix seconds. */
  created_at: number;
}

export interface ServiceFacetCount {
  value: string;
  count: number;
}

export interface ServiceFacets {
  areas: ServiceFacetCount[];
  categories: ServiceFacetCount[];
  visitTypes: ServiceFacetCount[];
  paymentModes: ServiceFacetCount[];
  vendors: ServiceFacetCount[];
}

export interface ServiceSearchResponse {
  data: ServiceListItem[];
  total: number;
  page: number;
  limit: number;
  facets: ServiceFacets;
}
