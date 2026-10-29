import { JWT } from "google-auth-library";
import type { GoogleMerchantCenterCredentials } from "../credentials.ts";
import type { FeedItem } from "../feed/feed-item.ts";

// Re-export the canonical type from ../credentials.ts so existing call sites
// (and tests) that import `GoogleMerchantCenterCredentials` from the adapter
// continue to work. Phase 1a's `GoogleMerchantCredentials` was renamed to
// `GoogleMerchantCenterCredentials` and moved into credentials.ts.
export type { GoogleMerchantCenterCredentials } from "../credentials.ts";

export interface GoogleAdapterDeps {
  /** Override for tests. */
  fetchImpl?: typeof fetch;
  /** Override for tests. */
  authFactory?: (creds: GoogleMerchantCenterCredentials) => {
    getAccessToken: () => Promise<string>;
  };
}

const BASE = "https://shoppingcontent.googleapis.com/content/v2.1";
const SCOPE = "https://www.googleapis.com/auth/content";
const CHANNEL = "online";
const FEED_LANG = "en";
const FEED_COUNTRY = "AE";

function productIdFor(offerId: string): string {
  return `${CHANNEL}:${FEED_LANG}:${FEED_COUNTRY}:${offerId}`;
}

function toGoogleProduct(item: FeedItem): Record<string, unknown> {
  const price = (fils: number) => ({
    value: (fils / 100).toFixed(2),
    currency: item.currency,
  });
  const body: Record<string, unknown> = {
    offerId: item.offer_id,
    title: item.title,
    description: item.description,
    link: item.link,
    imageLink: item.image_link,
    contentLanguage: FEED_LANG,
    targetCountry: FEED_COUNTRY,
    channel: CHANNEL,
    availability: item.availability === "in_stock" ? "in stock" : "out of stock",
    condition: item.condition,
    price: price(item.price_fils),
    identifierExists: item.identifier_exists,
  };
  if (item.item_group_id) body.itemGroupId = item.item_group_id;
  if (item.additional_image_links.length > 0) {
    body.additionalImageLinks = item.additional_image_links;
  }
  if (item.sale_price_fils != null) body.salePrice = price(item.sale_price_fils);
  if (item.brand) body.brand = item.brand;
  if (item.gtin) body.gtin = item.gtin;
  if (item.mpn) body.mpn = item.mpn;
  if (item.google_product_category) {
    body.googleProductCategory = item.google_product_category;
  }
  if (item.product_type) body.productTypes = [item.product_type];
  return body;
}

export class GoogleAdapter {
  private readonly fetchImpl: typeof fetch;
  private readonly authFactory: NonNullable<GoogleAdapterDeps["authFactory"]>;

  constructor(deps: GoogleAdapterDeps = {}) {
    this.fetchImpl = deps.fetchImpl ?? fetch;
    this.authFactory =
      deps.authFactory ??
      ((creds) => {
        const client = new JWT({
          email: creds.serviceAccount.client_email,
          key: creds.serviceAccount.private_key,
          scopes: [SCOPE],
        });
        return {
          getAccessToken: async () => {
            const token = await client.getAccessToken();
            if (!token?.token) throw new Error("google_auth_no_token");
            return token.token;
          },
        };
      });
  }

  async upsertProduct(
    creds: GoogleMerchantCenterCredentials,
    item: FeedItem,
  ): Promise<{ status: number; body: unknown }> {
    const token = await this.authFactory(creds).getAccessToken();
    const res = await this.fetchImpl(`${BASE}/${encodeURIComponent(creds.merchantId)}/products`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(toGoogleProduct(item)),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      throw Object.assign(new Error(`google_upsert_failed ${res.status}`), {
        status: res.status,
        body,
      });
    }
    return { status: res.status, body };
  }

  async deleteProduct(
    creds: GoogleMerchantCenterCredentials,
    offerId: string,
  ): Promise<{ status: number }> {
    const token = await this.authFactory(creds).getAccessToken();
    const res = await this.fetchImpl(
      `${BASE}/${encodeURIComponent(creds.merchantId)}/products/${encodeURIComponent(productIdFor(offerId))}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (!res.ok && res.status !== 404) {
      const body = await res.json().catch(() => null);
      throw Object.assign(new Error(`google_delete_failed ${res.status}`), {
        status: res.status,
        body,
      });
    }
    return { status: res.status };
  }
}
