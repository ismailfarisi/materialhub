import axios from "axios";
import { getMembershipsFromToken } from "./auth";
import { useActiveVendor } from "../stores/active-vendor";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

function getCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${name}=([^;]*)`),
  );
  return match ? decodeURIComponent(match[1]) : undefined;
}

const COOKIE_ACCESS_TOKEN = "vendor_access_token";

// Delete the access-token cookie client-side on logout. The cookie is set
// httpOnly:false (the request interceptor reads it), and the backend's expiry
// Set-Cookie doesn't always match the original domain/path, so it can linger
// and silently re-authenticate the next /auth/me. Expire it for every scope it
// could have been set on (host-only, current host, and the registrable parent
// domain — e.g. ".materialhubuae.com") so logout actually clears the session.
export function clearAccessTokenCookie(): void {
  if (typeof document === "undefined") return;
  const base = `${COOKIE_ACCESS_TOKEN}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  document.cookie = base;
  const host = typeof window !== "undefined" ? window.location.hostname : "";
  if (host) {
    document.cookie = `${base}; domain=${host}`;
    const parts = host.split(".");
    if (parts.length >= 2) {
      document.cookie = `${base}; domain=.${parts.slice(-2).join(".")}`;
    }
  }
}

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
    "X-Client-App": "vendor",
  },
});

// Attach access token as Bearer header + X-Active-Vendor-Id header
// when the user has 2+ vendor memberships and has chosen one explicitly.
// (For 0 or 1 memberships the backend auto-resolves; the header isn't needed.)
api.interceptors.request.use((config) => {
  const token = getCookie(COOKIE_ACCESS_TOKEN);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  const memberships = getMembershipsFromToken();
  if (memberships.length >= 2) {
    const activeId = useActiveVendor.getState().activeVendorId;
    if (activeId) {
      config.headers["X-Active-Vendor-Id"] = activeId;
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

function processQueue(error: unknown) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve();
  });
  failedQueue = [];
}

// Requests whose 401 is an answer, not an expired access token: refreshing and
// resending them would be wrong (a bad password, a bad 2FA code, logout).
const NO_REFRESH_PATHS = [
  "/auth/refresh",
  "/auth/login",
  "/auth/logout",
  "/auth/2fa/login-verify",
  "/auth/2fa/backup-verify",
  "/auth/change-password",
];

export function isNoRefreshUrl(url: string | undefined): boolean {
  if (!url) return false;
  return NO_REFRESH_PATHS.some((p) => url.includes(p));
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !isNoRefreshUrl(originalRequest.url)
    ) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(() => api(originalRequest));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        await api.post("/auth/refresh", {});
        processQueue(null);
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
