import { describe, expect, it, mock } from "bun:test";
import type { FeedItem } from "../feed/feed-item.ts";
import {
  GoogleAdapter,
  type GoogleAdapterDeps,
  type GoogleMerchantCenterCredentials,
} from "./google.adapter.ts";

const baseItem = (overrides: Partial<FeedItem> = {}): FeedItem => ({
  offer_id: "prod-1",
  item_group_id: null,
  title: "Rose Eau de Parfum",
  description: "A floral fragrance.",
  link: "https://www.materialhubuae.com/en/product/rose-edp",
  image_link: "https://cdn.materialhubuae.com/p/1/a.jpg",
  additional_image_links: [],
  availability: "in_stock",
  price_fils: 12000,
  sale_price_fils: null,
  currency: "AED",
  brand: null,
  gtin: null,
  mpn: null,
  condition: "new",
  google_product_category: null,
  product_type: null,
  country_of_origin: null,
  identifier_exists: false,
  ...overrides,
});

const creds: GoogleMerchantCenterCredentials = {
  merchantId: "1234567890",
  serviceAccount: {
    client_email: "feed-pusher@example.iam.gserviceaccount.com",
    private_key: "-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----\n",
    token_uri: "https://oauth2.googleapis.com/token",
  },
};

const makeAuthFactory = (): NonNullable<GoogleAdapterDeps["authFactory"]> =>
  mock((_c: GoogleMerchantCenterCredentials) => ({
    getAccessToken: () => Promise.resolve("fake-token"),
  })) as unknown as NonNullable<GoogleAdapterDeps["authFactory"]>;

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

describe("GoogleAdapter.upsertProduct", () => {
  it("POSTs to the correct URL with bearer token and translated body", async () => {
    const { fn, calls } = makeFetch({ ok: true, status: 200, body: { id: "ok" } });
    const adapter = new GoogleAdapter({ fetchImpl: fn, authFactory: makeAuthFactory() });

    const result = await adapter.upsertProduct(creds, baseItem());

    expect(result.status).toBe(200);
    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.url).toBe(
      "https://shoppingcontent.googleapis.com/content/v2.1/1234567890/products",
    );
    expect(call.init?.method).toBe("POST");
    const headers = call.init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer fake-token");
    expect(headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(call.init?.body as string);
    expect(body.offerId).toBe("prod-1");
    expect(body.price.value).toBe("120.00");
    expect(body.price.currency).toBe("AED");
    expect(body.availability).toBe("in stock");
    expect(body.identifierExists).toBe(false);
    expect(body.contentLanguage).toBe("en");
    expect(body.targetCountry).toBe("AE");
    expect(body.channel).toBe("online");
    expect(body.condition).toBe("new");
  });

  it("emits all optional fields when populated", async () => {
    const { fn, calls } = makeFetch({ ok: true, status: 200, body: { id: "ok" } });
    const adapter = new GoogleAdapter({ fetchImpl: fn, authFactory: makeAuthFactory() });

    await adapter.upsertProduct(
      creds,
      baseItem({
        offer_id: "var-1",
        item_group_id: "prod-2",
        availability: "out_of_stock",
        price_fils: 8500,
        sale_price_fils: 6900,
        additional_image_links: [
          "https://cdn.materialhubuae.com/p/2/b.jpg",
          "https://cdn.materialhubuae.com/p/2/c.jpg",
        ],
        brand: "LuxeBeauty",
        gtin: "0123456789012",
        mpn: "LB-MATTE-CR",
        google_product_category: "567",
        product_type: "Health & Beauty > Makeup > Lipstick",
        identifier_exists: true,
      }),
    );

    const body = JSON.parse(calls[0]!.init?.body as string);
    expect(body.itemGroupId).toBe("prod-2");
    expect(body.additionalImageLinks).toEqual([
      "https://cdn.materialhubuae.com/p/2/b.jpg",
      "https://cdn.materialhubuae.com/p/2/c.jpg",
    ]);
    expect(body.salePrice).toEqual({ value: "69.00", currency: "AED" });
    expect(body.brand).toBe("LuxeBeauty");
    expect(body.gtin).toBe("0123456789012");
    expect(body.mpn).toBe("LB-MATTE-CR");
    expect(body.googleProductCategory).toBe("567");
    expect(body.productTypes).toEqual(["Health & Beauty > Makeup > Lipstick"]);
    expect(body.availability).toBe("out of stock");
    expect(body.identifierExists).toBe(true);
  });

  it("omits optional fields when not set", async () => {
    const { fn, calls } = makeFetch({ ok: true, status: 200, body: { id: "ok" } });
    const adapter = new GoogleAdapter({ fetchImpl: fn, authFactory: makeAuthFactory() });

    await adapter.upsertProduct(creds, baseItem());

    const body = JSON.parse(calls[0]!.init?.body as string);
    expect(body.itemGroupId).toBeUndefined();
    expect(body.additionalImageLinks).toBeUndefined();
    expect(body.salePrice).toBeUndefined();
    expect(body.brand).toBeUndefined();
    expect(body.gtin).toBeUndefined();
    expect(body.mpn).toBeUndefined();
    expect(body.googleProductCategory).toBeUndefined();
    expect(body.productTypes).toBeUndefined();
  });

  it("throws Error with status + body on 4xx response", async () => {
    const { fn } = makeFetch({ ok: false, status: 400, body: { error: "bad" } });
    const adapter = new GoogleAdapter({ fetchImpl: fn, authFactory: makeAuthFactory() });

    try {
      await adapter.upsertProduct(creds, baseItem());
      throw new Error("should have thrown");
    } catch (err) {
      const e = err as Error & { status: number; body: unknown };
      expect(e).toBeInstanceOf(Error);
      expect(e.message).toContain("google_upsert_failed");
      expect(e.status).toBe(400);
      expect(e.body).toEqual({ error: "bad" });
    }
  });

  it("URL-encodes the merchantId path segment", async () => {
    const { fn, calls } = makeFetch({ ok: true, status: 200, body: {} });
    const adapter = new GoogleAdapter({ fetchImpl: fn, authFactory: makeAuthFactory() });

    await adapter.upsertProduct({ ...creds, merchantId: "abc/def" }, baseItem());

    expect(calls[0]!.url).toBe(
      "https://shoppingcontent.googleapis.com/content/v2.1/abc%2Fdef/products",
    );
  });
});

