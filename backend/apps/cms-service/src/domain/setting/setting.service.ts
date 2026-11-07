import { AppDataSource, SiteSetting } from "@materialhub/database";
import { HttpError } from "@materialhub/plugins";

const PUBLIC_SETTING_KEYS = new Set([
  "platform_currency",
  "default_vat_rate",
  "platform_name",
  "platform_logo_url",
  "platform_support_email",
  "maintenance_mode",
  "min_order_amount",
  "free_shipping_threshold",
]);

export const VALUE_TYPE_VALIDATORS: Record<string, (v: string) => boolean> = {
  string: () => true,
  number: (v) => v.trim() !== "" && Number.isFinite(Number(v)),
  integer: (v) => /^-?\d+$/.test(v.trim()),
  boolean: (v) => v === "true" || v === "false",
  json: (v) => {
    try {
      JSON.parse(v);
      return true;
    } catch {
      return false;
    }
  },
};

export class SettingService {
  private get repo() {
    return AppDataSource.getRepository(SiteSetting);
  }

  async list(group?: string) {
    const where: any = {};
    if (group) where.group = group;
    return this.repo.find({
      where,
      order: { group: "ASC", key: "ASC" },
    });
  }

  async getPublic() {
    const settings = await this.repo.find({ order: { key: "ASC" } });
    return settings.filter((s) => PUBLIC_SETTING_KEYS.has(s.key));
  }

  async update(key: string, value: string, userId: string) {
    const setting = await this.repo.findOne({ where: { key } });
    if (!setting) throw new HttpError(404, "Setting not found", "SETTING_NOT_FOUND");

    const validator = VALUE_TYPE_VALIDATORS[setting.value_type];
    if (validator && !validator(value)) {
      throw new HttpError(400, `Value must be of type ${setting.value_type}`, "INVALID_VALUE_TYPE");
    }

    setting.value = value;
    setting.updated_by = userId;
    return this.repo.save(setting);
  }
}
