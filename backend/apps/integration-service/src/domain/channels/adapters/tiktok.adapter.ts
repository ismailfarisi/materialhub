import { createHash } from "node:crypto";
import type { ConversionEventPayload } from "../conversions/conversion-event.ts";
import { hashEmail, hashPhone } from "../conversions/pii-hash.ts";
import type { TiktokChannelCredentials } from "../credentials.ts";

const ENDPOINT = "https://business-api.tiktok.com/open_api/v1.3/event/track/";

/**
 * TikTok's name for the Purchase semantic. Mirrored in apps/web's
 * registry.ts buildTikTokChannel — see Task 7 in the Phase 3 plan. If this
 * literal changes, update both places (and the per-file tests pin it).
 */
const TIKTOK_PURCHASE_EVENT = "CompletePayment";

export interface TiktokAdapterDeps {
  /** Override for tests. */
  fetchImpl?: typeof fetch;
}

/**
 * SHA-256 lowercase-hex hash for `external_id`. Email + phone reuse the
 * canonical helpers from `pii-hash.ts` so all channels hash identically.
 * Inlined here (rather than added to `pii-hash.ts`) because `external_id`
 * is TikTok-specific — Meta/Google don't have a matching identifier.
 */
function hashExternalId(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

export class TiktokAdapter {
  private readonly fetchImpl: typeof fetch;

  constructor(deps: TiktokAdapterDeps = {}) {
    this.fetchImpl = deps.fetchImpl ?? fetch;
  }

  /**
   * Events API — fires a single server-side CompletePayment event.
   * `event_id` MUST match the browser-side Pixel `event_id` so TikTok dedupes
   * the pair. Phase 1b's per-order `getOrCreateEventId(order_id)` ensures the
   * browser fires `order.id` as the event_id.
   *
   * SECURITY: `creds.accessToken` is sent as the `Access-Token` HTTP header.
   * Callers MUST NOT log the request headers map. Error bodies attached to
   * thrown errors are safe to log (they don't include the header).
   *
   * https://business-api.tiktok.com/portal/docs?id=1741601162187777
   */
  async uploadConversion(
    creds: TiktokChannelCredentials,
    payload: ConversionEventPayload,
  ): Promise<{ status: number; body: unknown }> {
    const user: Record<string, string[]> = {};
    if (payload.customer.email) {
      user.em = [hashEmail(payload.customer.email)];
    }
    if (payload.customer.phone) {
      user.ph = [hashPhone(payload.customer.phone)];
    }
    if (payload.customer.user_id) {
      user.external_id = [hashExternalId(payload.customer.user_id)];
    }

    const event = {
      event: TIKTOK_PURCHASE_EVENT,
      event_id: payload.order_id,
      event_time: Math.floor(payload.occurred_at.getTime() / 1000),
      user,
      properties: {
        currency: payload.currency,
        value: payload.value_fils / 100,
        contents: payload.items.map((i) => ({
          content_id: i.offer_id,
          content_type: "product",
          quantity: i.quantity,
          price: i.price_fils / 100,
        })),
        content_type: "product",
        order_id: payload.order_id,
      },
      page: { url: payload.event_source_url },
    };

    const body = {
      event_source: "web",
      event_source_id: creds.pixelCode,
      data: [event],
      ...(creds.testEventCode ? { test_event_code: creds.testEventCode } : {}),
    };

    const res = await this.fetchImpl(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Access-Token": creds.accessToken,
      },
      body: JSON.stringify(body),
    });
    const resBody = await res.json().catch(() => null);
    if (!res.ok) {
      // SECURITY: do NOT include the request headers in the thrown error.
      throw Object.assign(new Error(`tiktok_events_api_failed ${res.status}`), {
        status: res.status,
        body: resBody,
      });
    }
    return { status: res.status, body: resBody };
  }
}
