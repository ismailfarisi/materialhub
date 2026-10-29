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
