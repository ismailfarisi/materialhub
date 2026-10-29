import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { useAuthStore } from "../../stores/auth";
import { clearAuthSession } from "./auth";

// Minimal cookie jar so clearAccessTokenCookie has a `document`/`window` to act
// on outside a browser. Honors `expires` in the past as a delete.
function installCookieJar() {
  const jar = new Map<string, string>();
  const g = globalThis as Record<string, unknown>;
  g.window = { location: { hostname: "localhost" } };
  g.document = {
    get cookie() {
      return Array.from(jar.entries())
        .map(([k, v]) => `${k}=${v}`)
        .join("; ");
    },
    set cookie(str: string) {
      const [pair, ...attrs] = str.split(";").map((s) => s.trim());
      const eq = pair.indexOf("=");
      const name = pair.slice(0, eq);
      const value = pair.slice(eq + 1);
      const expired = attrs.some((a) => {
        const [k, v] = a.split("=");
        return k.toLowerCase() === "expires" && new Date(v).getTime() < Date.now();
      });
      if (expired) jar.delete(name);
      else jar.set(name, value);
    },
  };
}

describe("clearAuthSession", () => {
  beforeEach(() => installCookieJar());
  afterEach(() => {
    const g = globalThis as Record<string, unknown>;
    g.document = undefined;
    g.window = undefined;
  });

  test("clears auth state and cached query data", () => {
    const queryClient = new QueryClient();
    useAuthStore.getState().setUser({
      id: "user-1",
      email: "vendor@example.com",
      first_name: "Vendor",
      last_name: "User",
      role: "customer",
    });
    queryClient.setQueryData(["auth", "me"], { id: "user-1" });

    clearAuthSession(queryClient);

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().user).toBeNull();
    expect(queryClient.getQueryData(["auth", "me"])).toBeUndefined();
  });

  test("deletes the access-token cookie so /auth/me can't re-authenticate", () => {
    document.cookie = "vendor_access_token=stale.jwt.token; path=/";
    expect(document.cookie).toContain("vendor_access_token");

    clearAuthSession(new QueryClient());

    expect(document.cookie).not.toContain("vendor_access_token");
  });
});
