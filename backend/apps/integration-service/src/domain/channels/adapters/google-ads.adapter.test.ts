import { describe, expect, it, mock } from "bun:test";
import type { ConversionEventPayload } from "../conversions/conversion-event.ts";
import { hashEmail, hashPhone } from "../conversions/pii-hash.ts";
import type { GoogleAdsCredentials } from "../credentials.ts";
import {
  GoogleAdsAdapter,
  type GoogleAdsAdapterDeps,
  toGoogleAdsDateTime,
} from "./google-ads.adapter.ts";

const baseCreds = (overrides: Partial<GoogleAdsCredentials> = {}): GoogleAdsCredentials => ({
  developerToken: "dev_token_abc",
  customerId: "1234567890",
  conversionActionId: "9876543210",
  oauthClient: {
    clientId: "12345.apps.googleusercontent.com",
    clientSecret: "GOCSPX-fake",
    refreshToken: "1//fake-refresh-token",
  },
  ...overrides,
});

const basePayload = (overrides: Partial<ConversionEventPayload> = {}): ConversionEventPayload => ({
  order_id: "order-123",
  currency: "AED",
  value_fils: 25000,
  customer: {
    email: "shopper@example.com",
    phone: "+971501234567",
    first_name: "Aisha",
    last_name: "Khan",
    user_id: null,
  },
  items: [{ offer_id: "var-1", quantity: 2, price_fils: 12500 }],
  gclid: null,
  occurred_at: new Date("2026-05-23T17:00:00.000Z"),
  event_source_url: "https://materialhubuae.com/en/account/orders/order-123",
  ...overrides,
});

const makeOAuthFactory = (): NonNullable<GoogleAdsAdapterDeps["oauthFactory"]> =>
  mock((_c: GoogleAdsCredentials) => ({
    getAccessToken: () => Promise.resolve("fake-token"),
  })) as unknown as NonNullable<GoogleAdsAdapterDeps["oauthFactory"]>;

interface FetchCall {
  url: string;
  init: RequestInit | undefined;
}

const makeFetch = (response: { ok: boolean; status: number; body: unknown }) => {
  const calls: FetchCall[] = [];
  const fn = mock((url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve({
      ok: response.ok,
      status: response.status,
      json: () => Promise.resolve(response.body),
    } as unknown as Response);
  }) as unknown as typeof fetch;
  return { fn, calls };
};

