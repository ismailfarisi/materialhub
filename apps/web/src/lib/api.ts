import axios from "axios";

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

export function getCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${name}=([^;]*)`),
  );
  return match ? decodeURIComponent(match[1]) : undefined;
}

export const COOKIE_ACCESS_TOKEN = "web_access_token";
export const GUEST_SESSION_STORAGE_KEY = "materialhub-guest-session";
const AUTH_HINT_STORAGE_KEY = "materialhub-auth-hint";

/**
 * Whether this browser has a session worth probing with /auth/me.
 *
 * Deliberately tri-state, and an ABSENT hint must mean "probe", not "guest".
 * The readable access cookie lives 15 minutes; the httpOnly refresh cookie
 * lives 7 days and cannot be read from JS. So a returning user routinely has
 * no access cookie and a perfectly good session. Treating absence as guest
 * would skip /auth/me, never reach the refresh interceptor, and silently sign
 * out everyone who hasn't loaded the site in the last 15 minutes.
 *
 * Guests still get the optimization: their first probe 401s, logout() marks
 * them "0", and every page view after that skips the 401/refresh-400 cascade.
 */
export function shouldProbeAuthSession(): boolean {
  if (typeof window === "undefined") return false;
  if (getCookie(COOKIE_ACCESS_TOKEN)) return true;
  return window.localStorage.getItem(AUTH_HINT_STORAGE_KEY) !== "0";
}

/** Record that this browser holds a real session. */
export function setAuthSessionHint(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(AUTH_HINT_STORAGE_KEY, "1");
}

/** Record that this browser is definitively a guest, so we stop probing. */
export function markAuthSessionGuest(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(AUTH_HINT_STORAGE_KEY, "0");
}

export function getGuestSessionToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(GUEST_SESSION_STORAGE_KEY);
}

export function setGuestSessionToken(token: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(GUEST_SESSION_STORAGE_KEY, token);
}

export function clearGuestSessionToken(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(GUEST_SESSION_STORAGE_KEY);
}

let guestSessionBootstrapPromise: Promise<string | null> | null = null;

// Ensures a guest session token is in localStorage before the caller proceeds.
// Returns null for SSR or already-authenticated callers (they don't need one).
// Concurrent callers share a single in-flight POST /auth/guest.
export async function ensureGuestSessionToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  if (getCookie(COOKIE_ACCESS_TOKEN)) return null;
  const existing = getGuestSessionToken();
  if (existing) return existing;
  if (guestSessionBootstrapPromise) return guestSessionBootstrapPromise;
  guestSessionBootstrapPromise = (async () => {
    try {
      const { data } = await api.post("/auth/guest", {});
      const token = data?.data?.session_token;
      if (typeof token === "string" && token.length > 0) {
        setGuestSessionToken(token);
        return token;
      }
      return null;
    } catch {
      return null;
    } finally {
      guestSessionBootstrapPromise = null;
    }
  })();
  return guestSessionBootstrapPromise;
}

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
    "X-Client-App": "web",
  },
});

// Attach access token as Bearer header + guest session + Accept-Language
api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const locale = localStorage.getItem("materialhub-locale") || "en";
    config.headers["Accept-Language"] = locale;
  }
  const token = getCookie(COOKIE_ACCESS_TOKEN);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // Only attach the guest session token when there is NO access-token cookie
  // (i.e. this is a genuinely unauthenticated request). Optional-auth routes
  // (e.g. /support/*) fall back to the guest identity whenever a guest header
  // is present, so a logged-in user must never send one — otherwise an
  // expired-but-still-cookied access token would silently get the user
  // served their guest's (empty) state instead of a 401.
  //
  // Known residual limitation (accepted for Slice 1): because these routes
  // are optional-auth, an expired access token there produces guest/empty
  // results or a 400, not a 401 — so the silent-refresh flow below (which
  // only triggers on 401) won't fire off a support call alone. The cookie
  // still gets refreshed via other, required-auth traffic in the app.
  if (!token) {
    const guestToken = getGuestSessionToken();
    if (guestToken) {
      config.headers["x-guest-session"] = guestToken;
    }
  }
  return config;
});

// Silent token refresh on 401, then redirect if refresh also fails
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: unknown) => void;
  reject: (reason?: unknown) => void;
}> = [];

export function shouldAttemptAuthRefresh(url?: string): boolean {
  if (!url) return true;
  const path = url.startsWith("http") ? new URL(url).pathname : url;
  const publicAuthEndpoints = [
    "/auth/refresh",
    "/auth/login",
    // 2FA login step and password change: a 401 here is about the code or
    // password the user typed, so refreshing and resending would be wrong.
    "/auth/2fa/login-verify",
    "/auth/2fa/backup-verify",
    "/auth/change-password",
    "/auth/register",
    "/auth/phone/start",
    "/auth/phone/verify",
    "/auth/phone/register",
    "/auth/guest",
    "/auth/google",
    "/auth/google/callback",
    "/auth/apple",
    "/auth/apple/callback",
  ];
  return !publicAuthEndpoints.some((endpoint) => path === endpoint || path.startsWith(`${endpoint}?`));
}

// A 401 whose body carries error code INVALID_OTP means "the code you typed
// is wrong" — it is NOT an expired/invalid token. This can only come from
// authenticated OTP-confirmation endpoints (e.g. POST /auth/me/verified-phones/confirm),
// so it can't be filtered out by URL the way /auth/phone/verify is: the same
// endpoint also uses 401 for a genuinely expired session, and blanket-excluding
// its URL would break real token refresh there. Discriminate on the error code
// instead: if we silently refreshed and retried, we'd resubmit the exact same
// wrong code as a second check against the OTP provider (Twilio Verify caps
// check attempts at 5 by default), and the caller would see the refresh
// outcome instead of the original "wrong code" error.
export function isInvalidOtpError(error: unknown): boolean {
  const data = (error as { response?: { data?: unknown } })?.response?.data;
  if (!data || typeof data !== "object") return false;
  return (data as { error?: unknown }).error === "INVALID_OTP";
}

function processQueue(error: unknown) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve();
  });
  failedQueue = [];
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Only attempt refresh on 401, and not on public auth endpoints themselves.
    // Also never refresh+retry a "wrong OTP code" 401 (see isInvalidOtpError) —
    // that would silently resubmit the same wrong code as another provider check.
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      shouldAttemptAuthRefresh(originalRequest.url) &&
      !isInvalidOtpError(error)
    ) {
      if (isRefreshing) {
        // Queue this request until the refresh completes
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(() => api(originalRequest));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        // refresh_token cookie is sent automatically via withCredentials
        await api.post("/auth/refresh", {});
        processQueue(null);
        // Retry the original request — new access_token cookie is now set
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError);
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);
