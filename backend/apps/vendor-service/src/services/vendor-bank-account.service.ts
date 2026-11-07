import { AppDataSource, VendorBankAccount } from "@materialhub/database";
import { HttpError } from "@materialhub/plugins";
import type { EncryptionService } from "@materialhub/utils";

const ACCOUNT_NUMBER_RE = /^[A-Za-z0-9]{4,34}$/;
const IBAN_RE = /^[A-Z]{2}[0-9A-Z]{13,32}$/;

/** Strip the spaces people paste; uppercase IBAN letters. */
const compact = (v: string) => v.replace(/\s+/g, "").toUpperCase();

/**
 * Validates bank details without ever echoing them back: error messages name
 * the field, never its value.
 */
export function normalizeBankDetails(data: {
  bankName?: string;
  accountHolderName?: string;
  accountNumber?: string;
  iban?: string;
}) {
  const out: {
    bankName?: string;
    accountHolderName?: string;
    accountNumber?: string;
    iban?: string;
  } = {};
  if (data.bankName !== undefined) {
    out.bankName = data.bankName.trim();
    if (!out.bankName) throw new HttpError(400, "Bank name is required", "INVALID_BANK_NAME");
  }
  if (data.accountHolderName !== undefined) {
    out.accountHolderName = data.accountHolderName.trim();
    if (!out.accountHolderName)
      throw new HttpError(400, "Account holder name is required", "INVALID_ACCOUNT_HOLDER");
  }
  if (data.accountNumber !== undefined) {
    out.accountNumber = compact(data.accountNumber);
    if (!ACCOUNT_NUMBER_RE.test(out.accountNumber))
      throw new HttpError(
        400,
        "Account number must be 4 to 34 letters or digits",
        "INVALID_ACCOUNT_NUMBER",
      );
  }
  if (data.iban !== undefined) {
    out.iban = compact(data.iban);
    if (!IBAN_RE.test(out.iban)) throw new HttpError(400, "IBAN is not valid", "INVALID_IBAN");
  }
  return out;
}

export class VendorBankAccountService {
  constructor(private readonly encryption: EncryptionService) {}

  private get repo() {
    return AppDataSource.getRepository(VendorBankAccount);
  }

  async create(
    vendorId: string,
    input: {
      bankName: string;
      accountHolderName: string;
      accountNumber: string;
      iban: string;
      swiftCode?: string;
      routingNumber?: string;
      currency?: string;
    },
  ) {
    const clean = normalizeBankDetails({
      bankName: input.bankName,
      accountHolderName: input.accountHolderName,
      accountNumber: input.accountNumber,
      iban: input.iban || undefined,
    });
    const data = { ...input, ...clean };
    const existing = await this.repo.find({ where: { vendor_id: vendorId } });
    const isPrimary = existing.length === 0;

    const account = this.repo.create({
      vendor_id: vendorId,
      bank_name: data.bankName,
      account_holder_name: data.accountHolderName,
      account_number_encrypted: this.encryption.encrypt(data.accountNumber),
      iban_encrypted: data.iban ? this.encryption.encrypt(data.iban) : null,
      swift_code: data.swiftCode ?? null,
      routing_number: data.routingNumber ?? null,
      currency: data.currency ?? "AED",
      is_primary: isPrimary,
    });

    return this.toView(await this.repo.save(account));
  }

  async list(vendorId: string) {
    const accounts = await this.repo.find({
      where: { vendor_id: vendorId },
      order: { is_primary: "DESC", created_at: "ASC" },
    });

    return accounts.map((a) => this.toView(a));
  }

  /**
   * The only shape a bank account leaves this service in: account number and
   * IBAN masked to their last 4 characters, ciphertext never included.
   */
  toView(a: VendorBankAccount) {
    return {
      id: a.id,
      bankName: a.bank_name,
      accountHolderName: a.account_holder_name,
      accountNumberMasked: this.safeMask(a.account_number_encrypted),
      ibanMasked: a.iban_encrypted ? this.safeMask(a.iban_encrypted) : null,
      swiftCode: a.swift_code,
      currency: a.currency,
      isPrimary: a.is_primary,
    };
  }

  private safeMask(ciphertext: string): string {
    try {
      return this.encryption.mask(this.encryption.decrypt(ciphertext));
    } catch {
      // Undecryptable (rotated key / corrupt row): never echo the ciphertext.
      return "****";
    }
  }

  async update(
    vendorId: string,
    accountId: string,
    input: Partial<{
      bankName: string;
      accountHolderName: string;
      accountNumber: string;
      iban: string;
      swiftCode: string;
      currency: string;
    }>,
  ) {
    const account = await this.repo.findOne({
      where: { id: accountId, vendor_id: vendorId },
    });
    if (!account) throw new HttpError(404, "Bank account not found", "BANK_ACCOUNT_NOT_FOUND");

    const data = {
      ...input,
      ...normalizeBankDetails({
        bankName: input.bankName,
        accountHolderName: input.accountHolderName,
        accountNumber: input.accountNumber || undefined,
        iban: input.iban || undefined,
      }),
    };
    if (data.bankName) account.bank_name = data.bankName;
    if (data.accountHolderName) account.account_holder_name = data.accountHolderName;
    if (data.accountNumber)
      account.account_number_encrypted = this.encryption.encrypt(data.accountNumber);
    if (data.iban) account.iban_encrypted = this.encryption.encrypt(data.iban);
    if (data.swiftCode !== undefined) account.swift_code = data.swiftCode;
    if (data.currency) account.currency = data.currency;

    return this.toView(await this.repo.save(account));
  }

  async setPrimary(vendorId: string, accountId: string) {
    const account = await this.repo.findOne({
      where: { id: accountId, vendor_id: vendorId },
    });
    if (!account) throw new HttpError(404, "Bank account not found", "BANK_ACCOUNT_NOT_FOUND");

    await AppDataSource.transaction(async (manager) => {
      await manager.update(VendorBankAccount, { vendor_id: vendorId }, { is_primary: false });
      await manager.update(VendorBankAccount, { id: accountId }, { is_primary: true });
    });

    return this.toView({ ...account, is_primary: true } as VendorBankAccount);
  }

  async remove(vendorId: string, accountId: string) {
    const account = await this.repo.findOne({
      where: { id: accountId, vendor_id: vendorId },
    });
    if (!account) throw new HttpError(404, "Bank account not found", "BANK_ACCOUNT_NOT_FOUND");

    const count = await this.repo.count({ where: { vendor_id: vendorId } });
    if (count <= 1) {
      throw new HttpError(422, "Cannot remove last bank account", "LAST_BANK_ACCOUNT");
    }

    const wasPrimary = account.is_primary;
    await this.repo.softRemove(account);

    if (wasPrimary) {
      const oldest = await this.repo.findOne({
        where: { vendor_id: vendorId },
        order: { created_at: "ASC" },
      });
      if (oldest) {
        oldest.is_primary = true;
        await this.repo.save(oldest);
      }
    }
  }
}
