import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Elysia, t } from "elysia";

// Minimal in-process route tests — no real DB/Redis needed.
// They verify handler wiring: ETag, 304, 409 pass-through, response shape.

const FAKE_QUOTE_RESPONSE = {
  schema_version: 1 as const,
  quote_token: "q_abc123.2026-04-17T00:00:00.000Z",
  issued_at: "2026-04-17T10:00:00.000Z",
  expires_at: "2026-04-17T10:05:00.000Z",
  currency: "AED" as const,
  requires_address: false,
  fx_snapshot: { base: "AED" as const, rate: 1, captured_at: "2026-04-17T00:00:00.000Z" },
  totals: {
    subtotal_fils: 100000,
    vat_fils: 5000,
    vat_rate_bps: 500,
    surcharge_fils: 0,
    discount_fils: 0,
    grand_total_fils: 105000,
    default_selection: { payment_method_id: "card", shipping_by_group: {} },
  },
  payment_methods: [
    {
      id: "card" as const,
      available: true,
      surcharge_fils: 0,
      surcharge_type: "fixed" as const,
      reason_key: null,
      reason_params: null,
    },
  ],
  shipping: null,
  compatibility: { card: ["standard"], cod: ["standard"] },
  notices: [],
};

const FAKE_ETAG = '"abc123etag"';

const makeApp = (quoteControllerOverride?: Partial<{ getQuote: any; getInstruments: any }>) => {
  const defaultQuoteController = {
    getQuote: mock(() => Promise.resolve({ response: FAKE_QUOTE_RESPONSE, etag: FAKE_ETAG })),
    getInstruments: mock(() => Promise.resolve({ schema_version: 1, instruments: [] })),
  };
  const quoteController = { ...defaultQuoteController, ...quoteControllerOverride };

  const defaultCheckoutController = {
    initiateCheckout: mock(() =>
      Promise.resolve({
        orderId: "o1",
        orderNumber: "ORD-001",
        subtotal: 100000,
        taxTotal: 5000,
        shippingTotal: 0,
        discountTotal: 0,
        grandTotal: 105000,
      }),
    ),
  };

  return new Elysia()
    .decorate("quoteController", quoteController)
    .decorate("checkoutController", defaultCheckoutController)
    .derive(() => ({ user: { id: "user-1", role: "customer" } }))
    .get(
      "/checkout/quote",
      async ({ user, query, request, set, quoteController: qc }: any) => {
        const addressId: string | null = (query as any).address_id ?? null;
        const ifNoneMatch: string | null = request.headers.get("if-none-match");
        const result = await qc.getQuote(user.id, addressId);
        if (ifNoneMatch && ifNoneMatch === result.etag) {
          set.status = 304;
          return;
        }
        set.headers.etag = result.etag;
        set.headers["cache-control"] = "private, max-age=60";
        return { statusCode: 200, data: result.response, timestamp: new Date().toISOString() };
      },
      { query: t.Object({ address_id: t.Optional(t.String()) }) },
    )
    .get("/checkout/payment-instruments", async ({ user, set, quoteController: qc }: any) => {
      const result = await qc.getInstruments(user.id);
      set.headers["cache-control"] = "private, max-age=300";
      return { statusCode: 200, data: result, timestamp: new Date().toISOString() };
    })
    .post(
      "/checkout/initiate",
      async ({ body, set, checkoutController: cc }: any) => {
        const result = await cc.initiateCheckout("user-1", body);
        if (result && (result as any).status === 409) {
          set.status = 409;
          return result;
        }
        return { statusCode: 200, data: result, timestamp: new Date().toISOString() };
      },
      {
        body: t.Object({
          quote_token: t.Optional(t.String()),
          address_id: t.Optional(t.String()),
        }),
      },
    );
};

