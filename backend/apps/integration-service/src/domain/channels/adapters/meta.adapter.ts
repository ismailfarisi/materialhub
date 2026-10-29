import type { ConversionEventPayload } from "../conversions/conversion-event.ts";
import { hashEmail, hashName, hashPhone } from "../conversions/pii-hash.ts";
import type { MetaChannelCredentials } from "../credentials.ts";
import type { FeedItem } from "../feed/feed-item.ts";

const BASE = "https://graph.facebook.com/v18.0";
const BATCH_CHUNK = 1000;

export interface MetaBatchRequest {
  method: "UPDATE" | "DELETE";
  retailerId: string;
  /** Required for UPDATE. Ignored for DELETE. */
  item?: FeedItem;
}

export interface MetaAdapterDeps {
  /** Override for tests. */
  fetchImpl?: typeof fetch;
}

function priceWithCurrency(fils: number, currency: string): string {
  return `${(fils / 100).toFixed(2)} ${currency}`;
}

/**
 * Convert one FeedItem to a Meta Catalog Batch API `data` object.
 * Field names mirror Meta's documented Catalog item schema. Where Meta and the
 * Google Merchant feed XML agree, we use the same canonicalization the
 * serializer uses (e.g. `availability: "in stock"`).
 */
function toMetaProduct(item: FeedItem): Record<string, unknown> {
  const body: Record<string, unknown> = {
    id: item.offer_id,
    title: item.title,
    description: item.description,
    link: item.link,
    image_link: item.image_link,
    availability: item.availability === "in_stock" ? "in stock" : "out of stock",
    condition: item.condition,
    price: priceWithCurrency(item.price_fils, item.currency),
  };
  if (item.item_group_id) body.item_group_id = item.item_group_id;
  if (item.additional_image_links.length > 0) {
    body.additional_image_link = item.additional_image_links;
  }
  if (item.sale_price_fils != null) {
    body.sale_price = priceWithCurrency(item.sale_price_fils, item.currency);
  }
  if (item.brand) body.brand = item.brand;
  if (item.gtin) body.gtin = item.gtin;
  if (item.mpn) body.mpn = item.mpn;
  body.identifier_exists = item.identifier_exists ? "YES" : "NO";
  if (item.google_product_category) body.google_product_category = item.google_product_category;
  if (item.product_type) body.product_type = item.product_type;
  return body;
}

export class MetaAdapter {
  private readonly fetchImpl: typeof fetch;

  constructor(deps: MetaAdapterDeps = {}) {
    this.fetchImpl = deps.fetchImpl ?? fetch;
  }

  /**
   * Catalog Batch API. Chunks `requests` to 1000 per HTTP call. Throws on the
   * first chunk that 4xx/5xxs with `.status` + `.body` attached (so the
   * existing circuit-breaker in delta.worker.ts picks it up).
   *
   * SECURITY: `creds.accessToken` is embedded in the request body per Meta's API
   * requirement. Callers MUST NOT log the serialized request body — only the
   * response body (attached to thrown errors as `.body`) is safe to log.
   *
   * https://developers.facebook.com/docs/marketing-api/catalog-batch
   */
  async pushBatch(
    creds: MetaChannelCredentials,
    requests: MetaBatchRequest[],
  ): Promise<{ status: number; body: unknown }> {
    // Explicit no-op when called with an empty array — surface a non-API
    // sentinel rather than a synthetic 200 that callers might log as success.
    if (requests.length === 0) {
      return { status: 204, body: null };
    }
    let lastStatus = 200;
    let lastBody: unknown = null;
    for (let i = 0; i < requests.length; i += BATCH_CHUNK) {
      const chunk = requests.slice(i, i + BATCH_CHUNK);
      const body = {
        access_token: creds.accessToken,
        requests: chunk.map((r) => {
          if (r.method === "DELETE") {
            return { method: "DELETE", retailer_id: r.retailerId };
          }
          if (!r.item) throw new Error("meta_batch_update_missing_item");
          return { method: "UPDATE", retailer_id: r.retailerId, data: toMetaProduct(r.item) };
        }),
      };
      const res = await this.fetchImpl(`${BASE}/${encodeURIComponent(creds.catalogId)}/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const resBody = await res.json().catch(() => null);
      if (!res.ok) {
        throw Object.assign(new Error(`meta_batch_failed ${res.status}`), {
          status: res.status,
          body: resBody,
        });
      }
      lastStatus = res.status;
      lastBody = resBody;
    }
    return { status: lastStatus, body: lastBody };
  }

  /**
   * Conversions API — fires a single server-side event (Purchase only in v1).
   * `event_id` must match the browser-side Pixel `eventID` so Meta dedupes
   * the pair within ~24h. Phase 1b's `getOrCreateEventId(order_id)` ensures
   * the browser fires `order.id` as the eventID.
   *
   * SECURITY: `creds.accessToken` is embedded in the request body per Meta's API
   * requirement. Callers MUST NOT log the serialized request body — only the
   * response body (attached to thrown errors as `.body`) is safe to log.
   *
   * https://developers.facebook.com/docs/marketing-api/conversions-api
   */
  async uploadConversion(
    creds: MetaChannelCredentials,
    payload: ConversionEventPayload,
  ): Promise<{ status: number; body: unknown }> {
    const user_data: Record<string, string[]> = {};
    if (payload.customer.email) user_data.em = [hashEmail(payload.customer.email)];
    if (payload.customer.phone) user_data.ph = [hashPhone(payload.customer.phone)];
    if (payload.customer.first_name) user_data.fn = [hashName(payload.customer.first_name)];
    if (payload.customer.last_name) user_data.ln = [hashName(payload.customer.last_name)];

    const event = {
      event_name: "Purchase",
      event_time: Math.floor(payload.occurred_at.getTime() / 1000),
      event_id: payload.order_id,
      action_source: "website",
      // event_source_url improves Meta's Event Match Quality score. Sourced
      // from the payload so TikTok's Events API (page.url) and Meta CAPI
      // (event_source_url) stay in lockstep — the worker builds it once.
      event_source_url: payload.event_source_url,
      user_data,
      custom_data: {
        currency: payload.currency,
        value: payload.value_fils / 100,
        content_ids: payload.items.map((i) => i.offer_id),
        content_type: "product",
        contents: payload.items.map((i) => ({
          id: i.offer_id,
          quantity: i.quantity,
          item_price: i.price_fils / 100,
        })),
        order_id: payload.order_id,
      },
    };

    const body = {
      data: [event],
      access_token: creds.accessToken,
      ...(creds.testEventCode ? { test_event_code: creds.testEventCode } : {}),
    };

    const res = await this.fetchImpl(`${BASE}/${encodeURIComponent(creds.pixelId)}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const resBody = await res.json().catch(() => null);
    if (!res.ok) {
      throw Object.assign(new Error(`meta_capi_failed ${res.status}`), {
        status: res.status,
        body: resBody,
      });
    }
    return { status: res.status, body: resBody };
  }
}
