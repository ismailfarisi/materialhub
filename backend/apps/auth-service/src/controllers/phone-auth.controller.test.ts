import { describe, expect, test } from "bun:test";
import type { SafeUser } from "../services/phone-auth.service.ts";
import { PhoneAuthController } from "./phone-auth.controller.ts";

describe("PhoneAuthController", () => {
  test("maps existing customer verify to login response", async () => {
    const controller = new PhoneAuthController({
      start: async () => ({ phone: "+971501234567" }),
      verify: async () => ({
        kind: "login",
        user: { id: "user-1", role: "customer" } as unknown as SafeUser,
        refreshToken: "refresh-1",
      }),
      register: async () => ({ user: {} as SafeUser, refreshToken: "refresh-1" }),
    });

    const result = await controller.verify(
      { phone: "+971501234567", code: "123456" },
      {
        device_type: "web",
        ip_address: "127.0.0.1",
      },
    );

    expect(result.requires_registration).toBe(false);
    if (result.requires_registration) throw new Error("Expected login response");
    expect(result.user.id).toBe("user-1");
  });

  test("maps unknown verified phone to registration response", async () => {
    const controller = new PhoneAuthController({
      start: async () => ({ phone: "+971501234567" }),
      verify: async () => ({
        kind: "register",
        phone: "+971501234567",
        registrationToken: "token-1",
      }),
      register: async () => ({ user: {} as SafeUser, refreshToken: "refresh-1" }),
    });

    const result = await controller.verify(
      { phone: "+971501234567", code: "123456" },
      {
        device_type: "web",
        ip_address: "127.0.0.1",
      },
    );

    expect(result.requires_registration).toBe(true);
    expect(result.phone).toBe("+971501234567");
    expect(result.registration_token).toBe("token-1");
  });
});
