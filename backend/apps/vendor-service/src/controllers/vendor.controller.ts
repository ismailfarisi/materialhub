import { config } from "@materialhub/config";
import { serviceFetch } from "@materialhub/utils/src/service-fetch.ts";
import type { VendorBankAccountService } from "../services/vendor-bank-account.service.ts";
import type { VendorDocumentService } from "../services/vendor-document.service.ts";
import type { VendorSettingsService } from "../services/vendor-settings.service.ts";
import { withTrnStatus } from "../services/vendor.service.ts";
import type { VendorService } from "../services/vendor.service.ts";

export class VendorController {
  constructor(
    private readonly vendorService: VendorService,
    private readonly bankAccountService: VendorBankAccountService,
    private readonly documentService: VendorDocumentService,
    private readonly settingsService: VendorSettingsService,
  ) {}

  async apply(userId: string, body: any) {
    const vendor = await this.vendorService.apply({
      userId,
      businessName: body.business_name,
      businessNameAr: body.business_name_ar,
      businessEmail: body.business_email,
      businessPhone: body.business_phone,
      businessAddress: body.business_address,
      taxRegistrationNumber: body.tax_registration_number,
      documents: body.documents,
      bankAccount: body.bank_account,
    });

    // Create initial bank account
    await this.bankAccountService.create(vendor.id, {
      bankName: body.bank_account.bank_name,
      accountHolderName: body.bank_account.account_holder_name,
      accountNumber: body.bank_account.account_number,
      iban: body.bank_account.iban,
      swiftCode: body.bank_account.swift_code,
      currency: body.bank_account.currency,
    });

    return vendor;
  }

  async getProfile(userId: string) {
    return this.vendorService.findByUserId(userId);
  }

  async getPublicProfile(vendorId: string) {
    return this.vendorService.getPublicProfile(vendorId);
  }

  async getPublicProfileBySlug(slug: string) {
    return this.vendorService.getPublicProfileBySlug(slug);
  }

  async approve(vendorId: string, adminId: string, message?: string) {
    const _vendor = await this.vendorService.transition(vendorId, "under_review");
    const approved = await this.vendorService.transition(vendorId, "approved", adminId);
    // Phase 3b: owner identity is in vendor_members, not on the vendor row.
    const ownerUserId = await this.vendorService.findOwnerUserId(approved.id);
    if (ownerUserId) {
      this.notifyVendor(ownerUserId, "vendor_approved", { vendorName: approved.name, message });
    }
    return approved;
  }

  async reject(vendorId: string, adminId: string, reason: string) {
    const vendor = await this.vendorService.findById(vendorId);
    // Auto-transition to under_review if still pending
    if (vendor.status === "pending") {
      await this.vendorService.transition(vendorId, "under_review");
    }
    const rejected = await this.vendorService.transition(vendorId, "rejected", adminId, reason);
    const ownerUserId = await this.vendorService.findOwnerUserId(rejected.id);
    if (ownerUserId) {
      this.notifyVendor(ownerUserId, "vendor_rejected", { vendorName: rejected.name, reason });
    }
    return rejected;
  }

  async suspend(vendorId: string, adminId: string, reason: string) {
    const suspended = await this.vendorService.transition(vendorId, "suspended", adminId, reason);
    const ownerUserId = await this.vendorService.findOwnerUserId(suspended.id);
    if (ownerUserId) {
      this.notifyVendor(ownerUserId, "vendor_suspended", {
        vendorName: suspended.name,
        reason,
      });
    }
    return suspended;
  }

  async deactivate(userId: string) {
    const vendor = await this.vendorService.findByUserId(userId);
    return this.vendorService.transition(vendor.id, "deactivated");
  }

  async listForAdmin(status?: string, page?: number, limit?: number, search?: string) {
    const result = await this.vendorService.listForAdmin(status, page, limit, search);
    return { ...result, data: (result.data ?? []).map((v) => withTrnStatus(v)) };
  }

  async getById(vendorId: string) {
    return withTrnStatus(await this.vendorService.findById(vendorId));
  }

  async updateTrn(vendorId: string, trn: string | null) {
    return this.vendorService.updateTrn(vendorId, trn);
  }

  async setTrnVerified(vendorId: string, adminId: string, verified: boolean) {
    return this.vendorService.setTrnVerified(vendorId, adminId, verified);
  }

