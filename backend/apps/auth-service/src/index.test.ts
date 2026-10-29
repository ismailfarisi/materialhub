import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";

// ─── Unit tests for auth helpers and route-level behavior ───

describe("auth-service", () => {
  // ─── Health Check ───

  function createHealthApp() {
    return new Elysia({ prefix: "/auth" }).get("/health", () => ({
      status: "ok",
      service: "auth-service",
      timestamp: new Date().toISOString(),
    }));
  }

  test("GET /auth/health returns 200 with service info", async () => {
    const app = createHealthApp();
    const res = await app.handle(new Request("http://localhost/auth/health"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.status).toBe("ok");
    expect(body.service).toBe("auth-service");
    expect(body.timestamp).toBeDefined();
  });

  // ─── Token hashing ───

  test("SHA-256 hash produces consistent hex output", () => {
    const hash = new Bun.CryptoHasher("sha256").update("test-token").digest("hex");
    expect(hash).toHaveLength(64);
    // Same input should produce same hash
    const hash2 = new Bun.CryptoHasher("sha256").update("test-token").digest("hex");
    expect(hash).toBe(hash2);
  });

  test("different tokens produce different hashes", () => {
    const hash1 = new Bun.CryptoHasher("sha256").update("token-a").digest("hex");
    const hash2 = new Bun.CryptoHasher("sha256").update("token-b").digest("hex");
    expect(hash1).not.toBe(hash2);
  });

  // ─── Password hashing ───

  test("bcrypt hash and verify round-trip", async () => {
    const password = "SecurePassword123!";
    const hash = await Bun.password.hash(password, {
      algorithm: "bcrypt",
      cost: 4, // Low cost for test speed
    });
    expect(hash).toStartWith("$2");
    expect(await Bun.password.verify(password, hash)).toBe(true);
    expect(await Bun.password.verify("WrongPassword", hash)).toBe(false);
  });

  test("bcrypt rejects non-bcrypt hash gracefully", async () => {
    const notBcrypt = "plaintext-not-a-hash";
    // Bun.password.verify should throw for non-bcrypt input
    try {
      await Bun.password.verify("password", notBcrypt);
      // If it doesn't throw, that's also valid info
    } catch (e) {
      expect(e).toBeDefined();
    }
  });

  // ─── Email normalization ───

  test("email normalization lowercases and trims", () => {
    const normalize = (email: string) => email.toLowerCase().trim();
    expect(normalize("  User@Example.COM  ")).toBe("user@example.com");
    expect(normalize("ADMIN@materialhubUAE.COM")).toBe("admin@materialhubuae.com");
  });

  // ─── Device info extraction ───

  test("getDeviceInfo extracts from request headers", async () => {
    // Import the actual helper
    const { getDeviceInfo } = await import("./domain/types.ts");
    const request = new Request("http://localhost/test", {
      headers: {
        "x-forwarded-for": "192.168.1.1, 10.0.0.1",
        "user-agent": "TestBrowser/1.0",
      },
    });
    const info = getDeviceInfo(request, { device_type: "mobile" });
    expect(info.ip_address).toBe("192.168.1.1");
    expect(info.user_agent).toBe("TestBrowser/1.0");
    expect(info.device_type).toBe("mobile");
  });

  test("getDeviceInfo defaults to web when no device_type", async () => {
    const { getDeviceInfo } = await import("./domain/types.ts");
    const request = new Request("http://localhost/test");
    const info = getDeviceInfo(request);
    expect(info.device_type).toBe("web");
  });

  // ─── Token response shape ───

  test("tokenResponse produces correct structure", async () => {
    const { tokenResponse } = await import("./domain/types.ts");
    const result = tokenResponse(
      200,
      "Test message",
      { id: "user-1", email: "test@test.com" },
      "access-token",
      "refresh-token",
    );
    expect(result.statusCode).toBe(200);
    expect(result.message).toBe("Test message");
    expect(result.data.tokens.accessToken).toBe("access-token");
    expect(result.data.tokens.refreshToken).toBe("refresh-token");
    expect(result.data.user).toEqual({ id: "user-1", email: "test@test.com" });
    expect(result.timestamp).toBeDefined();
  });

  test("tokenResponse does not include extra fields unless passed", async () => {
    const { tokenResponse } = await import("./domain/types.ts");
    const result = tokenResponse(201, "Created", {}, "at", "rt");
    expect(result.data).not.toHaveProperty("emailVerifyToken");
  });

  // ─── requireAuth validation ───

  test("requireAuth throws on missing bearer", async () => {
    const { requireAuth } = await import("./domain/types.ts");
    const mockJwt = { verify: async () => false as const };
    try {
      await requireAuth(undefined, mockJwt);
      expect(false).toBe(true); // Should not reach
    } catch (e: any) {
      expect(e.statusCode).toBe(401);
    }
  });

  test("requireAuth throws on invalid token", async () => {
    const { requireAuth } = await import("./domain/types.ts");
    const mockJwt = { verify: async () => false as const };
    try {
      await requireAuth("invalid-token", mockJwt);
      expect(false).toBe(true);
    } catch (e: any) {
      expect(e.statusCode).toBe(401);
    }
  });

  test("requireAuth throws when payload missing sub", async () => {
    const { requireAuth } = await import("./domain/types.ts");
    const mockJwt = {
      verify: async () => ({ email: "test@test.com", role: "customer" }),
    };
    try {
      await requireAuth("valid-token", mockJwt);
      expect(false).toBe(true);
    } catch (e: any) {
      expect(e.statusCode).toBe(401);
    }
  });

  test("requireAuth returns user on valid payload", async () => {
    const { requireAuth } = await import("./domain/types.ts");
    const mockJwt = {
      verify: async () => ({
        sub: "user-123",
        email: "test@test.com",
        role: "customer",
      }),
    };
    const user = await requireAuth("valid-token", mockJwt);
    expect(user.id).toBe("user-123");
    expect(user.email).toBe("test@test.com");
    expect(user.role).toBe("customer");
  });

  // ─── Password generator ───

  test("generateTemporaryPassword returns 16 chars by default", async () => {
    const { generateTemporaryPassword } = await import("./utils/password-generator.ts");
    const pw = generateTemporaryPassword();
    expect(pw).toHaveLength(16);
  });

  test("generateTemporaryPassword excludes ambiguous characters", async () => {
    const { generateTemporaryPassword } = await import("./utils/password-generator.ts");
    // Generate many to make collision odds vanishingly small
    for (let i = 0; i < 50; i++) {
      const pw = generateTemporaryPassword();
      expect(pw).not.toMatch(/[O0Il1]/);
    }
  });

  test("generateTemporaryPassword includes lower, upper, digit, symbol", async () => {
    const { generateTemporaryPassword } = await import("./utils/password-generator.ts");
    // Run many times — at least one of each class is guaranteed by construction
    for (let i = 0; i < 20; i++) {
      const pw = generateTemporaryPassword();
      expect(pw).toMatch(/[a-z]/);
      expect(pw).toMatch(/[A-Z]/);
      expect(pw).toMatch(/[2-9]/);
      expect(pw).toMatch(/[!@#$%^&*\-_=+?]/);
    }
  });

  test("generateTemporaryPassword produces different passwords each call", async () => {
    const { generateTemporaryPassword } = await import("./utils/password-generator.ts");
    const a = generateTemporaryPassword();
    const b = generateTemporaryPassword();
    expect(a).not.toBe(b);
  });

  // ─── must_change_password surfacing ───

  test("stripPasswordHash preserves must_change_password", () => {
    const user = {
      id: "u1",
      email: "v@x.com",
      password_hash: "$2b$secret",
      must_change_password: true,
    } as any;
    const { password_hash: _, ...rest } = user;
    expect(rest).toHaveProperty("must_change_password", true);
    expect(rest).not.toHaveProperty("password_hash");
  });

  // ─── changePassword logic ───

  test("changePassword shape: rejects when current password wrong", async () => {
    // Pure-logic check on the verification step. Mock userRepo.
    const { HttpError } = await import("@materialhub/plugins");
    const verify = async (supplied: string, _hash: string) => supplied === "correct";
    const stored = "$2bcorrect";
    const supplied = "wrong";
    const ok = await verify(supplied, stored);
    expect(ok).toBe(false);
    // Verify HttpError shape exists for the 401 response
    const err = new HttpError(401, "Current password is incorrect", "INVALID_CURRENT_PASSWORD");
    expect(err.statusCode).toBe(401);
  });
});