describe("GoogleAdsAdapter.uploadEnhancedConversion", () => {
  it("POSTs to the conversionAdjustments:upload URL with bearer + developer-token headers", async () => {
    const { fn, calls } = makeFetch({
      ok: true,
      status: 200,
      body: { results: [{ orderId: "order-123" }] },
    });
    const adapter = new GoogleAdsAdapter({ fetchImpl: fn, oauthFactory: makeOAuthFactory() });

    const result = await adapter.uploadEnhancedConversion(baseCreds(), basePayload());

    expect(result.status).toBe(200);
    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.url).toBe(
      "https://googleads.googleapis.com/v17/customers/1234567890/conversionAdjustments:upload",
    );
    expect(call.init?.method).toBe("POST");
    const headers = call.init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer fake-token");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["developer-token"]).toBe("dev_token_abc");
    expect(headers["login-customer-id"]).toBeUndefined();
  });

  it("includes login-customer-id header when set on creds", async () => {
    const { fn, calls } = makeFetch({ ok: true, status: 200, body: {} });
    const adapter = new GoogleAdsAdapter({ fetchImpl: fn, oauthFactory: makeOAuthFactory() });

    await adapter.uploadEnhancedConversion(
      baseCreds({ loginCustomerId: "9999999999" }),
      basePayload(),
    );

    const headers = calls[0]!.init?.headers as Record<string, string>;
    expect(headers["login-customer-id"]).toBe("9999999999");
  });

  it("builds the conversionAdjustments[0] body with the expected shape", async () => {
    const { fn, calls } = makeFetch({ ok: true, status: 200, body: {} });
    const adapter = new GoogleAdsAdapter({ fetchImpl: fn, oauthFactory: makeOAuthFactory() });

    await adapter.uploadEnhancedConversion(baseCreds(), basePayload());

    const body = JSON.parse(calls[0]!.init?.body as string);
    expect(body.partialFailure).toBe(false);
    expect(body.validateOnly).toBe(false);
    expect(body.conversionAdjustments).toHaveLength(1);
    const adj = body.conversionAdjustments[0];
    expect(adj.conversionAction).toBe("customers/1234567890/conversionActions/9876543210");
    expect(adj.adjustmentType).toBe("ENHANCEMENT");
    expect(adj.orderId).toBe("order-123");
    expect(adj.adjustmentDateTime).toBe("2026-05-23 17:00:00+00:00");
    expect(Array.isArray(adj.userIdentifiers)).toBe(true);
  });

  it("hashes email matching the pii-hash helper output", async () => {
    const { fn, calls } = makeFetch({ ok: true, status: 200, body: {} });
    const adapter = new GoogleAdsAdapter({ fetchImpl: fn, oauthFactory: makeOAuthFactory() });

    await adapter.uploadEnhancedConversion(
      baseCreds(),
      basePayload({
        customer: {
          email: "Test@Example.com  ",
          phone: null,
          first_name: null,
          last_name: null,
          user_id: null,
        },
      }),
    );

    const body = JSON.parse(calls[0]!.init?.body as string);
    const ids = body.conversionAdjustments[0].userIdentifiers as Array<Record<string, string>>;
    expect(ids).toHaveLength(1);
    expect(ids[0]!.hashedEmail).toBe(hashEmail("Test@Example.com  "));
    // Spot-check against the Google-published canonical example.
    expect(ids[0]!.hashedEmail).toBe(
      "973dfe463ec85785f5f95af5ba3906eedb2d931c24e69824a89ea65dba4e813b",
    );
  });

  it("hashes phone matching the pii-hash helper output (E.164 normalization)", async () => {
    const { fn, calls } = makeFetch({ ok: true, status: 200, body: {} });
    const adapter = new GoogleAdsAdapter({ fetchImpl: fn, oauthFactory: makeOAuthFactory() });

    await adapter.uploadEnhancedConversion(
      baseCreds(),
      basePayload({
        customer: {
          email: null,
          phone: "+1 (415) 555-2671",
          first_name: null,
          last_name: null,
          user_id: null,
        },
      }),
    );

    const body = JSON.parse(calls[0]!.init?.body as string);
    const ids = body.conversionAdjustments[0].userIdentifiers as Array<Record<string, string>>;
    expect(ids).toHaveLength(1);
    expect(ids[0]!.hashedPhoneNumber).toBe(hashPhone("+1 (415) 555-2671"));
  });

  it("emits both hashedEmail and hashedPhoneNumber when both are present", async () => {
    const { fn, calls } = makeFetch({ ok: true, status: 200, body: {} });
    const adapter = new GoogleAdsAdapter({ fetchImpl: fn, oauthFactory: makeOAuthFactory() });

    await adapter.uploadEnhancedConversion(baseCreds(), basePayload());

    const body = JSON.parse(calls[0]!.init?.body as string);
    const ids = body.conversionAdjustments[0].userIdentifiers as Array<Record<string, string>>;
    expect(ids).toHaveLength(2);
    expect(ids[0]!.hashedEmail).toBe(hashEmail("shopper@example.com"));
    expect(ids[1]!.hashedPhoneNumber).toBe(hashPhone("+971501234567"));
  });

  it("includes gclidDateTimePair when payload.gclid is present", async () => {
    const { fn, calls } = makeFetch({ ok: true, status: 200, body: {} });
    const adapter = new GoogleAdsAdapter({ fetchImpl: fn, oauthFactory: makeOAuthFactory() });

    await adapter.uploadEnhancedConversion(
      baseCreds(),
      basePayload({ gclid: "EAIaIQobChMI-fake-gclid" }),
    );

    const body = JSON.parse(calls[0]!.init?.body as string);
    const adj = body.conversionAdjustments[0];
    expect(adj.gclidDateTimePair).toEqual({
      gclid: "EAIaIQobChMI-fake-gclid",
      conversionDateTime: "2026-05-23 17:00:00+00:00",
    });
  });

  it("omits gclidDateTimePair when payload.gclid is null", async () => {
    const { fn, calls } = makeFetch({ ok: true, status: 200, body: {} });
    const adapter = new GoogleAdsAdapter({ fetchImpl: fn, oauthFactory: makeOAuthFactory() });

    await adapter.uploadEnhancedConversion(baseCreds(), basePayload({ gclid: null }));

    const body = JSON.parse(calls[0]!.init?.body as string);
    expect(body.conversionAdjustments[0].gclidDateTimePair).toBeUndefined();
  });

  it("throws google_ads_no_user_identifiers when neither email nor phone is set", async () => {
    const { fn } = makeFetch({ ok: true, status: 200, body: {} });
    const adapter = new GoogleAdsAdapter({ fetchImpl: fn, oauthFactory: makeOAuthFactory() });

    try {
      await adapter.uploadEnhancedConversion(
        baseCreds(),
        basePayload({
          customer: {
            email: null,
            phone: null,
            first_name: null,
            last_name: null,
            user_id: null,
          },
        }),
      );
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toBe("google_ads_no_user_identifiers");
    }
  });

  it("throws Error with status + body on 4xx response", async () => {
    const { fn } = makeFetch({
      ok: false,
      status: 400,
      body: { error: { message: "bad request" } },
    });
    const adapter = new GoogleAdsAdapter({ fetchImpl: fn, oauthFactory: makeOAuthFactory() });

    try {
      await adapter.uploadEnhancedConversion(baseCreds(), basePayload());
      throw new Error("should have thrown");
    } catch (err) {
      const e = err as Error & { status: number; body: unknown };
      expect(e).toBeInstanceOf(Error);
      expect(e.message).toContain("google_ads_upload_failed 400");
      expect(e.status).toBe(400);
      expect(e.body).toEqual({ error: { message: "bad request" } });
    }
  });

  it("throws Error with status + body on 5xx response", async () => {
    const { fn } = makeFetch({ ok: false, status: 503, body: { error: "service unavailable" } });
    const adapter = new GoogleAdsAdapter({ fetchImpl: fn, oauthFactory: makeOAuthFactory() });

    try {
      await adapter.uploadEnhancedConversion(baseCreds(), basePayload());
      throw new Error("should have thrown");
    } catch (err) {
      const e = err as Error & { status: number; body: unknown };
      expect(e).toBeInstanceOf(Error);
      expect(e.message).toContain("google_ads_upload_failed 503");
      expect(e.status).toBe(503);
      expect(e.body).toEqual({ error: "service unavailable" });
    }
  });

  it("URL-encodes the customerId path segment", async () => {
    const { fn, calls } = makeFetch({ ok: true, status: 200, body: {} });
    const adapter = new GoogleAdsAdapter({ fetchImpl: fn, oauthFactory: makeOAuthFactory() });

    await adapter.uploadEnhancedConversion(baseCreds({ customerId: "abc/def" }), basePayload());

    expect(calls[0]!.url).toBe(
      "https://googleads.googleapis.com/v17/customers/abc%2Fdef/conversionAdjustments:upload",
    );
  });

  it("invokes the oauthFactory with the supplied creds", async () => {
    const { fn } = makeFetch({ ok: true, status: 200, body: {} });
    const oauthFactory = makeOAuthFactory();
    const adapter = new GoogleAdsAdapter({ fetchImpl: fn, oauthFactory });

    const creds = baseCreds();
    await adapter.uploadEnhancedConversion(creds, basePayload());

    expect(oauthFactory).toHaveBeenCalledTimes(1);
    expect(oauthFactory).toHaveBeenCalledWith(creds);
  });
});

describe("toGoogleAdsDateTime", () => {
  it("converts a UTC Date to the YYYY-MM-DD HH:MM:SS+00:00 format", () => {
    expect(toGoogleAdsDateTime(new Date("2026-05-23T17:00:00.000Z"))).toBe(
      "2026-05-23 17:00:00+00:00",
    );
  });

  it("strips milliseconds even when non-zero", () => {
    expect(toGoogleAdsDateTime(new Date("2026-01-02T03:04:05.678Z"))).toBe(
      "2026-01-02 03:04:05+00:00",
    );
  });
});
