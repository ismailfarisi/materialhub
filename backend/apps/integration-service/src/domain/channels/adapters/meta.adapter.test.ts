import { describe, expect, it } from "bun:test";
import type { ConversionEventPayload } from "../conversions/conversion-event.ts";
import type { MetaChannelCredentials } from "../credentials.ts";
import type { FeedItem } from "../feed/feed-item.ts";
import { MetaAdapter, type MetaBatchRequest } from "./meta.adapter.ts";

const creds: MetaChannelCredentials = {
  pixelId: "1111111111",
  catalogId: "2222222222",
  businessId: "3333333333",
  accessToken: "EAAFakeSystemUserToken",
};

const item: FeedItem = {
  offer_id: "var-1",
  item_group_id: "prod-1",
  title: "Test",
  description: "Desc",
  link: "https://www.materialhubuae.com/en/product/test",
  image_link: "https://cdn.materialhubuae.com/p/1/a.jpg",
  additional_image_links: [],
  availability: "in_stock",
  price_fils: 12000,
  sale_price_fils: null,
  currency: "AED",
  brand: "B",
  gtin: null,
  mpn: null,
  condition: "new",
  google_product_category: null,
  product_type: null,
  country_of_origin: null,
  identifier_exists: false,
};

const purchasePayload: ConversionEventPayload = {
  order_id: "order-xyz",
  currency: "AED",
  value_fils: 15000,
  customer: {
    email: "Test@Example.COM",
    phone: "+971501234567",
    first_name: "Aisha",
    last_name: "Khan",
    user_id: null,
  },
  items: [{ offer_id: "var-1", quantity: 2, price_fils: 7500 }],
  gclid: null,
  occurred_at: new Date("2026-05-26T12:00:00Z"),
  event_source_url: "https://materialhubuae.com/en/account/orders/order-xyz",
};

