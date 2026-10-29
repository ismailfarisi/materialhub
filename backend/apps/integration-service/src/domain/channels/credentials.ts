/**
 * Encrypted-credentials blob shape for the Google sales channel.
 *
 * Phase 1a stored a flat `{ merchantId, serviceAccount }` JSON in
 * `sales_channels.credentials_encrypted`. Phase 1b extends this to nest the
 * Merchant Center creds alongside an optional Google Ads section used by the
 * Enhanced Conversions Adjustment uploader.
 *
 * The `readGoogleChannelCredentials` helper accepts BOTH shapes — legacy flat
 * blobs are promoted to the nested form transparently, so the ops team does
 * not have to re-upload existing channels during the rollout.
 */

export interface GoogleMerchantCenterCredentials {
  merchantId: string;
  serviceAccount: {
    client_email: string;
    private_key: string;
    token_uri?: string;
  };
}

export interface GoogleAdsCredentials {
  developerToken: string;
  /** Customer id without dashes, e.g. "1234567890". */
  customerId: string;
  /** Optional MCC / manager account id (no dashes). */
  loginCustomerId?: string;
  /** Numeric conversion-action id, e.g. "9876543210". */
  conversionActionId: string;
  oauthClient: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
  };
}

export interface GoogleChannelCredentials {
  merchantCenter: GoogleMerchantCenterCredentials;
  googleAds: GoogleAdsCredentials | null;
}

/**
 * Read the encrypted credentials blob, accommodating two shapes:
 *  1. Legacy flat: `{ merchantId, serviceAccount }` (Phase 1a era)
 *  2. Nested:     `{ merchantCenter: {...}, googleAds: {...} | null }` (Phase 1b+)
 *
 * Throws `Error("google_channel_credentials_invalid")` if the blob can't be
 * coerced to either shape.
 */
export function readGoogleChannelCredentials(blob: unknown): GoogleChannelCredentials {
  if (typeof blob !== "object" || blob === null) {
    throw new Error("google_channel_credentials_invalid");
  }
  const obj = blob as Record<string, unknown>;

  // Nested shape (Phase 1b+).
  if ("merchantCenter" in obj) {
    const mc = obj.merchantCenter;
    if (!isMerchantCenterCreds(mc)) {
      throw new Error("google_channel_credentials_invalid");
    }
    const adsRaw = obj.googleAds;
    const googleAds =
      adsRaw === undefined || adsRaw === null
        ? null
        : isGoogleAdsCreds(adsRaw)
          ? adsRaw
          : (() => {
              throw new Error("google_channel_credentials_invalid");
            })();
    return { merchantCenter: mc, googleAds };
  }

  // Legacy flat shape — promote to nested.
  if (isMerchantCenterCreds(obj)) {
    return { merchantCenter: obj, googleAds: null };
  }

  throw new Error("google_channel_credentials_invalid");
}

function isMerchantCenterCreds(value: unknown): value is GoogleMerchantCenterCredentials {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.merchantId !== "string" || v.merchantId.length === 0) return false;
  if (typeof v.serviceAccount !== "object" || v.serviceAccount === null) return false;
  const sa = v.serviceAccount as Record<string, unknown>;
  if (typeof sa.client_email !== "string" || sa.client_email.length === 0) return false;
  if (typeof sa.private_key !== "string" || sa.private_key.length === 0) return false;
  if (sa.token_uri !== undefined && typeof sa.token_uri !== "string") return false;
  return true;
}

function isGoogleAdsCreds(value: unknown): value is GoogleAdsCredentials {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.developerToken !== "string" || v.developerToken.length === 0) return false;
  if (typeof v.customerId !== "string" || v.customerId.length === 0) return false;
  if (v.loginCustomerId !== undefined && typeof v.loginCustomerId !== "string") return false;
  if (typeof v.conversionActionId !== "string" || v.conversionActionId.length === 0) return false;
  if (typeof v.oauthClient !== "object" || v.oauthClient === null) return false;
  const oc = v.oauthClient as Record<string, unknown>;
  if (typeof oc.clientId !== "string" || oc.clientId.length === 0) return false;
  if (typeof oc.clientSecret !== "string" || oc.clientSecret.length === 0) return false;
  if (typeof oc.refreshToken !== "string" || oc.refreshToken.length === 0) return false;
  return true;
}

