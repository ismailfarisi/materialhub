import type { CartMergeService } from "./cart-merge.service.ts";
// cart.controller.ts
import type { CartService } from "./cart.service.ts";

export class CartController {
  constructor(
    private cartService: CartService,
    private cartMergeService: CartMergeService,
  ) {}

  async getCart(userId: string | null, guestSessionId: string | null) {
    return this.cartService.getCart(userId, guestSessionId);
  }

  async addItem(
    userId: string | null,
    guestSessionId: string | null,
    data: { productId: string; variantId: string | null; quantity: number },
  ) {
    return this.cartService.addItem(userId, guestSessionId, data);
  }

  async updateQuantity(
    userId: string | null,
    guestSessionId: string | null,
    fieldKey: string,
    quantity: number,
  ) {
    return this.cartService.updateItemQuantity(userId, guestSessionId, fieldKey, quantity);
  }

  async clear(userId: string | null, guestSessionId: string | null) {
    return this.cartService.clearCart(userId, guestSessionId);
  }

  async mergeGuestCart(guestSessionId: string, userId: string) {
    return this.cartMergeService.mergeGuestToUser(guestSessionId, userId);
  }
}
