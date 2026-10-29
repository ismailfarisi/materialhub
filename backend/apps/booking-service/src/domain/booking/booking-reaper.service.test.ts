import { describe, expect, it, mock } from "bun:test";
import { BookingReaperService } from "./booking-reaper.service.ts";

// Builds a service whose bookingRepo.find returns `bookings` and whose
// paymentRepo.findOne looks up `paymentsById`. Mirrors
// pending-order-reaper.service.test.ts's makeService shape.
function makeService(opts: {
  bookings: any[];
  paymentsById?: Record<string, any>;
  transition?: any;
  confirm?: any;
  voidPayment?: any;
  windowMinutes?: number;
  // Phase 7 fix #8: when set, `find` honours skip/take against a mutable
  // backing list so the pagination loop can be exercised for real.
  paginate?: boolean;
}) {
  const bookingRepo = {
    find: mock(async (args: any) => {
      if (!opts.paginate) return opts.bookings;
      // Model the real query: only rows STILL `pending_payment` match, so a
      // row this sweep expired drops out of the result set (which is exactly
      // why the service advances `skip` by the rows it left behind, not by
      // the page size).
      const live = opts.bookings.filter((b) => b.status === "pending_payment");
      const skip = args?.skip ?? 0;
      const take = args?.take ?? live.length;
      return live.slice(skip, skip + take);
    }),
  };
  const paymentRepo = {
    findOne: mock(async ({ where }: any) => opts.paymentsById?.[where.id] ?? null),
  };
  const transition =
    opts.transition ??
    mock(async (id: string, to: string) => {
      // Reflect the flip back onto the backing row so the paginating `find`
      // above stops returning it (mirrors the real WHERE clause).
      const row = opts.bookings.find((b) => b.id === id);
      if (row) row.status = to;
      return { status: to };
    });
  const confirm = opts.confirm ?? mock(async () => ({ status: "confirmed" }));
  const statusService = { transition, confirm };
  const voidPayment =
    opts.voidPayment ?? mock(async () => ({ paymentIntentId: "pi_x", status: "canceled" }));
  const paymentClient = { void: voidPayment };
  const service = new BookingReaperService(
    bookingRepo as any,
    paymentRepo as any,
    statusService as any,
    paymentClient as any,
    opts.windowMinutes ?? 60,
  );
  return { service, bookingRepo, paymentRepo, transition, confirm, voidPayment };
}

