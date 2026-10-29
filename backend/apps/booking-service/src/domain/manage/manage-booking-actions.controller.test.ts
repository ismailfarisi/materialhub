// manage-booking-actions.controller.test.ts
//
// Mocked-repo unit tests (no live DB) for the Task 0B vendor-surface booking
// mutations: the authorization matrix (wrong vendor -> 404; location scope;
// home-visit owner/manager-only) and delegation to the SAME
// completion/no-show/reschedule services the admin routes use (assert the mock
// was called — no new money math in this layer). Mirrors
// block-time.service.test.ts's fake-repo style.
import { describe, expect, it, mock } from "bun:test";
import { ForbiddenError, type HttpError, NotFoundError } from "@materialhub/plugins";
import {
  CompleteWindowError,
  ManageBookingActionsController,
} from "./manage-booking-actions.controller.ts";

const OWNER = { userId: "user-owner", vendorId: "vendor-1", role: "owner" };
const MANAGER = { userId: "user-mgr", vendorId: "vendor-1", role: "manager" };
// A vendor member outside VENDOR_MANAGER_ROLES — passes the outer
// products.write gate (via a live role-permission grant) but must be
// location-scoped for anything branch-tied.
const STAFF = { userId: "user-staff", vendorId: "vendor-1", role: "staff" };

function baseBooking(overrides: Record<string, unknown> = {}) {
  return {
    id: "booking-1",
    vendor_id: "vendor-1",
    location_id: "loc-1",
    status: "confirmed",
    // A past start by default so complete() delegation tests (which don't pass
    // an explicit `now`) deterministically clear the I1 lower-bound window guard.
    starts_at: "2020-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeLocationScope(opts: {
  locations?: Array<{ id: string; vendor_id: string }>;
  memberships?: Array<{ vendor_location_id: string; user_id: string; role: string }>;
}) {
  const locations = opts.locations ?? [{ id: "loc-1", vendor_id: "vendor-1" }];
  const memberships = opts.memberships ?? [];
  const locationRepo = {
    findOne: mock(
      async ({ where }: { where: { id: string } }) =>
        locations.find((l) => l.id === where.id) ?? null,
    ),
  };
  const membershipRepo = {
    findOne: mock(
      async ({ where }: { where: { vendor_location_id: string; user_id: string } }) =>
        memberships.find(
          (m) => m.vendor_location_id === where.vendor_location_id && m.user_id === where.user_id,
        ) ?? null,
    ),
    find: mock(async ({ where }: { where: { user_id: string } }) =>
      memberships.filter((m) => m.user_id === where.user_id),
    ),
  };
  return { locationRepo, membershipRepo };
}

function makeHarness(
  opts: {
    booking?: Record<string, unknown> | null;
    locationScope?: {
      locations?: Array<{ id: string; vendor_id: string }>;
      memberships?: Array<{ vendor_location_id: string; user_id: string; role: string }>;
    };
  } = {},
) {
  const booking = opts.booking === undefined ? baseBooking() : opts.booking;
  const bookingRepo = {
    findOne: mock(async () => (booking ? { ...booking } : null)),
  };
  const locationScope = makeLocationScope(opts.locationScope ?? {});

  const completionService = {
    completeBooking: mock(async () => ({ ...(booking as object), status: "completed" })),
  };
  const noShowService = {
    markNoShow: mock(async () => ({
      booking: { ...(booking as object), status: "no_show" },
      forfeitFils: 5000,
      refundFils: 0,
      action: "partial_capture" as const,
      policy: "deposit_forfeit",
    })),
  };
  const rescheduleService = {
    rescheduleByVendor: mock(async () => ({
      booking: { ...(booking as object), status: "confirmed" },
    })),
  };

  const controller = new ManageBookingActionsController(
    // biome-ignore lint/suspicious/noExplicitAny: minimal fake repos
    bookingRepo as any,
    // biome-ignore lint/suspicious/noExplicitAny: minimal fake repos
    locationScope as any,
    // biome-ignore lint/suspicious/noExplicitAny: minimal fake service
    completionService as any,
    // biome-ignore lint/suspicious/noExplicitAny: minimal fake service
    noShowService as any,
    // biome-ignore lint/suspicious/noExplicitAny: minimal fake service
    rescheduleService as any,
  );

  return {
    controller,
    bookingRepo,
    completionService,
    noShowService,
    rescheduleService,
  };
}

const RESCHEDULE_BODY = { starts_at: "2026-08-15T14:00:00Z", ends_at: "2026-08-15T14:30:00Z" };

