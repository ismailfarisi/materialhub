import { describe, expect, test } from "bun:test";
import { config } from "./index.ts";

describe("config", () => {
  test("has all required port keys", () => {
    expect(config.port).toHaveProperty("gateway");
    expect(config.port).toHaveProperty("auth");
    expect(config.port).toHaveProperty("product");
    expect(config.port).toHaveProperty("order");
    expect(config.port).toHaveProperty("vendor");
    expect(config.port).toHaveProperty("notification");
  });

  test("ports are numbers", () => {
    for (const [, port] of Object.entries(config.port)) {
      expect(typeof port).toBe("number");
      expect(Number.isNaN(port)).toBe(false);
    }
  });

  test("default ports are in expected range", () => {
    expect(config.port.gateway).toBe(3000);
    expect(config.port.auth).toBe(3001);
    expect(config.port.product).toBe(3002);
    expect(config.port.order).toBe(3003);
    expect(config.port.vendor).toBe(3004);
    expect(config.port.notification).toBe(3005);
  });

  test("has database configuration", () => {
    expect(config.database).toHaveProperty("host");
    expect(config.database).toHaveProperty("port");
    expect(config.database).toHaveProperty("username");
    expect(config.database).toHaveProperty("password");
    expect(config.database).toHaveProperty("database");
  });

  test("database port is a number", () => {
    expect(typeof config.database.port).toBe("number");
  });

  test("has redis configuration", () => {
    expect(config.redis).toHaveProperty("host");
    expect(config.redis).toHaveProperty("port");
  });

  test("has jwt configuration", () => {
    expect(config.jwt).toHaveProperty("accessSecret");
    expect(config.jwt).toHaveProperty("refreshSecret");
    expect(config.jwt).toHaveProperty("accessExpiresIn");
    expect(config.jwt).toHaveProperty("refreshExpiresIn");
    expect(config.jwt.accessExpiresIn).toBe("15m");
    expect(config.jwt.refreshExpiresIn).toBe("7d");
  });

  test("env reads from NODE_ENV", () => {
    // Bun sets NODE_ENV=test during test runs
    expect(config.env).toBe(process.env.NODE_ENV || "development");
  });

  test("jwt secrets have default dev values", () => {
    expect(config.jwt.accessSecret).toBe("dev-access-secret");
    expect(config.jwt.refreshSecret).toBe("dev-refresh-secret");
  });

  // Regression for C1 (Tamara redirect final review): WEB_URL is never set in
  // production, so the Tamara merchant-redirect allowlist must fail safe to
  // the real storefront origins rather than resolving to `[]` — an empty
  // allowlist silently discards every client-supplied redirect URL.
  test("tamara redirect allowlist is never empty, even without WEB_URL set", () => {
    expect(config.tamara.allowedRedirectOrigins.length).toBeGreaterThan(0);
    expect(config.tamara.allowedRedirectOrigins).toContain("https://materialhubuae.com");
    expect(config.tamara.allowedRedirectOrigins).toContain("https://www.materialhubuae.com");
  });

  // Regression for N2 (Tamara redirect final review, round 2): a `||`
  // default before safeOrigin() only covers unset/empty WEB_URL — a
  // SET-but-malformed value (e.g. an operator typing "materialhubuae.com" with no
  // scheme, which is exactly what an operator is likely to type into a
  // secret named WEB_URL/PROD_WEB_URL) is truthy, reaches safeOrigin(),
  // resolves to null, and gets filtered out, silently re-opening the same
  // `[]`-allowlist outage C1 fixed. The fallback must apply AFTER parsing.
  //
  // `config` is a single module-level object evaluated once at import time,
  // so exercising this requires re-importing the module with the env it
  // should read already set (a cache-busting query string forces Bun to
  // re-evaluate rather than return the cached singleton — verified via a
  // throwaway probe test before writing this one). Because the module also
  // eagerly evaluates several requireEnv() production gates unrelated to
  // Tamara, those must be stubbed too so the re-import doesn't throw.
  test("tamara redirect allowlist falls back to canonical origins when WEB_URL/WEB_WWW_URL are malformed in production", async () => {
    const keysToRestore = [
      "NODE_ENV",
      "WEB_URL",
      "WEB_WWW_URL",
      "DB_PASSWORD",
      "JWT_ACCESS_SECRET",
      "JWT_REFRESH_SECRET",
      "TWO_FA_ENCRYPTION_KEY",
      "INTERNAL_SERVICE_SECRET",
      "VENDOR_ENCRYPTION_KEY",
      "ENCRYPTION_KEY",
      "TYPESENSE_API_KEY",
      "VENDOR_DASHBOARD_URL",
      "ADMIN_PANEL_URL",
    ] as const;
    const originalValues = Object.fromEntries(keysToRestore.map((k) => [k, process.env[k]]));

    try {
      process.env.NODE_ENV = "production";
      // Scheme-less: exactly what an operator is likely to paste into the
      // secret. `new URL(...)` throws on these, so safeOrigin() returns null.
      process.env.WEB_URL = "materialhubuae.com";
      process.env.WEB_WWW_URL = "www.materialhubuae.com";
      // Unrelated production-only requireEnv() gates evaluated eagerly at
      // module load — stub so the re-import doesn't throw before we even
      // get to the Tamara allowlist.
      process.env.DB_PASSWORD = "test-db-password";
      process.env.JWT_ACCESS_SECRET = "test-access-secret";
      process.env.JWT_REFRESH_SECRET = "test-refresh-secret";
      process.env.TWO_FA_ENCRYPTION_KEY = "test-2fa-key";
      process.env.INTERNAL_SERVICE_SECRET = "test-internal-secret";
      process.env.VENDOR_ENCRYPTION_KEY = "test-vendor-encryption-key";
      process.env.ENCRYPTION_KEY = "test-encryption-key";
      process.env.TYPESENSE_API_KEY = "test-typesense-key";
      process.env.VENDOR_DASHBOARD_URL = "https://vendor.materialhubuae.com";
      process.env.ADMIN_PANEL_URL = "https://admin.materialhubuae.com";

      const reimported: { config: typeof config } = await import(
        `./index.ts?reimport=${Date.now()}-${Math.random()}`
      );

      expect(reimported.config.isProduction).toBe(true);
      expect(reimported.config.tamara.allowedRedirectOrigins).toContain(
        "https://materialhubuae.com",
      );
      expect(reimported.config.tamara.allowedRedirectOrigins).toContain(
        "https://www.materialhubuae.com",
      );
      // The malformed inputs themselves must not have leaked through as
      // literal origins (that would mean safeOrigin()/the fallback did
      // nothing rather than failing safe).
      expect(reimported.config.tamara.allowedRedirectOrigins).not.toContain("materialhubuae.com");
      expect(reimported.config.tamara.allowedRedirectOrigins).not.toContain(
        "www.materialhubuae.com",
      );
    } finally {
      for (const key of keysToRestore) {
        const original = originalValues[key];
        if (original === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = original;
        }
      }
    }
  });
});
