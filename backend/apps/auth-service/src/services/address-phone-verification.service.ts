import { AppDataSource, User, UserVerifiedPhone } from "@materialhub/database";
import { HttpError } from "@materialhub/plugins";
import { IsNull, type Repository } from "typeorm";
import { type OtpCooldown, createOtpCooldown, redisOtpCooldownStore } from "./otp-cooldown.ts";
import { normalizePhoneForOtp } from "./phone-normalization.ts";
import type { PhoneVerificationProvider } from "./phone-verification-provider.ts";

export interface AddressPhoneVerificationDeps {
  userRepo?: Repository<User>;
  verifiedRepo?: Repository<UserVerifiedPhone>;
  cooldown?: OtpCooldown;
}

export class AddressPhoneVerificationService {
  private userRepo: Repository<User>;
  private verifiedRepo: Repository<UserVerifiedPhone>;
  private cooldown: OtpCooldown;

  constructor(
    private provider: PhoneVerificationProvider,
    deps: AddressPhoneVerificationDeps = {},
  ) {
    this.userRepo = deps.userRepo ?? AppDataSource.getRepository(User);
    this.verifiedRepo = deps.verifiedRepo ?? AppDataSource.getRepository(UserVerifiedPhone);
    this.cooldown = deps.cooldown ?? createOtpCooldown(redisOtpCooldownStore);
  }

  /**
   * A phone is verified for a user when it is their verified login number, or
   * when they have separately proven it by OTP. The login-phone clause is what
   * makes that number usable by default — and why no backfill is needed.
   */
  async isVerified(userId: string, phoneInput: string): Promise<boolean> {
    const phone = normalizePhoneForOtp(phoneInput);

    const user = await this.userRepo.findOne({
      where: { id: userId, deleted_at: IsNull() },
      select: { id: true, phone: true, phone_verified_at: true },
    });
    if (user?.phone && user.phone_verified_at) {
      // users.phone predates normalization, so normalize both sides.
      let loginPhone: string | null = null;
      try {
        loginPhone = normalizePhoneForOtp(user.phone);
      } catch {
        loginPhone = null;
      }
      if (loginPhone === phone) return true;
    }

    const row = await this.verifiedRepo.findOne({ where: { user_id: userId, phone } });
    return row !== null;
  }

  /**
   * isVerified() for many phones at once, keyed by the raw input so callers can
   * look up by the value they already hold. Two queries total rather than two
   * per phone — list() reports exactly the union isVerified() gates on, so a
   * set lookup against it is equivalent, and it drops the repeated re-read of
   * the same users row that the per-address loop performed.
   */
  async isVerifiedBulk(userId: string, phones: string[]): Promise<Map<string, boolean>> {
    const result = new Map<string, boolean>();
    if (phones.length === 0) return result;

    const verified = await this.list(userId);
    const verifiedPhones = new Set(verified.map((v) => v.phone));

    for (const raw of phones) {
      let normalized: string | null = null;
      try {
        normalized = normalizePhoneForOtp(raw);
      } catch {
        // A malformed legacy value simply isn't verified — same as isVerified,
        // which would find no row for it.
        normalized = null;
      }
      result.set(raw, normalized !== null && verifiedPhones.has(normalized));
    }
    return result;
  }

  /** Send an OTP to a number the user wants to use on an address. */
  async start(
    userId: string,
    phoneInput: string,
  ): Promise<{ phone: string; retry_after_seconds: number }> {
    const phone = normalizePhoneForOtp(phoneInput);
    // Cooldown first: a rejected send must not cost an SMS.
    await this.cooldown.check(userId, phone);
    try {
      await this.provider.sendCode(phone);
    } catch (err) {
      // The send never happened (Twilio unset -> 503, or the API is failing),
      // so it must not spend the caller's hourly budget — otherwise five
      // outages in a row lock them out for an hour having received no SMS at
      // all. The 60s per-number cooldown is intentionally NOT refunded; see
      // createOtpCooldown.refund.
      await this.refundQuietly(userId);
      throw err;
    }
    return { phone, retry_after_seconds: 60 };
  }

  /**
   * A refund is best-effort bookkeeping. If it throws it must not replace the
   * real send failure the caller is about to see — that would turn a clean
   * "OTP not configured" 503 into an opaque Redis error.
   */
  private async refundQuietly(userId: string): Promise<void> {
    try {
      await this.cooldown.refund(userId);
    } catch {
      // Swallowed deliberately: worst case the caller keeps the hourly slot
      // they'd have kept anyway before this refund existed.
    }
  }

  async confirm(
    userId: string,
    phoneInput: string,
    code: string,
  ): Promise<{ phone: string; verified_at: Date }> {
    const phone = normalizePhoneForOtp(phoneInput);

    const ok = await this.provider.checkCode(phone, code);
    if (!ok) throw new HttpError(401, "Invalid verification code", "INVALID_OTP");

    const existing = await this.verifiedRepo.findOne({ where: { user_id: userId, phone } });
    if (existing) return { phone, verified_at: existing.verified_at };

    const verified_at = new Date();
    try {
      await this.verifiedRepo.save({ user_id: userId, phone, verified_at } as UserVerifiedPhone);
    } catch (err) {
      // Two concurrent confirms can both pass the findOne check above; the
      // loser hits uq_user_verified_phone (SQLSTATE 23505). Treat that as the
      // idempotent success it actually is rather than surfacing a 500.
      if ((err as { code?: string }).code === "23505") {
        const row = await this.verifiedRepo.findOne({ where: { user_id: userId, phone } });
        if (row) return { phone, verified_at: row.verified_at };
      }
      throw err;
    }
    return { phone, verified_at };
  }

  /**
   * Reports every number the caller may use on an address — which must match
   * the union isVerified() gates on, or the client disables Save for numbers
   * the server would actually accept (the verified login phone chief among
   * them).
   */
  async list(userId: string): Promise<{ phone: string; verified_at: Date }[]> {
    const rows = await this.verifiedRepo.find({
      where: { user_id: userId },
      order: { verified_at: "DESC" },
    });
    const result = rows.map((r) => ({ phone: r.phone, verified_at: r.verified_at }));

    const user = await this.userRepo.findOne({
      where: { id: userId, deleted_at: IsNull() },
      select: { id: true, phone: true, phone_verified_at: true },
    });
    if (user?.phone && user.phone_verified_at) {
      // users.phone predates normalization, so normalize before including it.
      // A malformed legacy value must be omitted, never throw and 400 the list.
      let loginPhone: string | null = null;
      try {
        loginPhone = normalizePhoneForOtp(user.phone);
      } catch {
        loginPhone = null;
      }
      if (loginPhone && !result.some((r) => r.phone === loginPhone)) {
        result.push({ phone: loginPhone, verified_at: user.phone_verified_at });
        result.sort((a, b) => b.verified_at.getTime() - a.verified_at.getTime());
      }
    }

    return result;
  }
}