  // Bank accounts
  async createBankAccount(vendorId: string, body: any) {
    return this.bankAccountService.create(vendorId, body);
  }
  async listBankAccounts(vendorId: string) {
    return this.bankAccountService.list(vendorId);
  }
  async updateBankAccount(vendorId: string, accountId: string, body: any) {
    return this.bankAccountService.update(vendorId, accountId, body);
  }
  async removeBankAccount(vendorId: string, accountId: string) {
    return this.bankAccountService.remove(vendorId, accountId);
  }

  // Documents
  async uploadDocument(vendorId: string, type: string, s3Key: string, fileName: string) {
    return this.documentService.upload(vendorId, type, s3Key, fileName);
  }
  async listDocuments(vendorId: string) {
    return this.documentService.list(vendorId);
  }

  // Settings
  async updateSettings(vendorId: string, body: any) {
    return this.settingsService.updateSettings(vendorId, body);
  }

  // Payment connect
  async createConnectedAccount(vendorId: string, returnUrl: string, refreshUrl: string) {
    return this.vendorService.createConnectedAccount(vendorId, returnUrl, refreshUrl);
  }
  async getConnectStatus(vendorId: string) {
    const vendor = await this.vendorService.findById(vendorId);
    return {
      hasConnectedAccount: !!vendor.stripe_account_id,
      chargesEnabled: vendor.charges_enabled ?? false,
      payoutsEnabled: vendor.payouts_enabled ?? false,
      detailsSubmitted: vendor.details_submitted ?? false,
    };
  }
  async handleStripeWebhook(rawBody: string, signature: string) {
    return this.vendorService.handlePaymentWebhook(rawBody, signature);
  }

  async createByAdmin(adminId: string, body: any) {
    const result = await this.vendorService.createByAdmin(adminId, {
      user: {
        firstName: body.user.first_name,
        lastName: body.user.last_name,
        email: body.user.email,
        phone: body.user.phone,
        password: body.user.password,
      },
      vendor: body.vendor,
      documents: body.documents?.map((d: any) => ({
        type: d.type,
        fileUrl: d.file_url,
        fileName: d.file_name,
        fileSize: d.file_size,
        mimeType: d.mime_type,
        expiryDate: d.expiry_date,
      })),
    });

    // Create bank account outside transaction (uses encryption service)
    if (body.bank_account) {
      await this.bankAccountService.create(result.vendor.id, {
        bankName: body.bank_account.bank_name,
        accountHolderName: body.bank_account.account_holder_name,
        accountNumber: body.bank_account.account_number,
        iban: body.bank_account.iban,
        swiftCode: body.bank_account.swift_code,
        routingNumber: body.bank_account.routing_number,
        currency: body.bank_account.currency,
      });
    }

    return result;
  }

  async updateByAdmin(vendorId: string, body: any) {
    return this.vendorService.updateByAdmin(vendorId, body);
  }

  async usePlatformShipping(vendorId: string) {
    return this.vendorService.usePlatformShipping(vendorId);
  }

  async verifyDocument(docId: string, adminId: string) {
    return this.documentService.verify(docId, adminId);
  }

  async rejectDocument(docId: string, reason: string) {
    return this.documentService.reject(docId, reason);
  }

  async updateDocument(
    docId: string,
    body: {
      file_url?: string;
      file_name?: string;
      file_size?: number;
      mime_type?: string;
      expiry_date?: string;
    },
  ) {
    return this.documentService.update(docId, {
      fileUrl: body.file_url,
      fileName: body.file_name,
      fileSize: body.file_size,
      mimeType: body.mime_type,
      expiryDate: body.expiry_date,
    });
  }

  async deleteDocument(docId: string) {
    return this.documentService.delete(docId);
  }

  async uploadDocumentForVendor(vendorId: string, body: any) {
    return this.documentService.upload(vendorId, body.type, body.file_url, body.file_name, {
      expiryDate: body.expiry_date,
      fileSize: body.file_size,
      mimeType: body.mime_type,
    });
  }

  async setPrimaryBankAccount(vendorId: string, accountId: string) {
    return this.bankAccountService.setPrimary(vendorId, accountId);
  }

  // Fire-and-forget notification
  private notifyVendor(userId: string, type: string, data: Record<string, any>) {
    serviceFetch(`${config.internal.notificationServiceUrl}/notifications/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": config.internal.serviceSecret,
      },
      body: JSON.stringify({ user_id: userId, type, channel: "email", data }),
    }).catch(() => {});
  }
}
