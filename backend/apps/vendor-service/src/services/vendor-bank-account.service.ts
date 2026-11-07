import { AppDataSource, VendorBankAccount } from "@materialhub/database";
import { HttpError } from "@materialhub/plugins";
import type { EncryptionService } from "@materialhub/utils";

export class VendorBankAccountService {
  constructor(private readonly encryption: EncryptionService) {}

  private get repo() {
    return AppDataSource.getRepository(VendorBankAccount);
  }

  async create(
    vendorId: string,
    data: {
      bankName: string;
      accountHolderName: string;
      accountNumber: string;
      iban: string;
      swiftCode?: string;
      routingNumber?: string;
      currency?: string;
    },
  ) {
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
    data: Partial<{
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
