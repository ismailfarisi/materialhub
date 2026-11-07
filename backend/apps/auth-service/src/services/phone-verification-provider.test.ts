import { describe, expect, test } from "bun:test";
import { createPhoneVerificationProvider } from "./phone-verification-provider.ts";

describe("createPhoneVerificationProvider", () => {
  test("creates disabled provider when SMS_OTP_PROVIDER is missing", async () => {
    const provider = createPhoneVerificationProvider({} as NodeJS.ProcessEnv);
    await expect(provider.sendCode("+971501234567")).rejects.toThrow("Phone OTP is not configured");
  });

  test("falls back to disabled (does NOT throw at boot) when Twilio config is incomplete", async () => {
    let provider!: ReturnType<typeof createPhoneVerificationProvider>;
    expect(() => {
      provider = createPhoneVerificationProvider({
        SMS_OTP_PROVIDER: "twilio",
        TWILIO_ACCOUNT_SID: "AC123",
      } as NodeJS.ProcessEnv);
    }).not.toThrow();
    await expect(provider.sendCode("+971501234567")).rejects.toThrow("Phone OTP is not configured");
  });

  test("falls back to disabled when TWILIO_ACCOUNT_SID has a placeholder/invalid format", async () => {
    let provider!: ReturnType<typeof createPhoneVerificationProvider>;
    expect(() => {
      provider = createPhoneVerificationProvider({
        SMS_OTP_PROVIDER: "twilio",
        TWILIO_ACCOUNT_SID: "PLACEHOLDER",
        TWILIO_AUTH_TOKEN: "PLACEHOLDER",
        TWILIO_VERIFY_SERVICE_SID: "PLACEHOLDER",
      } as NodeJS.ProcessEnv);
    }).not.toThrow();
    await expect(provider.sendCode("+971501234567")).rejects.toThrow("Phone OTP is not configured");
  });

  test("falls back to disabled when TWILIO_VERIFY_SERVICE_SID has an invalid format", async () => {
    let provider!: ReturnType<typeof createPhoneVerificationProvider>;
    expect(() => {
      provider = createPhoneVerificationProvider({
        SMS_OTP_PROVIDER: "twilio",
        TWILIO_ACCOUNT_SID: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        TWILIO_AUTH_TOKEN: "sometoken",
        TWILIO_VERIFY_SERVICE_SID: "NOT_A_VERIFY_SID",
      } as NodeJS.ProcessEnv);
    }).not.toThrow();
    await expect(provider.sendCode("+971501234567")).rejects.toThrow("Phone OTP is not configured");
  });

  test("builds a real Twilio provider when config is well-formed", () => {
    expect(() =>
      createPhoneVerificationProvider({
        SMS_OTP_PROVIDER: "twilio",
        TWILIO_ACCOUNT_SID: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        TWILIO_AUTH_TOKEN: "sometoken",
        TWILIO_VERIFY_SERVICE_SID: "VAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });

  test("falls back to disabled (does NOT throw at boot) when WhatsApp config is incomplete", async () => {
    let provider!: ReturnType<typeof createPhoneVerificationProvider>;
    expect(() => {
      provider = createPhoneVerificationProvider({
        SMS_OTP_PROVIDER: "whatsapp",
        WHATSAPP_ACCESS_TOKEN: "token-only-no-phone-number-id",
      } as NodeJS.ProcessEnv);
    }).not.toThrow();
    await expect(provider.sendCode("+971501234567")).rejects.toThrow("Phone OTP is not configured");
  });

  test("builds a real WhatsApp provider when config is well-formed", () => {
    expect(() =>
      createPhoneVerificationProvider({
        SMS_OTP_PROVIDER: "whatsapp",
        WHATSAPP_ACCESS_TOKEN: "token-123",
        WHATSAPP_PHONE_NUMBER_ID: "555000",
      } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });
});

describe("console OTP provider (local development)", () => {
  test("is refused in production", async () => {
    const provider = createPhoneVerificationProvider({
      SMS_OTP_PROVIDER: "console",
      NODE_ENV: "production",
    } as any);
    await expect(provider.sendCode("+971500000000")).rejects.toThrow("Phone OTP is not configured");
  });

  test("is a working provider outside production", () => {
    const provider = createPhoneVerificationProvider({
      SMS_OTP_PROVIDER: "console",
      NODE_ENV: "development",
    } as any);
    expect(provider.constructor.name).toBe("ConsoleOtpProvider");
  });
});
