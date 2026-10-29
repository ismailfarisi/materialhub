import { afterEach, describe, expect, test } from "vitest";
import {
  isInvalidOtpError,
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
