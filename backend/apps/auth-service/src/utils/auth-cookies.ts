import { config } from "@materialhub/config";

const ACCESS_TOKEN_MAX_AGE = 15 * 60; // 15 minutes in seconds
const REFRESH_TOKEN_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds

const VALID_CLIENT_APPS = ["web", "admin", "vendor"] as const;
type ClientApp = (typeof VALID_CLIENT_APPS)[number];

/**
 * Derive cookie names from X-Client-App header.
 * Each frontend app gets its own cookie pair so sessions don't collide
 * when multiple apps run on the same domain (e.g., localhost in dev).
 */
export function getCookieNames(request: Request) {
  const clientApp = request.headers.get("x-client-app")?.toLowerCase() as ClientApp | undefined;

  const prefix = clientApp && VALID_CLIENT_APPS.includes(clientApp) ? `${clientApp}_` : "";

  return {
    accessToken: `${prefix}access_token`,
    refreshToken: `${prefix}refresh_token`,
  };
}

export function setAuthCookies(
  cookie: Record<string, any>,
  accessToken: string,
  refreshToken: string,
  request: Request,
) {
  const names = getCookieNames(request);

  // Auto-detect if we're in production by checking if origin is not localhost
  // This is more reliable than relying on NODE_ENV on platforms like Vercel
  const origin = request.headers.get("origin");
  let cookieDomain: string | undefined;
  let isProduction = config.isProduction;

  if (origin) {
    try {
      const url = new URL(origin);
      const hostname = url.hostname;

      // If hostname is not localhost/127.0.0.1, treat as production
      if (!hostname.includes("localhost") && !hostname.includes("127.0.0.1")) {
        isProduction = true;
        const parts = hostname.split(".");

        // Set domain to root domain with leading dot for shared scoping
        // For: admin.stage.materialhubuae.com → .materialhubuae.com
        // For: materialhubuae.com → .materialhubuae.com
        if (parts.length >= 2) {
          cookieDomain = `.${parts.slice(-2).join(".")}`;
        }
      }
    } catch {
      // Invalid origin, fall back to config
    }
  }

  cookie[names.accessToken].set({
    value: accessToken,
    httpOnly: false,
    secure: isProduction,
    sameSite: "lax",
    maxAge: ACCESS_TOKEN_MAX_AGE,
    path: "/",
    domain: cookieDomain,
  });
  cookie[names.refreshToken].set({
    value: refreshToken,
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    maxAge: REFRESH_TOKEN_MAX_AGE,
    path: "/",
    domain: cookieDomain,
  });
}

export function clearAuthCookies(cookie: Record<string, any>, request: Request) {
  const names = getCookieNames(request);

  // Use the same production detection logic as setAuthCookies
  const origin = request.headers.get("origin");
  let cookieDomain: string | undefined;
  let isProduction = config.isProduction;

  if (origin) {
    try {
      const url = new URL(origin);
      const hostname = url.hostname;

      if (!hostname.includes("localhost") && !hostname.includes("127.0.0.1")) {
        isProduction = true;
        const parts = hostname.split(".");
        if (parts.length >= 2) {
          cookieDomain = `.${parts.slice(-2).join(".")}`;
        }
      }
    } catch {
      // Invalid origin
    }
  }

  cookie[names.accessToken]?.remove({
    domain: cookieDomain,
  });
  cookie[names.refreshToken]?.remove({
    domain: cookieDomain,
  });
}

export function getRefreshTokenFromCookie(
  cookie: Record<string, any>,
  request: Request,
): string | undefined {
  const names = getCookieNames(request);
  return cookie[names.refreshToken]?.value;
}

export function getAccessTokenFromCookie(
  cookie: Record<string, any>,
  request: Request,
): string | undefined {
  const names = getCookieNames(request);
  return cookie[names.accessToken]?.value;
}
