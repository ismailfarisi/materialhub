import type {
  Cart,
  CartGiftBox,
  CartItem,
  Inventory,
  Product,
  ProductVariant,
} from "@materialhub/database";
import { BadRequestError, NotFoundError } from "@materialhub/plugins";
// cart.service.ts
import type { Repository } from "typeorm";
import type { FlashDealApplicator } from "../checkout/flash-deal-applicator.service.ts";
import type { CartRedisService } from "./cart-redis.service.ts";
import { computeCartTotals } from "./cart-totals.ts";
import type { GiftBoxCartResolver } from "./gift-box-cart-resolver.service.ts";

export class CartService {
  constructor(
    private cartRepo: Repository<Cart>,
    private cartItemRepo: Repository<CartItem>,
    private inventoryRepo: Repository<Inventory>,
    private productRepo: Repository<Product>,
    private variantRepo: Repository<ProductVariant>,
    private redisCart: CartRedisService,
    private flashDealApplicator: FlashDealApplicator,
    private cartGiftBoxRepo: Repository<CartGiftBox>,
    private giftBoxResolver: GiftBoxCartResolver,
  ) {}

  async addGiftBox(
    userId: string | null,
    guestSessionId: string | null,
    data: {
      giftBoxId: string;
      quantity?: number;
      giftMessage?: string | null;
      recipientName?: string | null;
    },
  ): Promise<CartGiftBox> {
    const cart = await this.getOrCreateCart(userId, guestSessionId);
    const resolved = await this.giftBoxResolver.resolve(data.giftBoxId);

    const row = this.cartGiftBoxRepo.create({
      cart_id: cart.id,
      gift_box_id: resolved.gift_box_id,
      quantity: data.quantity ?? 1,
      unit_price: resolved.unit_price,
      packaging_price: resolved.packaging_price,
      discount_total: resolved.discount_total,
      box_name_snapshot: resolved.box_name_snapshot,
      style_snapshot: resolved.style_snapshot,
      occasion_snapshot: resolved.occasion_snapshot,
      components: resolved.components,
      gift_message: data.giftMessage ?? null,
      recipient_name: data.recipientName ?? null,
    });
    const saved = await this.cartGiftBoxRepo.save(row);

    await this.recalcCartTotals(cart.id);
    return saved;
  }

  async removeGiftBox(
    userId: string | null,
    guestSessionId: string | null,
    cartGiftBoxId: string,
  ): Promise<void> {
    const cart = await this.getOrCreateCart(userId, guestSessionId);
    const row = await this.cartGiftBoxRepo.findOne({
      where: { id: cartGiftBoxId, cart_id: cart.id },
    });
    if (!row) throw new NotFoundError("Gift box not found in cart");

    await this.cartGiftBoxRepo.softRemove(row);
    await this.recalcCartTotals(cart.id);
  }

  /**
   * Owner filter for a cart lookup, or null when the caller has no identity.
   *
   * Never fall back to a bare `{ guest_session_id: null }`: TypeORM drops a
   * null condition, so the query degenerates to "the first cart in the table"
   * and hands the caller a stranger's cart.
   */
  private cartOwnerWhere(
    userId: string | null,
    guestSessionId: string | null,
  ): { user_id: string } | { guest_session_id: string } | null {
    if (userId) return { user_id: userId };
    if (guestSessionId) return { guest_session_id: guestSessionId };
    return null;
  }

