import type { VendorFollowService } from "../services/vendor-follow.service.ts";

export class VendorFollowController {
  constructor(private readonly service: VendorFollowService) {}

  follow(vendorId: string, userId: string) {
    return this.service.follow(vendorId, userId);
  }
  unfollow(vendorId: string, userId: string) {
    return this.service.unfollow(vendorId, userId);
  }
  isFollowing(vendorId: string, userId: string) {
    return this.service.isFollowing(vendorId, userId);
  }
  recentFollowed(userId: string, limit?: number) {
    return this.service.recentFollowed(userId, limit);
  }
}
