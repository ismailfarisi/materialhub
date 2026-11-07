import { AppDataSource, Vendor, VendorTranslation } from "@materialhub/database";
import { HttpError } from "@materialhub/plugins";

/** Fields a vendor may change on its own row via PATCH /vendors/me/settings. */
export const SETTINGS_FIELDS = [
  "name",
  "processing_time_days",
  "logo_url",
  "banner_url",
  "description",
  "return_policy",
  "shipping_policy",
  "payout_schedule",
] as const;

export class VendorSettingsService {
  private get vendorRepo() {
    return AppDataSource.getRepository(Vendor);
  }
  private get translationRepo() {
    return AppDataSource.getRepository(VendorTranslation);
  }

  async updateSettings(
    vendorId: string,
    data: Partial<{
      name: string;
      processing_time_days: number;
      logo_url: string;
      banner_url: string;
      description: string;
      return_policy: string;
      shipping_policy: string;
      payout_schedule: string;
    }>,
  ) {
    const vendor = await this.vendorRepo.findOne({ where: { id: vendorId } });
    if (!vendor) throw new HttpError(404, "Vendor not found", "VENDOR_NOT_FOUND");
    const patch: Record<string, unknown> = {};
    for (const key of SETTINGS_FIELDS) {
      if (data[key] !== undefined) patch[key] = data[key];
    }
    if (typeof patch.name === "string") {
      patch.name = patch.name.trim();
      if ((patch.name as string).length < 2) {
        throw new HttpError(400, "Store name must be at least 2 characters", "INVALID_NAME");
      }
    }
    Object.assign(vendor, patch);
    return this.vendorRepo.save(vendor);
  }

  async upsertTranslation(
    vendorId: string,
    locale: string,
    data: {
      name?: string;
      description?: string;
      return_policy?: string;
      shipping_policy?: string;
    },
  ) {
    let translation = await this.translationRepo.findOne({
      where: { vendor_id: vendorId, locale },
    });

    if (translation) {
      Object.assign(translation, data);
    } else {
      translation = this.translationRepo.create({
        vendor_id: vendorId,
        locale,
        ...data,
      });
    }

    return this.translationRepo.save(translation);
  }
}
