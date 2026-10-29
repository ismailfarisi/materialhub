import { describe, expect, it, mock } from "bun:test";
import { createHash } from "node:crypto";
import type { ConversionEventPayload } from "../conversions/conversion-event.ts";
import type { TiktokChannelCredentials } from "../credentials.ts";
import { TiktokAdapter } from "./tiktok.adapter.ts";

const CREDS: TiktokChannelCredentials = {
  pixelCode: "CK2XXXXXXXXXXXXXXXXXXXXX",
  catalogId: "ttcat_1",
  accessToken: "ttkn_xxx",
};

const BASE_PAYLOAD: ConversionEventPayload = {
  order_id: "ord-abc",
  currency: "AED",
  value_fils: 12950,
  customer: {
    email: "Buyer@Example.com",
    phone: "+971501234567",
    first_name: "Aaminah",
    last_name: "Khan",
    user_id: "usr-001",
  },
  items: [{ offer_id: "SKU-1", quantity: 2, price_fils: 6475 }],
  gclid: null,
  occurred_at: new Date("2026-05-31T10:00:00Z"),
  event_source_url: "https://materialhubuae.com/en/account/orders/ord-abc",
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function makeFetchMock(opts: { status?: number; body?: unknown } = {}): {
  fetchImpl: typeof fetch;
  calls: Array<{ url: string; init: RequestInit | undefined }>;
} {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetchImpl = mock(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(opts.body ?? { code: 0, message: "ok" }), {
      status: opts.status ?? 200,
    });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe("TiktokAdapter.uploadConversion", () => {
  it("POSTs to /v1.3/event/track/ with the correct URL", async () => {
    const { fetchImpl, calls } = makeFetchMock();
    const adapter = new TiktokAdapter({ fetchImpl });
    await adapter.uploadConversion(CREDS, BASE_PAYLOAD);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://business-api.tiktok.com/open_api/v1.3/event/track/");
    expect(calls[0]?.init?.method).toBe("POST");
  });

  it("sends Access-Token header with the credential", async () => {
    const { fetchImpl, calls } = makeFetchMock();
    await new TiktokAdapter({ fetchImpl }).uploadConversion(CREDS, BASE_PAYLOAD);
    const headers = calls[0]?.init?.headers as Record<string, string>;
    expect(headers["Access-Token"]).toBe("ttkn_xxx");
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("hard-codes event name as CompletePayment", async () => {
    const { fetchImpl, calls } = makeFetchMock();
    await new TiktokAdapter({ fetchImpl }).uploadConversion(CREDS, BASE_PAYLOAD);
    const body = JSON.parse((calls[0]?.init?.body as string) ?? "{}");
    expect(body.data[0].event).toBe("CompletePayment");
  });

  it("sets event_source 'web' and event_source_id from pixelCode", async () => {
    const { fetchImpl, calls } = makeFetchMock();
    await new TiktokAdapter({ fetchImpl }).uploadConversion(CREDS, BASE_PAYLOAD);
    const body = JSON.parse((calls[0]?.init?.body as string) ?? "{}");
    expect(body.event_source).toBe("web");
    expect(body.event_source_id).toBe("CK2XXXXXXXXXXXXXXXXXXXXX");
  });

  it("uses order.id as event_id (dedup contract)", async () => {
    const { fetchImpl, calls } = makeFetchMock();
    await new TiktokAdapter({ fetchImpl }).uploadConversion(CREDS, BASE_PAYLOAD);
    const body = JSON.parse((calls[0]?.init?.body as string) ?? "{}");
    expect(body.data[0].event_id).toBe("ord-abc");
  });

  it("hashes email + phone lowercase-hex SHA-256", async () => {
    const { fetchImpl, calls } = makeFetchMock();
    await new TiktokAdapter({ fetchImpl }).uploadConversion(CREDS, BASE_PAYLOAD);
    const body = JSON.parse((calls[0]?.init?.body as string) ?? "{}");
    // Email normalized to lowercase before hash (per pii-hash.ts convention).
    expect(body.data[0].user.em).toEqual([sha256("buyer@example.com")]);
    // Phone hashed as the normalized E.164 the worker passed in.
    expect(body.data[0].user.ph).toEqual([sha256("+971501234567")]);
  });

  it("hashes user_id into external_id (lowercases + trims first)", async () => {
    const { fetchImpl, calls } = makeFetchMock();
    const mixedCase: ConversionEventPayload = {
      ...BASE_PAYLOAD,
      customer: { ...BASE_PAYLOAD.customer, user_id: "USR-001 " },
    };
    await new TiktokAdapter({ fetchImpl }).uploadConversion(CREDS, mixedCase);
    const body = JSON.parse((calls[0]?.init?.body as string) ?? "{}");
    expect(body.data[0].user.external_id).toEqual([sha256("usr-001")]);
  });

  it("omits user.em / user.ph / user.external_id when source fields are null", async () => {
    const { fetchImpl, calls } = makeFetchMock();
    const anon: ConversionEventPayload = {
      ...BASE_PAYLOAD,
      customer: { ...BASE_PAYLOAD.customer, email: null, phone: null, user_id: null },
    };
    await new TiktokAdapter({ fetchImpl }).uploadConversion(CREDS, anon);
    const body = JSON.parse((calls[0]?.init?.body as string) ?? "{}");
    expect(body.data[0].user.em).toBeUndefined();
    expect(body.data[0].user.ph).toBeUndefined();
    expect(body.data[0].user.external_id).toBeUndefined();
  });

  it("includes page.url from event_source_url", async () => {
    const { fetchImpl, calls } = makeFetchMock();
    await new TiktokAdapter({ fetchImpl }).uploadConversion(CREDS, BASE_PAYLOAD);
    const body = JSON.parse((calls[0]?.init?.body as string) ?? "{}");
    expect(body.data[0].page.url).toBe("https://materialhubuae.com/en/account/orders/ord-abc");
  });

  it("maps properties (value/currency/contents/order_id) with fils -> decimal conversion", async () => {
    const { fetchImpl, calls } = makeFetchMock();
    await new TiktokAdapter({ fetchImpl }).uploadConversion(CREDS, BASE_PAYLOAD);
    const body = JSON.parse((calls[0]?.init?.body as string) ?? "{}");
    const props = body.data[0].properties;
    expect(props.currency).toBe("AED");
    expect(props.value).toBe(129.5); // 12950 fils -> AED decimal
    expect(props.order_id).toBe("ord-abc");
    expect(props.content_type).toBe("product");
    expect(props.contents).toEqual([
      { content_id: "SKU-1", content_type: "product", quantity: 2, price: 64.75 },
    ]);
  });

  it("includes test_event_code only when creds.testEventCode is set", async () => {
    const { fetchImpl, calls } = makeFetchMock();
    await new TiktokAdapter({ fetchImpl }).uploadConversion(CREDS, BASE_PAYLOAD);
    const bodyNoTest = JSON.parse((calls[0]?.init?.body as string) ?? "{}");
    expect(bodyNoTest.test_event_code).toBeUndefined();

    const { fetchImpl: f2, calls: c2 } = makeFetchMock();
    await new TiktokAdapter({ fetchImpl: f2 }).uploadConversion(
      { ...CREDS, testEventCode: "TEST123" },
      BASE_PAYLOAD,
    );
    const bodyWithTest = JSON.parse((c2[0]?.init?.body as string) ?? "{}");
    expect(bodyWithTest.test_event_code).toBe("TEST123");
  });

  it("throws with .status and .body when TikTok responds non-2xx", async () => {
    const { fetchImpl } = makeFetchMock({
      status: 400,
      body: { code: 40001, message: "Invalid pixel_code" },
    });
    const adapter = new TiktokAdapter({ fetchImpl });
    let caught: unknown;
    try {
      await adapter.uploadConversion(CREDS, BASE_PAYLOAD);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as { status: number }).status).toBe(400);
    expect((caught as { body: { code: number } }).body.code).toBe(40001);
    // SECURITY: error message must NOT leak the access token.
    expect(String((caught as Error).message)).not.toContain(CREDS.accessToken);
  });
});
