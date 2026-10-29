import { AppDataSource, Vendor, VendorTranslation } from "@materialhub/database";
import { HttpError } from "@materialhub/plugins";

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
    Object.assign(vendor, data);
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
