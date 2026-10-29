import { describe, expect, test } from "bun:test";
import { UserRole, UserStatus } from "@materialhub/database";
import { PhoneAuthService } from "./phone-auth.service.ts";
import type { PhoneVerificationProvider } from "./phone-verification-provider.ts";

function provider(valid = true): PhoneVerificationProvider {
  return {
    sendCode: async () => {},
    checkCode: async () => valid,
  };
}

type TestRow = Record<string, unknown> & { id?: string };

function repo<T extends TestRow>(rows: T[] = []) {
  return {
    rows,
    create: (data: Partial<T>) => data as T,
    save: async (entity: T) => {
      if (!entity.id) entity.id = crypto.randomUUID();
      const existing = rows.findIndex((row) => row.id === entity.id);
      if (existing >= 0) rows[existing] = entity;
      else rows.push(entity);
      return entity;
    },
    findOne: async ({ where }: { where: Record<string, unknown> }) => {
      return (
        rows.find((row) =>
          Object.entries(where).every(([key, value]) => {
            if (value && typeof value === "object" && "_type" in value) return row[key] == null;
            return row[key] === value;
          }),
        ) ?? null
      );
    },
  };
}

const deviceInfo = {
  device_type: "web",
  ip_address: "127.0.0.1",
  user_agent: "test-agent",
};

describe("PhoneAuthService", () => {
  test("returns registration token for valid otp on unknown phone", async () => {
    const challengeRepo = repo<Record<string, unknown>>();
    const service = new PhoneAuthService(provider(true), {
      userRepo: repo<Record<string, unknown>>() as never,
      challengeRepo: challengeRepo as never,
      sessionRepo: repo<Record<string, unknown>>() as never,
      hashPassword: async () => "hash",
    });

    const result = await service.verify("+971501234567", "123456", deviceInfo);

    expect(result.kind).toBe("register");
    if (result.kind !== "register") throw new Error("Expected registration result");
    expect(result.phone).toBe("+971501234567");
    expect(typeof result.registrationToken).toBe("string");
    expect(challengeRepo.rows).toHaveLength(1);
  });

  test("rejects invalid otp", async () => {
    const service = new PhoneAuthService(provider(false), {
      userRepo: repo<Record<string, unknown>>() as never,
      challengeRepo: repo<Record<string, unknown>>() as never,
      sessionRepo: repo<Record<string, unknown>>() as never,
      hashPassword: async () => "hash",
    });

    await expect(service.verify("+971501234567", "000000", deviceInfo)).rejects.toThrow(
      "Invalid verification code",
    );
  });

  test("logs in existing customer after valid otp", async () => {
    const userRepo = repo<Record<string, unknown>>([
      {
        id: "user-1",
        email: "buyer@example.com",
        first_name: "Aisha",
        last_name: "Khan",
        phone: "+971501234567",
        role: UserRole.customer,
        status: UserStatus.active,
        password_hash: "secret",
        phone_verified_at: null,
        login_attempts: 4,
        locked_until: new Date(),
      },
    ]);
    const sessionRepo = repo<Record<string, unknown>>();
    const service = new PhoneAuthService(provider(true), {
      userRepo: userRepo as never,
      challengeRepo: repo<Record<string, unknown>>() as never,
      sessionRepo: sessionRepo as never,
      hashPassword: async () => "hash",
    });

    const result = await service.verify("+971501234567", "123456", deviceInfo);

    expect(result.kind).toBe("login");
    if (result.kind === "login") {
      expect(result.user.id).toBe("user-1");
      expect("password_hash" in result.user).toBe(false);
      expect(result.refreshToken).toBeString();
    }
    const savedUser = userRepo.rows[0];
    expect(savedUser).toBeDefined();
    expect(savedUser!.phone_verified_at).toBeInstanceOf(Date);
    expect(savedUser!.login_attempts).toBe(0);
    expect(sessionRepo.rows).toHaveLength(1);
  });
});