describe("BookingReaperService.reapExpired", () => {
  it("expires an aged pay_at_venue-shaped pending booking with no payment_id — no void call", async () => {
    const { service, transition, voidPayment } = makeService({
      bookings: [
        {
          id: "b-venue",
          payment_mode: "pay_at_venue",
          payment_id: null,
          status: "pending_payment",
        },
      ],
    });

    const summary = await service.reapExpired();

    expect(transition).toHaveBeenCalledWith(
      "b-venue",
      "expired",
      { id: null, role: "system" },
      "Payment not completed within 60 minutes",
    );
    expect(voidPayment).not.toHaveBeenCalled();
    expect(summary).toEqual({ scanned: 1, expired: 1, skipped: 0, errored: 0 });
  });

  it("expires a deposit booking and voids its PaymentIntent via the payment client", async () => {
    const { service, voidPayment } = makeService({
      bookings: [
        {
          id: "b-deposit",
          payment_mode: "deposit",
          payment_id: "pay-1",
          status: "pending_payment",
        },
      ],
      paymentsById: { "pay-1": { id: "pay-1", gateway_payment_id: "pi_deposit_1" } },
    });

    const summary = await service.reapExpired();

    expect(voidPayment).toHaveBeenCalledWith({
      bookingId: "b-deposit",
      paymentIntentId: "pi_deposit_1",
      reason: "Payment not completed within 60 minutes",
    });
    expect(summary).toEqual({ scanned: 1, expired: 1, skipped: 0, errored: 0 });
  });

  it("expires a prepay booking WITHOUT attempting to cancel its SetupIntent (no cancel path)", async () => {
    const { service, voidPayment, paymentRepo } = makeService({
      bookings: [
        { id: "b-prepay", payment_mode: "prepay", payment_id: "pay-2", status: "pending_payment" },
      ],
      paymentsById: { "pay-2": { id: "pay-2", gateway_payment_id: "seti_1" } },
    });

    const summary = await service.reapExpired();

    expect(voidPayment).not.toHaveBeenCalled();
    // Never even looks up the Payment row for prepay — the branch short-circuits.
    expect(paymentRepo.findOne).not.toHaveBeenCalled();
    expect(summary).toEqual({ scanned: 1, expired: 1, skipped: 0, errored: 0 });
  });

  // PHASE 7 REVIEW FIX #2 — BEHAVIOUR CHANGE. This case previously asserted
  // that a void failure "does not block expiry": the booking was expired
  // anyway and the failure was swallowed into a log line. That is precisely
  // the money-loss bug — a deposit PI is CAPTURE-NOW, so the most likely
  // reason `void` (= paymentIntents.cancel) fails is that the PI has ALREADY
  // SUCCEEDED (delayed payment_intent.succeeded webhook). Expiring anyway
  // charged the customer, freed their slot for resale, and left no refund and
  // no reconciliation record. The reaper must now fail CLOSED instead.
  it("a deposit void failure BLOCKS expiry — booking stays pending_payment for the next sweep", async () => {
    const voidPayment = mock(async () => {
      throw new Error("cannot cancel a PaymentIntent with status succeeded");
    });
    const { service, transition } = makeService({
      bookings: [
        {
          id: "b-deposit-fail",
          payment_mode: "deposit",
          payment_id: "pay-3",
          status: "pending_payment",
        },
      ],
      paymentsById: { "pay-3": { id: "pay-3", gateway_payment_id: "pi_fail_1" } },
      voidPayment,
    });

    const summary = await service.reapExpired();

    // The slot is NOT freed — we have no proof the money was released.
    expect(transition).not.toHaveBeenCalled();
    expect(summary).toEqual({ scanned: 1, expired: 0, skipped: 0, errored: 1 });
  });

  it("voids the deposit PI BEFORE expiring (money settles before the slot is freed)", async () => {
    const order: string[] = [];
    const voidPayment = mock(async () => {
      order.push("void");
      return { paymentIntentId: "pi_ok", status: "canceled" };
    });
    const transition = mock(async () => {
      order.push("transition");
      return { status: "expired" };
    });
    const { service } = makeService({
      bookings: [
        { id: "b-order", payment_mode: "deposit", payment_id: "pay-o", status: "pending_payment" },
      ],
      paymentsById: { "pay-o": { id: "pay-o", gateway_payment_id: "pi_ok" } },
      voidPayment,
      transition,
    });

    const summary = await service.reapExpired();

    expect(order).toEqual(["void", "transition"]);
    expect(summary).toEqual({ scanned: 1, expired: 1, skipped: 0, errored: 0 });
  });

  // PHASE 7 REVIEW FIX #2 — the headline case: the deposit was already
  // captured because the webhook was merely SLOW, not absent.
  for (const status of ["captured", "authorized", "refunded", "partially_refunded"]) {
    it(`does NOT expire a deposit booking whose Payment row is '${status}' — confirms it instead`, async () => {
      const confirm = mock(async () => ({ status: "confirmed" }));
      const { service, transition, voidPayment } = makeService({
        bookings: [
          {
            id: "b-paid",
            payment_mode: "deposit",
            payment_id: "pay-paid",
            status: "pending_payment",
          },
        ],
        paymentsById: { "pay-paid": { id: "pay-paid", gateway_payment_id: "pi_paid", status } },
        confirm,
      });

      const summary = await service.reapExpired();

      // Never expired, never voided — the customer keeps the slot they paid for.
      expect(transition).not.toHaveBeenCalled();
      expect(voidPayment).not.toHaveBeenCalled();
      expect(confirm).toHaveBeenCalledWith("b-paid");
      expect(summary).toEqual({ scanned: 1, expired: 0, skipped: 1, errored: 0 });
    });
  }

  it("counts a captured-deposit booking as errored (not expired) when confirm() itself fails", async () => {
    const confirm = mock(async () => {
      throw new Error("db down");
    });
    const { service, transition } = makeService({
      bookings: [
        {
          id: "b-paid-err",
          payment_mode: "deposit",
          payment_id: "pay-pe",
          status: "pending_payment",
        },
      ],
      paymentsById: {
        "pay-pe": { id: "pay-pe", gateway_payment_id: "pi_pe", status: "captured" },
      },
      confirm,
    });

    const summary = await service.reapExpired();

    expect(transition).not.toHaveBeenCalled();
    expect(summary).toEqual({ scanned: 1, expired: 0, skipped: 0, errored: 1 });
  });

  it("still expires a deposit booking whose Payment row is 'pending' (genuinely abandoned)", async () => {
    const { service, transition, voidPayment } = makeService({
      bookings: [
        {
          id: "b-abandoned",
          payment_mode: "deposit",
          payment_id: "pay-ab",
          status: "pending_payment",
        },
      ],
      paymentsById: {
        "pay-ab": { id: "pay-ab", gateway_payment_id: "pi_ab", status: "pending" },
      },
    });

    const summary = await service.reapExpired();

    expect(voidPayment).toHaveBeenCalled();
    expect(transition).toHaveBeenCalledTimes(1);
    expect(summary).toEqual({ scanned: 1, expired: 1, skipped: 0, errored: 0 });
  });

  it("continues the batch when transition throws for one booking (raced to confirmed)", async () => {
    const transition = mock(async (id: string) => {
      if (id === "b-bad") throw new Error("Invalid transition: confirmed -> expired");
      return { status: "expired" };
    });
    const { service } = makeService({
      bookings: [
        { id: "b-bad", payment_mode: "pay_at_venue", payment_id: null, status: "pending_payment" },
        { id: "b-good", payment_mode: "pay_at_venue", payment_id: null, status: "pending_payment" },
      ],
      transition,
    });

    const summary = await service.reapExpired();

    expect(summary).toEqual({ scanned: 2, expired: 1, skipped: 0, errored: 1 });
  });

  it("skips voiding when the deposit booking's Payment row has no gateway_payment_id yet", async () => {
    const { service, voidPayment } = makeService({
      bookings: [
        { id: "b-nopid", payment_mode: "deposit", payment_id: "pay-4", status: "pending_payment" },
      ],
      paymentsById: { "pay-4": { id: "pay-4", gateway_payment_id: null } },
    });

    const summary = await service.reapExpired();

    expect(voidPayment).not.toHaveBeenCalled();
    expect(summary).toEqual({ scanned: 1, expired: 1, skipped: 0, errored: 0 });
  });

  it("queries pending_payment bookings older than the window, oldest first, capped at 100", async () => {
    const { service, bookingRepo } = makeService({ bookings: [] });
    await service.reapExpired();
    const arg = (bookingRepo.find as any).mock.calls[0][0];
    expect(arg.where.status).toBe("pending_payment");
    expect(arg.where.created_at).toBeInstanceOf(Object); // LessThan(cutoff)
    expect(arg.take).toBe(100);
    expect(arg.order).toEqual({ created_at: "ASC" });
  });
});