function makeFetchMock(impl: (url: string, init?: RequestInit) => Response) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return impl(url, init);
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe("MetaAdapter.pushBatch", () => {
  it("POSTs to /v18.0/{catalogId}/batch with access_token + requests body", async () => {
    const { fetchImpl, calls } = makeFetchMock(
      () => new Response(JSON.stringify({ handles: ["h1"] }), { status: 200 }),
    );
    const adapter = new MetaAdapter({ fetchImpl });
    const requests: MetaBatchRequest[] = [{ method: "UPDATE", retailerId: item.offer_id, item }];

    const res = await adapter.pushBatch(creds, requests);

    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://graph.facebook.com/v18.0/2222222222/batch");
    const body = JSON.parse(String(calls[0]!.init!.body));
    expect(body.access_token).toBe("EAAFakeSystemUserToken");
    expect(body.requests).toHaveLength(1);
    expect(body.requests[0].method).toBe("UPDATE");
    expect(body.requests[0].retailer_id).toBe("var-1");
    expect(body.requests[0].data.title).toBe("Test");
    expect(body.requests[0].data.availability).toBe("in stock");
    expect(body.requests[0].data.price).toBe("120.00 AED");
    expect(body.requests[0].data.identifier_exists).toBe("NO");
  });

  it("returns 204 sentinel without making an HTTP call when requests is empty", async () => {
    const { fetchImpl, calls } = makeFetchMock(
      () => new Response(JSON.stringify({}), { status: 200 }),
    );
    const adapter = new MetaAdapter({ fetchImpl });
    const res = await adapter.pushBatch(creds, []);
    expect(res.status).toBe(204);
    expect(calls).toHaveLength(0);
  });

  it("sends 1 chunk when requests has exactly 1000 items", async () => {
    const { fetchImpl, calls } = makeFetchMock(
      () => new Response(JSON.stringify({ handles: [] }), { status: 200 }),
    );
    const adapter = new MetaAdapter({ fetchImpl });
    const requests: MetaBatchRequest[] = Array.from({ length: 1000 }, (_, i) => ({
      method: "UPDATE",
      retailerId: `r-${i}`,
      item: { ...item, offer_id: `r-${i}` },
    }));
    await adapter.pushBatch(creds, requests);
    expect(calls).toHaveLength(1);
    expect(JSON.parse(String(calls[0]!.init!.body)).requests).toHaveLength(1000);
  });

  it("sends 2 chunks when requests has 1001 items", async () => {
    const { fetchImpl, calls } = makeFetchMock(
      () => new Response(JSON.stringify({ handles: [] }), { status: 200 }),
    );
    const adapter = new MetaAdapter({ fetchImpl });
    const requests: MetaBatchRequest[] = Array.from({ length: 1001 }, (_, i) => ({
      method: "UPDATE",
      retailerId: `r-${i}`,
      item: { ...item, offer_id: `r-${i}` },
    }));
    await adapter.pushBatch(creds, requests);
    expect(calls).toHaveLength(2);
    expect(JSON.parse(String(calls[0]!.init!.body)).requests).toHaveLength(1000);
    expect(JSON.parse(String(calls[1]!.init!.body)).requests).toHaveLength(1);
  });

  it("chunks to 1000 items per HTTP call", async () => {
    const { fetchImpl, calls } = makeFetchMock(
      () => new Response(JSON.stringify({ handles: [] }), { status: 200 }),
    );
    const adapter = new MetaAdapter({ fetchImpl });
    const requests: MetaBatchRequest[] = Array.from({ length: 2500 }, (_, i) => ({
      method: "UPDATE",
      retailerId: `r-${i}`,
      item: { ...item, offer_id: `r-${i}` },
    }));

    await adapter.pushBatch(creds, requests);

    // 2500 → 3 chunks (1000, 1000, 500)
    expect(calls).toHaveLength(3);
    expect(JSON.parse(String(calls[0]!.init!.body)).requests).toHaveLength(1000);
    expect(JSON.parse(String(calls[1]!.init!.body)).requests).toHaveLength(1000);
    expect(JSON.parse(String(calls[2]!.init!.body)).requests).toHaveLength(500);
  });

  it("emits DELETE requests with retailer_id only", async () => {
    const { fetchImpl, calls } = makeFetchMock(
      () => new Response(JSON.stringify({ handles: [] }), { status: 200 }),
    );
    const adapter = new MetaAdapter({ fetchImpl });

    await adapter.pushBatch(creds, [{ method: "DELETE", retailerId: "var-1" }]);

    const body = JSON.parse(String(calls[0]!.init!.body));
    expect(body.requests[0].method).toBe("DELETE");
    expect(body.requests[0].retailer_id).toBe("var-1");
    expect(body.requests[0].data).toBeUndefined();
  });

  it("throws with status + body attached on 4xx", async () => {
    const { fetchImpl } = makeFetchMock(
      () => new Response(JSON.stringify({ error: { message: "bad token" } }), { status: 401 }),
    );
    const adapter = new MetaAdapter({ fetchImpl });

    let thrown: unknown;
    try {
      await adapter.pushBatch(creds, [{ method: "UPDATE", retailerId: "x", item }]);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as { status?: number }).status).toBe(401);
    expect((thrown as { body?: unknown }).body).toEqual({
      error: { message: "bad token" },
    });
  });
});

