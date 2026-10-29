import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type {
  AvailabilityQuery,
  AvailabilityResponse,
  Booking,
  BookingHoldBody,
  BookingHoldResponse,
  BookingStatus,
  CancelBookingBody,
  CancelBookingResponse,
  CreateBookingBody,
  CreateBookingResponse,
  CreateServiceReviewBody,
  OfferingStaffMember,
  RescheduleBookingBody,
  RescheduleBookingResponse,
  ServiceOffering,
  ServiceReview,
  VendorLocation,
} from "../booking/types";

/** GET /booking/vendors/:id/locations — public, active branches only. */
export function useVendorLocations(vendorId: string | undefined) {
  return useQuery({
    queryKey: ["booking", "vendor-locations", vendorId],
    queryFn: async () => {
      const { data } = await api.get(`/booking/vendors/${vendorId}/locations`);
      return (data.data ?? []) as VendorLocation[];
    },
    enabled: !!vendorId,
    staleTime: 5 * 60 * 1000,
  });
}

/** GET /booking/offerings/:offeringId/staff — public. */
export function useOfferingStaff(
  offeringId: string | undefined,
  locationId?: string,
) {
  return useQuery({
    queryKey: ["booking", "offering-staff", offeringId, locationId],
    queryFn: async () => {
      const { data } = await api.get(
        `/booking/offerings/${offeringId}/staff`,
        { params: locationId ? { location: locationId } : undefined },
      );
      return (data.data ?? []) as OfferingStaffMember[];
    },
    enabled: !!offeringId,
    staleTime: 60 * 1000,
  });
}

/** GET /services/:slug/availability — public. `from`/`to` are required by the endpoint. */
export function useAvailability(
  slug: string | undefined,
  query: AvailabilityQuery | undefined,
) {
  return useQuery({
    queryKey: ["booking", "availability", slug, query],
    queryFn: async () => {
      const { data } = await api.get(`/services/${slug}/availability`, {
        params: query,
      });
      return data.data as AvailabilityResponse;
    },
    enabled: !!slug && !!query?.from && !!query?.to,
    staleTime: 30 * 1000,
    retry: 1,
  });
}

/**
 * POST /bookings/hold — soft-locks a staff+slot in Redis only (no DB row).
 * 200, not 201. Returns `allowed_payment_modes` (empty or single-element —
 * one payment_mode per offering, never a menu) and a 600s hold TTL. A 409
 * means the slot is gone or held by someone else — callers should route to
 * a re-pick path, not retry automatically.
 */
export function useHoldBooking() {
  return useMutation({
    mutationFn: async (body: BookingHoldBody) => {
      const { data } = await api.post("/bookings/hold", body);
      return data.data as BookingHoldResponse;
    },
  });
}

/**
 * POST /bookings — creates the booking against a hold_token. 201. Branches
 * by payment_mode: pay_at_venue confirms immediately (client_secret null);
 * deposit/prepay return a Stripe client_secret (capture-now PaymentIntent
 * or SetupIntent respectively) for the caller to confirm client-side. A
 * 409 means the hold/slot was lost between hold and create (EXCLUDE race) —
 * same re-pick path as the hold 409. A 422 `pay_at_venue_unavailable` is
 * the hard backstop even when the hold's `allowed_payment_modes` looked
 * fine (that field is advisory only).
 */
export function useCreateBooking() {
  return useMutation({
    mutationFn: async (body: CreateBookingBody) => {
      const { data } = await api.post("/bookings", body);
      return data.data as CreateBookingResponse;
    },
  });
}

/**
 * GET /bookings/:id — there is NO customer-facing "confirm my booking"
 * endpoint; confirmation is entirely webhook-driven (order-service Stripe
 * webhook -> booking-service internal route). After a client-side Stripe
 * confirm resolves, this is the only way the frontend observes the status
 * flip from "pending_payment" to "confirmed". Polls every 2s while
 * `enabled` and the last-seen status is still "pending_payment"; stops
 * polling once a terminal status is reached. Callers must enforce their
 * own overall timeout (query.state.data doesn't know how long it's been
 * polling) — see booking-checkout.tsx's POLL_TIMEOUT_MS.
 */
export function useBookingPoll(bookingId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["booking", "detail", bookingId],
    queryFn: async () => {
      const { data } = await api.get(`/bookings/${bookingId}`);
      return data.data as Booking;
    },
    enabled: !!bookingId && enabled,
    refetchInterval: (query) =>
      query.state.data?.status === "pending_payment" ? 2000 : false,
    refetchIntervalInBackground: true,
  });
}

/**
 * GET /bookings/:id — plain (non-polling) read for my-bookings detail /
 * reschedule pages (Task 3). Ownership-scoped server-side; a booking that
 * exists but isn't the caller's reads as a plain 404 (surfaces via
 * `query.isError` / `error.response.status === 404`, same as any other
 * axios 404 — no special handling needed here).
 */
