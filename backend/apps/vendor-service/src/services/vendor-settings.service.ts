import { AppDataSource, Vendor, VendorHoliday, VendorTranslation } from "@materialhub/database";
import { HttpError } from "@materialhub/plugins";

export class VendorSettingsService {
  private get vendorRepo() {
    return AppDataSource.getRepository(Vendor);
  }
  private get translationRepo() {
    return AppDataSource.getRepository(VendorTranslation);
  }
  private get holidayRepo() {
    return AppDataSource.getRepository(VendorHoliday);
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

  async createHoliday(
    vendorId: string,
    data: {
      name: string;
      starts_at: Date;
      ends_at: Date;
      auto_extend_sla?: boolean;
      notify_customers?: boolean;
    },
  ) {
    if (data.ends_at < data.starts_at) {
      throw new HttpError(400, "End date must be after start date", "INVALID_DATE_RANGE");
    }

    try {
      return await this.holidayRepo.save(this.holidayRepo.create({ vendor_id: vendorId, ...data }));
    } catch (err: any) {
      if (err.code === "23P01") {
        throw new HttpError(409, "Holiday dates overlap with existing holiday", "HOLIDAY_OVERLAP");
      }
      throw err;
    }
  }

  async listHolidays(vendorId: string) {
    return this.holidayRepo.find({
      where: { vendor_id: vendorId },
      order: { starts_at: "ASC" },
    });
  }

  async deleteHoliday(vendorId: string, holidayId: string) {
    const holiday = await this.holidayRepo.findOne({
      where: { id: holidayId, vendor_id: vendorId },
    });
    if (!holiday) throw new HttpError(404, "Holiday not found", "HOLIDAY_NOT_FOUND");
    await this.holidayRepo.softRemove(holiday);
  }
}
