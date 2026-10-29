import type { SettingService } from "./setting.service.ts";

export class SettingController {
  constructor(private readonly settingService: SettingService) {}

  async list(group?: string) {
    return this.settingService.list(group);
  }
  async getPublic() {
    return this.settingService.getPublic();
  }
  async update(key: string, value: string, userId: string) {
    return this.settingService.update(key, value, userId);
  }
}
