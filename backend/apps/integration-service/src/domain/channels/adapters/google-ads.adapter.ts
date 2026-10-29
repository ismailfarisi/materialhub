import { OAuth2Client } from "google-auth-library";
import type { ConversionEventPayload } from "../conversions/conversion-event.ts";
import { hashEmail, hashPhone } from "../conversions/pii-hash.ts";
import type { GoogleAdsCredentials } from "../credentials.ts";

const BASE = "https://googleads.googleapis.com/v17";

export interface GoogleAdsAdapterDeps {
  /** Override for tests. */
  fetchImpl?: typeof fetch;
  /** Override for tests. Bypasses the real OAuth2 refresh-token exchange. */
  oauthFactory?: (creds: GoogleAdsCredentials) => { getAccessToken: () => Promise<string> };
}

/**
 * Google Ads Enhanced Conversions Adjustment uploader.
 *
 * OAuth2 refresh-token → access token, then POSTs a single
 * `conversionAdjustments:upload` request per order. SHA-256-hashed email/phone
 * are sent as `userIdentifiers`; the `transaction_id` Google dedupes against
 * the browser-side `purchase` event is the master `order.id`.
 *
 * https://developers.google.com/google-ads/api/rest/reference/rest/v17/customers.conversionAdjustments/upload
 */
export class GoogleAdsAdapter {
  private readonly fetchImpl: typeof fetch;
  private readonly oauthFactory: NonNullable<GoogleAdsAdapterDeps["oauthFactory"]>;

  constructor(deps: GoogleAdsAdapterDeps = {}) {
    this.fetchImpl = deps.fetchImpl ?? fetch;
    this.oauthFactory =
      deps.oauthFactory ??
      ((creds) => {
        const client = new OAuth2Client({
          clientId: creds.oauthClient.clientId,
          clientSecret: creds.oauthClient.clientSecret,
        });
        client.setCredentials({ refresh_token: creds.oauthClient.refreshToken });
        return {
          getAccessToken: async () => {
            const res = await client.getAccessToken();
            if (!res?.token) throw new Error("google_ads_auth_no_token");
            return res.token;
          },
        };
      });
  }

  /**
   * Upload a single Enhanced Conversions Adjustment for one order.
   *
   * Throws:
   * - `google_ads_no_user_identifiers` when the order has neither email nor
   *   phone — Enhanced Conversions requires at least one PII identifier.
   * - `google_ads_upload_failed {status}` (with `.status` + `.body` attached)
   *   on any non-ok HTTP response.
   */
  async uploadEnhancedConversion(
    creds: GoogleAdsCredentials,
    payload: ConversionEventPayload,
  ): Promise<{ status: number; body: unknown }> {
    const token = await this.oauthFactory(creds).getAccessToken();

    const userIdentifiers: Array<Record<string, unknown>> = [];
    if (payload.customer.email) {
      userIdentifiers.push({ hashedEmail: hashEmail(payload.customer.email) });
    }
    if (payload.customer.phone) {
      userIdentifiers.push({ hashedPhoneNumber: hashPhone(payload.customer.phone) });
    }
    if (userIdentifiers.length === 0) {
      throw new Error("google_ads_no_user_identifiers");
    }

    const conversionActionResource = `customers/${creds.customerId}/conversionActions/${creds.conversionActionId}`;
    const adjustmentDateTime = toGoogleAdsDateTime(payload.occurred_at);

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "developer-token": creds.developerToken,
    };
    if (creds.loginCustomerId) headers["login-customer-id"] = creds.loginCustomerId;

    const body = {
      conversionAdjustments: [
        {
          conversionAction: conversionActionResource,
          adjustmentType: "ENHANCEMENT",
          orderId: payload.order_id,
          adjustmentDateTime,
          userIdentifiers,
          ...(payload.gclid
            ? {
                gclidDateTimePair: {
                  gclid: payload.gclid,
                  conversionDateTime: adjustmentDateTime,
                },
              }
            : {}),
        },
      ],
      partialFailure: false,
      validateOnly: false,
    };

    const res = await this.fetchImpl(
      `${BASE}/customers/${encodeURIComponent(creds.customerId)}/conversionAdjustments:upload`,
      { method: "POST", headers, body: JSON.stringify(body) },
    );
    const resBody = await res.json().catch(() => null);
    if (!res.ok) {
      throw Object.assign(new Error(`google_ads_upload_failed ${res.status}`), {
        status: res.status,
        body: resBody,
      });
    }
    return { status: res.status, body: resBody };
  }
}

/**
 * Google Ads API expects `"YYYY-MM-DD HH:MM:SS+TZ"` (e.g.
 * `"2026-05-23 17:00:00+00:00"`). We emit UTC since `Date#toISOString` is
 * always in UTC.
 */
export function toGoogleAdsDateTime(d: Date): string {
  const iso = d.toISOString(); // "2026-05-23T17:00:00.000Z"
  return iso.replace("T", " ").replace(/\.\d{3}Z$/, "+00:00");
}