// ───────────────────────────────────────────────────────────────────────────
// PHASE 7 REVIEW FIX #8 — bounded pagination.
//
// The reaper used to take ONE page of 100 per 5-minute cron with no
// repeat-until-empty, so a backlog above ~1200/hour could never drain and
// stale holds kept blocking slots indefinitely.
// ───────────────────────────────────────────────────────────────────────────

function makePending(n: number, prefix = "b") {
  return Array.from({ length: n }, (_, i) => ({
    id: `${prefix}-${i}`,
    payment_mode: "pay_at_venue",
    payment_id: null,
    status: "pending_payment",
  }));
}

describe("BookingReaperService.reapExpired pagination (Phase 7 review fix 8)", () => {
  it("drains a backlog larger than one page instead of stopping at 100", async () => {
    const { service, bookingRepo } = makeService({
      bookings: makePending(250),
      paginate: true,
    });

    const summary = await service.reapExpired();

    // Before the fix this was 100/100 — the other 150 were left for a next
    // tick that could never catch up.
    expect(summary.scanned).toBe(250);
    expect(summary.expired).toBe(250);
    expect((bookingRepo.find as any).mock.calls.length).toBe(3);
  });

  it("stops at a bounded per-run ceiling (10 pages x 100) rather than looping unbounded", async () => {
    const { service, bookingRepo } = makeService({
      bookings: makePending(1500),
      paginate: true,
    });

    const summary = await service.reapExpired();

    expect(summary.scanned).toBe(1000);
    expect(summary.expired).toBe(1000);
    expect((bookingRepo.find as any).mock.calls.length).toBe(10);
  });

  it("advances `skip` past rows it could not expire, so a stuck row cannot loop the sweep forever", async () => {
    // Every row fails to expire — without the skip advance the next page would
    // re-select the identical rows and the sweep would spin on them.
    const transition = mock(async () => {
      throw new Error("raced to confirmed");
    });
    const { service, bookingRepo } = makeService({
      bookings: makePending(150),
      paginate: true,
      transition,
    });

    const summary = await service.reapExpired();

    expect(summary.expired).toBe(0);
    expect(summary.errored).toBe(150);
    const skips = (bookingRepo.find as any).mock.calls.map((c: any[]) => c[0].skip);
    expect(skips[0]).toBe(0);
    expect(skips[1]).toBe(100); // stepped past the 100 it left behind
    // No id is ever processed twice.
    const ids = (transition as any).mock.calls.map((c: any[]) => c[0]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("stops early on a short page (no wasted queries when the backlog is small)", async () => {
    const { service, bookingRepo } = makeService({ bookings: makePending(5), paginate: true });

    const summary = await service.reapExpired();

    expect(summary.expired).toBe(5);
    expect((bookingRepo.find as any).mock.calls.length).toBe(1);
  });
});
