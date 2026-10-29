import type { Cart, CartItem } from "@materialhub/database";
// cart-merge.service.ts
import type { Repository } from "typeorm";
import type { CartRedisService } from "./cart-redis.service.ts";
import { computeCartTotals } from "./cart-totals.ts";

export class CartMergeService {
  constructor(
    private cartRepo: Repository<Cart>,
    private cartItemRepo: Repository<CartItem>,
    private redisCart: CartRedisService,
  ) {}

  async mergeGuestToUser(guestSessionId: string, userId: string): Promise<void> {
    const guestCart = await this.cartRepo.findOne({
      where: { guest_session_id: guestSessionId } as any,
    });
    if (!guestCart) return;

    // Get or create user cart
    let userCart = await this.cartRepo.findOne({ where: { user_id: userId } as any });
    if (!userCart) {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);
      userCart = await this.cartRepo.save({
        user_id: userId,
        subtotal: 0,
        item_count: 0,
        expires_at: expiresAt,
      } as any);
    }

    const guestItems = await this.cartItemRepo.find({ where: { cart_id: guestCart.id } });
    const userItems = await this.cartItemRepo.find({ where: { cart_id: userCart!.id } });

    // Build lookup for user items
    const userItemMap = new Map<string, CartItem>();
    for (const item of userItems) {
      userItemMap.set(`${item.product_id}:${item.variant_id || ""}`, item);
    }

    // Merge: higher quantity wins
    for (const guestItem of guestItems) {
      const key = `${guestItem.product_id}:${guestItem.variant_id || ""}`;
      const existing = userItemMap.get(key);

      if (existing) {
        if (guestItem.quantity > existing.quantity) {
          existing.quantity = guestItem.quantity;
          existing.line_total = existing.unit_price * guestItem.quantity;
          await this.cartItemRepo.save(existing);
        }
      } else {
        // Move guest item to user cart
        await this.cartItemRepo.save({
          ...guestItem,
          id: undefined,
          cart_id: userCart!.id,
        } as any);
      }

      // Sync to Redis
      await this.redisCart.setItem(userId, {
        productId: guestItem.product_id,
        variantId: guestItem.variant_id,
        quantity: existing ? Math.max(guestItem.quantity, existing.quantity) : guestItem.quantity,
        unitPrice: guestItem.unit_price,
        vendorId: guestItem.vendor_id,
      });
    }

    // Recalculate user cart totals — the merge inserts rows into
    // cart_items but doesn't touch cart.subtotal / cart.item_count. Checkout's "cart is empty" guard reads
    // cart.item_count, so we must refresh it here or the first
    // post-login checkout fails.
    const mergedItems = await this.cartItemRepo.find({ where: { cart_id: userCart!.id } });
    const { subtotal, itemCount } = computeCartTotals(mergedItems);
    await this.cartRepo.save({
      id: userCart!.id,
      subtotal,
      item_count: itemCount,
    } as any);

    // Remove guest cart + clear guest Redis
    await this.cartRepo.softRemove(guestCart);
    await this.redisCart.clear(guestSessionId);
  }
}
