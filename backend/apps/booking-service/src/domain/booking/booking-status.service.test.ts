// booking-status.service.test.ts
//
// Mocked-repo unit tests (no live DB) for BookingStatusService's pay_at_venue
// confirm path (Phase 5 final review Fix 1). Builds a fake `bookingRepo` whose
// `manager.transaction` runs the callback against in-memory Booking /
// BookingStatusHistory / StaffEngagement repos, so the REAL transitionGuarded
// logic (conditional UPDATE, history row, engagement sync, wroteHistory gating)
// executes without Postgres — the transitionGuarded behaviour under true
// concurrency is covered by the live integration suite; here we only assert
// that confirmPayAtVenue fires the post-confirm hooks exactly once on the
// winning transition and never on a duplicate/losing call.
import { describe, expect, it, mock } from "bun:test";
import {
  Booking,
  BookingStatus,
  BookingStatusHistory,
  ServicePaymentMode,
  StaffEngagement,
} from "@materialhub/database";
import { BookingCompletionService } from "./booking-completion.service.ts";
import { ALLOWED_TRANSITIONS, BookingStatusService } from "./booking-status.service.ts";

function makeFakeBooking(overrides: Record<string, any> = {}) {
  return {
    id: "booking-1",
    status: BookingStatus.pending_payment,
    engagement_id: "eng-1",
    payment_mode: ServicePaymentMode.pay_at_venue,
    customer_user_id: "cust-1",
    vendor_id: "vendor-1",
    booking_number: "BK-1",
    service_name: "Deep Tissue Massage",
    starts_at: new Date("2026-08-10T10:00:00Z"),
    ends_at: new Date("2026-08-10T10:30:00Z"),
    ...overrides,
  } as Record<string, any>;
}

function makeStatusHarness(opts: {
  booking: Record<string, any>;
  completionHook?: unknown;
}) {
  const booking = opts.booking;
  const engagement = {
    id: booking.engagement_id,
    staff_member_id: "s1",
    starts_at: booking.starts_at,
    ends_at: booking.ends_at,
    status: "held",
  } as Record<string, any>;
  const history: unknown[] = [];

  const txBookingRepo = {
    // The atomic guard: only "matches" (assigns) when the current status equals
    // the criteria's `from` status, mirroring the real
    // `UPDATE ... WHERE status = :from`.
    update: mock(async (criteria: any, partial: Record<string, any>) => {
      if (criteria.status !== undefined && booking.status !== criteria.status) {
        return { affected: 0 };
      }
      Object.assign(booking, partial);
      return { affected: 1 };
    }),
    findOne: mock(async () => ({ ...booking })),
  };
  const historyRepo = {
    create: (x: unknown) => x,
    save: mock(async (x: unknown) => {
      history.push(x);
      return x;
    }),
  };
  const engagementRepo = {
    findOne: mock(async () => ({ ...engagement })),
    update: mock(async (_c: unknown, partial: Record<string, any>) => {
      Object.assign(engagement, partial);
      return { affected: 1 };
    }),
  };
  const manager = {
    getRepository: (entity: unknown) => {
      if (entity === Booking) return txBookingRepo;
      if (entity === BookingStatusHistory) return historyRepo;
      if (entity === StaffEngagement) return engagementRepo;
      throw new Error("unexpected entity in fake manager");
    },
  };
  const bookingRepo = {
    findOne: mock(async () => ({ ...booking })),
    manager: {
      transaction: async (cb: (m: typeof manager) => Promise<unknown>) => cb(manager),
    },
  };

  const autoCompleteHook = {
    scheduleForConfirm: mock(async () => {}),
    removeAutoCompleteJob: mock(async () => {}),
  };
  const reminderHook = {
    scheduleForConfirm: mock(async () => {}),
    removeReminderJobs: mock(async () => {}),
  };
  const notificationQueue = { add: mock(async () => ({ id: "notif-1" })) };
  const vendorOwnerLookup = { findOwnerUserId: mock(async () => "vendor-user-1") };

  const service = new BookingStatusService(
    bookingRepo as any,
    undefined, // cache — EngagementService.invalidate no-ops without it
    undefined, // bookingAuthHook (pay_at_venue is never prepay)
    opts.completionHook as any, // completionHook (default undefined)
    autoCompleteHook as any,
    reminderHook as any,
    notificationQueue as any,
    vendorOwnerLookup as any,
  );

  return {
    service,
    booking,
    txBookingRepo,
    autoCompleteHook,
    reminderHook,
    notificationQueue,
    vendorOwnerLookup,
    history,
  };
}

