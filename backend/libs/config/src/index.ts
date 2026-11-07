function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const env = process.env.NODE_ENV || "development";
const isProduction = env === "production";

export const config = {
  env,
  isProduction,
  port: {
    gateway: Number(process.env.GATEWAY_PORT) || 3000,
    auth: Number(process.env.AUTH_PORT) || 3001,
    product: Number(process.env.PRODUCT_PORT) || 3002,
    order: Number(process.env.ORDER_PORT) || 3003,
    vendor: Number(process.env.VENDOR_PORT) || 3004,
    notification: Number(process.env.NOTIFICATION_PORT) || 3005,
    cms: Number(process.env.CMS_PORT) || 3006,
    integration: Number(process.env.INTEGRATION_PORT) || 3008,
  },
  serviceHost: {
    auth: process.env.AUTH_HOST || "localhost",
    product: process.env.PRODUCT_HOST || "localhost",
    order: process.env.ORDER_HOST || "localhost",
    vendor: process.env.VENDOR_HOST || "localhost",
    notification: process.env.NOTIFICATION_HOST || "localhost",
    cms: process.env.CMS_HOST || "localhost",
    integration: process.env.INTEGRATION_HOST || "localhost",
  },
  /**
   * Base URL of each backend module. In the monolith these origins are served
   * in-process (see `serviceFetch` in @materialhub/utils), so they never hit
   * the network; they only need to be stable and distinct.
   */
  serviceUrl: {
    auth: `http://${process.env.AUTH_HOST || "localhost"}:${Number(process.env.AUTH_PORT) || 3001}`,
    product: `http://${process.env.PRODUCT_HOST || "localhost"}:${Number(process.env.PRODUCT_PORT) || 3002}`,
    order: `http://${process.env.ORDER_HOST || "localhost"}:${Number(process.env.ORDER_PORT) || 3003}`,
    vendor: `http://${process.env.VENDOR_HOST || "localhost"}:${Number(process.env.VENDOR_PORT) || 3004}`,
    notification: `http://${process.env.NOTIFICATION_HOST || "localhost"}:${Number(process.env.NOTIFICATION_PORT) || 3005}`,
    cms: `http://${process.env.CMS_HOST || "localhost"}:${Number(process.env.CMS_PORT) || 3006}`,
    integration: `http://${process.env.INTEGRATION_HOST || "localhost"}:${Number(process.env.INTEGRATION_PORT) || 3008}`,
  },
  database: {
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT) || 5432,
    username: process.env.DB_USERNAME || "materialhub",
    password: isProduction ? requireEnv("DB_PASSWORD") : process.env.DB_PASSWORD || "materialhub",
    database: process.env.DB_NAME || "materialhub",
  },
  redis: {
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: Number(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
  },
  jwt: {
    accessSecret: isProduction
      ? requireEnv("JWT_ACCESS_SECRET")
      : process.env.JWT_ACCESS_SECRET || "dev-access-secret",
    refreshSecret: isProduction
      ? requireEnv("JWT_REFRESH_SECRET")
      : process.env.JWT_REFRESH_SECRET || "dev-refresh-secret",
    accessExpiresIn: "15m",
    refreshExpiresIn: "7d",
  },
  aws: {
    region: process.env.AWS_REGION || "me-south-1",
    // SES identities are region-scoped. The verified materialhubuae.com identity
    // lives in a specific region that may differ from where S3/media run, so
    // SES gets its own region knob. Falls back to AWS_REGION when unset.
    sesRegion: process.env.SES_REGION || process.env.AWS_REGION || "me-south-1",
    // Production uses the EC2 instance IAM role — no static keys. An empty
    // string makes the AWS SDK fall back to the default credential chain
    // (instance metadata). See terraform/production/iam.tf.
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
    // Local dev only: points the S3 client at the `local-s3` docker-compose
    // service instead of AWS. Unset in staging/prod, so the SDK talks to AWS.
    s3Endpoint: process.env.S3_ENDPOINT || "",
  },
  media: {
    s3Bucket: process.env.S3_MEDIA_BUCKET || "materialhub-media-dev",
    cloudfrontDomain: process.env.CLOUDFRONT_DOMAIN || "",
    cloudfrontDistributionId: process.env.CLOUDFRONT_DISTRIBUTION_ID || "",
    maxFileSize: 10 * 1024 * 1024,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"] as readonly string[],
    sizes: { thumb: 150, card: 320, medium: 600, large: 1200 } as const,
  },
  invoice: {
    trn: process.env.PLATFORM_TRN || null,
    legalName: process.env.PLATFORM_LEGAL_NAME || "MaterialHub",
  },
  twoFa: {
    encryptionKey: isProduction
      ? requireEnv("TWO_FA_ENCRYPTION_KEY")
      : process.env.TWO_FA_ENCRYPTION_KEY || "dev-2fa-encryption-key-32bytes!!",
  },
  internal: {
    serviceSecret: isProduction
      ? requireEnv("INTERNAL_SERVICE_SECRET")
      : process.env.INTERNAL_SERVICE_SECRET || "dev-internal-secret",
    notificationServiceUrl:
      process.env.NOTIFICATION_SERVICE_URL ||
      `http://localhost:${Number(process.env.NOTIFICATION_PORT) || 3005}`,
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || "",
    connectWebhookSecret: process.env.STRIPE_CONNECT_WEBHOOK_SECRET || "",
    // Signing secret of the platform PaymentIntent webhook endpoint
    // (POST /webhooks/stripe). Unset → that endpoint fails closed with 503.
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
  },
  tamara: {
    apiToken: process.env.TAMARA_API_TOKEN || "",
    apiBaseUrl: process.env.TAMARA_API_BASE_URL || "https://api-sandbox.tamara.co",
    notificationToken: process.env.TAMARA_NOTIFICATION_TOKEN || "",
    successUrl:
      process.env.TAMARA_SUCCESS_URL ||
      process.env.WEB_URL ||
      "http://localhost:4000/checkout/tamara/success",
    failureUrl:
      process.env.TAMARA_FAILURE_URL ||
      process.env.WEB_URL ||
      "http://localhost:4000/checkout/tamara/failure",
    cancelUrl:
      process.env.TAMARA_CANCEL_URL ||
      process.env.WEB_URL ||
      "http://localhost:4000/checkout/tamara/cancel",
    notificationUrl: process.env.TAMARA_NOTIFICATION_URL || "http://localhost:3003/webhooks/tamara",
    // Origins that a client may supply merchant redirect URLs for. Anything
    // else falls back to the configured URL above — a client-controlled
    // redirect handed to Tamara verbatim is an open redirect, since Tamara
    // sends the customer there off the back of a genuine payment.
    // WEB_URL is read directly rather than via config.bookings.appUrl: that
    // key is booking-scoped, and this is the same env var the *Url fallbacks
    // two lines above already use.
    //
    // WEB_URL/WEB_WWW_URL default to the real storefront hostnames — mirrors
    // api-gateway/src/app.ts's CORS origin fallback
    // (`process.env.WEB_URL || "https://materialhubuae.com"`) in spirit, because
    // WEB_URL is never actually set in the production env (verified against
    // terraform/production/user-data.sh, deploy-prod.yml's SSM PAIRS, and
    // refresh-env-from-ssm.sh before this fix). Without a fallback here the
    // allowlist resolved to `[]` in prod, so every client-supplied redirect
    // URL was silently discarded (resolveMerchantUrl falls back to the
    // static configured URL, which carries no `?order=`) — the whole
    // per-request-redirect feature no-op'd with no error anywhere. See C1 in
    // the Tamara redirect final review.
    //
    // The fallback is applied AFTER safeOrigin(), not via `||` before it
    // (final-review fix N2): a `||` default only covers unset/empty, so a
    // SET-but-malformed value (e.g. an operator typing "materialhubuae.com" with no
    // scheme into WEB_URL/PROD_WEB_URL) is truthy, reaches safeOrigin(),
    // returns null, and gets filtered out below — silently re-opening the
    // exact `[]`-allowlist outage C1 fixed, just via a malformed value
    // instead of an unset one.
    allowedRedirectOrigins: [
      safeOrigin(process.env.WEB_URL) ?? "https://materialhubuae.com",
      safeOrigin(process.env.WEB_WWW_URL) ?? "https://www.materialhubuae.com",
      ...(isProduction ? [] : ["http://localhost:4000", "http://127.0.0.1:4000"]),
    ].filter((origin): origin is string => Boolean(origin)),
    // Non-production only, NEVER in prod: lets Vercel preview deploys (which
    // mint a per-deployment hostname a fixed allowlist can't enumerate) supply
    // a Tamara redirect URL too. Mirrors previewOriginPatterns() in
    // api-gateway/src/app.ts — same env var, same fail-closed-on-malformed-
    // -pattern behavior — deliberately duplicated rather than shared so a typo
    // in one consumer's regex can't affect the other.
    allowedRedirectOriginPatterns: previewRedirectOriginPatterns(),
  },
  whatsapp: {
    // Meta WhatsApp Cloud API. All optional — blank accessToken/phoneNumberId
    // means the channel is disabled and consumers must degrade to stubs
    // (never requireEnv here: a missing WhatsApp secret must not crash the
    // other services that import this config at boot).
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN || "",
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || "",
    apiBaseUrl: process.env.WHATSAPP_API_BASE_URL || "https://graph.facebook.com/v21.0",
    webhookVerifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || "",
    appSecret: process.env.WHATSAPP_APP_SECRET || "",
    templateLanguage: process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en",
  },
  vendor: {
    encryptionKey: isProduction
      ? requireEnv("VENDOR_ENCRYPTION_KEY")
      : process.env.VENDOR_ENCRYPTION_KEY ||
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  },
  encryption: {
    key: isProduction
      ? requireEnv("ENCRYPTION_KEY")
      : process.env.ENCRYPTION_KEY ||
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  },
  bullmq: {
    redisUrl:
      process.env.BULLMQ_REDIS_URL ||
      `redis://${process.env.REDIS_HOST || "localhost"}:${Number(process.env.REDIS_PORT) || 6379}`,
    reservationExpiryIntervalMs: Number(process.env.RESERVATION_EXPIRY_INTERVAL_MS) || 60_000,
    lowStockThresholdDefault: Number(process.env.LOW_STOCK_THRESHOLD_DEFAULT) || 10,
  },
  orders: {
    pendingExpiryMinutes: Number(process.env.ORDER_PENDING_EXPIRY_MINUTES) || 60,
  },
  cache: {
    categoryTreeTtl: Number(process.env.CATEGORY_TREE_CACHE_TTL) || 3600,
    productDetailTtl: Number(process.env.PRODUCT_DETAIL_CACHE_TTL) || 600,
    productListTtl: Number(process.env.PRODUCT_LIST_CACHE_TTL) || 300,
    // Per-staff/day free-window read-model. Short TTL also caps staleness if a
    // holiday write-path invalidation is ever missed (Phase 3 fallback).
  },
  typesense: {
    host: process.env.TYPESENSE_HOST || "127.0.0.1",
    port: Number(process.env.TYPESENSE_PORT) || 8108,
    protocol: process.env.TYPESENSE_PROTOCOL || "http",
    apiKey: isProduction
      ? requireEnv("TYPESENSE_API_KEY")
      : process.env.TYPESENSE_API_KEY || "dev-typesense-key",
    collectionName: process.env.TYPESENSE_COLLECTION || "products",
  },
  google: {
    /** Public API key for Drive v3 files.list. If null, folder URLs in
     *  bulk catalog import fail with drive_api_not_configured. */
    driveApiKey: process.env.GOOGLE_DRIVE_API_KEY || null,
    /** Gemini API key for AI-powered product media features. */
    geminiApiKey: process.env.GOOGLE_GEMINI_API_KEY ?? "",
  },
  urls: {
    vendorDashboard:
      process.env.VENDOR_DASHBOARD_URL ||
      (isProduction ? requireEnv("VENDOR_DASHBOARD_URL") : "http://localhost:4001"),
    adminPanel:
      process.env.ADMIN_PANEL_URL ||
      (isProduction ? requireEnv("ADMIN_PANEL_URL") : "http://localhost:4002"),
    // Public gateway base URL for building absolute links returned to API
    // clients (Phase 6 Task 5's issued .ics feed URL). Mirrors
    // libs/utils/email.service.ts's own `PUBLIC_API_URL` fallback (the
    // gateway's default port, 3000) — same env var, now also readable via
    // config instead of only a raw `process.env` read.
    publicApi: process.env.PUBLIC_API_URL || "http://localhost:3000",
  },
} as const;

export type Config = typeof config;

function safeOrigin(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * Optional extra-origin regex for Tamara redirect validation, non-production
 * only. `new RegExp()` throws on a malformed pattern — fails CLOSED (no extra
 * origin allowed) rather than crash-looping every service that imports
 * `config`, same rationale as previewOriginPatterns() in
 * api-gateway/src/app.ts, which this mirrors.
 */
function previewRedirectOriginPatterns(): RegExp[] {
  if (isProduction) return [];
  const raw = process.env.CORS_PREVIEW_ORIGIN_PATTERN;
  if (!raw) return [];
  try {
    return [new RegExp(raw)];
  } catch (error) {
    console.error(
      `[tamara] Ignoring invalid CORS_PREVIEW_ORIGIN_PATTERN (${raw}): ${
        error instanceof Error ? error.message : String(error)
      }. No preview origins will be allowed for Tamara redirects.`,
    );
    return [];
  }
}