/**
 * Encrypted-credentials blob shape for the Meta sales channel.
 *
 * Meta is greenfield in Phase 2 — there is no legacy flat shape to migrate
 * from (unlike Google's nested-vs-flat compat helper). The reader does a
 * strict shape check and throws `meta_channel_credentials_invalid` otherwise.
 */
export interface MetaChannelCredentials {
  pixelId: string;
  catalogId: string;
  businessId: string;
  /** Long-lived System User token. Scope: catalog_management, ads_management. */
  accessToken: string;
  /**
   * Optional. When set, CAPI events surface in Meta Events Manager's "Test
   * Events" tab without polluting production diagnostics. Strip in prod.
   */
  testEventCode?: string;
}

export function readMetaChannelCredentials(blob: unknown): MetaChannelCredentials {
  if (typeof blob !== "object" || blob === null) {
    throw new Error("meta_channel_credentials_invalid");
  }
  const v = blob as Record<string, unknown>;
  if (typeof v.pixelId !== "string" || v.pixelId.length === 0) {
    throw new Error("meta_channel_credentials_invalid");
  }
  if (typeof v.catalogId !== "string" || v.catalogId.length === 0) {
    throw new Error("meta_channel_credentials_invalid");
  }
  if (typeof v.businessId !== "string" || v.businessId.length === 0) {
    throw new Error("meta_channel_credentials_invalid");
  }
  if (typeof v.accessToken !== "string" || v.accessToken.length === 0) {
    throw new Error("meta_channel_credentials_invalid");
  }
  if (
    v.testEventCode !== undefined &&
    (typeof v.testEventCode !== "string" || v.testEventCode.length === 0)
  ) {
    throw new Error("meta_channel_credentials_invalid");
  }
  const out: MetaChannelCredentials = {
    pixelId: v.pixelId,
    catalogId: v.catalogId,
    businessId: v.businessId,
    accessToken: v.accessToken,
  };
  if (v.testEventCode !== undefined) out.testEventCode = v.testEventCode as string;
  return out;
}

/**
 * Encrypted-credentials blob shape for the TikTok sales channel.
 *
 * TikTok is greenfield in Phase 3 — no legacy shape to migrate from. The reader
 * does a strict shape check and throws `tiktok_channel_credentials_invalid`
 * otherwise. Unlike Meta, no `businessId` is required — the access token binds
 * to the Business Center scope implicitly.
 */
export interface TiktokChannelCredentials {
  /** 24-char alphanumeric pixel code, e.g. "CXXXXXXXXXXXXXXXXXXXXXXX". */
  pixelCode: string;
  /** Catalog Manager catalog id used for feed pairing. */
  catalogId: string;
  /**
   * Long-lived System User access token. Sent as `Access-Token` header on every
   * Events API call. Scope: Pixel & Events Manager, Catalog Manager.
   */
  accessToken: string;
  /**
   * Optional. When set, Events API events surface in TikTok Events Manager's
   * "Test Events" tab without polluting production diagnostics. Strip in prod.
   * Empty string is rejected (would silently send an empty test code).
   */
  testEventCode?: string;
}

export function readTiktokChannelCredentials(blob: unknown): TiktokChannelCredentials {
  if (typeof blob !== "object" || blob === null) {
    throw new Error("tiktok_channel_credentials_invalid");
  }
  const v = blob as Record<string, unknown>;
  if (typeof v.pixelCode !== "string" || v.pixelCode.length === 0) {
    throw new Error("tiktok_channel_credentials_invalid");
  }
  if (typeof v.catalogId !== "string" || v.catalogId.length === 0) {
    throw new Error("tiktok_channel_credentials_invalid");
  }
  if (typeof v.accessToken !== "string" || v.accessToken.length === 0) {
    throw new Error("tiktok_channel_credentials_invalid");
  }
  if (
    v.testEventCode !== undefined &&
    (typeof v.testEventCode !== "string" || v.testEventCode.length === 0)
  ) {
    throw new Error("tiktok_channel_credentials_invalid");
  }
  const out: TiktokChannelCredentials = {
    pixelCode: v.pixelCode,
    catalogId: v.catalogId,
    accessToken: v.accessToken,
  };
  if (v.testEventCode !== undefined) out.testEventCode = v.testEventCode as string;
  return out;
}