describe("ManageBookingActionsController — authorization matrix", () => {
  it("wrong vendor -> 404 (hide existence), never delegates", async () => {
    const { controller, completionService } = makeHarness({
      booking: baseBooking({ vendor_id: "vendor-2" }),
    });
    await expect(controller.complete(OWNER, "booking-1")).rejects.toBeInstanceOf(NotFoundError);
    expect(completionService.completeBooking).not.toHaveBeenCalled();
  });

  it("nonexistent booking -> 404", async () => {
    const { controller } = makeHarness({ booking: null });
    await expect(controller.complete(OWNER, "missing")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("owner passes for a branch booking (vendor-wide manager role)", async () => {
    const { controller, completionService } = makeHarness({});
    await controller.complete(OWNER, "booking-1");
    expect(completionService.completeBooking).toHaveBeenCalledTimes(1);
  });

  it("staff/viewer WITHOUT a managing location_membership -> blocked (403), never delegates", async () => {
    const { controller, completionService } = makeHarness({
      locationScope: { locations: [{ id: "loc-1", vendor_id: "vendor-1" }], memberships: [] },
    });
    await expect(controller.complete(STAFF, "booking-1")).rejects.toBeInstanceOf(ForbiddenError);
    expect(completionService.completeBooking).not.toHaveBeenCalled();
  });

  it("location-admin passes booking mutations for THEIR branch", async () => {
    const { controller, completionService } = makeHarness({
      locationScope: {
        locations: [{ id: "loc-1", vendor_id: "vendor-1" }],
        memberships: [{ vendor_location_id: "loc-1", user_id: "user-staff", role: "manager" }],
      },
    });
    await controller.complete(STAFF, "booking-1");
    expect(completionService.completeBooking).toHaveBeenCalledTimes(1);
  });

  it("home-visit booking (location_id null) -> owner/manager only; staff blocked (403)", async () => {
    const { controller, completionService } = makeHarness({
      booking: baseBooking({ location_id: null }),
    });
    await expect(controller.complete(STAFF, "booking-1")).rejects.toBeInstanceOf(ForbiddenError);
    expect(completionService.completeBooking).not.toHaveBeenCalled();
  });

  it("home-visit booking (location_id null) -> owner passes", async () => {
    const { controller, completionService } = makeHarness({
      booking: baseBooking({ location_id: null }),
    });
    await controller.complete(OWNER, "booking-1");
    expect(completionService.completeBooking).toHaveBeenCalledTimes(1);
  });
});

describe("ManageBookingActionsController — delegation (no money math here)", () => {
  it("complete delegates to completeBooking with a non-customer 'vendor' actor", async () => {
    const { controller, completionService } = makeHarness({});
    const res = await controller.complete(MANAGER, "booking-1");
    expect(completionService.completeBooking).toHaveBeenCalledTimes(1);
    const [id, actor] = completionService.completeBooking.mock.calls[0] as any[];
    expect(id).toBe("booking-1");
    expect(actor).toEqual({ id: "user-mgr", role: "vendor" });
    expect(res.booking.status as string).toBe("completed");
  });

  it("no-show delegates to markNoShow and mirrors the admin response shape", async () => {
    const { controller, noShowService } = makeHarness({});
    const res = await controller.noShow(MANAGER, "booking-1", { reason: "late" });
    expect(noShowService.markNoShow).toHaveBeenCalledTimes(1);
    const [id, actor, input] = noShowService.markNoShow.mock.calls[0] as any[];
    expect(id).toBe("booking-1");
    expect(actor).toEqual({ id: "user-mgr", role: "vendor" });
    expect(input).toEqual({ reason: "late" });
    expect(res).toEqual({
      booking: expect.objectContaining({ status: "no_show" }),
      forfeit_fils: 5000,
      refund_fils: 0,
      action: "partial_capture",
      policy: "deposit_forfeit",
    });
  });

  it("reschedule delegates to rescheduleByVendor (hold-less vendor entry point)", async () => {
    const { controller, rescheduleService } = makeHarness({});
    const res = await controller.reschedule(MANAGER, "booking-1", {
      ...RESCHEDULE_BODY,
      staff_member_id: "staff-9",
    });
    expect(rescheduleService.rescheduleByVendor).toHaveBeenCalledTimes(1);
    const [id, input, actor] = rescheduleService.rescheduleByVendor.mock.calls[0] as any[];
    expect(id).toBe("booking-1");
    expect(input).toEqual({
      startsAt: RESCHEDULE_BODY.starts_at,
      endsAt: RESCHEDULE_BODY.ends_at,
      staffMemberId: "staff-9",
    });
    expect(actor).toEqual({ id: "user-mgr", role: "vendor" });
    expect(res.booking.status as string).toBe("confirmed");
  });

  // ── I1 (Task 0B review): vendor-complete lower-bound window ────────────────
  it("complete BEFORE starts_at -> 422 complete_window, never delegates", async () => {
    const { controller, completionService } = makeHarness({
      booking: baseBooking({ starts_at: "2026-08-15T14:00:00Z" }),
    });
    const now = new Date("2026-08-15T13:59:00Z"); // one minute before the start
    let threw: unknown;
    try {
      await controller.complete(OWNER, "booking-1", now);
    } catch (err) {
      threw = err;
    }
    expect(threw).toBeInstanceOf(CompleteWindowError);
    expect((threw as HttpError).statusCode).toBe(422);
    expect(completionService.completeBooking).not.toHaveBeenCalled();
  });

  it("complete AT/AFTER starts_at -> delegates to completeBooking", async () => {
    const { controller, completionService } = makeHarness({
      booking: baseBooking({ starts_at: "2026-08-15T14:00:00Z" }),
    });
    // Exactly at starts_at — the lower bound is inclusive (mirrors no-show).
    await controller.complete(OWNER, "booking-1", new Date("2026-08-15T14:00:00Z"));
    expect(completionService.completeBooking).toHaveBeenCalledTimes(1);
  });

  it("no-show with an unauthorized actor never reaches markNoShow", async () => {
    const { controller, noShowService } = makeHarness({
      locationScope: { locations: [{ id: "loc-1", vendor_id: "vendor-1" }], memberships: [] },
    });
    await expect(controller.noShow(STAFF, "booking-1", {})).rejects.toBeInstanceOf(ForbiddenError);
    expect(noShowService.markNoShow).not.toHaveBeenCalled();
  });
});
