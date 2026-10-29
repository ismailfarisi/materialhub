import type { BannerListQuery, CreateBannerBody, UpdateBannerBody } from "@materialhub/dto";
import type { BannerService } from "./banner.service.ts";

export class BannerController {
  constructor(private readonly bannerService: BannerService) {}

  async list(query: BannerListQuery) {
    return this.bannerService.list(query);
  }
  async getActive(placement: string, locale?: string) {
    return this.bannerService.getActive(placement, locale);
  }
  async create(data: CreateBannerBody) {
    return this.bannerService.create(data);
  }
  async update(id: string, data: UpdateBannerBody) {
    return this.bannerService.update(id, data);
  }
  async remove(id: string) {
    return this.bannerService.remove(id);
  }
}
