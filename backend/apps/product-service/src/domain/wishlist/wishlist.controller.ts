import type { WishlistService } from "./wishlist.service.ts";

export class WishlistController {
  constructor(private readonly wishlistService: WishlistService) {}

  async toggle(
    productId: string,
    variantId: string | null,
    userId: string | null,
    guestSessionId: string | null,
  ) {
    return this.wishlistService.toggle(productId, variantId, userId, guestSessionId);
  }

  async list(userId: string | null, guestSessionId: string | null, page?: number, limit?: number) {
    return this.wishlistService.list(userId, guestSessionId, page, limit);
  }

  async merge(guestSessionId: string, userId: string) {
    return this.wishlistService.mergeGuestToUser(guestSessionId, userId);
  }
}