describe("BookingStatusService.confirmPayAtVenue (Phase 5 final review Fix 1)", () => {
  it("winning transition: schedules auto-complete + reminders and emits both confirm notifications exactly once", async () => {
    const booking = makeFakeBooking();
    const { service, autoCompleteHook, reminderHook, notificationQueue, vendorOwnerLookup } =
      makeStatusHarness({ booking });

    const result = await service.confirmPayAtVenue("booking-1", { id: "cust-1", role: "customer" });

    expect(result.status).toBe(BookingStatus.confirmed);
    expect(autoCompleteHook.scheduleForConfirm).toHaveBeenCalledTimes(1);
    expect(reminderHook.scheduleForConfirm).toHaveBeenCalledTimes(1);
    expect(vendorOwnerLookup.findOwnerUserId).toHaveBeenCalledTimes(1);

    const types = (notificationQueue.add.mock.calls as any[][]).map((c) => c[1].notificationType);
    expect(types.filter((t) => t === "booking_confirmed")).toHaveLength(1);
    expect(types.filter((t) => t === "vendor_new_booking")).toHaveLength(1);
  });

  it("duplicate call (booking already confirmed): fires NO post-confirm hooks or notifications", async () => {
    const booking = makeFakeBooking({ status: BookingStatus.confirmed });
    const { service, autoCompleteHook, reminderHook, notificationQueue } = makeStatusHarness({
      booking,
    });

    const result = await service.confirmPayAtVenue("booking-1", { id: "cust-1", role: "customer" });

    expect(result.status).toBe(BookingStatus.confirmed);
    expect(autoCompleteHook.scheduleForConfirm).not.toHaveBeenCalled();
    expect(reminderHook.scheduleForConfirm).not.toHaveBeenCalled();
    expect(notificationQueue.add).not.toHaveBeenCalled();
  });

  it("lost concurrent race (guarded UPDATE matched 0 rows, row already confirmed): safe no-op, fires NO hooks", async () => {
    const booking = makeFakeBooking(); // starts pending_payment
    const harness = makeStatusHarness({ booking });
    // Simulate a concurrent winner committing the confirm between our pre-tx
    // read and our guarded UPDATE: the UPDATE matches 0 rows, and the in-tx
    // re-read now sees `confirmed`.
    (harness.txBookingRepo.update as any).mockImplementation(async () => {
      booking.status = BookingStatus.confirmed;
      return { affected: 0 };
    });

    const result = await harness.service.confirmPayAtVenue("booking-1", {
      id: "cust-1",
      role: "customer",
    });

    expect(result.status).toBe(BookingStatus.confirmed);
    expect(harness.autoCompleteHook.scheduleForConfirm).not.toHaveBeenCalled();
    expect(harness.reminderHook.scheduleForConfirm).not.toHaveBeenCalled();
    expect(harness.notificationQueue.add).not.toHaveBeenCalled();
  });
});