  async getOrCreateCart(userId: string | null, guestSessionId: string | null): Promise<Cart> {
    const where = this.cartOwnerWhere(userId, guestSessionId);
    if (!where) {
      throw new BadRequestError("A user session or guest session is required to use the cart");
    }
    let cart = await this.cartRepo.findOne({ where: where as any });
    if (!cart) {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);
      cart = await this.cartRepo.save({
        user_id: userId,
        guest_session_id: guestSessionId,
        subtotal: 0,
        item_count: 0,
        expires_at: expiresAt,
      } as any);
    }
    return cart!;
  }

  private ownerId(userId: string | null, guestSessionId: string | null): string {
    return userId || guestSessionId || "";
  }

  async addItem(
    userId: string | null,
    guestSessionId: string | null,
    data: { productId: string; variantId: string | null; quantity: number },
  ): Promise<CartItem> {
    const cart = await this.getOrCreateCart(userId, guestSessionId);

    // Validate product exists and is published
    const product = await this.productRepo.findOne({ where: { id: data.productId } });
    if (!product || product.status !== "published") {
      throw new BadRequestError("Product not available");
    }

    // Validate stock
    const inventoryWhere: any = { product_id: data.productId, vendor_id: product.vendor_id };
    if (data.variantId) inventoryWhere.variant_id = data.variantId;
    const inventory = await this.inventoryRepo.findOne({ where: inventoryWhere });
    const available = (inventory?.quantity_on_hand ?? 0) - (inventory?.quantity_reserved ?? 0);
    if (available < data.quantity) {
      throw new BadRequestError(`Only ${available} units available`);
    }

    // Check for existing cart item (upsert)
    const existingWhere: any = { cart_id: cart.id, product_id: data.productId };
    if (data.variantId) existingWhere.variant_id = data.variantId;
    let item = await this.cartItemRepo.findOne({ where: existingWhere });

    // Use variant price when adding a variant product
    let unitPrice = product.price;
    if (data.variantId) {
      const variant = await this.variantRepo.findOne({
        where: { id: data.variantId, product_id: data.productId },
      });
      if (!variant) throw new BadRequestError("Variant not found");
      unitPrice = variant.price;
    }

    const deal = await this.flashDealApplicator.resolveForLine(data.productId, data.variantId);
    const finalPrice = deal?.dealPrice ?? unitPrice;
    const dealId = deal?.flashDealId ?? null;
    const originalPrice = deal?.originalPrice ?? unitPrice;

    if (item) {
      item.quantity = data.quantity;
      item.unit_price = finalPrice;
      item.line_total = finalPrice * data.quantity;
      item.flash_deal_id = dealId;
      item.original_unit_price = originalPrice;
    } else {
      item = this.cartItemRepo.create({
        cart_id: cart.id,
        product_id: data.productId,
        variant_id: data.variantId,
        vendor_id: product.vendor_id,
        quantity: data.quantity,
        unit_price: finalPrice,
        original_unit_price: originalPrice,
        flash_deal_id: dealId,
        line_total: finalPrice * data.quantity,
      });
    }
    const saved = await this.cartItemRepo.save(item);

    // Dual-write to Redis
    await this.redisCart.setItem(this.ownerId(userId, guestSessionId), {
      productId: data.productId,
      variantId: data.variantId,
      quantity: data.quantity,
      unitPrice: finalPrice,
      vendorId: product.vendor_id,
      flashDealId: dealId,
      originalUnitPrice: originalPrice,
    });

    await this.recalcCartTotals(cart.id);
    return saved;
  }

  async updateItemQuantity(
    userId: string | null,
    guestSessionId: string | null,
    fieldKey: string,
    quantity: number,
  ): Promise<void> {
    const cart = await this.getOrCreateCart(userId, guestSessionId);
    const item = await this.cartItemRepo.findOne({
      where: [
        { cart_id: cart.id, variant_id: fieldKey },
        { cart_id: cart.id, product_id: fieldKey },
      ] as any,
    });
    if (!item) throw new NotFoundError("Cart item not found");

    if (quantity <= 0) {
      await this.cartItemRepo.softRemove(item);
      await this.redisCart.removeItem(this.ownerId(userId, guestSessionId), fieldKey);
    } else {
      item.quantity = quantity;
      item.line_total = item.unit_price * quantity;
      await this.cartItemRepo.save(item);
      await this.redisCart.setItem(this.ownerId(userId, guestSessionId), {
        productId: item.product_id,
        variantId: item.variant_id,
        quantity,
        unitPrice: item.unit_price,
        vendorId: item.vendor_id,
        flashDealId: item.flash_deal_id,
        originalUnitPrice: item.original_unit_price,
      });
    }

    await this.recalcCartTotals(cart.id);
  }

  async clearCart(userId: string | null, guestSessionId: string | null): Promise<void> {
    const cart = await this.getOrCreateCart(userId, guestSessionId);
    const items = await this.cartItemRepo.find({ where: { cart_id: cart.id } });
    if (items.length > 0) {
      await this.cartItemRepo.softRemove(items);
    }
    const giftBoxes = await this.cartGiftBoxRepo.find({ where: { cart_id: cart.id } });
    if (giftBoxes.length > 0) {
      await this.cartGiftBoxRepo.softRemove(giftBoxes);
    }
    cart.subtotal = 0;
    cart.item_count = 0;
    (cart as any).coupon_id = null;
    (cart as any).coupon_code = null;
    (cart as any).coupon_discount = 0;
    await this.cartRepo.save(cart);
    await this.redisCart.clear(this.ownerId(userId, guestSessionId));
  }

  /** Persist a validated coupon on the cart so quote/order creation pick it up. */
  async setCoupon(
    userId: string | null,
    guestSessionId: string | null,
    coupon: { couponId: string; code: string; discount: number },
  ): Promise<void> {
    const cart = await this.getOrCreateCart(userId, guestSessionId);
    await this.cartRepo.save({
      id: cart.id,
      coupon_id: coupon.couponId,
      coupon_code: coupon.code,
      coupon_discount: coupon.discount,
    } as any);
  }

  async clearCoupon(userId: string | null, guestSessionId: string | null): Promise<void> {
    const cart = await this.getOrCreateCart(userId, guestSessionId);
    await this.cartRepo.save({
      id: cart.id,
      coupon_id: null,
      coupon_code: null,
      coupon_discount: 0,
    } as any);
  }

  async setAffiliateCode(cartId: string, code: string | null): Promise<void> {
    await this.cartRepo.update({ id: cartId }, { affiliate_code: code });
  }

  async getCart(
    userId: string | null,
    guestSessionId: string | null,
  ): Promise<{
    cart: Cart | null;
    items: any[];
    giftBoxes: CartGiftBox[];
    staleItems: string[];
    notifications: Array<{
      type: "deal_ended" | "deal_updated";
      product_id: string;
      variant_id: string | null;
      product_name: string;
      was: number;
      now: number;
    }>;
  }> {
    // A caller with no identity (e.g. a first-paint visitor whose guest session
    // is still being bootstrapped) owns no cart. Answer with an empty view
    // rather than creating an ownerless row or matching an arbitrary one.
    if (!userId && !guestSessionId) {
      return { cart: null, items: [], giftBoxes: [], staleItems: [], notifications: [] };
    }

    const cart = await this.getOrCreateCart(userId, guestSessionId);
    const items = await this.cartItemRepo.find({
      where: { cart_id: cart.id },
      relations: ["product", "product.images", "variant", "vendor"],
    });

    const notifications: Array<{
      type: "deal_ended" | "deal_updated";
      product_id: string;
      variant_id: string | null;
      product_name: string;
      was: number;
      now: number;
    }> = [];

    // Re-resolve flash-deal state for items that had a deal applied
    const updatesNeeded: CartItem[] = [];
    for (const item of items) {
      if (!item.flash_deal_id) continue;
      const live = await this.flashDealApplicator.resolveForLine(item.product_id, item.variant_id);

      if (live && live.flashDealId === item.flash_deal_id) continue; // unchanged

      const wasPrice = item.unit_price;
      if (live) {
        // Different deal id — admin replaced the deal. Snap to new deal.
        item.unit_price = live.dealPrice;
        item.flash_deal_id = live.flashDealId;
        item.line_total = live.dealPrice * item.quantity;
        notifications.push({
          type: "deal_updated",
          product_id: item.product_id,
          variant_id: item.variant_id,
          product_name: item.product?.name ?? "",
          was: wasPrice,
          now: live.dealPrice,
        });
      } else {
        // No active deal — snap back to original.
        const fallback = item.original_unit_price ?? item.unit_price;
        item.unit_price = fallback;
        item.flash_deal_id = null;
        item.line_total = fallback * item.quantity;
        notifications.push({
          type: "deal_ended",
          product_id: item.product_id,
          variant_id: item.variant_id,
          product_name: item.product?.name ?? "",
          was: wasPrice,
          now: fallback,
        });
      }
      updatesNeeded.push(item);
    }

    if (updatesNeeded.length > 0) {
      await this.cartItemRepo.save(updatesNeeded);
      await this.recalcCartTotals(cart.id);
      const refreshed = await this.cartRepo.findOne({ where: { id: cart.id } });
      if (refreshed) Object.assign(cart, refreshed);
    }

    // Stale-price detection — only flag rows that are NOT under an active deal.
    // Deal-priced items legitimately have unit_price ≠ product.price.
    const staleItems: string[] = [];
    for (const item of items) {
      if (item.flash_deal_id) continue;
      if (item.product) {
        const livePrice = item.variant?.price ?? item.product.price;
        if (livePrice !== item.unit_price) {
          staleItems.push(item.id);
        }
      }
    }

    // Group by vendor
    const grouped = items.reduce((acc: Record<string, any[]>, item) => {
      const vid = item.vendor_id;
      if (!acc[vid]) acc[vid] = [];
      acc[vid].push(item);
      return acc;
    }, {});

    const giftBoxes = await this.cartGiftBoxRepo.find({ where: { cart_id: cart.id } });

    return {
      cart,
      items: Object.entries(grouped).map(([vendorId, vendorItems]) => ({
        vendor_id: vendorId,
        vendor_name: (vendorItems[0] as any).vendor?.name,
        items: vendorItems,
      })),
      giftBoxes,
      staleItems,
      notifications,
    };
  }

  private async recalcCartTotals(cartId: string): Promise<void> {
    const items = await this.cartItemRepo.find({ where: { cart_id: cartId } });
    const giftBoxes = await this.cartGiftBoxRepo.find({ where: { cart_id: cartId } });
    const { subtotal, itemCount } = computeCartTotals(items, giftBoxes);
    await this.cartRepo.save({ id: cartId, subtotal, item_count: itemCount } as any);
  }
}
