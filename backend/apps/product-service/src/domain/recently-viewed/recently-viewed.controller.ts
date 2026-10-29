import type { RecentlyViewedService } from "./recently-viewed.service.ts";

export class RecentlyViewedController {
  constructor(private readonly service: RecentlyViewedService) {}

  async record(productId: string, userId: string | null, guestSessionId: string | null) {
    return this.service.record(productId, userId, guestSessionId);
  }

  async list(userId: string | null, guestSessionId: string | null, limit?: number) {
    return this.service.list(userId, guestSessionId, limit);
  }
}