// ─── C1 (Task 0B review): completeBooking on a MANUAL walk-in/phone booking
// (customer_user_id null) is CAPACITY-ONLY end-to-end. This wires the REAL
// BookingCompletionService as the completion hook and drives completeBooking
// with the SYSTEM actor — the exact path the auto-complete job takes
// (BookingAutoCompleteService.runAutoCompleteJob -> completeBooking(id,
// SYSTEM_ACTOR)) — proving the guard covers that caller too: the booking
// transitions confirmed -> completed (status + history) but NO capture, NO
// commission accrual, NO customer notification fire. ───────────────────────────
describe("BookingStatusService.completeBooking — manual booking capacity-only (C1)", () => {
  it("system auto-complete of a walk-in: transitions to completed + writes history, but skips capture/commission/notification", async () => {
    const booking = makeFakeBooking({
      status: BookingStatus.confirmed,
      customer_user_id: null,
      source: "walk_in",
      payment_mode: ServicePaymentMode.pay_at_venue,
      commission_fils: 0,
      commission_rate: 10,
      price_fils: 12000,
      vat_fils: 571,
      escrow_hold_id: null,
    });

    const paymentClient = { complete: mock(async () => ({ captured: false })) };
    const completionNotificationQueue = { add: mock(async () => ({ id: "notif-c" })) };
    const completionHook = new BookingCompletionService(
      { findOne: mock(async () => null) } as any, // paymentRepo — never reached
      paymentClient as any,
      completionNotificationQueue as any,
    );

    const { service, history } = makeStatusHarness({ booking, completionHook });

    const result = await service.completeBooking("booking-1", { id: null, role: "system" });

    // Transition happened: status + one history row.
    expect(result.status).toBe(BookingStatus.completed);
    expect(history).toHaveLength(1);
    expect((history[0] as any).to_status).toBe(BookingStatus.completed);

    // Capacity-only: no money moved, no customer notification (userId is null).
    expect(paymentClient.complete).not.toHaveBeenCalled();
    expect(completionNotificationQueue.add).not.toHaveBeenCalled();
  });

  it("system auto-complete of a MARKETPLACE booking still captures + accrues (unchanged)", async () => {
    const booking = makeFakeBooking({
      status: BookingStatus.confirmed,
      customer_user_id: "cust-1",
      payment_mode: ServicePaymentMode.pay_at_venue,
      commission_fils: 950,
      commission_rate: 10,
      price_fils: 10000,
      vat_fils: 476,
      escrow_hold_id: null,
    });

    const paymentClient = { complete: mock(async () => ({ captured: true })) };
    const completionNotificationQueue = { add: mock(async () => ({ id: "notif-m" })) };
    const completionHook = new BookingCompletionService(
      { findOne: mock(async () => null) } as any,
      paymentClient as any,
      completionNotificationQueue as any,
    );

    const { service } = makeStatusHarness({ booking, completionHook });

    const result = await service.completeBooking("booking-1", { id: null, role: "system" });

    expect(result.status).toBe(BookingStatus.completed);
    // Marketplace path untouched: capture/commission requested, notifications emitted.
    expect(paymentClient.complete).toHaveBeenCalledTimes(1);
    const types = (completionNotificationQueue.add.mock.calls as any[][]).map(
      (c) => c[1].notificationType,
    );
    expect(types).toContain("booking_completed");
    expect(types).toContain("booking_review_request");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// PHASE 7 REVIEW FIX #10 — the state-machine transition matrix.
//
// ALLOWED_TRANSITIONS is a plain exported data structure and the single source
// of truth for every legal booking status edge, but until now it was only
// exercised by an integration test CI never runs (CI has no Postgres). These
// table-driven cases need no DB at all, so they DO run in CI.
// ───────────────────────────────────────────────────────────────────────────

const ALL_STATUSES: BookingStatus[] = [
  BookingStatus.pending_payment,
  BookingStatus.confirmed,
  BookingStatus.rescheduled,
  BookingStatus.cancelled,
  BookingStatus.completed,
  BookingStatus.no_show,
  BookingStatus.expired,
];

// The complete legal edge set per spec §5.3, spelled out INDEPENDENTLY of the
// implementation so a careless edit to ALLOWED_TRANSITIONS fails here.
const LEGAL_EDGES: ReadonlyArray<[BookingStatus, BookingStatus]> = [
  [BookingStatus.pending_payment, BookingStatus.confirmed],
  [BookingStatus.pending_payment, BookingStatus.expired],
  [BookingStatus.confirmed, BookingStatus.completed],
  [BookingStatus.confirmed, BookingStatus.no_show],
  [BookingStatus.confirmed, BookingStatus.rescheduled],
  [BookingStatus.confirmed, BookingStatus.cancelled],
  [BookingStatus.rescheduled, BookingStatus.confirmed],
];

function isLegalEdge(from: BookingStatus, to: BookingStatus): boolean {
  return LEGAL_EDGES.some(([f, t]) => f === from && t === to);
}

describe("ALLOWED_TRANSITIONS matrix (spec 5.3)", () => {
  for (const from of ALL_STATUSES) {
    for (const to of ALL_STATUSES) {
      const legal = isLegalEdge(from, to);
      it(`${from} -> ${to} is ${legal ? "LEGAL" : "ILLEGAL"}`, () => {
        expect(ALLOWED_TRANSITIONS[from].has(to)).toBe(legal);
      });
    }
  }

  it("covers every status as a key — a new BookingStatus must be classified, not defaulted", () => {
    expect(Object.keys(ALLOWED_TRANSITIONS).sort()).toEqual([...ALL_STATUSES].sort());
  });

  it("has no self-loops (transitionGuarded relies on from !== to for its atomic guard)", () => {
    for (const s of ALL_STATUSES) {
      expect(ALLOWED_TRANSITIONS[s].has(s)).toBe(false);
    }
  });

  it("completed / cancelled / expired / no_show are terminal — no outgoing edges", () => {
    for (const terminal of [
      BookingStatus.completed,
      BookingStatus.cancelled,
      BookingStatus.expired,
      BookingStatus.no_show,
    ]) {
      expect([...ALLOWED_TRANSITIONS[terminal]]).toEqual([]);
    }
  });

  // The money-safety property the matrix must preserve: every edge that frees
  // a slot while money may still be held is one whose caller is contractually
  // required to void/capture/refund. cancelled/expired are the only two such
  // targets, and each is reachable from exactly ONE status, whose flow owns
  // that money movement (CancelService + BookingAuthService's follow-up
  // auto-cancel for confirmed->cancelled; BookingReaperService for
  // pending_payment->expired). A NEW inbound edge to either would silently
  // create a path that frees the slot without releasing an authorization.
  it("no edge strands an authorization: cancelled/expired are reachable only from the money-owning statuses", () => {
    const inbound = (target: BookingStatus) =>
      ALL_STATUSES.filter((from) => ALLOWED_TRANSITIONS[from].has(target)).sort();

    expect(inbound(BookingStatus.cancelled)).toEqual([BookingStatus.confirmed]);
    expect(inbound(BookingStatus.expired)).toEqual([BookingStatus.pending_payment]);
  });

  // PHASE 7 REVIEW FIX #1's invariant, pinned at the data level: `rescheduled`
  // must never become a state a booking can be parked in with no way out.
  it("rescheduled stays recoverable — it keeps an outgoing edge back to confirmed", () => {
    expect(ALLOWED_TRANSITIONS[BookingStatus.rescheduled].has(BookingStatus.confirmed)).toBe(true);
    expect([...ALLOWED_TRANSITIONS[BookingStatus.rescheduled]].length).toBeGreaterThan(0);
  });

  it("every non-terminal status can still reach a terminal one (no unreachable dead ends)", () => {
    const TERMINAL = new Set<BookingStatus>([
      BookingStatus.completed,
      BookingStatus.cancelled,
      BookingStatus.expired,
      BookingStatus.no_show,
    ]);
    for (const start of ALL_STATUSES) {
      if (TERMINAL.has(start)) continue;
      const seen = new Set<BookingStatus>();
      const queue: BookingStatus[] = [start];
      let reachedTerminal = false;
      while (queue.length) {
        const cur = queue.shift() as BookingStatus;
        if (seen.has(cur)) continue;
        seen.add(cur);
        if (TERMINAL.has(cur)) {
          reachedTerminal = true;
          break;
        }
        for (const next of ALLOWED_TRANSITIONS[cur]) queue.push(next);
      }
      expect(reachedTerminal).toBe(true);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// PHASE 7 REVIEW FIX #1 — transitionThroughRescheduled atomicity.
// ───────────────────────────────────────────────────────────────────────────

describe("BookingStatusService.transitionThroughRescheduled (Phase 7 review fix 1)", () => {
  it("commits confirmed -> rescheduled -> confirmed in ONE transaction, writing both history rows", async () => {
    const booking = makeFakeBooking({ status: BookingStatus.confirmed });
    const harness = makeStatusHarness({ booking });

    let transactions = 0;
    const repo = (harness.service as any).bookingRepo;
    const originalTx = repo.manager.transaction;
    repo.manager.transaction = async (cb: any) => {
      transactions++;
      return originalTx(cb);
    };

    const result = await harness.service.transitionThroughRescheduled(
      "booking-1",
      { id: "u1", role: "customer" },
      "moved",
    );

    // Exactly ONE transaction — the whole point of the fix.
    expect(transactions).toBe(1);
    // Ends confirmed; `rescheduled` is never a committed state.
    expect(result.status).toBe(BookingStatus.confirmed);
    expect(booking.status).toBe(BookingStatus.confirmed);
    // Both audit rows still written, in order.
    expect(harness.history).toHaveLength(2);
    expect(harness.history[0]).toMatchObject({
      from_status: BookingStatus.confirmed,
      to_status: BookingStatus.rescheduled,
    });
    expect(harness.history[1]).toMatchObject({
      from_status: BookingStatus.rescheduled,
      to_status: BookingStatus.confirmed,
    });
  });

  it("a failure inside the pair leaves the booking CONFIRMED — never stranded in rescheduled", async () => {
    const booking = makeFakeBooking({ status: BookingStatus.confirmed });
    const harness = makeStatusHarness({ booking });

    // Simulate a crash/rollback partway through the pair: this fake manager
    // discards the callback's writes on throw, exactly as a real ROLLBACK
    // would.
    (harness.service as any).bookingRepo.manager.transaction = async (cb: any) => {
      const snapshot = { ...booking };
      try {
        return await cb({
          getRepository: (entity: unknown) => {
            if (entity === Booking) {
              return {
                update: async (criteria: any, partial: any) => {
                  // Leg 1 succeeds; leg 2 blows up mid-transaction.
                  if (partial.status === BookingStatus.confirmed) {
                    throw new Error("connection reset mid-transaction");
                  }
                  if (criteria.status !== undefined && booking.status !== criteria.status) {
                    return { affected: 0 };
                  }
                  Object.assign(booking, partial);
                  return { affected: 1 };
                },
                findOne: async () => ({ ...booking }),
              };
            }
            if (entity === BookingStatusHistory) {
              return { create: (x: unknown) => x, save: async (x: unknown) => x };
            }
            if (entity === StaffEngagement) {
              return {
                findOne: async () => ({ id: "eng-1", status: "held" }),
                update: async () => ({ affected: 1 }),
              };
            }
            throw new Error("unexpected entity");
          },
        });
      } catch (err) {
        Object.assign(booking, snapshot); // ROLLBACK
        throw err;
      }
    };

    await expect(
      harness.service.transitionThroughRescheduled(
        "booking-1",
        { id: "u1", role: "customer" },
        "moved",
      ),
    ).rejects.toThrow("connection reset mid-transaction");

    // THE FIX: the booking is back on `confirmed`, which cancel / no-show /
    // reschedule can all still act on. Before the fix the first transition
    // had its OWN committed transaction, so this scenario left the booking
    // durably `rescheduled` — unreachable by every api and every job.
    expect(booking.status).toBe(BookingStatus.confirmed);
    expect(booking.status).not.toBe(BookingStatus.rescheduled);
  });

  it("refuses to run from a non-confirmed status (grants no edge the matrix disallows)", async () => {
    const booking = makeFakeBooking({ status: BookingStatus.completed });
    const { service } = makeStatusHarness({ booking });

    await expect(
      service.transitionThroughRescheduled("booking-1", { id: null, role: "admin" }),
    ).rejects.toThrow(/Cannot transition booking from 'completed' to 'rescheduled'/);
    expect(booking.status).toBe(BookingStatus.completed);
  });

  it("fires the stale delayed-job cleanup after commit (those jobs are keyed to the OLD slot)", async () => {
    const booking = makeFakeBooking({ status: BookingStatus.confirmed });
    const { service, autoCompleteHook, reminderHook } = makeStatusHarness({ booking });

    await service.transitionThroughRescheduled("booking-1", { id: "u1", role: "customer" });

    expect(autoCompleteHook.removeAutoCompleteJob).toHaveBeenCalledWith("booking-1");
    expect(reminderHook.removeReminderJobs).toHaveBeenCalledWith("booking-1");
  });
});
