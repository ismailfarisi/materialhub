import type { UserAddress } from "@materialhub/database";
import { HttpError } from "@materialhub/plugins";
// address.service.ts
import type { Repository } from "typeorm";
import { normalizePhoneForOtp } from "./phone-normalization.ts";

export interface PhoneVerifier {
  isVerified(userId: string, phoneInput: string): Promise<boolean>;
}

export interface AddressWriteOptions {
  /** Admin support flows write a number on the customer's behalf; audited. */
  skipPhoneVerification?: boolean;
}

export class AddressService {
  constructor(
    private addressRepo: Repository<UserAddress>,
    private phoneVerifier: PhoneVerifier,
  ) {}

  private async assertPhoneVerified(userId: string, phone: string, opts?: AddressWriteOptions) {
    if (opts?.skipPhoneVerification) return;
    if (await this.phoneVerifier.isVerified(userId, phone)) return;
    throw new HttpError(403, "This phone number has not been verified", "PHONE_NOT_VERIFIED");
  }

  async list(userId: string): Promise<UserAddress[]> {
    return this.addressRepo.find({
      where: { user_id: userId },
      order: { is_default: "DESC", created_at: "DESC" },
    });
  }

  async getById(userId: string, id: string): Promise<UserAddress | null> {
    return this.addressRepo.findOne({ where: { id, user_id: userId } });
  }

  async create(
    userId: string,
    data: Partial<UserAddress>,
    opts?: AddressWriteOptions,
  ): Promise<UserAddress> {
    if (!data.phone) {
      throw new HttpError(400, "Phone number is required", "INVALID_PHONE");
    }
    const phone = normalizePhoneForOtp(data.phone as string);
    await this.assertPhoneVerified(userId, phone, opts);

    // If setting as default, unset other defaults first
    if (data.is_default) {
      await this.addressRepo.update({ user_id: userId, is_default: true }, { is_default: false });
    }

    return this.addressRepo.save({
      ...data,
      phone,
      user_id: userId,
    } as any);
  }

  async update(
    userId: string,
    id: string,
    data: Partial<UserAddress>,
    opts?: AddressWriteOptions,
  ): Promise<UserAddress> {
    const address = await this.addressRepo.findOne({ where: { id, user_id: userId } });
    if (!address) throw new HttpError(404, "Address not found", "ADDRESS_NOT_FOUND");

    // Split phone out of the patch: it's only re-added below when we decide
    // it should actually be written, so an unchanged-and-unnormalizable
    // phone is never included at all (rather than deleted after the fact).
    const { phone: incomingPhone, ...rest } = data;
    const patch: Partial<UserAddress> = { ...rest };

    if (incomingPhone !== undefined) {
      // address.phone predates normalization: live rows can hold values
      // normalizePhoneForOtp rejects (a UAE landline, a number missing its
      // "+"). Normalize BOTH sides defensively (try/catch) before deciding
      // whether the phone changed, so an unchanged malformed value can never
      // throw or get gated -- the incoming value must not be normalized
      // (and therefore must not be able to throw) until we know it changed.
      const incomingRaw = String(incomingPhone).trim();
      const storedRaw = address.phone.trim();

      let incomingNormalized: string | null = null;
      try {
        incomingNormalized = normalizePhoneForOtp(incomingPhone as string);
      } catch {
        incomingNormalized = null;
      }

      let storedNormalized: string | null = null;
      try {
        storedNormalized = normalizePhoneForOtp(address.phone);
      } catch {
        storedNormalized = null;
      }

      // Compare normalized forms when both sides normalize (so "0509999999"
      // and "+971509999999" are recognized as the same number). If either
      // side can't be normalized, fall back to a raw comparison -- a
      // malformed legacy value resubmitted byte-identically still counts as
      // unchanged.
      const changed =
        incomingNormalized !== null && storedNormalized !== null
          ? incomingNormalized !== storedNormalized
          : incomingRaw !== storedRaw;

      if (changed) {
        // A genuinely new number is still validated: INVALID_PHONE for a
        // malformed new value is correct and must be preserved.
        const phone = incomingNormalized ?? normalizePhoneForOtp(incomingPhone as string);
        await this.assertPhoneVerified(userId, phone, opts);
        patch.phone = phone;
      } else if (incomingNormalized !== null) {
        // Unchanged but normalizable: keep persisting the canonical E.164
        // form (matches pre-existing behaviour for well-formed numbers).
        patch.phone = incomingNormalized;
      }
      // else: unchanged and unnormalizable (malformed legacy value resubmitted
      // byte-identically) -- never gate, never throw, and never force it
      // through normalization. `patch` has no phone key at all here, so the
      // stored value is left untouched below.
    }

    // If setting as default, unset other defaults first
    if (patch.is_default) {
      await this.addressRepo.update({ user_id: userId, is_default: true }, { is_default: false });
    }

    Object.assign(address, patch);
    return this.addressRepo.save(address);
  }

  async delete(userId: string, id: string): Promise<void> {
    const address = await this.addressRepo.findOne({ where: { id, user_id: userId } });
    if (!address) throw new HttpError(404, "Address not found", "ADDRESS_NOT_FOUND");
    await this.addressRepo.softRemove(address);
  }
}
