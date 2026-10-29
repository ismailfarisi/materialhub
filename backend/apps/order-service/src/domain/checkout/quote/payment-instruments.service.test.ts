import { describe, expect, it, mock } from "bun:test";
import { PaymentInstrumentsService } from "./payment-instruments.service.ts";

describe("PaymentInstrumentsService", () => {
  it("deduplicates by (brand, last4, expiry) and flags expired", async () => {
    const now = new Date("2026-04-17T00:00:00Z");
    const paymentRepo = {
      find: mock(() =>
        Promise.resolve([
          {
            id: "pm1",
            card_brand: "visa",
            card_last4: "4242",
            card_expiry: "12/2028",
            status: "captured",
            created_at: now,
          },
          {
            id: "pm2",
            card_brand: "visa",
            card_last4: "4242",
            card_expiry: "12/2028",
            status: "captured",
            created_at: new Date("2026-04-10T00:00:00Z"),
          },
          {
            id: "pm3",
            card_brand: "mastercard",
            card_last4: "1111",
            card_expiry: "01/2025",
            status: "captured",
            created_at: new Date("2026-02-01T00:00:00Z"),
          },
        ]),
      ),
    };
    const svc = new PaymentInstrumentsService(paymentRepo as any);
    const instruments = await svc.listForUser("user-1", now);
    expect(instruments).toHaveLength(2);
    const visa = instruments.find((i) => i.brand === "visa");
    expect(visa?.exp_month).toBe(12);
    expect(visa?.exp_year).toBe(2028);
    expect(visa?.is_expired).toBe(false);
    expect(visa?.is_default).toBe(true);
    const mc = instruments.find((i) => i.brand === "mastercard");
    expect(mc?.is_expired).toBe(true);
  });

  it("skips payments missing card fields", async () => {
    const now = new Date("2026-04-17T00:00:00Z");
    const paymentRepo = {
      find: mock(() =>
        Promise.resolve([
          {
            id: "pm1",
            card_brand: null,
            card_last4: null,
            card_expiry: null,
            status: "captured",
            created_at: now,
          },
        ]),
      ),
    };
    const svc = new PaymentInstrumentsService(paymentRepo as any);
    const out = await svc.listForUser("user-1", now);
    expect(out).toEqual([]);
  });

  it("skips payments with non-captured/authorized status", async () => {
    const now = new Date("2026-04-17T00:00:00Z");
    const paymentRepo = {
      find: mock(() =>
        Promise.resolve([
          {
            id: "pm1",
            card_brand: "visa",
            card_last4: "4242",
            card_expiry: "12/2028",
            status: "failed",
            created_at: now,
          },
        ]),
      ),
    };
    const svc = new PaymentInstrumentsService(paymentRepo as any);
    const out = await svc.listForUser("user-1", now);
    expect(out).toEqual([]);
  });
});
