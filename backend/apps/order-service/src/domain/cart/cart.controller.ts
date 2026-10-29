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

  async addGiftBox(
    userId: string | null,
    guestSessionId: string | null,
    data: {
      giftBoxId: string;
      quantity?: number;
      giftMessage?: string | null;
      recipientName?: string | null;
    },
  ) {
    return this.cartService.addGiftBox(userId, guestSessionId, data);
  }

  async removeGiftBox(userId: string | null, guestSessionId: string | null, cartGiftBoxId: string) {
    return this.cartService.removeGiftBox(userId, guestSessionId, cartGiftBoxId);
  }

  async mergeGuestCart(guestSessionId: string, userId: string) {
    return this.cartMergeService.mergeGuestToUser(guestSessionId, userId);
  }

  async setAffiliateCode(
    userId: string | null,
    guestSessionId: string | null,
    code: string | null,
  ) {
    const cart = await this.cartService.getOrCreateCart(userId, guestSessionId);
    await this.cartService.setAffiliateCode(cart.id, code);
  }
}