export function useBooking(bookingId: string | undefined) {
  return useQuery({
    // Shares the ["booking","detail",id] key with useBookingPoll above so a
    // completed poll's cached data is reused instead of re-fetched.
    queryKey: ["booking", "detail", bookingId],
    queryFn: async () => {
      const { data } = await api.get(`/bookings/${bookingId}`);
      return data.data as Booking;
    },
    enabled: !!bookingId,
  });
}

/**
 * GET /services/by-id/:id — public id-keyed offering read (Task 3's backend
 * enabler, mirrors GET /services/:slug exactly, published-only). Used by the
 * reschedule flow to resolve a booking's service_offering_id (bookings only
 * carry the id, never a slug) back into a full ServiceOffering so the
 * availability picker can be re-driven.
 */
export function useServiceOfferingById(offeringId: string | undefined) {
  return useQuery({
    queryKey: ["booking", "service-offering-by-id", offeringId],
    queryFn: async () => {
      const { data } = await api.get(`/services/by-id/${offeringId}`);
      return data.data as ServiceOffering;
    },
    enabled: !!offeringId,
    staleTime: 60 * 1000,
  });
}

const MY_BOOKINGS_BUCKET_STATUSES: Record<"upcoming" | "past", BookingStatus[]> = {
  // "rescheduled" is a transient in-transaction marker
  // (confirmed -> rescheduled -> confirmed, see reschedule.service.ts) that
  // no production read path is expected to observe at rest — omitted from
  // both buckets rather than given a third tab for a status nobody will see.
  upcoming: ["confirmed", "pending_payment"],
  past: ["completed", "cancelled", "no_show", "expired"],
};

interface MyBookingsPage {
  bookings: Booking[];
  total: number;
  page: number;
}

/**
 * GET /me/bookings, bucketed into "upcoming"/"past" tabs (Task 3's own call
 * per the brief — the endpoint only accepts a SINGLE `status` filter, not a
 * list, so each bucket is backed by one parallel GET per constituent status,
 * merged client-side). `total` sums each status's own total (stable across
 * pages); "load more" pages every constituent status call together via
 * `useInfiniteQuery` and the merged result is de-duped/re-sorted by
 * `starts_at` (soonest-first for upcoming, most-recent-first for past) —
 * this is the "client pagination" the brief's addendum calls for, since the
 * flat envelope never echoes page/limit back.
 */
export function useMyBookingsBucket(bucket: "upcoming" | "past", limit = 10) {
  const statuses = MY_BOOKINGS_BUCKET_STATUSES[bucket];
  return useInfiniteQuery({
    queryKey: ["booking", "my-bookings", bucket, limit],
    queryFn: async ({ pageParam }): Promise<MyBookingsPage> => {
      const responses = await Promise.all(
        statuses.map((status) =>
          api
            .get("/me/bookings", { params: { page: pageParam, limit, status } })
            .then((r) => ({ data: (r.data.data ?? []) as Booking[], total: (r.data.total ?? 0) as number })),
        ),
      );
      const bookings = responses.flatMap((r) => r.data);
      const total = responses.reduce((sum, r) => sum + r.total, 0);
      return { bookings, total, page: pageParam };
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const shownIds = new Set(allPages.flatMap((p) => p.bookings.map((b) => b.id)));
      return shownIds.size < lastPage.total ? lastPage.page + 1 : undefined;
    },
    staleTime: 30 * 1000,
  });
}

/**
 * POST /bookings/hold + POST /bookings/:id/reschedule — the reschedule flow
 * re-uses `useHoldBooking` above for the fresh hold (hold_token cannot be
 * reused from the original create), then this mutation. `offering_id` is
 * intentionally NOT part of the body — the backend carries it over from the
 * existing booking.
 */
export function useRescheduleBooking() {
  return useMutation({
    mutationFn: async ({ bookingId, body }: { bookingId: string; body: RescheduleBookingBody }) => {
      const { data } = await api.post(`/bookings/${bookingId}/reschedule`, body);
      return data.data as RescheduleBookingResponse;
    },
  });
}

/**
 * POST /bookings/:id/cancel — the response is the source of truth for the
 * actual refund/forfeit amounts; `computeCancelEstimate` (lib/booking/
 * cancel-estimate.ts) is only a pre-confirm client-side estimate.
 */
export function useCancelBooking() {
  return useMutation({
    mutationFn: async ({ bookingId, body }: { bookingId: string; body: CancelBookingBody }) => {
      const { data } = await api.post(`/bookings/${bookingId}/cancel`, body);
      return data.data as CancelBookingResponse;
    },
  });
}

/**
 * POST /bookings/:id/review — customer-only, completed bookings only (403
 * otherwise), one review per booking (409 on a second attempt — there is no
 * GET for "did I already review this" so callers flip local state to
 * "already reviewed" on a 409 rather than detecting it ahead of time).
 */
export function useReviewBooking() {
  return useMutation({
    mutationFn: async ({ bookingId, body }: { bookingId: string; body: CreateServiceReviewBody }) => {
      const { data } = await api.post(`/bookings/${bookingId}/review`, body);
      return data.data as ServiceReview;
    },
  });
}