describe("GoogleAdapter.deleteProduct", () => {
  it("DELETEs to the composite product-id URL with bearer token", async () => {
    const { fn, calls } = makeFetch({ ok: true, status: 204, body: null });
    const adapter = new GoogleAdapter({ fetchImpl: fn, authFactory: makeAuthFactory() });

    const result = await adapter.deleteProduct(creds, "offer-99");

    expect(result.status).toBe(204);
    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.url).toBe(
      `https://shoppingcontent.googleapis.com/content/v2.1/1234567890/products/${encodeURIComponent(
        "online:en:AE:offer-99",
      )}`,
    );
    expect(call.init?.method).toBe("DELETE");
    const headers = call.init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer fake-token");
  });

  it("tolerates 404 silently", async () => {
    const { fn } = makeFetch({ ok: false, status: 404, body: { error: "not found" } });
    const adapter = new GoogleAdapter({ fetchImpl: fn, authFactory: makeAuthFactory() });

    const result = await adapter.deleteProduct(creds, "offer-missing");
    expect(result.status).toBe(404);
  });

  it("throws Error with status + body on non-404 error response", async () => {
    const { fn } = makeFetch({ ok: false, status: 500, body: { error: "boom" } });
    const adapter = new GoogleAdapter({ fetchImpl: fn, authFactory: makeAuthFactory() });

    try {
      await adapter.deleteProduct(creds, "offer-7");
      throw new Error("should have thrown");
    } catch (err) {
      const e = err as Error & { status: number; body: unknown };
      expect(e).toBeInstanceOf(Error);
      expect(e.message).toContain("google_delete_failed");
      expect(e.status).toBe(500);
      expect(e.body).toEqual({ error: "boom" });
    }
  });
});
