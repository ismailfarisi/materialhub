import { HttpError } from "@materialhub/plugins";
import { WhatsAppService } from "@materialhub/utils";
import twilio from "twilio";
import { type WhatsAppOtpStore, createWhatsAppOtpStore, redisOtpKv } from "./whatsapp-otp-store.ts";

export interface PhoneVerificationProvider {
  sendCode(phone: string): Promise<void>;
  checkCode(phone: string, code: string): Promise<boolean>;
}

class DisabledPhoneVerificationProvider implements PhoneVerificationProvider {
  async sendCode(): Promise<void> {
    throw new HttpError(503, "Phone OTP is not configured", "PHONE_OTP_NOT_CONFIGURED");
  }

  async checkCode(): Promise<boolean> {
    throw new HttpError(503, "Phone OTP is not configured", "PHONE_OTP_NOT_CONFIGURED");
  }
}

class TwilioVerifyProvider implements PhoneVerificationProvider {
  private readonly client: ReturnType<typeof twilio>;

  constructor(
    accountSid: string,
    authToken: string,
    private readonly serviceSid: string,
  ) {
    this.client = twilio(accountSid, authToken);
  }

  async sendCode(phone: string): Promise<void> {
    await this.client.verify.v2.services(this.serviceSid).verifications.create({
      to: phone,
      channel: "sms",
    });
  }

  async checkCode(phone: string, code: string): Promise<boolean> {
    const result = await this.client.verify.v2.services(this.serviceSid).verificationChecks.create({
      to: phone,
      code,
    });
    return result.status === "approved";
  }
}

/**
 * OTP over a Meta WhatsApp authentication template. Meta doesn't run a verify
 * service the way Twilio does, so this provider generates the code itself and
 * checks it against the Redis-backed store (single-use, 5-min TTL, 5-attempt
 * cap). A failed Meta send throws out of sendCode, which lets the caller's
 * otp-cooldown refund logic behave exactly as it does for Twilio.
 */
class WhatsAppOtpProvider implements PhoneVerificationProvider {
  constructor(
    private readonly whatsapp: WhatsAppService,
    private readonly store: WhatsAppOtpStore,
    private readonly otpTemplateName: string,
  ) {}

  async sendCode(phone: string): Promise<void> {
    const code = await this.store.issue(phone);
    await this.whatsapp.sendOtpTemplate(phone, this.otpTemplateName, code);
  }

  async checkCode(phone: string, code: string): Promise<boolean> {
    return this.store.verify(phone, code.trim());
  }
}

export function createPhoneVerificationProvider(
  env: NodeJS.ProcessEnv = process.env,
): PhoneVerificationProvider {
  if (env.SMS_OTP_PROVIDER === "whatsapp") {
    // Same graceful-degradation contract as the Twilio path below: a
    // misconfigured provider must NOT crash auth-service at boot — phone-OTP
    // endpoints 503 while everything else keeps working.
    const accessToken = env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID;
    if (!accessToken || !phoneNumberId) {
      logOtpMisconfig("whatsapp", "missing WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID");
      return new DisabledPhoneVerificationProvider();
    }
    const whatsapp = new WhatsAppService({
      accessToken,
      phoneNumberId,
      apiBaseUrl: env.WHATSAPP_API_BASE_URL || "https://graph.facebook.com/v21.0",
      templateLanguage: env.WHATSAPP_TEMPLATE_LANGUAGE || "en",
    });
    return new WhatsAppOtpProvider(
      whatsapp,
      createWhatsAppOtpStore(redisOtpKv),
      env.WHATSAPP_OTP_TEMPLATE_NAME || "otp_code",
    );
  }

  if (env.SMS_OTP_PROVIDER !== "twilio") {
    return new DisabledPhoneVerificationProvider();
  }

  // A misconfigured Twilio setup must NOT crash the whole auth-service at boot
  // (this provider is constructed at container import time). Degrade gracefully:
  // phone-OTP endpoints return a clean 503, while login/refresh/2FA keep working.
  const accountSid = env.TWILIO_ACCOUNT_SID;
  const authToken = env.TWILIO_AUTH_TOKEN;
  const serviceSid = env.TWILIO_VERIFY_SERVICE_SID;

  if (!accountSid || !authToken || !serviceSid) {
    logOtpMisconfig(
      "twilio",
      "missing TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_VERIFY_SERVICE_SID",
    );
    return new DisabledPhoneVerificationProvider();
  }

  // Validate the SID shapes before handing them to the Twilio SDK, which throws
  // synchronously in its constructor on a malformed accountSid (e.g. a placeholder
  // value that does not start with "AC").
  if (!accountSid.startsWith("AC")) {
    logOtpMisconfig("twilio", "TWILIO_ACCOUNT_SID must start with 'AC'");
    return new DisabledPhoneVerificationProvider();
  }
  if (!serviceSid.startsWith("VA")) {
    logOtpMisconfig("twilio", "TWILIO_VERIFY_SERVICE_SID must start with 'VA'");
    return new DisabledPhoneVerificationProvider();
  }

  return new TwilioVerifyProvider(accountSid, authToken, serviceSid);
}

function logOtpMisconfig(provider: string, reason: string): void {
  console.error(
    `[auth-service] SMS_OTP_PROVIDER=${provider} but its config is invalid (${reason}); phone OTP is disabled until the env is fixed.`,
  );
}
