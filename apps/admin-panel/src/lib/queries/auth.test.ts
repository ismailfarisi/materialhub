import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, test } from "vitest";
import { useAuthStore } from "../../stores/auth";
import { clearAuthSession } from "./auth";

describe("clearAuthSession", () => {
  beforeEach(() => {
    // Reset jsdom's cookie jar between tests.
    for (const c of document.cookie.split(";")) {
      const name = c.split("=")[0].trim();
      if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    }
  });

  test("clears auth state and cached query data", () => {
    const queryClient = new QueryClient();
    useAuthStore.getState().setUser({
      id: "user-1",
      email: "admin@example.com",
      first_name: "Admin",
      last_name: "User",
      role: "admin",
    });
    queryClient.setQueryData(["auth", "me"], { id: "user-1" });

    clearAuthSession(queryClient);

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().user).toBeNull();
    expect(queryClient.getQueryData(["auth", "me"])).toBeUndefined();
  });

  test("deletes the access-token cookie so /auth/me can't re-authenticate", () => {
    document.cookie = "admin_access_token=stale.jwt.token; path=/";
    expect(document.cookie).toContain("admin_access_token");

    clearAuthSession(new QueryClient());

    expect(document.cookie).not.toContain("admin_access_token");
  });
});

describe("admin role gate", () => {
  test("only admin and super_admin may use the panel", async () => {
    const { isAdminRole } = await import("./auth");
    expect(isAdminRole("admin")).toBe(true);
    expect(isAdminRole("super_admin")).toBe(true);
    expect(isAdminRole("customer")).toBe(false);
    expect(isAdminRole("vendor")).toBe(false);
    expect(isAdminRole(undefined)).toBe(false);
  });

  test("login errors read the no-access message, the API message, then the fallback", async () => {
    const { NoAdminAccessError, loginErrorMessage, NO_ADMIN_ACCESS_MESSAGE } = await import(
      "./auth"
    );
    expect(loginErrorMessage(new NoAdminAccessError(), "x")).toBe(NO_ADMIN_ACCESS_MESSAGE);
    expect(loginErrorMessage({ response: { data: { message: "Bad password" } } }, "x")).toBe(
      "Bad password",
    );
    expect(loginErrorMessage(new Error("boom"), "fallback")).toBe("fallback");
  });

  test("an expired 2FA challenge is detected by its code", async () => {
    const { isExpiredTwoFactorChallenge } = await import("./auth");
    expect(
      isExpiredTwoFactorChallenge({ response: { data: { code: "INVALID_2FA_CHALLENGE" } } }),
    ).toBe(true);
    expect(isExpiredTwoFactorChallenge({ response: { data: { code: "INVALID_2FA_CODE" } } })).toBe(
      false,
    );
  });
});

describe("refresh-retry exclusions", () => {
  test("credential checks never trigger a token refresh", async () => {
    const { isNoRefreshUrl } = await import("../api");
    expect(isNoRefreshUrl("/auth/change-password")).toBe(true);
    expect(isNoRefreshUrl("/auth/2fa/login-verify")).toBe(true);
    expect(isNoRefreshUrl("/auth/2fa/backup-verify")).toBe(true);
    expect(isNoRefreshUrl("/auth/login")).toBe(true);
    expect(isNoRefreshUrl("/auth/me")).toBe(false);
    expect(isNoRefreshUrl("/admin/products")).toBe(false);
  });
});