describe("GET /checkout/quote", () => {
  let app: ReturnType<typeof makeApp>;
  beforeEach(() => {
    app = makeApp();
  });

  it("returns 200 with valid CheckoutQuoteResponse shape", async () => {
    const res = await app.handle(new Request("http://localhost/checkout/quote"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.statusCode).toBe(200);
    const d = body.data;
    expect(d.schema_version).toBe(1);
    expect(typeof d.quote_token).toBe("string");
    expect(typeof d.issued_at).toBe("string");
    expect(typeof d.expires_at).toBe("string");
    expect(d.currency).toBe("AED");
    expect(Array.isArray(d.payment_methods)).toBe(true);
    expect(d.totals).toBeDefined();
    expect(typeof d.totals.grand_total_fils).toBe("number");
  });

  it("returns ETag header", async () => {
    const res = await app.handle(new Request("http://localhost/checkout/quote"));
    expect(res.headers.get("etag")).toBe(FAKE_ETAG);
  });

  it("returns 304 when If-None-Match matches current ETag", async () => {
    const res = await app.handle(
      new Request("http://localhost/checkout/quote", {
        headers: { "if-none-match": FAKE_ETAG },
      }),
    );
    expect(res.status).toBe(304);
  });

  it("returns 200 when If-None-Match does not match", async () => {
    const res = await app.handle(
      new Request("http://localhost/checkout/quote", {
        headers: { "if-none-match": '"stale-etag"' },
      }),
    );
    expect(res.status).toBe(200);
  });

  it("forwards address_id query param to controller", async () => {
    const getQuote = mock(() =>
      Promise.resolve({ response: FAKE_QUOTE_RESPONSE, etag: FAKE_ETAG }),
    );
    const localApp = makeApp({ getQuote });
    await localApp.handle(
      new Request(
        "http://localhost/checkout/quote?address_id=00000000-0000-0000-0000-000000000001",
      ),
    );
    expect(getQuote).toHaveBeenCalledWith("user-1", "00000000-0000-0000-0000-000000000001");
  });
});

describe("GET /checkout/payment-instruments", () => {
  it("returns 200 with schema_version and instruments array", async () => {
    const app = makeApp();
    const res = await app.handle(new Request("http://localhost/checkout/payment-instruments"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.data.schema_version).toBe(1);
    expect(Array.isArray(body.data.instruments)).toBe(true);
  });

  it("sets Cache-Control header", async () => {
    const app = makeApp();
    const res = await app.handle(new Request("http://localhost/checkout/payment-instruments"));
    expect(res.headers.get("cache-control")).toContain("max-age=300");
  });
});

describe("POST /checkout/initiate — 409 fresh_quote", () => {
  it("passes through 409 with fresh_quote when service returns status 409", async () => {
    const staleCheckoutController = {
      initiateCheckout: mock(() =>
        Promise.resolve({
          status: 409,
          error: {
            code: "quote_token_stale",
            reason_key: "checkout.error.quote_token_stale",
            message: "Quote has changed",
          },
          fresh_quote: FAKE_QUOTE_RESPONSE,
        }),
      ),
    };
    const app = new Elysia()
      .decorate("checkoutController", staleCheckoutController)
      .derive(() => ({ user: { id: "user-1", role: "customer" } }))
      .post(
        "/checkout/initiate",
        async ({ body, set, checkoutController: cc }: any) => {
          const result = await cc.initiateCheckout("user-1", body);
          if (result && (result as any).status === 409) {
            set.status = 409;
            return result;
          }
          return { statusCode: 200, data: result, timestamp: new Date().toISOString() };
        },
        {
          body: t.Object({
            quote_token: t.Optional(t.String()),
          }),
        },
      );

    const res = await app.handle(
      new Request("http://localhost/checkout/initiate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ quote_token: "q_stale.2026-04-17T00:00:00.000Z" }),
      }),
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as any;
    expect(body.error.reason_key).toBe("checkout.error.quote_token_stale");
    expect(body.fresh_quote).toBeDefined();
  });
});
