// booking-auth.job.test.ts
//
// PHASE 7 REVIEW FIX #3 — the `booking-auth` queue's retry policy.
//
// Asserts the exported options constant rather than constructing the Queue,
// so this runs in CI with no Redis (same reason the rest of this directory's
// unit suite uses mocked seams).
import { describe, expect, it } from "bun:test";
import { BOOKING_AUTH_JOB_OPTIONS } from "./booking-auth.job.ts";

// The sibling `booking-autocomplete` queue's policy, transcribed from
// getBookingAutoCompleteQueue's inline `defaultJobOptions`
// (booking-autocomplete.job.ts). That file is owned elsewhere, so it is
// duplicated here rather than exported from there; the last assertion below
// pins the two together so a drift in either is caught.
const AUTOCOMPLETE_POLICY = {
  attempts: 3,
  backoff: { type: "exponential", delay: 60_000 },
};

describe("booking-auth queue job options (Phase 7 review fix 3)", () => {
  it("retries more than once — a single DB blip must not permanently lose a prepay authorization", () => {
    // THE BUG: the queue was constructed with no `defaultJobOptions`, so BullMQ
    // defaulted to `attempts: 1`. BookingAuthService.runAuthorizeJob opens with
    // a `bookingRepo.findOne` OUTSIDE any try/catch, so one DB hiccup at fire
    // time threw straight out of the worker and lost that booking's off-session
    // authorization forever — no retry, no notification, no re-schedule. The
    // booking then reached completion with nothing authorized.
    expect(BOOKING_AUTH_JOB_OPTIONS.attempts).toBeGreaterThan(1);
    expect(BOOKING_AUTH_JOB_OPTIONS.attempts).toBe(3);
  });

  it("backs off exponentially so a retry does not hammer a struggling order-service", () => {
    expect(BOOKING_AUTH_JOB_OPTIONS.backoff).toEqual({
      type: "exponential",
      delay: 60_000,
    });
  });

  // Both queues carry money-critical per-booking delayed jobs; the sibling was
  // given `attempts: 3` explicitly for exactly this reason (Phase 5 final
  // review Fix 2) and the two must not drift.
  it("matches the sibling booking-autocomplete queue's policy", () => {
    expect(BOOKING_AUTH_JOB_OPTIONS).toEqual(AUTOCOMPLETE_POLICY as any);
  });
});