describe("MetaAdapter.uploadConversion", () => {
  it("POSTs to /v18.0/{pixelId}/events with hashed user_data and order event_id", async () => {
    const { fetchImpl, calls } = makeFetchMock(
      () => new Response(JSON.stringify({ events_received: 1 }), { status: 200 }),
    );
    const adapter = new MetaAdapter({ fetchImpl });

    const res = await adapter.uploadConversion(creds, purchasePayload);

    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://graph.facebook.com/v18.0/1111111111/events");
    const body = JSON.parse(String(calls[0]!.init!.body));
    expect(body.access_token).toBe("EAAFakeSystemUserToken");
    expect(body.data).toHaveLength(1);
    const evt = body.data[0];
    expect(evt.event_name).toBe("Purchase");
    expect(evt.event_id).toBe("order-xyz");
    expect(evt.action_source).toBe("website");
    expect(evt.event_source_url).toBe("https://materialhubuae.com/en/account/orders/order-xyz");
    expect(evt.event_time).toBe(Math.floor(purchasePayload.occurred_at.getTime() / 1000));
    expect(evt.user_data.em[0]).toMatch(/^[a-f0-9]{64}$/); // sha256 hex
    expect(evt.user_data.ph[0]).toMatch(/^[a-f0-9]{64}$/);
    expect(evt.user_data.fn[0]).toMatch(/^[a-f0-9]{64}$/);
    expect(evt.user_data.ln[0]).toMatch(/^[a-f0-9]{64}$/);
    expect(evt.custom_data.currency).toBe("AED");
    expect(evt.custom_data.value).toBe(150); // fils → AED decimal: 15000 / 100
    expect(evt.custom_data.content_ids).toEqual(["var-1"]);
    expect(evt.custom_data.contents).toEqual([{ id: "var-1", quantity: 2, item_price: 75 }]);
    expect(evt.custom_data.order_id).toBe("order-xyz");
  });

  it("hashes the email per Google/Meta spec (lowercase + trim before sha256)", async () => {
    // The pii-hash.ts helpers already lock this canonicalization, but we
    // re-verify here so a future contract change in pii-hash.ts can't silently
    // break the CAPI payload shape.
    const { fetchImpl, calls } = makeFetchMock(
      () => new Response(JSON.stringify({ events_received: 1 }), { status: 200 }),
    );
    const adapter = new MetaAdapter({ fetchImpl });

    await adapter.uploadConversion(creds, purchasePayload);
    const body = JSON.parse(String(calls[0]!.init!.body));
    // sha256("test@example.com") — same canonicalization as Google's spec.
    expect(body.data[0].user_data.em[0]).toBe(
      "973dfe463ec85785f5f95af5ba3906eedb2d931c24e69824a89ea65dba4e813b",
    );
  });

  it("passes through test_event_code when set on credentials", async () => {
    const { fetchImpl, calls } = makeFetchMock(
      () => new Response(JSON.stringify({ events_received: 1 }), { status: 200 }),
    );
    const adapter = new MetaAdapter({ fetchImpl });

    await adapter.uploadConversion({ ...creds, testEventCode: "TEST12345" }, purchasePayload);

    const body = JSON.parse(String(calls[0]!.init!.body));
    expect(body.test_event_code).toBe("TEST12345");
  });

  it("omits user_data fields when the source value is null/empty", async () => {
    const { fetchImpl, calls } = makeFetchMock(
      () => new Response(JSON.stringify({ events_received: 1 }), { status: 200 }),
    );
    const adapter = new MetaAdapter({ fetchImpl });
    await adapter.uploadConversion(creds, {
      ...purchasePayload,
      customer: {
        email: null,
        phone: null,
        first_name: null,
        last_name: null,
        user_id: null,
      },
    });
    const body = JSON.parse(String(calls[0]!.init!.body));
    // Meta requires at least one user_data field — if all are null we still
    // send the event but with an empty user_data object; the API may reject
    // with low-match-quality warnings but the event is recorded. This matches
    // Google Ads' "no_user_identifiers" throw is intentional for the Ads side;
    // Meta is more forgiving so we don't throw here.
    expect(body.data[0].user_data.em).toBeUndefined();
    expect(body.data[0].user_data.ph).toBeUndefined();
    expect(body.data[0].user_data.fn).toBeUndefined();
    expect(body.data[0].user_data.ln).toBeUndefined();
  });

  it("throws with status + body attached on 4xx", async () => {
    const { fetchImpl } = makeFetchMock(
      () =>
        new Response(JSON.stringify({ error: { message: "bad pixel" } }), {
          status: 400,
        }),
    );
    const adapter = new MetaAdapter({ fetchImpl });

    let thrown: unknown;
    try {
      await adapter.uploadConversion(creds, purchasePayload);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as { status?: number }).status).toBe(400);
  });
});
