import type { Cart, CartItem } from "@materialhub/database";
// cart-merge.service.ts
import type { Repository } from "typeorm";
import type { CartRedisService } from "./cart-redis.service.ts";
import { computeCartTotals } from "./cart-totals.ts";
import { type CartPricingSource, noTradePricing } from "./pricing/cart-pricing.service.ts";
import { resolveLinePrice } from "./pricing/price-resolver.ts";
import { tradeTermsFor } from "./pricing/trade-terms.ts";

export class CartMergeService {
  constructor(
    private cartRepo: Repository<Cart>,
    private cartItemRepo: Repository<CartItem>,
    private redisCart: CartRedisService,
    private pricing: CartPricingSource = noTradePricing,
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
          // Both quantities met the trade terms when added, so the larger one
          // does too; re-price it, since a higher quantity can reach a tier.
          const merged = await this.cartItemRepo.findOne({
            where: { id: existing.id },
            relations: ["product", "variant"],
          });
          // A line from an accepted quote keeps its quoted price (quote > tier > base).
          if (merged?.product && !existing.quote_id) {
            const terms = tradeTermsFor(
              merged.product,
              merged.variant,
              await this.pricing.tiersForProducts([merged.product_id]),
            );
            existing.unit_price = resolveLinePrice({
              basePrice: terms.basePrice,
              tiers: terms.tiers,
              quantity: guestItem.quantity,
            }).unitPrice;
            existing.original_unit_price = existing.unit_price;
          }
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
