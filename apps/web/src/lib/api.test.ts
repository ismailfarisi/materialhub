import { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { afterEach, describe, expect, test } from "vitest";
import {
  api,
  isInvalidOtpError,
  isSessionGoneError,
  markAuthSessionGuest,
  setAuthSessionHint,
  shouldAttemptAuthRefresh,
  shouldProbeAuthSession,
} from "./api";

describe("shouldAttemptAuthRefresh", () => {
  test("does not refresh public phone auth endpoint failures", () => {
    expect(shouldAttemptAuthRefresh("/auth/phone/start")).toBe(false);
    expect(shouldAttemptAuthRefresh("https://api.materialhubuae.com/auth/phone/start")).toBe(false);
  });

  test("still refreshes protected auth endpoint failures", () => {
    expect(shouldAttemptAuthRefresh("/auth/me")).toBe(true);
  });
});

describe("shouldProbeAuthSession", () => {
  afterEach(() => {
    window.localStorage.clear();
    // jsdom has no cookie expiry helper; overwrite with a past date to clear.
    document.cookie = "web_access_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  });

  test("probes a browser it has never classified", () => {
    // The regression this guards: the access cookie lives 15 minutes but the
    // httpOnly refresh cookie lives 7 days, so a returning user has no access
    // cookie and no hint yet. Treating that as "guest" skips /auth/me, never
    // reaches the refresh interceptor, and silently logs everyone out.
    expect(shouldProbeAuthSession()).toBe(true);
  });

  test("probes when a session was previously recorded", () => {
    setAuthSessionHint();
    expect(shouldProbeAuthSession()).toBe(true);
  });

  test("skips a browser known to be a guest", () => {
    markAuthSessionGuest();
    expect(shouldProbeAuthSession()).toBe(false);
  });

  test("probes a known guest again once an access cookie appears", () => {
    markAuthSessionGuest();
    document.cookie = "web_access_token=abc; path=/";
    expect(shouldProbeAuthSession()).toBe(true);
  });
});

describe("isInvalidOtpError", () => {
  test("is true for a 401 body carrying error code INVALID_OTP", () => {
    expect(isInvalidOtpError({ response: { data: { error: "INVALID_OTP" } } })).toBe(true);
  });

  test("is false for a 401 body carrying a different error code on the same URL", () => {
    expect(isInvalidOtpError({ response: { data: { error: "UNAUTHORIZED" } } })).toBe(false);
  });

  test("is false when the body is missing or not an object", () => {
    expect(isInvalidOtpError({ response: { data: undefined } })).toBe(false);
    expect(isInvalidOtpError({ response: {} })).toBe(false);
    expect(isInvalidOtpError({})).toBe(false);
    expect(isInvalidOtpError(undefined)).toBe(false);
  });
});

describe("guest classification after a failed refresh", () => {
  afterEach(() => {
    window.localStorage.clear();
    api.defaults.adapter = undefined;
  });

  function reply(status: number, data: unknown, config: InternalAxiosRequestConfig) {
    const err = new AxiosError(`HTTP ${status}`, String(status), config, null, {
      status,
      statusText: String(status),
      headers: {},
      config,
      data,
    });
    return Promise.reject(err);
  }

  test("isSessionGoneError: 401/403 and a 400 from /auth/refresh are definitive", () => {
    expect(isSessionGoneError({ response: { status: 401 }, config: { url: "/auth/me" } })).toBe(true);
    expect(isSessionGoneError({ response: { status: 403 }, config: { url: "/auth/me" } })).toBe(true);
    expect(isSessionGoneError({ response: { status: 400 }, config: { url: "/auth/refresh" } })).toBe(true);
    expect(isSessionGoneError({ response: { status: 400 }, config: { url: "/cart" } })).toBe(false);
    expect(isSessionGoneError({ response: { status: 503 }, config: { url: "/auth/refresh" } })).toBe(false);
    expect(isSessionGoneError(new Error("Network Error"))).toBe(false);
  });

  test("a guest whose refresh 400s (no refresh cookie) stops being probed", async () => {
    api.defaults.adapter = (config) =>
      config.url === "/auth/refresh"
        ? reply(400, { code: "MISSING_REFRESH_TOKEN" }, config)
        : reply(401, { code: "UNAUTHORIZED" }, config);
    expect(shouldProbeAuthSession()).toBe(true);
    const err = await api.get("/auth/me").catch((e) => e);
    expect(isSessionGoneError(err)).toBe(true);
    expect(shouldProbeAuthSession()).toBe(false);
  });

  test("a revoked refresh token (401) also marks the browser as a guest", async () => {
    api.defaults.adapter = (config) =>
      reply(401, { code: config.url === "/auth/refresh" ? "TOKEN_REVOKED" : "UNAUTHORIZED" }, config);
    await api.get("/auth/me").catch(() => undefined);
    expect(shouldProbeAuthSession()).toBe(false);
  });

  test("a transient refresh failure (5xx) keeps probing", async () => {
    setAuthSessionHint();
    api.defaults.adapter = (config) =>
      config.url === "/auth/refresh" ? reply(503, {}, config) : reply(401, {}, config);
    await api.get("/auth/me").catch(() => undefined);
    expect(shouldProbeAuthSession()).toBe(true);
  });

  test("a real login (session hint) re-enables probing", () => {
    markAuthSessionGuest();
    setAuthSessionHint();
    expect(shouldProbeAuthSession()).toBe(true);
  });
});
