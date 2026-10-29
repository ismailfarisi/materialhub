import { describe, expect, it, mock } from "bun:test";
import { PendingOrderReaperService } from "./pending-order-reaper.service.ts";

// Builds a service whose paymentRepo returns per-order payment rows from `byOrder`.
function makeService(opts: {
  orders: any[];
  paymentsByOrder: Record<string, any[]>;
  stripe?: any;
  cancelOrder?: any;
  windowMinutes?: number;
}) {
  const orderRepo = {
    find: mock(async () => opts.orders),
  };
  const paymentRepo = {
    find: mock(async ({ where }: any) => opts.paymentsByOrder[where.order_id] ?? []),
  };
  const cancelOrder = opts.cancelOrder ?? mock(async () => ({}));
  const orderStatusService = { cancelOrder };
  const service = new PendingOrderReaperService(
    orderRepo as any,
    paymentRepo as any,
    orderStatusService as any,
    (opts.stripe ?? null) as any,
    opts.windowMinutes ?? 60,
  );
  return { service, orderRepo, paymentRepo, cancelOrder };
}

describe("PendingOrderReaperService.reapExpired", () => {
  it("cancels an abandoned Stripe order: cancels the PaymentIntent then the order", async () => {
    const retrieve = mock(async () => ({ status: "requires_payment_method" }));
    const cancel = mock(async () => ({ status: "canceled" }));
    const stripe = { paymentIntents: { retrieve, cancel } };
    const { service, cancelOrder } = makeService({
      orders: [{ id: "o-stripe" }],
      paymentsByOrder: {
        "o-stripe": [{ gateway: "stripe", status: "pending", gateway_payment_id: "pi_1" }],
      },
      stripe,
    });

    const summary = await service.reapExpired();

    expect(retrieve).toHaveBeenCalledWith("pi_1");
    expect(cancel).toHaveBeenCalledWith("pi_1");
    expect(cancelOrder).toHaveBeenCalledWith(
      "o-stripe",
      { userId: "system", role: "system" },
      "Payment not completed within 60 minutes",
    );
    expect(summary).toEqual({ scanned: 1, cancelled: 1, skipped: 0, errored: 0 });
  });

  it("skips a Stripe order whose PaymentIntent already succeeded", async () => {
    const retrieve = mock(async () => ({ status: "succeeded" }));
    const cancel = mock(async () => ({}));
    const stripe = { paymentIntents: { retrieve, cancel } };
    const { service, cancelOrder } = makeService({
      orders: [{ id: "o-paid" }],
      paymentsByOrder: {
        "o-paid": [{ gateway: "stripe", status: "pending", gateway_payment_id: "pi_2" }],
      },
      stripe,
    });

    const summary = await service.reapExpired();

    expect(cancel).not.toHaveBeenCalled();
    expect(cancelOrder).not.toHaveBeenCalled();
    expect(summary).toEqual({ scanned: 1, cancelled: 0, skipped: 1, errored: 0 });
  });

  it("skips a COD order that is still pending_payment", async () => {
    const { service, cancelOrder } = makeService({
      orders: [{ id: "o-cod" }],
      paymentsByOrder: { "o-cod": [{ gateway: "cod", status: "pending" }] },
    });

    const summary = await service.reapExpired();

    expect(cancelOrder).not.toHaveBeenCalled();
    expect(summary.skipped).toBe(1);
    expect(summary.cancelled).toBe(0);
  });

  it("skips a COD order that also carries a dead prepaid row", async () => {
    // "Tried card, abandoned, came back and picked COD" leaves both rows on
    // one order. COD only captures at delivery, so the captured-payment guard
    // can't see it — following the dead PaymentIntent here would cancel a COD
    // order that triggerAutoShipments has already booked and dispatched.
    const retrieve = mock(async () => ({ status: "requires_payment_method" }));
    const cancel = mock(async () => ({ status: "canceled" }));
    const { service, cancelOrder } = makeService({
      orders: [{ id: "o-mixed" }],
      paymentsByOrder: {
        "o-mixed": [
          { gateway: "stripe", status: "pending", gateway_payment_id: "pi_dead" },
          { gateway: "cod", status: "pending" },
        ],
      },
      stripe: { paymentIntents: { retrieve, cancel } },
    });

    const summary = await service.reapExpired();

    expect(cancel).not.toHaveBeenCalled();
    expect(cancelOrder).not.toHaveBeenCalled();
    expect(summary).toEqual({ scanned: 1, cancelled: 0, skipped: 1, errored: 0 });
  });

  it("cancels an abandoned order that has no payment row at all", async () => {
    // Distinct from COD: the customer reached order creation and then walked
    // away before choosing a payment method, so no payments row was ever
    // written. These used to hit the COD skip-guard and sat in
    // pending_payment forever, holding inventory.
    const { service, cancelOrder } = makeService({
      orders: [{ id: "o-none" }],
      paymentsByOrder: { "o-none": [] },
    });

    const summary = await service.reapExpired();

    expect(cancelOrder).toHaveBeenCalledWith(
      "o-none",
      { userId: "system", role: "system" },
      "Payment not completed within 60 minutes",
    );
    expect(summary).toEqual({ scanned: 1, cancelled: 1, skipped: 0, errored: 0 });
  });

  it("skips an order that already has a captured payment", async () => {
    const { service, cancelOrder } = makeService({
      orders: [{ id: "o-cap" }],
      paymentsByOrder: {
        "o-cap": [{ gateway: "stripe", status: "captured", gateway_payment_id: "pi_3" }],
      },
      stripe: {
        paymentIntents: { retrieve: mock(async () => ({})), cancel: mock(async () => ({})) },
      },
    });

    const summary = await service.reapExpired();

    expect(cancelOrder).not.toHaveBeenCalled();
    expect(summary.skipped).toBe(1);
  });

  it("cancels an abandoned Tabby order without any Stripe call", async () => {
    const { service, cancelOrder } = makeService({
      orders: [{ id: "o-tabby" }],
      paymentsByOrder: { "o-tabby": [{ gateway: "tabby", status: "pending" }] },
    });

    const summary = await service.reapExpired();

    expect(cancelOrder).toHaveBeenCalledWith(
      "o-tabby",
      { userId: "system", role: "system" },
      "Payment not completed within 60 minutes",
    );
    expect(summary.cancelled).toBe(1);
  });

  it("continues the batch when cancelOrder throws for one order (raced to confirmed)", async () => {
    const cancelOrder = mock(async (orderId: string) => {
      if (orderId === "o-bad")
        throw new Error("Invalid transition: confirmed → cancelled by system");
      return {};
    });
    const { service } = makeService({
      orders: [{ id: "o-bad" }, { id: "o-good" }],
      paymentsByOrder: {
        "o-bad": [{ gateway: "tabby", status: "pending" }],
        "o-good": [{ gateway: "tabby", status: "pending" }],
      },
      cancelOrder,
    });

    const summary = await service.reapExpired();

    expect(summary).toEqual({ scanned: 2, cancelled: 1, skipped: 0, errored: 1 });
  });

  it("queries pending_payment orders older than the window, oldest first, capped at 100", async () => {
    const { service, orderRepo } = makeService({ orders: [], paymentsByOrder: {} });
    await service.reapExpired();
    const arg = (orderRepo.find as any).mock.calls[0][0];
    expect(arg.where.status).toBe("pending_payment");
    expect(arg.where.created_at).toBeInstanceOf(Object); // LessThan(cutoff)
    expect(arg.take).toBe(100);
    expect(arg.order).toEqual({ created_at: "ASC" });
  });

  it("skips a Stripe order when the Stripe SDK is not configured", async () => {
    const { service, cancelOrder } = makeService({
      orders: [{ id: "o-nostripe" }],
      paymentsByOrder: {
        "o-nostripe": [{ gateway: "stripe", status: "pending", gateway_payment_id: "pi_x" }],
      },
      stripe: null,
    });
    const summary = await service.reapExpired();
    expect(cancelOrder).not.toHaveBeenCalled();
    expect(summary).toEqual({ scanned: 1, cancelled: 0, skipped: 1, errored: 0 });
  });

  it("skips a Stripe order that has no PaymentIntent id", async () => {
    const retrieve = mock(async () => ({ status: "requires_payment_method" }));
    const cancel = mock(async () => ({}));
    const { service, cancelOrder } = makeService({
      orders: [{ id: "o-nopi" }],
      paymentsByOrder: {
        "o-nopi": [{ gateway: "stripe", status: "pending", gateway_payment_id: null }],
      },
      stripe: { paymentIntents: { retrieve, cancel } },
    });
    const summary = await service.reapExpired();
    expect(retrieve).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
    expect(cancelOrder).not.toHaveBeenCalled();
    expect(summary).toEqual({ scanned: 1, cancelled: 0, skipped: 1, errored: 0 });
  });

  it("skips a multi-attempt Stripe order when a later PaymentIntent is live", async () => {
    const retrieve = mock(async (id: string) =>
      id === "pi_live" ? { status: "succeeded" } : { status: "requires_payment_method" },
    );
    const cancel = mock(async () => ({}));
    const { service, cancelOrder } = makeService({
      orders: [{ id: "o-multi" }],
      paymentsByOrder: {
        "o-multi": [
          { gateway: "stripe", status: "pending", gateway_payment_id: "pi_dead" },
          { gateway: "stripe", status: "pending", gateway_payment_id: "pi_live" },
        ],
      },
      stripe: { paymentIntents: { retrieve, cancel } },
    });

    const summary = await service.reapExpired();

    expect(cancel).not.toHaveBeenCalled();
    expect(cancelOrder).not.toHaveBeenCalled();
    expect(summary).toEqual({ scanned: 1, cancelled: 0, skipped: 1, errored: 0 });
  });

  it("cancels every dead PaymentIntent on a multi-attempt Stripe order", async () => {
    const retrieve = mock(async () => ({ status: "requires_payment_method" }));
    const cancel = mock(async () => ({}));
    const { service, cancelOrder } = makeService({
      orders: [{ id: "o-multi2" }],
      paymentsByOrder: {
        "o-multi2": [
          { gateway: "stripe", status: "pending", gateway_payment_id: "pi_a" },
          { gateway: "stripe", status: "pending", gateway_payment_id: "pi_b" },
        ],
      },
      stripe: { paymentIntents: { retrieve, cancel } },
    });

    const summary = await service.reapExpired();

    expect(cancel).toHaveBeenCalledWith("pi_a");
    expect(cancel).toHaveBeenCalledWith("pi_b");
    expect(cancelOrder).toHaveBeenCalled();
    expect(summary.cancelled).toBe(1);
  });
});
